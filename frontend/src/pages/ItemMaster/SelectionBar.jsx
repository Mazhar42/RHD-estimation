import React from "react";

export default function SelectionBar({ label, actions }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-700 bg-gray-800 px-3 py-2 text-white">
      <div className="text-xs">{label}</div>
      <div className="flex items-center gap-2">
        {actions.map(({ label: text, onClick, tone = "neutral" }) => (
          <button
            key={text}
            type="button"
            onClick={onClick}
            className={`rounded px-3 py-1 text-xs text-white ${
              tone === "primary"
                ? "bg-teal-600 hover:bg-teal-700"
                : tone === "danger"
                  ? "bg-red-600 hover:bg-red-700"
                  : tone === "accent"
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-gray-600 hover:bg-gray-500"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
