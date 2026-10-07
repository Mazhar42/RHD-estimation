import { apiClient } from "./axios";
import { normalizeListResponse } from "./listResponse.mjs";

export async function listOrganizations() {
  const res = await apiClient.get(`/orgs`);
  return normalizeListResponse(res.data);
}

export async function listRegions(orgId) {
  const res = await apiClient.get(`/orgs/${orgId}/regions`);
  return normalizeListResponse(res.data);
}

export async function createRegion(orgId, name) {
  const res = await apiClient.post(`/orgs/${orgId}/regions`, { name });
  return res.data; // { region_id, name, organization_id }
}

export async function deleteRegion(regionId) {
  const res = await apiClient.delete(`/orgs/regions/${regionId}`);
  return res.data; // deleted region
}

export async function createOrganization(name) {
  const res = await apiClient.post(`/orgs`, { name });
  return res.data; // { org_id, name }
}

export async function deleteOrganization(orgId) {
  const res = await apiClient.delete(`/orgs/${orgId}`);
  return res.data; // deleted org
}

export async function updateOrganization(orgId, name) {
  const res = await apiClient.patch(`/orgs/${orgId}`, { name });
  return res.data; // updated org
}

export async function updateRegion(regionId, name) {
  const res = await apiClient.patch(`/orgs/regions/${regionId}`, { name });
  return res.data; // updated region
}
