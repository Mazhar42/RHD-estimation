import { describe, it, expect } from "vitest";
import {
  groupByElementThenDivision,
  flattenForExport,
  elementSectionTitle,
} from "./grouping";

function makeLine({
  line_id,
  division = "Roadworks",
  org = "RHD",
  element_id = null,
  children = undefined,
}) {
  return {
    line_id,
    element_id,
    item: {
      item_code: `ITEM.${line_id}`,
      item_description: `Item ${line_id}`,
      division: { name: division },
      organization: org,
    },
    children,
  };
}

describe("groupByElementThenDivision", () => {
  it("with no elements, groups every line by division into a single unassigned section", () => {
    const lines = [
      makeLine({ line_id: 1, division: "Roadworks" }),
      makeLine({ line_id: 2, division: "Roadworks" }),
      makeLine({ line_id: 3, division: "Earthworks" }),
    ];

    const sections = groupByElementThenDivision(lines, []);

    expect(sections).toHaveLength(1);
    expect(sections[0].element).toBeNull();
    expect(Object.keys(sections[0].divisions)).toEqual(["Roadworks", "Earthworks"]);
    expect(sections[0].divisions["Roadworks"]).toHaveLength(2);
    expect(sections[0].divisions["Earthworks"]).toHaveLength(1);
  });

  it("appends the organization to the division label when it isn't RHD", () => {
    const lines = [makeLine({ line_id: 1, division: "Roadworks", org: "LGED" })];
    const sections = groupByElementThenDivision(lines, []);
    expect(Object.keys(sections[0].divisions)).toEqual(["Roadworks (LGED)"]);
  });

  it("orders sections by element sort_order, appending unassigned lines last", () => {
    const elements = [
      { element_id: 10, code: "P2", sort_order: 20 },
      { element_id: 11, code: "P1", sort_order: 10 },
    ];
    const lines = [
      makeLine({ line_id: 1, element_id: 10 }),
      makeLine({ line_id: 2, element_id: 11 }),
      makeLine({ line_id: 3, element_id: null }),
    ];

    const sections = groupByElementThenDivision(lines, elements);

    expect(sections.map((s) => s.element?.element_id ?? "unassigned")).toEqual([
      11,
      10,
      "unassigned",
    ]);
  });

  it("omits an element section that ended up with no matching lines", () => {
    const elements = [
      { element_id: 10, code: "P1", sort_order: 10 },
      { element_id: 11, code: "P2 (empty)", sort_order: 20 },
    ];
    const lines = [makeLine({ line_id: 1, element_id: 10 })];

    const sections = groupByElementThenDivision(lines, elements);

    expect(sections).toHaveLength(1);
    expect(sections[0].element.element_id).toBe(10);
  });

  it("treats a line whose element_id doesn't match any known element as unassigned", () => {
    const elements = [{ element_id: 10, code: "P1", sort_order: 10 }];
    const lines = [makeLine({ line_id: 1, element_id: 999 })];

    const sections = groupByElementThenDivision(lines, elements);

    expect(sections).toHaveLength(1);
    expect(sections[0].element).toBeNull();
  });
});

describe("flattenForExport", () => {
  it("returns root lines unchanged when includeChildren is false", () => {
    const lines = [makeLine({ line_id: 1 })];
    expect(flattenForExport(lines, { includeChildren: false })).toBe(lines);
  });

  it("flattens a nested tree into document order, parent before its children", () => {
    const child = makeLine({ line_id: 2 });
    const root = makeLine({ line_id: 1, children: [child] });

    const flat = flattenForExport([root], { includeChildren: true, elements: [] });

    expect(flat.map((l) => l.line_id)).toEqual([1, 2]);
  });

  it("flattens a multi-level tree depth-first", () => {
    const grandchild = makeLine({ line_id: 3 });
    const child = makeLine({ line_id: 2, children: [grandchild] });
    const root = makeLine({ line_id: 1, children: [child] });

    const flat = flattenForExport([root], { includeChildren: true, elements: [] });

    expect(flat.map((l) => l.line_id)).toEqual([1, 2, 3]);
  });

  it("indents a child's description and does not mutate the original line", () => {
    const child = makeLine({ line_id: 2 });
    const root = makeLine({ line_id: 1, children: [child] });

    const flat = flattenForExport([root], { includeChildren: true, elements: [] });

    expect(flat[0].item.item_description).toBe("Item 1"); // root untouched
    expect(flat[1].item.item_description).toContain("↳"); // child indented
    expect(child.item.item_description).toBe("Item 2"); // original object untouched
  });

  it("uses the element code as the child label when the line has no label of its own", () => {
    const elements = [{ element_id: 10, code: "P1" }];
    const child = makeLine({ line_id: 2, element_id: 10 });
    const root = makeLine({ line_id: 1, children: [child] });

    const flat = flattenForExport([root], { includeChildren: true, elements });

    expect(flat[1].item.item_code).toBe("P1");
  });
});

describe("elementSectionTitle", () => {
  it("returns 'Unassigned' for a null element", () => {
    expect(elementSectionTitle(null)).toBe("Unassigned");
  });

  it("delegates to elementLabel for a real element", () => {
    expect(elementSectionTitle({ code: "P1", structure_name: "Bridge" })).toBe(
      "P1 · Bridge",
    );
  });
});
