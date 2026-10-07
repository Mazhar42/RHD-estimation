import React from "react";
import { PAGE_SIZES, pageWindow } from "./itemMasterUtils";

const fmt = new Intl.NumberFormat("en-US");
const pageBtn = "px-2 py-1 border rounded text-xs disabled:opacity-50 hover:bg-gray-100 text-gray-600";

export default function Pagination({ page, totalPages, total, perPage, onPageChange, onPerPageChange }) {
  const start = total > 0 ? (page - 1) * perPage + 1 : 0;
  const end = total > 0 ? Math.min(page * perPage, total) : 0;
  const pages = pageWindow(page, totalPages);
  const lastShown = pages[pages.length - 1] ?? 0;
  const goTo = (p) => onPageChange(Math.min(Math.max(p, 1), totalPages || 1));

  return (
    <div className="flex flex-wrap justify-between items-center p-4 gap-3">
      <div className="text-xs text-gray-600">
        Showing {fmt.format(start)}–{fmt.format(end)} of {fmt.format(total)} items
      </div>
      <div className="flex items-center gap-2 text-gray-600">
        <select
          aria-label="Rows per page"
          value={perPage}
          onChange={(e) => onPerPageChange(parseInt(e.target.value, 10) || PAGE_SIZES[0])}
          className="text-xs border rounded px-2 py-1 text-gray-700"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button onClick={() => goTo(page - 1)} disabled={page <= 1} className={pageBtn} aria-label="Previous page">
            ‹
          </button>
          {pages.map((p) => (
            <button
              key={p}
              onClick={() => goTo(p)}
              aria-current={p === page ? "page" : undefined}
              className={`px-2 py-1 border rounded text-xs ${
                p === page ? "bg-teal-600 text-white border-teal-600" : "hover:bg-gray-100 text-gray-600"
              }`}
            >
              {p}
            </button>
          ))}
          {totalPages > lastShown && (
            <>
              <span className="px-2 py-1 text-gray-400 text-xs">…</span>
              <button onClick={() => goTo(totalPages)} className={pageBtn}>
                {totalPages}
              </button>
            </>
          )}
          <button
            onClick={() => goTo(page + 1)}
            disabled={page >= totalPages}
            className={pageBtn}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
        <label className="flex items-center gap-2 ml-3 text-xs text-gray-600">
          <span>Go to</span>
          <input
            type="number"
            min={1}
            max={Math.max(totalPages, 1)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const val = parseInt(e.currentTarget.value, 10);
              if (!Number.isNaN(val)) {
                goTo(val);
                e.currentTarget.blur();
              }
            }}
            className="w-16 border rounded px-2 py-1 text-xs text-gray-700"
          />
        </label>
      </div>
    </div>
  );
}
