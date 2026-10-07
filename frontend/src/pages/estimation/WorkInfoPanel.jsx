import React, { useEffect, useState } from "react";
import { GpsDisplay } from "../../components/gps/GpsInput";

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

// Commits on blur or Enter rather than per keystroke: typing "2025" used
// to save 2, 20, 202 and 2025 in turn and refetch the catalogue each time.
function RateYearInput({ value, disabled, onCommit }) {
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const commit = () => {
    const trimmed = String(draft).trim();
    const next = trimmed === "" ? null : parseInt(trimmed, 10);
    if (next !== null && (Number.isNaN(next) || next < MIN_YEAR || next > MAX_YEAR)) {
      setError(`Enter a year between ${MIN_YEAR} and ${MAX_YEAR}, or leave blank for the newest rates.`);
      return;
    }
    setError("");
    if (next !== (value ?? null)) onCommit(next);
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-xs text-teal-900">
        <span className="font-medium">Rate year</span>
        <input
          type="number"
          min={MIN_YEAR}
          max={MAX_YEAR}
          disabled={disabled}
          value={draft}
          placeholder="Newest"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="w-20 rounded border border-teal-300 px-2 py-1 text-xs"
        />
      </label>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

export default function WorkInfoPanel({ work, rateYear, canEdit, onRateYearChange }) {
  if (!work?.project_id) return null;
  return (
    <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="font-semibold">
            {work.name_id} · {work.project_name}
          </div>
          {work.client_name && <div className="text-xs text-teal-800">Client: {work.client_name}</div>}
          {work.summary && <div className="text-xs text-teal-800">{work.summary}</div>}
        </div>
        <div className="min-w-[220px] space-y-2">
          <GpsDisplay geometryKind={work.geometry_kind} points={work.geo_points || []} />
          <RateYearInput value={rateYear} disabled={!canEdit} onCommit={onRateYearChange} />
        </div>
      </div>
    </div>
  );
}
