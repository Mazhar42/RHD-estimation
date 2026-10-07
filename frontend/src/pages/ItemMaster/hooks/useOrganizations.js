import { useCallback, useEffect, useMemo, useState } from "react";
import { listOrganizations, listRegions } from "../../../api/orgs";

const errorDetail = (e, fallback) => e?.response?.data?.detail || fallback;

// Organizations, the active one, and its regions. `ready` flips true once
// the first load settles (success or failure) so item lists know when to
// fetch -- with no organization if the load failed, rather than never.
export function useOrganizations() {
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [regions, setRegions] = useState([]);
  const [orgsError, setOrgsError] = useState("");
  const [regionsError, setRegionsError] = useState("");
  const [ready, setReady] = useState(false);

  const loadRegions = useCallback(async (org) => {
    setRegionsError("");
    if (!org) {
      setRegions([]);
      return;
    }
    try {
      setRegions(await listRegions(org.org_id));
    } catch (e) {
      setRegions([]);
      setRegionsError(
        errorDetail(e, "Couldn't load regions for this organization. Retry from Manage Regions."),
      );
    }
  }, []);

  const fetchOrganizations = useCallback(async () => {
    const orgs = await listOrganizations();
    const list = Array.isArray(orgs) ? orgs : [];
    setOrganizations(list);
    return list;
  }, []);

  const reload = useCallback(async () => {
    setOrgsError("");
    try {
      const list = await fetchOrganizations();
      const defaultOrg = list.find((o) => o.name === "RHD") || list[0] || null;
      setSelectedOrg(defaultOrg);
      setReady(true);
      await loadRegions(defaultOrg);
    } catch (e) {
      setOrganizations([]);
      setSelectedOrg(null);
      setOrgsError(
        errorDetail(e, "Couldn't load organizations. Check your connection and permissions, then retry."),
      );
    } finally {
      setReady(true);
    }
  }, [fetchOrganizations, loadRegions]);

  useEffect(() => {
    reload();
  }, [reload]);

  const selectOrg = useCallback(
    async (orgId, list = organizations) => {
      const org = list.find((o) => String(o.org_id) === String(orgId)) || null;
      setSelectedOrg(org);
      await loadRegions(org);
    },
    [organizations, loadRegions],
  );

  const regionNames = useMemo(() => regions.map((r) => r.name), [regions]);

  return {
    organizations,
    selectedOrg,
    regions,
    regionNames,
    orgsError,
    regionsError,
    ready,
    reload,
    selectOrg,
    fetchOrganizations,
    refreshRegions: () => loadRegions(selectedOrg),
  };
}
