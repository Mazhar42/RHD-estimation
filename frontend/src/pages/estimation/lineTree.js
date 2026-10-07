// Pure helpers over the flat list of estimation lines, which form a tree
// through parent_line_id (a line broken into parts has child lines, to any
// depth).

export const MAX_DEPTH = 4; // 0-based: five levels in total

const bySortOrder = (a, b) =>
  (a.sort_order || 0) - (b.sort_order || 0) || a.line_id - b.line_id;

export const isReadOnlyLine = (line) => Boolean(line?.item?.special_item);

export function buildChildMap(lines) {
  const map = new Map();
  for (const line of lines) {
    if (line.parent_line_id == null) continue;
    if (!map.has(line.parent_line_id)) map.set(line.parent_line_id, []);
    map.get(line.parent_line_id).push(line);
  }
  for (const children of map.values()) children.sort(bySortOrder);
  return map;
}

export function rootLinesOf(lines) {
  return lines.filter((l) => l.parent_line_id == null).sort(bySortOrder);
}

// { ...line, children: [subtree, ...] } at every level.
export function buildSubtree(lineId, byId, childMap) {
  const node = byId.get(lineId);
  if (!node) return null;
  return {
    ...node,
    children: (childMap.get(lineId) || [])
      .map((child) => buildSubtree(child.line_id, byId, childMap))
      .filter(Boolean),
  };
}

export function descendantIds(lineId, childMap) {
  const out = [];
  const walk = (id) => {
    for (const child of childMap.get(id) || []) {
      out.push(child.line_id);
      walk(child.line_id);
    }
  };
  walk(lineId);
  return out;
}

export function depthOf(line, byId) {
  let depth = 0;
  let current = line;
  while (current?.parent_line_id != null) {
    depth += 1;
    current = byId.get(current.parent_line_id);
  }
  return depth;
}

// Rows to render for one subtree, depth-first. Collapsed lines hide their
// descendants unless ignoreCollapse is set.
export function flattenTree(node, collapsed, depth = 0, ignoreCollapse = false) {
  const rows = [{ line: node, depth }];
  if (ignoreCollapse || !collapsed.has(node.line_id)) {
    for (const child of node.children || []) {
      rows.push(...flattenTree(child, collapsed, depth + 1, ignoreCollapse));
    }
  }
  return rows;
}

// A line belongs to the work type of its element, or failing that the
// first element found among its descendants (breadth-first).
export function resolveLineWorkType(line, childMap, workTypeByElementId) {
  const own = line?.element_id != null ? workTypeByElementId.get(line.element_id) : null;
  if (own) return own;
  const queue = [...(childMap.get(line.line_id) || [])];
  while (queue.length > 0) {
    const child = queue.shift();
    const wt = child?.element_id != null ? workTypeByElementId.get(child.element_id) : null;
    if (wt) return wt;
    queue.push(...(childMap.get(child.line_id) || []));
  }
  return null;
}

// Root subtrees for one work-type tab, grouped under a division heading.
// Lines with no work type show on the first tab so nothing disappears.
export function divisionSections({ roots, byId, childMap, workTypeByElementId, activeWorkType, isFirstTab }) {
  const groups = new Map();
  for (const line of roots) {
    const wt = resolveLineWorkType(line, childMap, workTypeByElementId);
    if (wt != null ? wt !== activeWorkType : !isFirstTab) continue;
    const division = line.item?.division?.name || "Uncategorized";
    const org = line.item?.organization || "RHD";
    const title = org !== "RHD" ? `${division} (${org})` : division;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(buildSubtree(line.line_id, byId, childMap) || { ...line, children: [] });
  }
  return Array.from(groups, ([title, lines]) => ({
    title,
    lines,
    subtotal: lines.reduce((sum, l) => sum + (l.amount || 0), 0),
  }));
}

const filled = (v) => v != null && v !== "";
const filledExpr = (e) => Boolean(e) && String(e).trim() !== "";

export function hasDimensions(line) {
  return (
    filled(line.length) ||
    filledExpr(line.length_expr) ||
    filled(line.width) ||
    filledExpr(line.width_expr) ||
    filled(line.thickness) ||
    filledExpr(line.thickness_expr) ||
    filledExpr(line.no_of_units_expr)
  );
}

// Optional columns are shown only when some line in the section uses them.
export function visibleColumns(lines) {
  const any = (pred) => lines.some(pred);
  return {
    subDescription: any((l) => filledExpr(l.sub_description)),
    length: any((l) => filled(l.length) || filledExpr(l.length_expr)),
    width: any((l) => filled(l.width) || filledExpr(l.width_expr)),
    thickness: any((l) => filled(l.thickness) || filledExpr(l.thickness_expr)),
    quantity: any((l) => filled(l.quantity) || (l.calculated_qty != null && l.calculated_qty !== 0)),
    attachment: any((l) => l.attachments?.length > 0),
  };
}

export const formatAmount = (n) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
