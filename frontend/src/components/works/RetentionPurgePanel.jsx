import React, { useState } from "react";
import { purgeExpiredWorks } from "../../api/works";

export default function RetentionPurgePanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  const run = async (dryRun) => {
    setIsRunning(true);
    setError("");
    try {
      const result = await purgeExpiredWorks({ dryRun });
      setReport(result);
    } catch (runError) {
      setError(
        runError?.response?.data?.detail || "Failed to run the purge job.",
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-amber-900">
            Work retention
          </div>
          <div className="text-xs text-amber-800">
            Works past their 7-day expiry are archived to a stub. This runs
            hourly via cron; use these to check or trigger it manually.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => run(true)}
            disabled={isRunning}
            className="rounded border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
          >
            Check expired
          </button>
          <button
            type="button"
            onClick={() => run(false)}
            disabled={isRunning}
            className="rounded bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {isRunning ? "Running…" : "Purge now"}
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {report && (
        <div className="mt-2 rounded border border-amber-200 bg-white px-3 py-2 text-xs text-amber-900">
          {report.dry_run ? "Dry run" : "Purge"} found {report.candidates}{" "}
          expired work(s); {report.purged_project_ids.length} archived.
          {report.errors.length > 0 && (
            <div className="mt-1 text-red-700">
              {report.errors.length} error(s): {report.errors.join("; ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
