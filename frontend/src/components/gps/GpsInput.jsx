import React, { useMemo, useState } from "react";
import {
  parseCoordinate,
  formatCoordinate,
  parseGoogleMapsUrl,
  buildGoogleMapsUrl,
  isShortGoogleMapsLink,
  COORDINATE_MODES,
} from "../../utils/coordinates";

const EMPTY_POINT = { seq: 0, latitude: "", longitude: "", label: "" };
const COORD_MODE_KEY = "gpsCoordinateMode";

const getMinimumPointCount = (geometryKind) => {
  if (geometryKind === "point") return 1;
  if (geometryKind === "line") return 2;
  return 3;
};

// A line or an area can carry as many points as the user adds; only a single
// point is capped at one.
const supportsExtraPoints = (geometryKind) => geometryKind !== "point";

const readStoredMode = () => {
  try {
    const stored = localStorage.getItem(COORD_MODE_KEY);
    if (stored && COORDINATE_MODES.some((m) => m.key === stored)) return stored;
  } catch {}
  return "decimal";
};

const parseCoordinatePaste = (rawValue) => {
  const text = String(rawValue || "").trim();
  // Two decimals separated by a comma / whitespace (the common "lat, long").
  const decimalMatch = text.match(
    /(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/,
  );
  if (decimalMatch) {
    return { latitude: decimalMatch[1], longitude: decimalMatch[2] };
  }
  // Fall back to two DMS chunks split on a comma.
  const parts = text.split(/\s*[,;]\s*/);
  if (parts.length === 2) {
    const lat = parseCoordinate(parts[0]);
    const lng = parseCoordinate(parts[1]);
    if (lat != null && lng != null) {
      return { latitude: String(lat), longitude: String(lng) };
    }
  }
  return null;
};

const buildMapUrl = buildGoogleMapsUrl;

const displayCoordinate = (rawValue, mode, axis) => {
  if (rawValue === "" || rawValue == null) return "";
  const num = Number(rawValue);
  if (!Number.isFinite(num)) return String(rawValue);
  return formatCoordinate(num, mode, axis);
};

export function GpsDisplay({ geometryKind, points = [] }) {
  const mode = readStoredMode();
  const validPoints = points.filter(
    (point) => point.latitude && point.longitude,
  );
  if (validPoints.length === 0) {
    return <span className="text-gray-500">No GPS set</span>;
  }
  return (
    <div className="flex flex-col gap-1 text-sm text-gray-700">
      {validPoints.map((point) => (
        <span key={`${point.seq}-${point.latitude}-${point.longitude}`}>
          Lat: {displayCoordinate(point.latitude, mode, "lat")}, Long:{" "}
          {displayCoordinate(point.longitude, mode, "lng")}
        </span>
      ))}
      {buildMapUrl(geometryKind, validPoints) && (
        <a
          href={buildMapUrl(geometryKind, validPoints)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-teal-700 hover:underline"
        >
          {geometryKind === "line" ? "View route on map" : "View on map"}
        </a>
      )}
    </div>
  );
}

export default function GpsInput({ value, onChange, readOnly = false }) {
  const geometryKind = value?.geometry_kind || "point";
  const points = value?.points?.length ? value.points : [EMPTY_POINT];
  const minimumPointCount = getMinimumPointCount(geometryKind);
  const [geoError, setGeoError] = useState("");
  const [geoNotice, setGeoNotice] = useState("");
  const [coordMode, setCoordMode] = useState(readStoredMode);
  // What the user is currently typing, keyed "index:field"; lets them key in a
  // DMS string without the field snapping to decimal mid-edit.
  const [drafts, setDrafts] = useState({});
  // Same idea for the Google Maps link box: while it is being typed in, it
  // shows what was typed; otherwise it mirrors the coordinates above.
  const [linkDraft, setLinkDraft] = useState(null);
  const [linkError, setLinkError] = useState("");

  const changeCoordMode = (nextMode) => {
    setCoordMode(nextMode);
    setDrafts({});
    try {
      localStorage.setItem(COORD_MODE_KEY, nextMode);
    } catch {}
  };

  const normalizedPoints = useMemo(() => {
    const base = [...points].map((point, index) => ({
      seq: point.seq ?? index,
      latitude: point.latitude ?? "",
      longitude: point.longitude ?? "",
      label: point.label ?? "",
    }));
    while (base.length < minimumPointCount) {
      base.push({ ...EMPTY_POINT, seq: base.length });
    }
    return base;
  }, [minimumPointCount, points]);

  const updateValue = (nextGeometryKind, nextPoints) => {
    onChange({
      geometry_kind: nextGeometryKind,
      points: nextPoints.map((point, index) => ({ ...point, seq: index })),
    });
  };

  const handleGeometryKindChange = (event) => {
    const nextGeometryKind = event.target.value;
    const minCount = getMinimumPointCount(nextGeometryKind);
    const nextPoints = [...normalizedPoints];
    while (nextPoints.length < minCount) {
      nextPoints.push({ ...EMPTY_POINT, seq: nextPoints.length });
    }
    updateValue(
      nextGeometryKind,
      // Keep every point the user already entered for a line or an area; only
      // "single point" trims back down.
      supportsExtraPoints(nextGeometryKind)
        ? nextPoints
        : nextPoints.slice(0, minCount),
    );
  };

  const commitCoordinate = (index, field, text) => {
    const parsed = parseCoordinate(text);
    const stored = parsed != null ? String(parsed) : text;
    const nextPoints = normalizedPoints.map((point, pointIndex) =>
      pointIndex === index ? { ...point, [field]: stored } : point,
    );
    updateValue(geometryKind, nextPoints);
  };

  const handleCoordinateChange = (index, field, text) => {
    setDrafts((prev) => ({ ...prev, [`${index}:${field}`]: text }));
    commitCoordinate(index, field, text);
  };

  const handleCoordinateBlur = (index, field) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[`${index}:${field}`];
      return next;
    });
  };

  const handlePointChange = (index, field, fieldValue) => {
    const nextPoints = normalizedPoints.map((point, pointIndex) =>
      pointIndex === index ? { ...point, [field]: fieldValue } : point,
    );
    updateValue(geometryKind, nextPoints);
  };

  const handleLatitudePaste = (index, event) => {
    const parsed = parseCoordinatePaste(event.clipboardData.getData("text"));
    if (!parsed) return;
    event.preventDefault();
    const nextPoints = normalizedPoints.map((point, pointIndex) =>
      pointIndex === index
        ? { ...point, latitude: parsed.latitude, longitude: parsed.longitude }
        : point,
    );
    updateValue(geometryKind, nextPoints);
  };

  const addPoint = () => {
    updateValue(geometryKind, [
      ...normalizedPoints,
      { ...EMPTY_POINT, seq: normalizedPoints.length },
    ]);
  };

  const removePoint = (index) => {
    const nextPoints = normalizedPoints.filter(
      (_, pointIndex) => pointIndex !== index,
    );
    updateValue(geometryKind, nextPoints);
  };

  // Third way in: paste a Google Maps link and the coordinates fill in. The
  // box is bound to the generated link the rest of the time, so the two stay
  // in step in both directions.
  const handleLinkChange = (text) => {
    setLinkDraft(text);
    if (!text.trim()) {
      setLinkError("");
      return;
    }
    const parsed = parseGoogleMapsUrl(text);
    if (!parsed) {
      setLinkError(
        isShortGoogleMapsLink(text)
          ? "Short links (maps.app.goo.gl) don't carry coordinates. Open it in Google Maps and copy the full link."
          : "No coordinates found in that link.",
      );
      return;
    }
    setLinkError("");
    // A pasted route may bring more points than the current geometry allows,
    // so widen the geometry to fit rather than dropping them.
    const nextKind =
      parsed.points.length >= 3 && geometryKind === "area"
        ? "area"
        : parsed.points.length >= 2
          ? "line"
          : "point";
    updateValue(
      nextKind,
      parsed.points.map((point, index) => ({
        seq: index,
        latitude: point.latitude,
        longitude: point.longitude,
        label: normalizedPoints[index]?.label ?? "",
      })),
    );
  };

  const coordFieldValue = (index, field, rawValue, axis) => {
    const draftKey = `${index}:${field}`;
    if (draftKey in drafts) return drafts[draftKey];
    return displayCoordinate(rawValue, coordMode, axis);
  };

  const useCurrentLocation = () => {
    if (readOnly) return;
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setGeoError("Current location requires HTTPS or localhost.");
      return;
    }
    setGeoError("");
    setGeoNotice("Getting current location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextPoints = [...normalizedPoints];
        nextPoints[0] = {
          ...nextPoints[0],
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        };
        updateValue("point", nextPoints.slice(0, 1));
        setGeoNotice(`Accuracy: ${Math.round(position.coords.accuracy)} m`);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGeoError("Location permission was denied.");
        } else if (error.code === error.TIMEOUT) {
          setGeoError("Location request timed out.");
        } else {
          setGeoError("Could not get the current location.");
        }
        setGeoNotice("");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const canRemovePoints =
    supportsExtraPoints(geometryKind) &&
    normalizedPoints.length > minimumPointCount;

  const mapUrl = buildMapUrl(geometryKind, normalizedPoints);

  return (
    <div data-gps-panel className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Geometry</label>
        <select
          value={geometryKind}
          onChange={handleGeometryKindChange}
          disabled={readOnly}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="point">Single point</option>
          <option value="line">Line / route</option>
          <option value="area">Area</option>
        </select>

        <label className="text-sm font-medium text-gray-700">Format</label>
        <select
          value={coordMode}
          onChange={(event) => changeCoordMode(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {COORDINATE_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>

        {!readOnly && (
          <button
            type="button"
            onClick={useCurrentLocation}
            className="rounded border border-teal-300 px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-50"
          >
            Use my current location
          </button>
        )}
        {mapUrl && (
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-teal-700 hover:underline"
          >
            {geometryKind === "line" ? "View route on map" : "View on map"}
          </a>
        )}
      </div>

      <div className="space-y-2">
        {normalizedPoints.map((point, index) => (
          <div
            key={`${geometryKind}-${index}`}
            className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <input
              value={coordFieldValue(index, "latitude", point.latitude, "lat")}
              readOnly={readOnly}
              onPaste={(event) => handleLatitudePaste(index, event)}
              onChange={(event) =>
                handleCoordinateChange(index, "latitude", event.target.value)
              }
              onBlur={() => handleCoordinateBlur(index, "latitude")}
              placeholder={coordMode === "decimal" ? "Latitude" : "23°46'50\"N"}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={coordFieldValue(
                index,
                "longitude",
                point.longitude,
                "lng",
              )}
              readOnly={readOnly}
              onChange={(event) =>
                handleCoordinateChange(index, "longitude", event.target.value)
              }
              onBlur={() => handleCoordinateBlur(index, "longitude")}
              placeholder={
                coordMode === "decimal" ? "Longitude" : "90°23'12\"E"
              }
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={point.label}
              readOnly={readOnly}
              onChange={(event) =>
                handlePointChange(index, "label", event.target.value)
              }
              placeholder={
                geometryKind === "line"
                  ? index === 0
                    ? "Start"
                    : index === normalizedPoints.length - 1
                      ? "End"
                      : `Waypoint ${index}`
                  : `Point ${index + 1}`
              }
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            {!readOnly && canRemovePoints && (
              <button
                type="button"
                onClick={() => removePoint(index)}
                className="rounded border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {!readOnly && supportsExtraPoints(geometryKind) && (
        <button
          type="button"
          onClick={addPoint}
          className="rounded border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Add point
        </button>
      )}

      <div className="space-y-1 border-t border-gray-100 pt-3">
        <label
          className="block text-sm font-medium text-gray-700"
          htmlFor="gps-maps-link"
        >
          Google Maps link
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="gps-maps-link"
            value={linkDraft ?? mapUrl ?? ""}
            readOnly={readOnly}
            onChange={(event) => handleLinkChange(event.target.value)}
            onBlur={() => {
              setLinkDraft(null);
              setLinkError("");
            }}
            placeholder="Paste a Google Maps link to fill the coordinates"
            className="min-w-[200px] flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          {mapUrl && (
            <>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(mapUrl);
                  setGeoNotice("Link copied.");
                }}
                className="rounded border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Copy
              </button>
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-teal-300 px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-50"
              >
                Open
              </a>
            </>
          )}
        </div>
        {linkError ? (
          <div className="text-xs text-red-600">{linkError}</div>
        ) : (
          <div className="text-xs text-gray-500">
            Fills in automatically from the coordinates above, and reads them
            back when you paste a link.
          </div>
        )}
      </div>

      {geoNotice && <div className="text-xs text-teal-700">{geoNotice}</div>}
      {geoError && <div className="text-xs text-red-600">{geoError}</div>}
      <div className="text-xs text-gray-500">
        {coordMode === "decimal"
          ? "Fewer than 5 decimals is allowed, but may be imprecise."
          : 'Type e.g. 23°46\'50"N or 23 46 50 N; stored as decimal degrees.'}
      </div>
    </div>
  );
}
