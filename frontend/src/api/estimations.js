import { apiClient } from "./axios";

export const listEstimationLines = async (estimationId) => {
  const res = await apiClient.get(`/estimations/${estimationId}/lines`);
  return res.data;
};

export const listEstimationLinesTree = async (estimationId) => {
  const res = await apiClient.get(`/estimations/${estimationId}/lines`, {
    params: { tree: 1 },
  });
  return res.data;
};

export const createEstimationLine = async (estimationId, data) => {
  const res = await apiClient.post(`/estimations/${estimationId}/lines`, data);
  return res.data;
};

export const createEstimationLinesBatch = async (estimationId, lines) => {
  const res = await apiClient.post(`/estimations/${estimationId}/lines/batch`, {
    lines,
  });
  return res.data;
};

export const duplicateLines = async (estimationId, payload) => {
  const res = await apiClient.post(
    `/estimations/${estimationId}/lines/duplicate`,
    payload,
  );
  return res.data;
};

export const reorderLines = async (estimationId, payload) => {
  const res = await apiClient.post(
    `/estimations/${estimationId}/lines/reorder`,
    payload,
  );
  return res.data;
};

export const syncEstimationRates = async (estimationId) => {
  const res = await apiClient.post(`/estimations/${estimationId}/sync-rates`);
  return res.data;
};

export const updateEstimationLine = async (lineId, data) => {
  const res = await apiClient.put(`/estimations/lines/${lineId}`, data);
  return res.data;
};

export const deleteEstimationLines = async (lineIds) => {
  const res = await apiClient.delete(`/estimations/lines`, {
    data: { line_ids: lineIds },
  });
  return res.data;
};

export const getEstimationTotal = async (estimationId) => {
  const res = await apiClient.get(`/estimations/${estimationId}/total`);
  return res.data;
};

export const getEstimationSummary = async (estimationId) => {
  const res = await apiClient.get(`/estimations/${estimationId}/summary`);
  return res.data;
};

// Work type catalog (road/bridge/building/...), used by the estimation
// header's work-type picker.
export const listWorkTypes = async () => {
  const res = await apiClient.get(`/work-types`);
  return res.data;
};

export const getEstimation = async (estimationId) => {
  const res = await apiClient.get(`/estimations/${estimationId}`);
  return res.data;
};

export const deleteEstimation = async (estimationId) => {
  const res = await apiClient.delete(`/estimations/${estimationId}`);
  return res.data;
};

export const updateEstimation = async (estimationId, data) => {
  const res = await apiClient.patch(`/estimations/${estimationId}`, data);
  return res.data;
};

// Structural elements (bridge piers/abutments, road chainage segments)
export const listElements = async (estimationId) => {
  const res = await apiClient.get(`/estimations/${estimationId}/elements`);
  return res.data;
};

export const validateElements = async (estimationId) => {
  const res = await apiClient.get(
    `/estimations/${estimationId}/elements/validate`,
  );
  return res.data;
};

export const createElement = async (estimationId, data) => {
  const res = await apiClient.post(
    `/estimations/${estimationId}/elements`,
    data,
  );
  return res.data;
};

export const updateElement = async (estimationId, elementId, data) => {
  const res = await apiClient.put(
    `/estimations/${estimationId}/elements/${elementId}`,
    data,
  );
  return res.data;
};

export const deleteElement = async (estimationId, elementId, force = false) => {
  const res = await apiClient.delete(
    `/estimations/${estimationId}/elements/${elementId}`,
    { params: force ? { force: true } : {} },
  );
  return res.data;
};

export const generateBridgeElements = async (estimationId, data) => {
  const res = await apiClient.post(
    `/estimations/${estimationId}/elements/generate-bridge`,
    data,
  );
  return res.data;
};

export const generateRoadElements = async (estimationId, data) => {
  const res = await apiClient.post(
    `/estimations/${estimationId}/elements/generate-road`,
    data,
  );
  return res.data;
};

// Break one item line into per-element sub-items: A1/P1..PN/A2 for a bridge,
// chainage segments for a road, or distinct names for anything else.
export const generateSubItems = async (estimationId, lineId, payload) => {
  const res = await apiClient.post(
    `/estimations/${estimationId}/lines/${lineId}/sub-items`,
    payload,
  );
  return res.data;
};

export const assignLinesToElement = async (estimationId, lineIds, elementId) => {
  const res = await apiClient.post(
    `/estimations/${estimationId}/lines/assign-element`,
    { line_ids: lineIds, element_id: elementId },
  );
  return res.data;
};

// Special Items
export const listSpecialItemRequests = async (estimationId, status) => {
  const params = status ? { status } : {};
  const res = await apiClient.get(
    `/estimations/${estimationId}/special-item-requests`,
    { params },
  );
  return res.data;
};

export const listAllSpecialItemRequests = async (status) => {
  const params = status ? { status } : {};
  const res = await apiClient.get(`/estimations/special-item-requests/all`, {
    params,
  });
  return res.data;
};

export const createSpecialItemRequest = async (estimationId, data) => {
  const res = await apiClient.post(
    `/estimations/${estimationId}/special-item-requests`,
    data,
  );
  return res.data;
};

export const createSpecialItemRequestsBatch = async (
  estimationId,
  requests,
) => {
  const res = await apiClient.post(
    `/estimations/${estimationId}/special-item-requests/batch`,
    { requests },
  );
  return res.data;
};

export const approveSpecialItemRequest = async (requestId) => {
  const res = await apiClient.post(
    `/estimations/special-item-requests/${requestId}/approve`,
  );
  return res.data;
};

export const rejectSpecialItemRequest = async (requestId, reason) => {
  const res = await apiClient.post(
    `/estimations/special-item-requests/${requestId}/reject`,
    { reason },
  );
  return res.data;
};

export const updateSpecialItemRequest = async (requestId, data) => {
  const res = await apiClient.put(
    `/estimations/special-item-requests/${requestId}`,
    data,
  );
  return res.data;
};

export const deleteSpecialItemRequest = async (requestId) => {
  const res = await apiClient.delete(
    `/estimations/special-item-requests/${requestId}`,
  );
  return res.data;
};
