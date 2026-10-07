import React from "react";
import { formatRate } from "./itemMasterUtils";

const headerCell =
  "px-2 py-1 text-left text-xs font-bold border-r text-gray-800 border-gray-200";
const filterInput =
  "w-full min-w-0 text-xs px-2 py-1 border rounded-md bg-white text-gray-900 border-gray-300 placeholder-gray-500 focus:border-teal-500 focus:ring-1 focus:ring-teal-200";
const bodyCell = "px-2 py-1 text-xs border-r text-gray-800 border-gray-200";

function ResizableHeader({ column, label, widths, startResize }) {
  return (
    <th
      style={{ width: widths[column], minWidth: widths[column] }}
      className={`relative ${headerCell} group select-none`}
    >
      {label}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent group-hover:bg-teal-400 z-20"
        onMouseDown={(e) => startResize(e, column)}
      />
    </th>
  );
}

// The item-master pivot grid: one row per (division, code[, year]) with a
// rate column per region, plus a per-column filter row.
export default function ItemRateTable({
  rows,
  regionNames,
  divisions,
  search,
  onSearchChange,
  units,
  years,
  showYear,
  selectable,
  selectedKey,
  onToggleSelect,
  widths,
  startResize,
  emptyMessage,
  loading,
  footer,
}) {
  const colCount = (selectable ? 1 : 0) + 5 + (showYear ? 1 : 0) + regionNames.length;
  const setField = (field) => (e) => onSearchChange({ ...search, [field]: e.target.value });

  return (
    <div className="flex-1 border rounded-lg flex flex-col border-gray-200 min-h-0 overflow-hidden">
      <div className="relative flex-1 overflow-auto">
        {loading && (
          <div
            className="absolute inset-x-0 top-0 z-30 h-0.5 animate-pulse bg-teal-500"
            role="progressbar"
            aria-label="Loading items"
          />
        )}
        <table className="min-w-full border-collapse table-fixed">
          <thead className="sticky top-0 z-10 bg-gray-100 border-b-2 border-gray-200">
            <tr>
              {selectable && (
                <th className={`${headerCell} text-center min-w-[40px]`}>
                  <span className="sr-only">Select</span>
                </th>
              )}
              <ResizableHeader column="division" label="Division" widths={widths} startResize={startResize} />
              <ResizableHeader column="code" label="Code" widths={widths} startResize={startResize} />
              <ResizableHeader column="description" label="Description" widths={widths} startResize={startResize} />
              <th className={`${headerCell} min-w-[120px] sm:min-w-[150px]`}>Unit</th>
              <th className={`${headerCell} min-w-[140px]`}>Organization</th>
              {showYear && <th className={`${headerCell} min-w-[80px]`}>Year</th>}
              {regionNames.map((r) => (
                <th key={r} className={`${headerCell} text-right min-w-[140px]`}>
                  {r}
                </th>
              ))}
            </tr>
            <tr>
              {selectable && <th className="px-2 py-1 border-r border-gray-200" />}
              <th className="px-2 py-1 border-r border-gray-200">
                <select
                  aria-label="Filter by division"
                  value={search.division}
                  onChange={setField("division")}
                  className={filterInput}
                >
                  <option value="">All Divisions</option>
                  {divisions.map((d) => (
                    <option key={d.division_id} value={d.division_id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-2 py-1 border-r border-gray-200">
                <input
                  aria-label="Filter by code"
                  type="text"
                  placeholder="Search..."
                  value={search.code}
                  onChange={setField("code")}
                  className={filterInput}
                />
              </th>
              <th className="px-2 py-1 border-r border-gray-200">
                <input
                  aria-label="Filter by description"
                  type="text"
                  placeholder="Search..."
                  value={search.description}
                  onChange={setField("description")}
                  className={filterInput}
                />
              </th>
              <th className="px-2 py-1 border-r border-gray-200">
                <select
                  aria-label="Filter by unit"
                  value={search.unit}
                  onChange={setField("unit")}
                  className={filterInput}
                >
                  <option value="">All Units</option>
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-2 py-1 border-r border-gray-200" />
              {showYear && (
                <th className="px-2 py-1 border-r border-gray-200">
                  <select
                    aria-label="Filter by rate year"
                    value={search.year}
                    onChange={setField("year")}
                    className={filterInput}
                  >
                    <option value="">All</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </th>
              )}
              {regionNames.map((r) => (
                <th key={r} className="px-2 py-1 border-r border-gray-200" />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-4 sm:p-8 text-center text-gray-600">
                  <div className="text-sm font-medium">
                    {loading ? "Loading…" : emptyMessage}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.key}
                  className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-teal-50 transition-colors ${
                    selectedKey === row.key ? "!bg-teal-100" : ""
                  }`}
                >
                  {selectable && (
                    <td className="px-2 py-1 text-center border-r border-gray-200">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.item_code}`}
                        checked={selectedKey === row.key}
                        onChange={() => onToggleSelect(row.key)}
                      />
                    </td>
                  )}
                  <td className={`${bodyCell} whitespace-normal break-words`}>
                    {row.division?.name ?? "—"}
                  </td>
                  <td className={`${bodyCell} whitespace-normal break-words`}>{row.item_code}</td>
                  <td
                    className={`${bodyCell} whitespace-normal break-words`}
                    title={row.item_description}
                  >
                    {row.item_description}
                  </td>
                  <td className={`${bodyCell} whitespace-nowrap`}>{row.unit || "—"}</td>
                  <td className={`${bodyCell} whitespace-nowrap`}>{row.organization}</td>
                  {showYear && (
                    <td className={`${bodyCell} whitespace-nowrap tabular-nums`}>
                      {row.rate_year ?? "—"}
                    </td>
                  )}
                  {regionNames.map((r) => (
                    <td key={r} className={`${bodyCell} whitespace-nowrap text-right tabular-nums`}>
                      {formatRate(row.rates[r])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
