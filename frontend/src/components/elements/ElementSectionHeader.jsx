import React from "react";
import { elementLabel, elementKindLabel } from "../../utils/elementLabel";

// Section header shown above a structural element's group of division
// tables. Sits outside the tables (not a colSpan row or nested table) so it
// doesn't interact with each division's own sticky header / column widths.
export default function ElementSectionHeader({ element, onManage }) {
  if (!element) {
    return (
      <div className="flex items-center justify-between mb-3 mt-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
          Unassigned
        </h2>
        <span className="text-xs text-gray-400">
          Not yet linked to a pier, abutment or chainage segment
        </span>
      </div>
    );
  }

  const chainageRange =
    element.kind === "chainage" &&
    element.chainage_from_m != null &&
    element.chainage_to_m != null
      ? `${Number(element.chainage_from_m).toFixed(0)} m – ${Number(element.chainage_to_m).toFixed(0)} m`
      : null;

  return (
    <div className="flex items-center justify-between mb-3 mt-2 border-b-2 border-indigo-200 pb-2">
      <div className="flex items-baseline gap-2">
        <span className="inline-flex items-center rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
          {element.work_type === "bridge" ? "Bridge" : "Road"}
        </span>
        <h2 className="text-base font-bold text-gray-900">
          {elementLabel(element)}
        </h2>
        <span className="text-xs text-gray-500">
          {elementKindLabel(element)}
          {chainageRange ? ` · ${chainageRange}` : ""}
        </span>
      </div>
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="text-xs text-indigo-700 hover:text-indigo-900 underline"
        >
          Manage elements
        </button>
      )}
    </div>
  );
}
