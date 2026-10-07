import { apiClient } from "./axios";

export const listDivisions = async () => {
  const res = await apiClient.get(`/items/divisions`);
  return res.data;
};

export const listItems = async (params = {}, config = {}) => {
  const res = await apiClient.get(`/items`, { params, ...config });
  return res.data;
};

export const listAllItems = async (params = {}, options = {}) => {
  const {
    pageSize = 1000,
    timeout = 120000,
    maxPages = 0,
  } = options;
  let skip = 0;
  let page = 0;
  const all = [];
  while (true) {
    const res = await listItems(
      { ...params, skip, limit: pageSize },
      { timeout },
    );
    const batch = res || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    skip += pageSize;
    page += 1;
    if (maxPages && page >= maxPages) break;
  }
  return all;
};

export const createItem = async (payload) => {
  const res = await apiClient.post(`/items`, payload);
  return res.data;
};

export const importItems = async (
  file,
  mode = "append",
  onUploadProgress,
  rateYear = null,
) => {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await apiClient.post(`/items/import`, form, {
      params: rateYear ? { mode, rate_year: rateYear } : { mode },
      headers: {}, // Let axios automatically set Content-Type with proper boundary
      onUploadProgress: onUploadProgress,
      timeout: 300000, // 5 minute timeout for large file processing
    });
    return res.data;
  } catch (error) {
    console.error(
      "[API] importItems error:",
      error.message,
      error.response?.status,
    );
    if (error.code === "ECONNABORTED") {
      throw new Error(
        "Import request timed out. The file might be too large or the server is taking too long to process.",
      );
    }
    throw error;
  }
};
