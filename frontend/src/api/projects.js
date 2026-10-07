import { apiClient } from "./axios";

export const listProjects = async () => {
  const res = await apiClient.get(`/projects`);
  return res.data;
};

export const createProject = async (data) => {
  const res = await apiClient.post(`/projects`, data);
  return res.data;
};

export const updateProject = async (projectId, data) => {
  const res = await apiClient.patch(`/projects/${projectId}`, data);
  return res.data;
};

export const deleteProject = async (projectId) => {
  const res = await apiClient.delete(`/projects/${projectId}`);
  return res.data;
};

export const listEstimations = async (projectId) => {
  const res = await apiClient.get(`/projects/${projectId}/estimations`);
  return res.data;
};

export const createEstimation = async (projectId, data) => {
  const res = await apiClient.post(`/projects/${projectId}/estimations`, data);
  return res.data;
};
