// Which dimension inputs an item's unit expects, and whether it supports
// switching between "type the dimensions" and "type the quantity directly".
// Shared by any form that lets a user key in a line's numbers for a given unit.

export const supportsDualMode = (unit) => {
  const u = String(unit || "").toLowerCase();
  const norm = u.replace(/[^a-z0-9]/g, "");
  const isCubic =
    norm.includes("cumeter") || norm.includes("m3") || norm.includes("cubic");
  const isSquare =
    norm.includes("sqmeter") ||
    norm.includes("sqm") ||
    norm.includes("m2") ||
    norm.includes("square");
  return isCubic || isSquare;
};

// A short suffix to show inside a dimension input so the estimator can see what
// the number means as they type (meeting item 4). `field` is one of
// no_of_units | quantity | length | width | thickness.
export const unitAdornment = (unit, field) => {
  const norm = String(unit || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isCubic =
    norm.includes("cumeter") || norm.includes("m3") || norm.includes("cubic");
  const isSquare =
    norm.includes("sqmeter") ||
    norm.includes("sqm") ||
    norm.includes("m2") ||
    norm.includes("square");
  const DIMENSION_FIELDS = ["no_of_units", "quantity", "length", "width", "thickness"];
  if (!DIMENSION_FIELDS.includes(field)) return "";
  if (field === "no_of_units") return "nos";
  if (field === "length" || field === "width" || field === "thickness")
    return "m";
  // field === "quantity" -> the line's own unit
  if (isCubic) return "m³";
  if (isSquare) return "m²";
  return unit || "";
};

export const allowedInputsForUnit = (unit, mode) => {
  const u = String(unit || "").toLowerCase();
  const norm = u.replace(/[^a-z0-9]/g, "");
  const isCubic =
    norm.includes("cumeter") || norm.includes("m3") || norm.includes("cubic");
  const isSquare =
    norm.includes("sqmeter") ||
    norm.includes("sqm") ||
    norm.includes("m2") ||
    norm.includes("square");
  const isLinear =
    !isCubic &&
    !isSquare &&
    (norm.includes("linm") || norm.includes("rm") || norm.includes("meter"));
  if (isCubic) {
    return mode === "quantity"
      ? ["no_of_units", "quantity"]
      : ["no_of_units", "length", "width", "thickness"];
  } else if (isSquare) {
    return mode === "quantity"
      ? ["no_of_units", "quantity"]
      : ["no_of_units", "length", "width"];
  } else if (isLinear) {
    return ["no_of_units", "length"];
  } else {
    return ["no_of_units", "quantity"];
  }
};
