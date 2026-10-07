import React, { useState } from "react";
import { FaEdit, FaTrash } from "react-icons/fa";

// A small list with inline rename and confirm-before-delete per row. Used
// by both Manage Regions and Manage Organizations. Rows are
// { id, name }; onRename/onDelete may throw to report failure.
export default function EditableNameList({ rows, emptyText, onRename, onDelete, onPick, noun }) {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState("");

  const run = async (fn) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e?.response?.data?.detail || `Couldn't update the ${noun}`);
    }
  };

  const saveRename = (id) =>
    run(async () => {
      const name = editingName.trim();
      if (!name) return;
      await onRename(id, name);
      setEditingId(null);
    });

  if (rows.length === 0) {
    return (
      <div className="rounded border border-gray-200 p-2 text-xs text-gray-500">{emptyText}</div>
    );
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <ul className="max-h-48 overflow-auto rounded border border-gray-200 p-1">
        {rows.map((row) => (
          <li key={row.id} className="border-b border-gray-100 px-2 py-2 text-xs last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              {editingId === row.id ? (
                <input
                  aria-label={`Rename ${row.name}`}
                  className="w-2/3 rounded border border-gray-300 p-1 text-xs"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveRename(row.id);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingId(null);
                    }
                  }}
                  autoFocus
                />
              ) : onPick ? (
                <button type="button" className="text-left font-medium text-gray-800 hover:underline" onClick={() => onPick(row.id)}>
                  {row.name}
                </button>
              ) : (
                <span className="font-medium text-gray-800">{row.name}</span>
              )}
              <div className="flex items-center gap-3">
                {editingId === row.id ? (
                  <>
                    <button type="button" onClick={() => saveRename(row.id)} className="text-teal-700 hover:text-teal-900">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-gray-600 hover:text-gray-800">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(row.id);
                        setEditingName(row.name);
                        setConfirmId(null);
                      }}
                      className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                    >
                      <FaEdit className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(row.id)}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-800"
                    >
                      <FaTrash className="h-3 w-3" /> Delete
                    </button>
                  </>
                )}
              </div>
            </div>
            {confirmId === row.id && (
              <div className="mt-2 flex items-center justify-between rounded border border-red-200 bg-red-50 p-2 text-[11px] text-gray-700">
                <span>Delete {noun} “{row.name}”?</span>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setConfirmId(null)} className="text-gray-700 hover:text-gray-900">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      run(async () => {
                        await onDelete(row.id);
                        setConfirmId(null);
                      })
                    }
                    className="font-semibold text-red-700 hover:text-red-900"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
