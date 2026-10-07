import React from "react";
import Modal from "./Modal.jsx";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busyLabel = "Working…",
  busy = false,
  danger = true,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      maxWidthClassName="max-w-sm"
      onSubmit={() => {
        if (!busy) onConfirm();
      }}
      closeDisabled={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-teal-600 bg-white px-3 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            data-autofocus
            className={`rounded px-3 py-1 text-xs font-semibold text-white disabled:opacity-60 ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-teal-700 hover:bg-teal-900"
            }`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm text-gray-700">{message}</p>
    </Modal>
  );
}
