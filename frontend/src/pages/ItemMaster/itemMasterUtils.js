export const EMPTY_SEARCH = Object.freeze({
  division: "",
  code: "",
  description: "",
  unit: "",
  rate: "",
  rateOperator: "==",
  region: "",
  organization: "",
  year: "",
});

export const PAGE_SIZES = [50, 100, 200, 300];

export const ITEM_COLUMN_WIDTHS = { division: 150, code: 150, description: 300 };

export function formatRate(val) {
  const num = Number(val);
  return val !== null && val !== "" && Number.isFinite(num) ? num.toFixed(2) : "";
}

// Legacy rows may still carry the old "Cumilla Zone" spelling; the pivot
// columns are keyed by the canonical name, so without this their rate
// silently disappears from the table.
export function normalizeRegion(name) {
  return name === "Cumilla Zone" ? "Comilla Zone" : name;
}

export function isSearchActive(search) {
  return Object.keys(EMPTY_SEARCH).some(
    (key) => (search?.[key] ?? "") !== EMPTY_SEARCH[key],
  );
}

export function groupKey(row, { byYear }) {
  const base = `${row.division_id}|${row.item_code}`;
  return byYear ? `${base}|${row.rate_year ?? ""}` : base;
}

// Pivots one-row-per-region items into one row per (division, code[, year])
// with a { region: rate } map, in first-seen order.
export function groupItemRows(items, { byYear }) {
  const grouped = new Map();
  for (const it of items || []) {
    const key = groupKey(it, { byYear });
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        division: it.division,
        division_id: it.division_id,
        item_code: it.item_code,
        item_description: it.item_description,
        unit: it.unit,
        organization: it.organization || "RHD",
        rate_year: it.rate_year ?? null,
        rates: {},
      });
    }
    grouped.get(key).rates[normalizeRegion(it.region)] = it.rate;
  }
  return Array.from(grouped.values());
}

export function itemsInGroup(items, key) {
  const [divisionId, code, year] = String(key).split("|");
  const byYear = year !== undefined;
  return (items || []).filter(
    (it) =>
      String(it.division_id) === divisionId &&
      String(it.item_code) === code &&
      (!byYear || String(it.rate_year ?? "") === year),
  );
}

export function groupToForm(groupItems, regionNames) {
  const first = groupItems[0];
  const regionRates = Object.fromEntries(regionNames.map((r) => [r, ""]));
  for (const it of groupItems) {
    regionRates[normalizeRegion(it.region)] = it.rate ?? "";
  }
  return {
    division_id: first.division_id,
    item_code: first.item_code,
    item_description: first.item_description,
    unit: first.unit,
    organization: first.organization || "RHD",
    rate_year: first.rate_year ?? null,
    regionRates,
  };
}

export function divisionsForOrg(divisions, org) {
  if (!org) return divisions;
  return divisions.filter(
    (d) =>
      d.organization_id === org.org_id ||
      (d.organization_id == null && org.name === "RHD"),
  );
}

export function buildItemQuery(filters, { page, perPage, orgName }) {
  const params = { skip: (page - 1) * perPage, limit: perPage };
  if (orgName) params.organization = orgName;
  const divisionId = parseInt(filters.division, 10);
  if (divisionId) params.division_id = divisionId;
  if (filters.code) params.item_code = filters.code;
  if (filters.description) params.item_description = filters.description;
  if (filters.unit) params.unit = filters.unit;
  if (filters.region) params.region = filters.region;
  const year = parseInt(filters.year, 10);
  if (year) params.rate_year = year;
  const rate = parseFloat(filters.rate);
  if (!Number.isNaN(rate)) {
    if (filters.rateOperator === ">") params.rate_min = rate;
    else if (filters.rateOperator === "<") params.rate_max = rate;
    else if (filters.rateOperator === "==") params.search = `rate:${rate}`;
  }
  return params;
}

// Page numbers to show as buttons: up to `max` consecutive pages centred
// on the current one where possible.
export function pageWindow(current, total, max = 5) {
  if (total <= 0) return [];
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(max / 2));
  start = Math.min(start, total - max + 1);
  return Array.from({ length: max }, (_, i) => start + i);
}

export const MASS_FILTER_COLUMNS = [
  { value: "division", label: "Division" },
  { value: "code", label: "Code" },
  { value: "description", label: "Description" },
  { value: "unit", label: "Unit" },
  { value: "rate", label: "Rate" },
  { value: "region", label: "Region" },
];

export const STRING_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "starts_with", label: "Starts With" },
  { value: "ends_with", label: "Ends With" },
];

export const NUMBER_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "less_than", label: "Less Than" },
  { value: "less_or_equal", label: "Less Than or Equal" },
  { value: "greater_than", label: "Greater Than" },
  { value: "greater_or_equal", label: "Greater Than or Equal" },
];

export const isNumberColumn = (col) => col === "rate";

function columnValue(item, column) {
  switch (column) {
    case "division":
      return item.division?.name ?? "";
    case "code":
      return item.item_code ?? "";
    case "description":
      return item.item_description ?? "";
    case "unit":
      return item.unit ?? "";
    case "rate":
      return item.rate;
    case "region":
      return item.region ?? "";
    default:
      return "";
  }
}

export function matchesFilter(item, { column, operator, value }) {
  if (value === "" || value == null) return false;
  const v = columnValue(item, column);
  if (isNumberColumn(column)) {
    const num = parseFloat(value);
    if (Number.isNaN(num) || v == null) return false;
    switch (operator) {
      case "equals":
        return v === num;
      case "not_equals":
        return v !== num;
      case "less_than":
        return v < num;
      case "less_or_equal":
        return v <= num;
      case "greater_than":
        return v > num;
      case "greater_or_equal":
        return v >= num;
      default:
        return false;
    }
  }
  const lhs = String(v).toLowerCase();
  const rhs = String(value).toLowerCase();
  switch (operator) {
    case "equals":
      return lhs === rhs;
    case "not_equals":
      return lhs !== rhs;
    case "contains":
      return lhs.includes(rhs);
    case "starts_with":
      return lhs.startsWith(rhs);
    case "ends_with":
      return lhs.endsWith(rhs);
    default:
      return false;
  }
}

export function activeFilters(filters) {
  return (filters || []).filter((f) => String(f.value ?? "").trim() !== "");
}

export function matchesFilters(item, filters, join) {
  const active = activeFilters(filters);
  if (active.length === 0) return false;
  return join === "OR"
    ? active.some((f) => matchesFilter(item, f))
    : active.every((f) => matchesFilter(item, f));
}
