import React from "react";
import Modal from "../ui/Modal.jsx";
import AttachmentPanel from "./AttachmentPanel.jsx";

export default function LineAttachmentsDialog({
  line,
  onClose,
  readOnly = false,
}) {
  return (
    <Modal
      open={!!line}
      onClose={onClose}
      title={`Attachments — ${line?.item?.item_code || "Line"}`}
      maxWidthClassName="max-w-2xl"
    >
      {line && (
        <AttachmentPanel
          ownerType="estimation_line"
          ownerId={line.line_id}
          readOnly={readOnly}
        />
      )}
    </Modal>
  );
}
