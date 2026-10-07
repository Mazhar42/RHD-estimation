import { describe, expect, it } from "vitest";
import {
  buildChildMap,
  buildSubtree,
  depthOf,
  descendantIds,
  divisionSections,
  flattenTree,
  hasDimensions,
  resolveLineWorkType,
  rootLinesOf,
  visibleColumns,
} from "./lineTree";

const line = (line_id, over = {}) => ({
  line_id,
  parent_line_id: null,
  sort_order: 0,
  amount: 0,
  item: { division: { name: "Earthwork" }, organization: "RHD" },
  ...over,
});

// 1 ─┬─ 2 ── 4
//    └─ 3
// 5 (root, sort_order -1 so it comes first)
const lines = [
  line(1, { amount: 300 }),
  line(3, { parent_line_id: 1, sort_order: 2, amount: 100 }),
  line(2, { parent_line_id: 1, sort_order: 1, amount: 200, element_id: 9 }),
  line(4, { parent_line_id: 2 }),
  line(5, { sort_order: -1, amount: 50, item: { division: { name: "Bridge" }, organization: "LGED" } }),
];
const byId = new Map(lines.map((l) => [l.line_id, l]));
const childMap = buildChildMap(lines);

describe("line tree", () => {
  it("orders roots and children by sort order", () => {
    expect(rootLinesOf(lines).map((l) => l.line_id)).toEqual([5, 1]);
    expect(childMap.get(1).map((l) => l.line_id)).toEqual([2, 3]);
  });

  it("builds nested subtrees and lists every descendant", () => {
    const tree = buildSubtree(1, byId, childMap);
    expect(tree.children.map((c) => c.line_id)).toEqual([2, 3]);
    expect(tree.children[0].children.map((c) => c.line_id)).toEqual([4]);
    expect(descendantIds(1, childMap)).toEqual([2, 4, 3]);
  });

  it("measures depth", () => {
    expect(depthOf(byId.get(1), byId)).toBe(0);
    expect(depthOf(byId.get(4), byId)).toBe(2);
  });

  it("hides collapsed descendants unless told to ignore collapse", () => {
    const tree = buildSubtree(1, byId, childMap);
    expect(flattenTree(tree, new Set()).map((r) => [r.line.line_id, r.depth])).toEqual([
      [1, 0],
      [2, 1],
      [4, 2],
      [3, 1],
    ]);
    expect(flattenTree(tree, new Set([2])).map((r) => r.line.line_id)).toEqual([1, 2, 3]);
    expect(flattenTree(tree, new Set([1]), 0, true)).toHaveLength(4);
  });

  it("resolves a line's work type from its own element or its descendants", () => {
    const workTypes = new Map([[9, "bridge"]]);
    expect(resolveLineWorkType(byId.get(1), childMap, workTypes)).toBe("bridge");
    expect(resolveLineWorkType(byId.get(5), childMap, workTypes)).toBeNull();
  });

  it("groups a tab's roots by division with subtotals", () => {
    const common = { roots: rootLinesOf(lines), byId, childMap, workTypeByElementId: new Map([[9, "bridge"]]) };
    const bridgeTab = divisionSections({ ...common, activeWorkType: "bridge", isFirstTab: false });
    expect(bridgeTab).toEqual([expect.objectContaining({ title: "Earthwork", subtotal: 300 })]);

    // Lines without a work type land on the first tab only.
    const firstTab = divisionSections({ ...common, activeWorkType: "road", isFirstTab: true });
    expect(firstTab.map((s) => s.title)).toEqual(["Bridge (LGED)"]);
    const otherTab = divisionSections({ ...common, activeWorkType: "road", isFirstTab: false });
    expect(otherTab).toEqual([]);
  });
});

describe("columns", () => {
  it("detects dimensions from values or expressions", () => {
    expect(hasDimensions({ length: 2 })).toBe(true);
    expect(hasDimensions({ width_expr: "2*3" })).toBe(true);
    expect(hasDimensions({ quantity: 5 })).toBe(false);
  });

  it("only shows optional columns some line uses", () => {
    expect(visibleColumns([{ length: 1, quantity: null, calculated_qty: 0 }])).toEqual({
      subDescription: false,
      length: true,
      width: false,
      thickness: false,
      quantity: false,
      attachment: false,
    });
  });
});
