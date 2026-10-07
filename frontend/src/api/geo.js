import { apiClient } from "./axios";

export const getGeoPoints = async (ownerType, ownerId) => {
  const response = await apiClient.get(`/geo/${ownerType}/${ownerId}`);
  return response.data;
};

export const putGeoPoints = async (ownerType, ownerId, { geometry_kind, points }) => {
  const response = await apiClient.put(`/geo/${ownerType}/${ownerId}`, {
    geometry_kind,
    points,
  });
  return response.data;
};

export const deleteGeoPoints = async (ownerType, ownerId) => {
  const response = await apiClient.delete(`/geo/${ownerType}/${ownerId}`);
  return response.data;
};
