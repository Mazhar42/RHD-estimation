import React, { useEffect } from "react";

export default function ConfirmDeleteLinesModal({
  selectedIds,
  lines,
  onClose,
  onConfirm,
}) {
  // Key handling: Esc closes, Enter confirms delete
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onConfirm]);

  const count = selectedIds.length;
  const single = count === 1;
  const line = single ? lines.find((l) => l.line_id === selectedIds[0]) : null;

  return (
    <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md z-50 relative border border-gray-200">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>
        </button>
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-gray-900">
          Confirm Delete
        </h3>
        {single ? (
          <p className="mb-3 text-xs text-gray-700">
            You are about to delete 1 line:{" "}
            <span className="font-medium">
              {line?.item?.item_code} — {line?.item?.item_description}
            </span>
            . This action cannot be undone.
          </p>
        ) : (
          <p className="mb-3 text-xs text-gray-700">
            You are about to delete {count} selected lines. This action cannot
            be undone.
          </p>
        )}
        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold py-1 px-3 rounded shadow-sm text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white font-medium py-1 px-3 rounded inline-flex items-center gap-1 text-xs"
          >
            Delete {single ? "Line" : "Lines"}
          </button>
        </div>
      </div>
    </div>
  );
}
