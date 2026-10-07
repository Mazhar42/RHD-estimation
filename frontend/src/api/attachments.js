import { apiClient } from "./axios";

export const listAttachments = async ({ ownerType, ownerId }) => {
  const response = await apiClient.get("/attachments", {
    params: {
      owner_type: ownerType,
      owner_id: ownerId,
    },
  });
  return response.data;
};

export const uploadAttachment = async ({
  ownerType,
  ownerId,
  file,
  onUploadProgress,
}) => {
  const formData = new FormData();
  formData.append("owner_type", ownerType);
  formData.append("owner_id", String(ownerId));
  formData.append("file", file);

  const response = await apiClient.post("/attachments", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress,
  });

  return response.data;
};

export const updateAttachment = async (attachmentId, payload) => {
  const response = await apiClient.patch(
    `/attachments/${attachmentId}`,
    payload,
  );
  return response.data;
};

export const deleteAttachment = async (attachmentId) => {
  const response = await apiClient.delete(`/attachments/${attachmentId}`);
  return response.data;
};

export const fetchAttachmentBlob = async (attachmentId) => {
  const response = await apiClient.get(`/attachments/${attachmentId}/content`, {
    responseType: "blob",
  });
  return response.data;
};
