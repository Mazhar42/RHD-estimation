// Human-readable label for a structural element (bridge pier/abutment, or
// road chainage segment). Shared between the on-screen grouping and the
// CSV/XLSX/PDF exporters so the label never drifts between the two.
export function elementLabel(element) {
  if (!element) return "";
  return element.structure_name
    ? `${element.code} · ${element.structure_name}`
    : element.code;
}

export function elementKindLabel(element) {
  if (!element) return "";
  if (element.kind === "abutment") return "Abutment";
  if (element.kind === "pier") return "Pier";
  if (element.kind === "span") return "Span";
  if (element.kind === "chainage") return "Chainage";
  return "Element";
}
