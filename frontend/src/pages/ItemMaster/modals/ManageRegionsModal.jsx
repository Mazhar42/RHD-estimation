import React, { useEffect, useState } from "react";
import Modal from "../../../components/ui/Modal";
import { createRegion, deleteRegion, updateRegion } from "../../../api/orgs";
import { useToast } from "../../../components/ui/Toast";
import EditableNameList from "./EditableNameList";
import { btnPrimary, btnSecondary, errorInput, textInput } from "../styles";

export default function ManageRegionsModal({ open, onClose, selectedOrg, regions, regionsError, onRetry, onChanged }) {
  const { showToast } = useToast();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setNewName("");
      setError("");
    }
  }, [open]);

  const add = async () => {
    if (!newName.trim()) {
      setError("Enter a region name");
      return;
    }
    if (!selectedOrg?.org_id) {
      setError("Select an organization first");
      return;
    }
    setBusy(true);
    try {
      await createRegion(selectedOrg.org_id, newName.trim());
      await onChanged();
      setNewName("");
      showToast("Region added");
    } catch {
      setError("Region already exists or couldn't be added");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage Regions"
      maxWidthClassName="max-w-md"
      onSubmit={add}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Done
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            Add Region
          </button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-gray-600">
        Regions (zones) for <strong>{selectedOrg?.name || "—"}</strong>. Each region gets its own rate column.
      </p>
      {regionsError && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>{regionsError}</span>
          <button type="button" onClick={onRetry} className="whitespace-nowrap underline hover:text-red-900">
            Retry
          </button>
        </div>
      )}
      <EditableNameList
        noun="region"
        rows={regions.map((r) => ({ id: r.region_id, name: r.name }))}
        emptyText={regionsError ? "Couldn't load regions." : "No regions yet."}
        onRename={async (id, name) => {
          await updateRegion(id, name);
          await onChanged();
        }}
        onDelete={async (id) => {
          await deleteRegion(id);
          await onChanged();
        }}
      />
      <div className="mt-4">
        <label className="text-xs text-gray-600" htmlFor="new-region-name">
          New region name
        </label>
        <input
          id="new-region-name"
          className={error ? errorInput : textInput}
          placeholder="e.g., Dhaka Zone"
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            if (error) setError("");
          }}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
