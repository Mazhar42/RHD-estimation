import { fetchAttachmentBlob } from "../api/attachments";
import { toast } from "../components/ui/Toast";

export const triggerBlobDownload = (blob, filename) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
};

export const downloadAttachmentFile = async (attachment) => {
  if (!attachment?.attachment_id) {
    throw new Error("Attachment metadata is missing.");
  }
  const blob = await fetchAttachmentBlob(attachment.attachment_id);
  triggerBlobDownload(
    blob,
    attachment.filename || `attachment-${attachment.attachment_id}`,
  );
};

export const downloadLineAttachment = (line) => {
  const attachment = line?.attachments?.[0];
  const action = attachment
    ? downloadAttachmentFile(attachment)
    : Promise.reject(new Error("Attachment data is missing."));

  return action.catch((error) => {
    console.error("Failed to download attachment", error);
    toast.error("Failed to download attachment.");
  });
};
