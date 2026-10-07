import React from "react";
import { Link } from "react-router-dom";

const notice =
  "mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900";

export default function PendingNotices({ estimationId, pendingSpecialCount, pendingLines, onResume }) {
  return (
    <>
      {pendingSpecialCount > 0 && (
        <div className={notice} role="status">
          <span>
            {pendingSpecialCount} special item{pendingSpecialCount === 1 ? " is" : "s are"} awaiting approval and not
            yet counted in this estimation.
          </span>
          <Link
            to={`/estimations/${estimationId}/special-items`}
            className="whitespace-nowrap font-semibold underline hover:text-amber-950"
          >
            Review special items
          </Link>
        </div>
      )}
      {pendingLines.length > 0 && (
        <div className={notice} role="status">
          <span>
            {pendingLines.length} part{pendingLines.length === 1 ? " still needs" : "s still need"} numbers. They are
            not yet counted in the total.
          </span>
          <button type="button" onClick={onResume} className="whitespace-nowrap font-semibold underline hover:text-amber-950">
            Resume entering
          </button>
        </div>
      )}
    </>
  );
}
