export function normalizeListResponse(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
    if (Array.isArray(payload.organizations)) {
      return payload.organizations;
    }
    if (Array.isArray(payload.regions)) {
      return payload.regions;
    }
  }

  return [];
}
