import React, { useEffect, useState } from "react";
import Modal from "../../../components/ui/Modal";
import { apiClient } from "../../../api/axios";
import { useToast } from "../../../components/ui/Toast";
import { btnPrimary, btnSecondary, errorDetail, errorInput, textInput } from "../styles";

export default function AddDivisionModal({ open, onClose, selectedOrg, onAdded }) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Enter a division name");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post("/items/divisions", {
        name: name.trim(),
        organization_id: selectedOrg?.org_id,
      });
      await onAdded();
      onClose();
      showToast("Division added");
    } catch (e) {
      setError(errorDetail(e, "Couldn't add the division"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Division"
      maxWidthClassName="max-w-md"
      onSubmit={submit}
      closeDisabled={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "Adding…" : "Add Division"}
          </button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-gray-600">Create a division to group related items.</p>
      <label className="text-xs text-gray-600" htmlFor="new-division-name">
        Division name
      </label>
      <input
        id="new-division-name"
        className={error ? errorInput : textInput}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError("");
        }}
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Modal>
  );
}
