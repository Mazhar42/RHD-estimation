import React from "react";
import Modal from "../../../components/ui/Modal";
import { downloadLineAttachment } from "../../../utils/download";
import { elementLabel } from "../../../utils/elementLabel";
import { formatAmount } from "../lineTree";

function Field({ label, children }) {
  return (
    <div>
      <dt className="inline text-gray-600">{label}:</dt> <dd className="inline">{children}</dd>
    </div>
  );
}

export default function LineDetailModal({ line, elements = [], onClose }) {
  const currentElement = elements.find((el) => el.element_id === line?.element_id);
  return (
    <Modal
      open
      onClose={onClose}
      title="Line details"
      maxWidthClassName="max-w-xl"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-teal-600 bg-white px-3 py-1 text-xs font-semibold text-teal-700 shadow-sm hover:bg-teal-50"
          >
            Close
          </button>
        </div>
      }
    >
      <dl className="space-y-2 text-xs text-gray-800">
        <Field label="Item">
          <span className="font-medium">
            {line?.item?.item_code} — {line?.item?.item_description}
          </span>
        </Field>
        <Field label="Division">{line?.item?.division?.name || "—"}</Field>
        <Field label="Rate">
          {line?.rate != null ? formatAmount(line.rate) : "—"} {line?.item?.unit ? `(${line.item.unit})` : ""}
        </Field>
        <Field label="Sub description">{line?.sub_description || "—"}</Field>
        {elements.length > 0 && (
          <Field label="Element">
            {currentElement ? elementLabel(currentElement) : "— Unassigned —"}
            {line?.parent_line_id != null && <span className="text-gray-500"> (inherited from parent)</span>}
          </Field>
        )}
        {line?.attachments?.length > 0 && (
          <Field label="Attachment">
            <span className="font-medium">{line.attachments[0].filename}</span>{" "}
            <button
              type="button"
              onClick={() => downloadLineAttachment(line)}
              className="rounded bg-rose-600 px-2 py-1 text-white hover:bg-rose-700"
            >
              Download
            </button>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="No. of units">{line?.no_of_units ?? "—"}</Field>
          <Field label="Quantity (direct)">{line?.quantity ?? "—"}</Field>
          <Field label="Length">{line?.length ?? "—"}</Field>
          <Field label="Width">{line?.width ?? "—"}</Field>
          <Field label="Thickness">{line?.thickness ?? "—"}</Field>
          <Field label="Calculated qty">{line?.calculated_qty ?? "—"}</Field>
        </div>
        <Field label="Amount">
          <span className="font-semibold">{line?.amount != null ? formatAmount(line.amount) : "—"}</span>
        </Field>
      </dl>
    </Modal>
  );
}
