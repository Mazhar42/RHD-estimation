import React from "react";
import { Link } from "react-router-dom";
import { FaPlus, FaUpload } from "react-icons/fa";
import DropdownMenu from "../../components/ui/DropdownMenu";

const btn = "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition";

// Page tabs (Items / Special Items), title, and the always-available
// actions. Selection actions render below via `children`.
export default function EstimationHeader({
  estimationId,
  title,
  region,
  pendingSpecialCount,
  canEdit,
  hasLines,
  onAddItem,
  onImport,
  onDownload,
  children,
}) {
  const specialHref = `/estimations/${estimationId}/special-items${
    region ? `?region=${encodeURIComponent(region)}` : ""
  }`;
  return (
    <>
      <nav className="-mt-1 mb-1 flex gap-1" aria-label="Estimation sections">
        <span className="rounded-t-md bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white" aria-current="page">
          Items
        </span>
        <Link
          to={specialHref}
          className="inline-flex items-center gap-1.5 rounded-t-md bg-gray-100 px-4 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-200"
        >
          Special Items
          {pendingSpecialCount > 0 && (
            <span
              className="inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white"
              aria-label={`${pendingSpecialCount} awaiting approval`}
            >
              {pendingSpecialCount}
            </span>
          )}
        </Link>
      </nav>
      <div className="sticky top-0 z-30 mb-4 border-b border-gray-200 bg-white py-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-xs text-gray-600">
              Region: <span className="text-gray-900">{region || "—"}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={onAddItem}
                  className={`${btn} border-teal-700 bg-teal-700 text-white hover:bg-teal-800`}
                >
                  <FaPlus className="h-3 w-3" /> Add Item
                </button>
                <button
                  type="button"
                  onClick={onImport}
                  className={`${btn} border-teal-600 bg-white text-teal-700 hover:bg-teal-50`}
                >
                  <FaUpload className="h-3 w-3" /> Import
                </button>
              </>
            )}
            <DropdownMenu
              label="Export"
              buttonClassName={`${btn} border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50`}
              items={[
                { label: "Excel (.xlsx)", onSelect: () => onDownload("xlsx"), disabled: !hasLines },
                { label: "PDF", onSelect: () => onDownload("pdf"), disabled: !hasLines },
                { label: "CSV", onSelect: () => onDownload("csv"), disabled: !hasLines },
              ]}
            />
          </div>
        </div>
        {children}
      </div>
    </>
  );
}
