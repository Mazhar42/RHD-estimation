import { apiClient } from "./axios";

export const checkWorkNameId = async (nameId) => {
  const response = await apiClient.get("/works/check-name-id", {
    params: { name_id: nameId },
  });
  return response.data;
};

export const createWork = async (payload) => {
  const response = await apiClient.post("/works", payload);
  return response.data;
};

export const listWorks = async (params = {}) => {
  const response = await apiClient.get("/works", { params });
  return response.data;
};

export const getWork = async (projectId, { open = false } = {}) => {
  const response = await apiClient.get(`/works/${projectId}`, {
    params: open ? { open: 1 } : undefined,
  });
  return response.data;
};

export const updateWork = async (projectId, payload) => {
  const response = await apiClient.patch(`/works/${projectId}`, payload);
  return response.data;
};

export const deleteWork = async (projectId) => {
  const response = await apiClient.delete(`/works/${projectId}`);
  return response.data;
};

export const checkpointWork = async (projectId, payload) => {
  const response = await apiClient.post(
    `/works/${projectId}/checkpoint`,
    payload,
  );
  return response.data;
};

export const listWorkSnapshots = async (projectId) => {
  const response = await apiClient.get(`/works/${projectId}/snapshots`);
  return response.data;
};

export const restoreWorkSnapshot = async (projectId, snapshotId) => {
  const response = await apiClient.post(
    `/works/${projectId}/snapshots/${snapshotId}/restore`,
  );
  return response.data;
};


export const purgeExpiredWorks = async ({ dryRun = false, limit = 500 } = {}) => {
  const response = await apiClient.post("/admin/purge-expired", {
    dry_run: dryRun,
    limit,
  });
  return response.data;
};

