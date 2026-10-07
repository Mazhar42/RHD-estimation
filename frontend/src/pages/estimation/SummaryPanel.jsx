import React, { useEffect, useState } from "react";
import { getEstimationSummary } from "../../api/estimations";
import { GpsDisplay } from "../../components/gps/GpsInput";
import { formatAmount } from "./lineTree";

// Totals per work type plus the grand total, recomputed server-side
// whenever the lines change.
export default function SummaryPanel({ estimationId, lines, geo }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    getEstimationSummary(estimationId)
      .then((data) => !cancelled && setSummary(data))
      .catch((e) => !cancelled && setError(e?.response?.data?.detail || "Couldn't load the summary."));
    return () => {
      cancelled = true;
    };
  }, [estimationId, lines]);

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!summary) return <div className="p-6 text-sm text-gray-500">Loading summary…</div>;

  return (
    <div className="space-y-8">
      {summary.work_types.map((wts) => (
        <section key={wts.work_type.code} className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
          <h3 className="border-b border-gray-200 bg-gray-100 px-6 py-4 text-lg font-bold uppercase tracking-wide text-gray-800">
            {wts.work_type.label}
          </h3>
          <dl className="grid grid-cols-1 gap-4 p-6 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-gray-500">Item Master</dt>
              <dd className="text-lg font-semibold text-gray-900">{formatAmount(wts.standard_total)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Special Items</dt>
              <dd className="text-lg font-semibold text-gray-900">{formatAmount(wts.special_total)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Work Type Total</dt>
              <dd className="text-lg font-bold text-teal-700">{formatAmount(wts.total)}</dd>
            </div>
          </dl>
        </section>
      ))}
      {summary.unassigned_total > 0 && (
        <div className="text-sm text-gray-500">Unassigned lines: {formatAmount(summary.unassigned_total)}</div>
      )}
      {geo.points.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
          <h3 className="border-b border-gray-200 bg-gray-100 px-6 py-4 text-lg font-bold uppercase tracking-wide text-gray-800">
            Route / Coordinates
          </h3>
          <div className="space-y-3 p-6 text-sm">
            <ol className="list-decimal space-y-1 pl-6 text-gray-700">
              {geo.points.map((point, index) => (
                <li key={point.geo_point_id ?? index}>
                  {point.label ? `${point.label}: ` : ""}
                  {point.latitude}, {point.longitude}
                </li>
              ))}
            </ol>
            <GpsDisplay geometryKind={geo.geometryKind} points={geo.points} />
          </div>
        </section>
      )}
      {summary.pending_line_count > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">
          {summary.pending_line_count} part{summary.pending_line_count === 1 ? "" : "s"} still missing numbers (not
          included in the totals).
        </div>
      )}
      <div className="mb-8 mt-4 flex flex-col items-center justify-between rounded-xl border-2 border-emerald-500 bg-emerald-50 p-8 shadow-md sm:flex-row">
        <h2 className="text-2xl font-bold uppercase tracking-tight text-emerald-800 sm:text-3xl">
          Grand Total (All Work Types)
        </h2>
        <div className="mt-4 text-3xl font-extrabold text-emerald-700 sm:mt-0 sm:text-4xl" data-testid="grand-total">
          {formatAmount(summary.grand_total)}
        </div>
      </div>
    </div>
  );
}
