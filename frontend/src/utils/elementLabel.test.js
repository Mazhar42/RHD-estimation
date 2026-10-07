import { describe, it, expect } from "vitest";
import { elementLabel, elementKindLabel } from "./elementLabel";

describe("elementLabel", () => {
  it("returns an empty string for a missing element", () => {
    expect(elementLabel(null)).toBe("");
    expect(elementLabel(undefined)).toBe("");
  });

  it("returns just the code when there is no structure_name", () => {
    expect(elementLabel({ code: "P1" })).toBe("P1");
    expect(elementLabel({ code: "P1", structure_name: "" })).toBe("P1");
  });

  it("combines code and structure_name when both are present", () => {
    expect(elementLabel({ code: "P1", structure_name: "Sangu Bridge" })).toBe(
      "P1 · Sangu Bridge",
    );
  });
});

describe("elementKindLabel", () => {
  it("returns an empty string for a missing element", () => {
    expect(elementKindLabel(null)).toBe("");
  });

  it.each([
    ["abutment", "Abutment"],
    ["pier", "Pier"],
    ["span", "Span"],
    ["chainage", "Chainage"],
  ])("maps kind %s to %s", (kind, expected) => {
    expect(elementKindLabel({ kind })).toBe(expected);
  });

  it("falls back to a generic label for an unrecognized kind", () => {
    expect(elementKindLabel({ kind: "other" })).toBe("Element");
    expect(elementKindLabel({ kind: undefined })).toBe("Element");
  });
});
