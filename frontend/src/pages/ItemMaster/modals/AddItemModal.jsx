import React, { useEffect, useState } from "react";
import { FaPlus, FaTrash } from "react-icons/fa";
import Modal from "../../../components/ui/Modal";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { apiClient } from "../../../api/axios";
import { useToast } from "../../../components/ui/Toast";
import { btnPrimary, btnSecondary, errorDetail, errorInput, textInput } from "../styles";

const NEW_UNIT = "__new_unit__";

function blankForm(regionNames, orgName) {
  return {
    division_id: "",
    item_code: "",
    item_description: "",
    unit: "",
    organization: orgName || "",
    regionRates: Object.fromEntries(regionNames.map((r) => [r, ""])),
  };
}

export default function AddItemModal({
  open,
  onClose,
  initialForm,
  divisions,
  units,
  regionNames,
  selectedOrg,
  onAdded,
  onDivisionsChanged,
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState(() => blankForm(regionNames, selectedOrg?.name));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [divisionMenuOpen, setDivisionMenuOpen] = useState(false);
  const [extraUnits, setExtraUnits] = useState([]);
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnit, setNewUnit] = useState("");
  const [divisionToDelete, setDivisionToDelete] = useState(null);
  const [deletingDivision, setDeletingDivision] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      initialForm
        ? { ...blankForm(regionNames, selectedOrg?.name), ...initialForm }
        : blankForm(regionNames, selectedOrg?.name),
    );
    setError("");
    setDivisionMenuOpen(false);
    setAddingUnit(false);
    // regionNames/selectedOrg are read at open time on purpose: the form
    // shouldn't reset under the user if regions refresh while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialForm]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const allUnits = [...new Set([...units, ...extraUnits])];
  const hasRate = Object.values(form.regionRates).some((v) => String(v).trim() !== "");
  const missing = {
    division: !form.division_id,
    code: !form.item_code.trim(),
    description: !form.item_description.trim(),
    unit: !form.unit,
  };

  const submit = async () => {
    if (regionNames.length === 0) {
      setError(`No regions for ${selectedOrg?.name || "this organization"}. Add a region first.`);
      return;
    }
    if (Object.values(missing).some(Boolean)) {
      setError("Fill in division, code, description and unit.");
      return;
    }
    if (!hasRate) {
      setError("Enter a rate for at least one region.");
      return;
    }
    const base = {
      item_code: form.item_code.trim(),
      item_description: form.item_description.trim(),
      unit: form.unit,
      division_id: parseInt(form.division_id, 10),
      organization: form.organization || selectedOrg?.name || "RHD",
    };
    const payloads = regionNames
      .filter((r) => String(form.regionRates[r] ?? "").trim() !== "")
      .map((region) => ({ ...base, region, rate: parseFloat(form.regionRates[region]) }));
    setBusy(true);
    try {
      await Promise.all(payloads.map((p) => apiClient.post("/items", p)));
      await onAdded();
      onClose();
      showToast(payloads.length === 1 ? "Item added" : `Item added for ${payloads.length} regions`);
    } catch (e) {
      setError(errorDetail(e, "Couldn't add one or more region rates"));
      await onAdded();
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteDivision = async () => {
    setDeletingDivision(true);
    try {
      await apiClient.delete(`/items/divisions/${divisionToDelete.division_id}`);
      if (String(form.division_id) === String(divisionToDelete.division_id)) set("division_id", "");
      await onDivisionsChanged();
      showToast("Division deleted");
      setDivisionToDelete(null);
    } catch (e) {
      showToast(errorDetail(e, "Couldn't delete the division"), "error");
    } finally {
      setDeletingDivision(false);
    }
  };

  const selectedDivision = divisions.find((d) => String(d.division_id) === String(form.division_id));
  const fieldClass = (bad) => (error && bad ? errorInput : textInput);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Add Item"
        onSubmit={submit}
        closeDisabled={busy}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
              Cancel
            </button>
            <button type="submit" disabled={busy || regionNames.length === 0} className={btnPrimary}>
              <FaPlus className="h-3 w-3" />
              {busy ? "Adding…" : "Add Item"}
            </button>
          </div>
        }
      >
        <p className="mb-3 text-xs text-gray-600">
          One item, with a rate for each region it applies to.
        </p>
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3">
          <div className="relative">
            <span className="text-xs text-gray-600">Division</span>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={divisionMenuOpen}
              onClick={() => setDivisionMenuOpen((v) => !v)}
              className={`${fieldClass(missing.division)} flex items-center justify-between text-left`}
            >
              <span>{selectedDivision?.name || "Select division"}</span>
              <span aria-hidden="true">▾</span>
            </button>
            {divisionMenuOpen && (
              <ul
                role="listbox"
                className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded border border-gray-200 bg-white shadow"
              >
                {divisions.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">No divisions</li>}
                {divisions.map((d) => (
                  <li key={d.division_id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                    <button
                      type="button"
                      role="option"
                      aria-selected={String(d.division_id) === String(form.division_id)}
                      className="flex-1 text-left text-xs"
                      onClick={() => {
                        set("division_id", d.division_id);
                        setDivisionMenuOpen(false);
                      }}
                    >
                      {d.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete division ${d.name}`}
                      className="ml-2 text-red-600 hover:text-red-800"
                      onClick={() => setDivisionToDelete(d)}
                    >
                      <FaTrash className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="text-xs text-gray-600">
            Item code
            <input
              value={form.item_code}
              onChange={(e) => set("item_code", e.target.value)}
              className={fieldClass(missing.code)}
            />
          </label>
          <label className="text-xs text-gray-600">
            Description
            <input
              value={form.item_description}
              onChange={(e) => set("item_description", e.target.value)}
              className={fieldClass(missing.description)}
            />
          </label>
          <label className="text-xs text-gray-600">
            Unit
            <select
              value={addingUnit ? NEW_UNIT : form.unit}
              onChange={(e) => {
                if (e.target.value === NEW_UNIT) {
                  setAddingUnit(true);
                } else {
                  set("unit", e.target.value);
                  setAddingUnit(false);
                }
              }}
              className={fieldClass(missing.unit)}
            >
              <option value="">Select unit</option>
              {allUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
              <option value={NEW_UNIT}>Add new unit…</option>
            </select>
          </label>
          {addingUnit && (
            <div className="flex items-center gap-2">
              <input
                aria-label="New unit"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="New unit"
                className={textInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
              <button
                type="button"
                className={btnPrimary}
                onClick={() => {
                  const unit = newUnit.trim();
                  if (!unit) return;
                  setExtraUnits((u) => [...u, unit]);
                  set("unit", unit);
                  setNewUnit("");
                  setAddingUnit(false);
                }}
              >
                Add
              </button>
            </div>
          )}
          <label className="text-xs text-gray-600">
            Organization
            <input value={form.organization} readOnly className={`${textInput} bg-gray-100`} />
          </label>
          <fieldset>
            <legend className="mb-1 text-xs text-gray-600">Rates by region</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {regionNames.map((r) => (
                <label key={r} className="flex items-center gap-2 text-[11px] text-gray-700">
                  <span className="whitespace-nowrap">{r}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={form.regionRates[r] ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, regionRates: { ...f.regionRates, [r]: e.target.value } }))
                    }
                    placeholder="Rate"
                    className={textInput}
                  />
                </label>
              ))}
            </div>
            {regionNames.length === 0 && (
              <p className="text-xs text-gray-600">
                No regions for {selectedOrg?.name || "this organization"} yet. Use Manage Regions to add one.
              </p>
            )}
          </fieldset>
        </div>
      </Modal>
      <ConfirmDialog
        open={Boolean(divisionToDelete)}
        title="Delete division"
        message={`Delete division “${divisionToDelete?.name ?? ""}”? Items in it will be removed too.`}
        busy={deletingDivision}
        busyLabel="Deleting…"
        onCancel={() => setDivisionToDelete(null)}
        onConfirm={confirmDeleteDivision}
      />
    </>
  );
}
