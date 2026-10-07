import React, { useEffect, useMemo, useState } from "react";
import Modal from "../../../components/ui/Modal";
import { apiClient } from "../../../api/axios";
import { useToast } from "../../../components/ui/Toast";
import {
  MASS_FILTER_COLUMNS,
  NUMBER_OPERATORS,
  STRING_OPERATORS,
  activeFilters,
  isNumberColumn,
  matchesFilters,
} from "../itemMasterUtils";
import { btnDanger, btnSecondary, textInput } from "../styles";

const BATCH_SIZE = 20;
const newFilter = (column = "division") => ({ column, operator: "equals", value: "" });

// Deletes the region-rate rows currently loaded in the table that match
// the filters. It deliberately never deletes anything without at least one
// filter value, and it only sees the loaded page -- the copy says so.
export default function MassDeleteModal({ open, onClose, items, onDeleted }) {
  const { showToast } = useToast();
  const [filters, setFilters] = useState([newFilter()]);
  const [join, setJoin] = useState("AND");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    if (open) {
      setFilters([newFilter()]);
      setJoin("AND");
      setConfirming(false);
    }
  }, [open]);

  const matches = useMemo(
    () => (items || []).filter((it) => matchesFilters(it, filters, join)),
    [items, filters, join],
  );
  const hasFilter = activeFilters(filters).length > 0;

  const updateFilter = (idx, patch) =>
    setFilters((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));

  const run = async () => {
    const ids = matches.map((it) => it.item_id).filter(Boolean);
    if (ids.length === 0) return;
    setBusy(true);
    setDone(0);
    setFailed(0);
    let ok = 0;
    let bad = 0;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const results = await Promise.allSettled(
        ids.slice(i, i + BATCH_SIZE).map((id) => apiClient.delete(`/items/${id}`)),
      );
      const batchOk = results.filter((r) => r.status === "fulfilled").length;
      ok += batchOk;
      bad += results.length - batchOk;
      setDone(ok);
      setFailed(bad);
    }
    setBusy(false);
    await onDeleted();
    onClose();
    showToast(
      bad === 0 ? `Deleted ${ok} row(s).` : `Deleted ${ok} row(s); ${bad} couldn't be deleted (probably used in an estimate).`,
      bad === 0 ? "success" : "error",
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mass Delete Items"
      maxWidthClassName="max-w-xl"
      closeDisabled={busy}
      onSubmit={() => {
        if (busy || matches.length === 0) return;
        if (confirming) run();
        else setConfirming(true);
      }}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          {!confirming && (
            <button type="submit" disabled={busy || matches.length === 0} className={btnDanger}>
              Delete {matches.length > 0 ? matches.length : ""} row(s)…
            </button>
          )}
        </div>
      }
    >
      <p className="mb-3 text-sm text-gray-700">
        Deletes matching rows from the <strong>{(items || []).length} rows loaded on this page</strong>. This can't be
        undone.
      </p>
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center gap-1 text-xs text-gray-600">
          Match
          <select value={join} onChange={(e) => setJoin(e.target.value)} className="rounded border p-1 text-xs">
            <option value="AND">all filters</option>
            <option value="OR">any filter</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setFilters((prev) => [...prev, newFilter("code")])}
          className="rounded bg-teal-600 px-2 py-1 text-xs text-white hover:bg-teal-700"
        >
          Add filter
        </button>
      </div>
      <div className="space-y-2">
        {filters.map((f, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
            <label className="text-xs text-gray-700">
              Column
              <select
                value={f.column}
                onChange={(e) => updateFilter(idx, { column: e.target.value, operator: "equals", value: "" })}
                className={textInput}
              >
                {MASS_FILTER_COLUMNS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-700">
              Operator
              <select
                value={f.operator}
                onChange={(e) => updateFilter(idx, { operator: e.target.value })}
                className={textInput}
              >
                {(isNumberColumn(f.column) ? NUMBER_OPERATORS : STRING_OPERATORS).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-700">
              Value
              <input
                type={isNumberColumn(f.column) ? "number" : "text"}
                value={f.value}
                onChange={(e) => {
                  updateFilter(idx, { value: e.target.value });
                  setConfirming(false);
                }}
                className={textInput}
              />
            </label>
            <button
              type="button"
              onClick={() => setFilters((prev) => prev.filter((_, i) => i !== idx))}
              disabled={filters.length === 1}
              className="mb-0.5 rounded bg-gray-200 px-2 py-2 text-xs text-gray-800 hover:bg-gray-300 disabled:opacity-50"
              aria-label="Remove filter"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-gray-700">
        Matching rows: <span className="font-medium">{hasFilter ? matches.length : "enter a filter value"}</span>
      </p>
      {confirming && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <p className="mb-2 text-xs text-red-700">
            Permanently delete <span className="font-semibold">{matches.length}</span> row(s)?
          </p>
          {busy ? (
            <div>
              <p className="mb-1 text-xs text-red-700">
                Deleting… {done + failed} of {matches.length}
              </p>
              <div className="h-2 w-full rounded bg-red-100">
                <div
                  className="h-2 rounded bg-red-500"
                  style={{ width: `${matches.length ? Math.round(((done + failed) / matches.length) * 100) : 0}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className={btnSecondary}>
                Back
              </button>
              <button type="submit" className={btnDanger} data-autofocus>
                Yes, delete
              </button>
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">Rows used in an estimate can't be deleted and will be skipped.</p>
    </Modal>
  );
}
