// Coordinate parsing / formatting (meeting item 6). Storage stays signed
// decimal degrees everywhere; these helpers only bridge to what a surveyor
// types or wants to read: plain decimal, D°M'S" (deg-min-sec), or D°M.m'
// (deg-decimal-min).

const HEMISPHERE_SIGN = { N: 1, S: -1, E: 1, W: -1 };

// Accepts:
//   "23.7808"            decimal degrees
//   "-90.4265"           signed decimal
//   "23 46 50.9 N"       space separated d m s with hemisphere
//   "23°46'50.9\"N"      symbol separated
//   "23d46m50.9sN"       letter separated
//   "23°46.85'N"         deg + decimal minutes
// Returns a Number in decimal degrees, or null when nothing usable is found.
export function parseCoordinate(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  // Plain decimal (optionally with a trailing hemisphere letter).
  const decimalMatch = text.match(/^([+-]?\d+(?:\.\d+)?)\s*([NSEW])?$/i);
  if (decimalMatch) {
    let value = parseFloat(decimalMatch[1]);
    const hemi = decimalMatch[2] ? decimalMatch[2].toUpperCase() : null;
    if (hemi) value = Math.abs(value) * HEMISPHERE_SIGN[hemi];
    return Number.isFinite(value) ? value : null;
  }

  // Degrees / minutes / seconds in any common separator style.
  const dmsMatch = text.match(
    /^([+-]?\d+(?:\.\d+)?)\s*(?:°|d|deg|:|\s)\s*(\d+(?:\.\d+)?)?\s*(?:'|’|m|min|:|\s)?\s*(\d+(?:\.\d+)?)?\s*(?:"|”|''|s|sec)?\s*([NSEW])?$/i,
  );
  if (!dmsMatch) return null;

  const degrees = parseFloat(dmsMatch[1]);
  const minutes = dmsMatch[2] ? parseFloat(dmsMatch[2]) : 0;
  const seconds = dmsMatch[3] ? parseFloat(dmsMatch[3]) : 0;
  const hemi = dmsMatch[4] ? dmsMatch[4].toUpperCase() : null;
  if (!Number.isFinite(degrees)) return null;

  const magnitude =
    Math.abs(degrees) + minutes / 60 + seconds / 3600;
  const sign = hemi ? HEMISPHERE_SIGN[hemi] : Math.sign(degrees) || 1;
  return magnitude * sign;
}

// Split a signed decimal degree into { degrees, minutes, seconds, negative }.
export function toDmsParts(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return { degrees: "", minutes: "", seconds: "", negative: false };
  }
  const negative = num < 0;
  let rest = Math.abs(num);
  const degrees = Math.floor(rest);
  rest = (rest - degrees) * 60;
  const minutes = Math.floor(rest);
  const seconds = Math.round((rest - minutes) * 60 * 1000) / 1000;
  return { degrees, minutes, seconds, negative };
}

// mode: "decimal" | "dms" | "dm". axis: "lat" | "lng" (only used for the
// hemisphere letter in dms/dm modes).
export function formatCoordinate(value, mode = "decimal", axis = "lat") {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  if (mode === "decimal") return num.toFixed(7).replace(/\.?0+$/, "");

  const { degrees, minutes, seconds, negative } = toDmsParts(num);
  const hemi =
    axis === "lng" ? (negative ? "W" : "E") : negative ? "S" : "N";
  if (mode === "dm") {
    const decimalMinutes = minutes + seconds / 60;
    return `${degrees}°${decimalMinutes.toFixed(4)}'${hemi}`;
  }
  return `${degrees}°${minutes}'${seconds}"${hemi}`;
}

export const COORDINATE_MODES = [
  { key: "decimal", label: "Decimal" },
  { key: "dms", label: "D°M'S\"" },
  { key: "dm", label: "D°M.m'" },
];

// ---------------------------------------------------------------------------
// Google Maps links. Coordinates and a link are two views of the same thing:
// the app can read a pasted link and can hand one back for any set of points.
// ---------------------------------------------------------------------------

const COORD_PAIR = /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/g;

const inRange = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

// True for the short links (maps.app.goo.gl / goo.gl/maps) that carry no
// coordinates at all -- they only resolve server-side, so the app has to ask
// the user for the full link instead of silently doing nothing.
export function isShortGoogleMapsLink(text) {
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(String(text || ""));
}

// Reads any of:
//   https://www.google.com/maps?q=23.78,90.42
//   https://www.google.com/maps/@23.78,90.42,15z
//   https://www.google.com/maps/place/Foo/@23.78,90.42,17z/...
//   https://www.google.com/maps/dir/23.7,90.4/23.8,90.5/23.9,90.6
//   https://maps.google.com/?ll=23.78,90.42   (also saddr/daddr, destination)
//   a bare "23.78, 90.42"
// Returns { geometryKind, points: [{latitude, longitude}] } or null.
export function parseGoogleMapsUrl(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const collect = (source) => {
    const found = [];
    COORD_PAIR.lastIndex = 0;
    let match;
    while ((match = COORD_PAIR.exec(source)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (inRange(lat, lng)) found.push({ latitude: String(lat), longitude: String(lng) });
    }
    return found;
  };

  // A directions link is an ordered route -- take its waypoints in order and
  // ignore the trailing "@centre,zoom" the URL often carries.
  const dirMatch = raw.match(/\/maps\/dir\/([^@?]+)/i);
  if (dirMatch) {
    const points = collect(decodeURIComponent(dirMatch[1]));
    if (points.length >= 2) return { geometryKind: "line", points };
    if (points.length === 1) return { geometryKind: "point", points };
  }

  // Explicit query parameters beat the map-centre "@lat,lng,zoom".
  for (const key of ["q", "ll", "daddr", "saddr", "destination", "center"]) {
    const param = raw.match(new RegExp(`[?&]${key}=([^&]+)`, "i"));
    if (param) {
      const points = collect(decodeURIComponent(param[1]));
      if (points.length) {
        return {
          geometryKind: points.length >= 2 ? "line" : "point",
          points,
        };
      }
    }
  }

  const at = raw.match(/@(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (at) {
    const lat = parseFloat(at[1]);
    const lng = parseFloat(at[2]);
    if (inRange(lat, lng)) {
      return { geometryKind: "point", points: [{ latitude: String(lat), longitude: String(lng) }] };
    }
  }

  const loose = collect(raw);
  if (loose.length) {
    return { geometryKind: loose.length >= 2 ? "line" : "point", points: loose };
  }
  return null;
}

// The inverse: one link for whatever points are on screen. A route becomes a
// multi-waypoint directions link; an area collapses to its centroid.
export function buildGoogleMapsUrl(geometryKind, points = []) {
  const valid = points.filter((p) => p && p.latitude !== "" && p.longitude !== "" &&
    Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));
  if (!valid.length) return null;

  if (geometryKind === "line" && valid.length >= 2) {
    const path = valid.map((p) => `${p.latitude},${p.longitude}`).join("/");
    return `https://www.google.com/maps/dir/${path}`;
  }
  if (geometryKind === "area" && valid.length >= 3) {
    const sum = valid.reduce(
      (acc, p) => ({
        latitude: acc.latitude + parseFloat(p.latitude),
        longitude: acc.longitude + parseFloat(p.longitude),
      }),
      { latitude: 0, longitude: 0 },
    );
    const lat = (sum.latitude / valid.length).toFixed(7).replace(/\.?0+$/, "");
    const lng = (sum.longitude / valid.length).toFixed(7).replace(/\.?0+$/, "");
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  return `https://www.google.com/maps?q=${valid[0].latitude},${valid[0].longitude}`;
}
