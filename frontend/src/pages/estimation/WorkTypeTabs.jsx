import React from "react";

export const SUMMARY_TAB = "__summary__";

export default function WorkTypeTabs({ workTypes, active, onChange, onRenameParts }) {
  const tab = (id, label) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={active === id}
      className={`px-4 py-2 text-sm font-medium focus:outline-none ${
        active === id ? "border-b-2 border-teal-600 text-teal-600" : "text-gray-500 hover:text-gray-700"
      }`}
      onClick={() => onChange(id)}
    >
      {label}
    </button>
  );
  return (
    <div className="mb-4 flex border-b border-gray-200" role="tablist">
      {workTypes.map((wt) => tab(wt.code, wt.label))}
      {tab(SUMMARY_TAB, "Summary")}
      {onRenameParts && (
        <button
          type="button"
          className="ml-auto px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 focus:outline-none"
          onClick={onRenameParts}
          title="Rename A1 / A2 / P1… or manage road chainage segments"
        >
          Rename parts
        </button>
      )}
    </div>
  );
}
