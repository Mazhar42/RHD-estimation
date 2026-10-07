import { elementLabel } from "../../../utils/elementLabel";

const UNASSIGNED = Symbol("unassigned");

function groupByDivision(list) {
  return list.reduce((acc, line) => {
    const divisionName = line.item?.division?.name || "Uncategorized";
    const orgName = line.item?.organization || "RHD";
    const label =
      orgName && orgName !== "RHD"
        ? `${divisionName} (${orgName})`
        : divisionName;
    if (!acc[label]) acc[label] = [];
    acc[label].push(line);
    return acc;
  }, {});
}

// Groups a flat list of root lines by structural element (outer) then by
// division (inner) -- the same hierarchy shown on screen. With no elements
// defined, returns a single section with a null element so callers render
// the original division-only layout unchanged.
export function groupByElementThenDivision(lines, elements = []) {
  if (!elements.length) {
    return [{ element: null, divisions: groupByDivision(lines) }];
  }

  const orderedElements = [...elements].sort(
    (a, b) =>
      (a.sort_order || 0) - (b.sort_order || 0) || a.element_id - b.element_id,
  );
  const buckets = new Map();
  orderedElements.forEach((el) => {
    buckets.set(el.element_id, { element: el, lines: [] });
  });
  lines.forEach((line) => {
    const elId = line.element_id ?? null;
    const key = elId != null && buckets.has(elId) ? elId : UNASSIGNED;
    if (!buckets.has(key)) buckets.set(key, { element: null, lines: [] });
    buckets.get(key).lines.push(line);
  });

  const ordered = orderedElements
    .map((el) => buckets.get(el.element_id))
    .filter(Boolean);
  if (buckets.has(UNASSIGNED)) ordered.push(buckets.get(UNASSIGNED));

  // Exports only ever include sections that actually have rows -- an empty
  // freshly-generated element is worth showing on screen but not on paper.
  return ordered
    .filter((bucket) => bucket.lines.length > 0)
    .map((bucket) => ({
      element: bucket.element,
      divisions: groupByDivision(bucket.lines),
    }));
}

export function flattenForExport(
  rootLines,
  { includeChildren, elements = [] },
) {
  if (!includeChildren) return rootLines;

  const elementById = new Map();
  elements.forEach((el) => elementById.set(el.element_id, el));

  function flatten(line, depth) {
    const indentedLine = { ...line };
    if (depth > 0) {
      const indent = "    ".repeat(depth - 1) + "↳ ";
      const elCode =
        line.element_id != null ? elementById.get(line.element_id)?.code : null;
      const label = line.label || elCode || line.item?.item_code || "";
      const originalDesc = line.item?.item_description || "";

      indentedLine.item = {
        ...line.item,
        item_code: label,
        item_description: `${indent}${label}`, // Emitting indented description
      };

      // If there's sub_description on the line, we might also want to preserve it.
    }

    const arr = [indentedLine];
    const children = line.children || [];
    for (const child of children) {
      arr.push(...flatten(child, depth + 1));
    }
    return arr;
  }

  return rootLines.flatMap((line) => flatten(line, 0));
}

export function elementSectionTitle(element) {
  return element ? elementLabel(element) : "Unassigned";
}
