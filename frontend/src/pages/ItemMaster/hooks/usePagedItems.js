import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../../api/axios";
import { EMPTY_SEARCH, buildItemQuery } from "../itemMasterUtils";

const SEARCH_DEBOUNCE_MS = 500;

// One server-paginated, server-filtered item list (normal or special).
// Search edits are debounced and reset to page 1; responses that arrive
// after a newer request was issued are dropped so fast typing or paging
// can't leave the table showing stale rows.
export function usePagedItems({ endpoint, countEndpoint, orgName, enabled }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPageState] = useState(50);
  const [search, setSearch] = useState(EMPTY_SEARCH);
  const [appliedSearch, setAppliedSearch] = useState(EMPTY_SEARCH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (search === appliedSearch) return undefined;
    const timer = setTimeout(() => {
      setPage(1);
      setAppliedSearch(search);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, appliedSearch]);

  const refetch = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    const params = buildItemQuery(appliedSearch, { page, perPage, orgName });
    const { skip, limit, ...countParams } = params;
    try {
      const [listRes, countRes] = await Promise.all([
        apiClient.get(endpoint, { params }),
        apiClient.get(countEndpoint, { params: countParams }),
      ]);
      if (requestId !== requestIdRef.current) return;
      setRows(listRes.data || []);
      setTotal(countRes.data?.count || 0);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(e?.response?.data?.detail || "Failed to load items");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [endpoint, countEndpoint, orgName, page, perPage, appliedSearch]);

  useEffect(() => {
    if (enabled) refetch();
  }, [enabled, refetch]);

  // Changing organization should start from the first page.
  useEffect(() => {
    setPage(1);
  }, [orgName]);

  const setPerPage = useCallback((n) => {
    setPerPageState(n);
    setPage(1);
  }, []);

  const clearSearch = useCallback(() => {
    setSearch(EMPTY_SEARCH);
    setAppliedSearch(EMPTY_SEARCH);
    setPage(1);
  }, []);

  const totalPages = Math.ceil(total / perPage);

  return {
    rows,
    total,
    totalPages,
    page,
    setPage,
    perPage,
    setPerPage,
    search,
    setSearch,
    clearSearch,
    loading,
    error,
    refetch,
  };
}
