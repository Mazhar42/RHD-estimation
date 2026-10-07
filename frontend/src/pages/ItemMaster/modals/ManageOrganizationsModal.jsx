import React, { useEffect, useState } from "react";
import Modal from "../../../components/ui/Modal";
import { createOrganization, deleteOrganization, updateOrganization } from "../../../api/orgs";
import { useToast } from "../../../components/ui/Toast";
import EditableNameList from "./EditableNameList";
import { btnPrimary, btnSecondary, errorInput, textInput } from "../styles";

export default function ManageOrganizationsModal({
  open,
  onClose,
  organizations,
  selectedOrg,
  orgsError,
  onRetry,
  onSelect,
  fetchOrganizations,
}) {
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
    const name = newName.trim();
    if (!name) {
      setError("Enter an organization name");
      return;
    }
    setBusy(true);
    try {
      await createOrganization(name);
      const list = await fetchOrganizations();
      const created = list.find((o) => o.name.toLowerCase() === name.toLowerCase());
      if (created) await onSelect(created.org_id, list);
      setNewName("");
      showToast("Organization added");
    } catch {
      setError("Organization already exists or couldn't be added");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage Organizations"
      maxWidthClassName="max-w-md"
      onSubmit={add}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Done
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            Add Organization
          </button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-gray-600">
        Click an organization to make it active. Active: <strong>{selectedOrg?.name || "—"}</strong>
      </p>
      {orgsError && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>{orgsError}</span>
          <button type="button" onClick={onRetry} className="whitespace-nowrap underline hover:text-red-900">
            Retry
          </button>
        </div>
      )}
      <EditableNameList
        noun="organization"
        rows={organizations.map((o) => ({ id: o.org_id, name: o.name }))}
        emptyText={orgsError ? "Couldn't load organizations." : "No organizations yet."}
        onPick={(id) => onSelect(id)}
        onRename={async (id, name) => {
          await updateOrganization(id, name);
          await fetchOrganizations();
        }}
        onDelete={async (id) => {
          await deleteOrganization(id);
          const list = await fetchOrganizations();
          const keep = list.find((o) => o.org_id === selectedOrg?.org_id) || list[0] || null;
          await onSelect(keep?.org_id ?? "", list);
        }}
      />
      <div className="mt-4">
        <label className="text-xs text-gray-600" htmlFor="new-org-name">
          New organization name
        </label>
        <input
          id="new-org-name"
          className={error ? errorInput : textInput}
          placeholder="e.g., LGED"
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
