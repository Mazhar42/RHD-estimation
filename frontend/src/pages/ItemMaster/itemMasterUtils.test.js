import { describe, expect, it } from "vitest";
import {
  EMPTY_SEARCH,
  buildItemQuery,
  divisionsForOrg,
  formatRate,
  groupItemRows,
  groupToForm,
  isSearchActive,
  itemsInGroup,
  matchesFilters,
  pageWindow,
} from "./itemMasterUtils";

const row = (over) => ({
  item_id: 1,
  division_id: 7,
  division: { name: "Earthwork" },
  item_code: "E-1",
  item_description: "Excavation",
  unit: "cum",
  organization: "RHD",
  region: "Dhaka Zone",
  rate: 100,
  rate_year: 2025,
  ...over,
});

describe("formatRate", () => {
  it("formats numbers to two decimals and blanks non-numbers", () => {
    expect(formatRate(337.5)).toBe("337.50");
    expect(formatRate("12")).toBe("12.00");
    expect(formatRate(null)).toBe("");
    expect(formatRate("")).toBe("");
    expect(formatRate("abc")).toBe("");
  });
});

describe("groupItemRows", () => {
  it("pivots region rows into one row with a rate per region", () => {
    const rows = groupItemRows(
      [row({ item_id: 1, region: "Dhaka Zone", rate: 100 }), row({ item_id: 2, region: "Sylhet Zone", rate: 120 })],
      { byYear: true },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].rates).toEqual({ "Dhaka Zone": 100, "Sylhet Zone": 120 });
  });

  it("keeps different rate years as separate rows when grouping by year", () => {
    const rows = groupItemRows([row({ rate_year: 2024 }), row({ item_id: 2, rate_year: 2025 })], { byYear: true });
    expect(rows.map((r) => r.rate_year)).toEqual([2024, 2025]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });

  it("maps the legacy Cumilla spelling onto the Comilla column", () => {
    const [grouped] = groupItemRows([row({ region: "Cumilla Zone", rate: 90 })], { byYear: true });
    expect(grouped.rates).toEqual({ "Comilla Zone": 90 });
  });
});

describe("itemsInGroup", () => {
  const items = [
    row({ item_id: 1, rate_year: 2024 }),
    row({ item_id: 2, rate_year: 2025 }),
    row({ item_id: 3, rate_year: 2025, region: "Sylhet Zone" }),
    row({ item_id: 4, item_code: "E-2" }),
  ];

  it("only returns the selected year's rows for a year-keyed group", () => {
    expect(itemsInGroup(items, "7|E-1|2025").map((i) => i.item_id)).toEqual([2, 3]);
  });

  it("returns every year for a key without a year", () => {
    expect(itemsInGroup(items, "7|E-1").map((i) => i.item_id)).toEqual([1, 2, 3]);
  });
});

describe("groupToForm", () => {
  it("fills known region rates and blanks the rest", () => {
    const form = groupToForm([row({ region: "Dhaka Zone", rate: 100 })], ["Dhaka Zone", "Sylhet Zone"]);
    expect(form.regionRates).toEqual({ "Dhaka Zone": 100, "Sylhet Zone": "" });
    expect(form.rate_year).toBe(2025);
  });
});

describe("buildItemQuery", () => {
  it("builds pagination and only the filters that are set", () => {
    expect(
      buildItemQuery({ ...EMPTY_SEARCH, code: "E-1", division: "7", year: "2025" }, { page: 3, perPage: 50, orgName: "RHD" }),
    ).toEqual({ skip: 100, limit: 50, organization: "RHD", item_code: "E-1", division_id: 7, rate_year: 2025 });
  });

  it("maps the rate operator to min/max", () => {
    expect(buildItemQuery({ ...EMPTY_SEARCH, rate: "5", rateOperator: ">" }, { page: 1, perPage: 10 }).rate_min).toBe(5);
    expect(buildItemQuery({ ...EMPTY_SEARCH, rate: "5", rateOperator: "<" }, { page: 1, perPage: 10 }).rate_max).toBe(5);
  });
});

describe("isSearchActive", () => {
  it("is false for the empty search and true once any field is set", () => {
    expect(isSearchActive(EMPTY_SEARCH)).toBe(false);
    expect(isSearchActive({ ...EMPTY_SEARCH, unit: "cum" })).toBe(true);
    expect(isSearchActive({ ...EMPTY_SEARCH, year: "2025" })).toBe(true);
  });
});

describe("divisionsForOrg", () => {
  const divisions = [
    { division_id: 1, organization_id: 1 },
    { division_id: 2, organization_id: 2 },
    { division_id: 3, organization_id: null },
  ];
  it("keeps the org's divisions, plus unowned ones for RHD", () => {
    expect(divisionsForOrg(divisions, { org_id: 1, name: "RHD" }).map((d) => d.division_id)).toEqual([1, 3]);
    expect(divisionsForOrg(divisions, { org_id: 2, name: "LGED" }).map((d) => d.division_id)).toEqual([2]);
    expect(divisionsForOrg(divisions, null)).toHaveLength(3);
  });
});

describe("matchesFilters (mass delete)", () => {
  const item = row();
  it("never matches when no filter has a value", () => {
    expect(matchesFilters(item, [{ column: "code", operator: "equals", value: "" }], "AND")).toBe(false);
  });

  it("ignores blank filters instead of failing the AND", () => {
    const filters = [
      { column: "code", operator: "equals", value: "e-1" },
      { column: "unit", operator: "equals", value: "" },
    ];
    expect(matchesFilters(item, filters, "AND")).toBe(true);
  });

  it("supports numeric operators and OR", () => {
    expect(matchesFilters(item, [{ column: "rate", operator: "greater_than", value: "50" }], "AND")).toBe(true);
    const filters = [
      { column: "rate", operator: "less_than", value: "50" },
      { column: "division", operator: "contains", value: "earth" },
    ];
    expect(matchesFilters(item, filters, "AND")).toBe(false);
    expect(matchesFilters(item, filters, "OR")).toBe(true);
  });
});

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });
  it("centres on the current page and clamps at the ends", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12]);
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
  });
  it("is empty with no pages", () => {
    expect(pageWindow(1, 0)).toEqual([]);
  });
});
