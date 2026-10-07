import React, { useEffect, useState } from "react";
import Modal from "../../../components/ui/Modal";
import { apiClient } from "../../../api/axios";
import { useToast } from "../../../components/ui/Toast";
import { normalizeRegion } from "../itemMasterUtils";
import { btnPrimary, btnSecondary, errorDetail, textInput } from "../styles";

// Edits one grouped item (every region's rate row for a division + code
// [+ year]) in a single form. Existing region rows are updated in place;
// for normal items a newly filled-in region creates a row in the same rate
// year. Special items only update existing rows -- creating a plain item
// here would silently turn part of a special item into a normal one.
export default function EditItemGroupModal({
  open,
  onClose,
  initialForm,
  groupItems,
  isSpecial,
  divisions,
  units,
  regionNames,
  onSaved,
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialForm);
      setError("");
    }
  }, [open, initialForm]);

  if (!form) return null;

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const existingByRegion = new Map(groupItems.map((it) => [normalizeRegion(it.region), it]));

  const submit = async () => {
    if (!form.item_code.trim() || !form.item_description.trim() || !form.division_id) {
      setError("Division, code and description are required.");
      return;
    }
    const base = {
      item_code: form.item_code.trim(),
      item_description: form.item_description.trim(),
      unit: form.unit,
      division_id: parseInt(form.division_id, 10),
      organization: form.organization || "RHD",
    };
    const ops = [];
    for (const region of regionNames) {
      const raw = form.regionRates[region];
      const filled = raw !== "" && raw != null;
      const existing = existingByRegion.get(region);
      if (existing) {
        ops.push(
          apiClient.put(`/items/${existing.item_id}`, {
            ...base,
            region: existing.region,
            rate: filled ? parseFloat(raw) : null,
          }),
        );
      } else if (filled && !isSpecial) {
        ops.push(
          apiClient.post("/items", {
            ...base,
            region,
            rate: parseFloat(raw),
            rate_year: form.rate_year ?? undefined,
          }),
        );
      }
    }
    setBusy(true);
    try {
      await Promise.all(ops);
      onClose();
      showToast("Item updated");
    } catch (e) {
      setError(errorDetail(e, "Couldn't save all rates"));
    } finally {
      setBusy(false);
      await onSaved();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isSpecial ? "Edit Special Item" : "Edit Item"}
      maxWidthClassName="max-w-3xl"
      onSubmit={submit}
      closeDisabled={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-gray-600">
          Division
          <select value={form.division_id} onChange={(e) => set("division_id", e.target.value)} className={textInput}>
            <option value="">Select division</option>
            {divisions.map((d) => (
              <option key={d.division_id} value={d.division_id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Item code
          <input value={form.item_code} onChange={(e) => set("item_code", e.target.value)} className={textInput} />
        </label>
        <label className="col-span-2 text-xs text-gray-600">
          Description
          <input
            value={form.item_description}
            onChange={(e) => set("item_description", e.target.value)}
            className={textInput}
          />
        </label>
        <label className="text-xs text-gray-600">
          Unit
          <select value={form.unit || ""} onChange={(e) => set("unit", e.target.value)} className={textInput}>
            <option value="">Select unit</option>
            {[...new Set([...units, form.unit].filter(Boolean))].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Organization
          <input value={form.organization} onChange={(e) => set("organization", e.target.value)} className={textInput} />
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-semibold text-gray-900">
          Rates by region{form.rate_year ? ` (${form.rate_year})` : ""}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {regionNames.map((r) => {
            const locked = isSpecial && !existingByRegion.has(r);
            return (
              <label key={r} className="flex items-center gap-2 text-xs text-gray-700">
                <span className="w-40">{r}</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.regionRates[r] ?? ""}
                  disabled={locked}
                  title={locked ? "Special items can only update regions they already have" : undefined}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, regionRates: { ...f.regionRates, [r]: e.target.value } }))
                  }
                  className={`${textInput} disabled:bg-gray-100`}
                  placeholder={locked ? "—" : "Rate"}
                />
              </label>
            );
          })}
        </div>
      </fieldset>
    </Modal>
  );
}
