import React from "react";

// A text input with a small unit suffix shown inside the field (meeting item 4),
// e.g. "m", "m²", "m³", "nos". `unit` is the already-resolved adornment string;
// pass "" to render a plain input. All other props are forwarded to <input>.
export default function InputWithUnit({ unit = "", className = "", ...props }) {
  if (!unit) {
    return <input {...props} className={className} />;
  }
  return (
    <div className="relative">
      <input {...props} className={`${className} pr-12`} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-gray-400">
        {unit}
      </span>
    </div>
  );
}
