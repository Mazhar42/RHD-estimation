import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authAPI } from "../api/auth";
import { getEstimation } from "../api/estimations";
import {
  checkpointWork,
  createWork,
  getWork,
} from "../api/works";

const WorkContext = createContext(null);

const DEFAULT_SETTINGS = {
  autosave_interval_minutes: 5,
  print_font_family: "helvetica",
  print_font_size: 9,
};

const parseEstimationIdFromPathname = (pathname) => {
  const match = pathname.match(/^\/estimations\/(\d+)/);
  return match ? Number(match[1]) : null;
};

export function WorkProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [work, setWork] = useState(null);
  const [status, setStatus] = useState("idle");
  const [lastCheckpointAt, setLastCheckpointAt] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [currentEstimationId, setCurrentEstimationId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const currentProjectIdRef = useRef(null);

  const loadWorkForEstimation = async (estimationId, openWork = false) => {
    if (!estimationId) {
      setWork(null);
      setCurrentEstimationId(null);
      currentProjectIdRef.current = null;
      return null;
    }
    const estimation = await getEstimation(estimationId);
    const detail = await getWork(estimation.project_id, { open: openWork });
    setWork(detail);
    setCurrentEstimationId(estimationId);
    setExpiresAt(detail.expires_at || null);
    setLastCheckpointAt(detail.last_checkpoint_at || null);
    setStatus(detail.status || "active");
    currentProjectIdRef.current = detail.project_id;
    return detail;
  };

  useEffect(() => {
    const estimationId = parseEstimationIdFromPathname(location.pathname);
    if (!estimationId) {
      setWork(null);
      setCurrentEstimationId(null);
      setExpiresAt(null);
      setLastCheckpointAt(null);
      setDirty(false);
      currentProjectIdRef.current = null;
      return;
    }
    const shouldOpen = estimationId !== currentEstimationId;
    loadWorkForEstimation(estimationId, shouldOpen).catch(() => {
      setWork(null);
      setCurrentEstimationId(estimationId);
    });
  }, [location.pathname]);

  useEffect(() => {
    const saved = localStorage.getItem("workSettings");
    if (!saved) return;
    try {
      setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, []);

  useEffect(() => {
    let active = true;
    authAPI
      .getSettings()
      .then((response) => {
        if (!active) return;
        const merged = { ...DEFAULT_SETTINGS, ...(response.data || {}) };
        setSettings(merged);
        localStorage.setItem("workSettings", JSON.stringify(merged));
      })
      .catch(() => {
        // Keep local fallback settings.
      });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!currentEstimationId) return null;
    return loadWorkForEstimation(currentEstimationId, false);
  }, [currentEstimationId]);

  // "Dirty" means changed since the last checkpoint -- edits themselves
  // are already saved to the server as they happen.
  const markDirty = useCallback(() => {
    setDirty(true);
    setSaveError("");
  }, []);

  const checkpoint = useCallback(
    async (kind = "manual") => {
      if (!work?.project_id) return null;
      setIsSaving(true);
      try {
        const snapshot = await checkpointWork(work.project_id, { kind });
        setLastCheckpointAt(snapshot.created_at);
        setDirty(false);
        setSaveError("");
        await refresh();
        return snapshot;
      } catch (error) {
        setSaveError(
          error?.response?.data?.detail || "Couldn't create the checkpoint.",
        );
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [work?.project_id, refresh],
  );

  const createNewWork = async (payload) => {
    const detail = await createWork(payload);
    setDirty(false);
    setSaveError("");
    navigate(`/estimations/${detail.primary_estimation_id}`);
    return detail;
  };

  const openWork = async (projectId) => {
    const detail = await getWork(projectId, { open: true });
    setDirty(false);
    setSaveError("");
    navigate(`/estimations/${detail.primary_estimation_id}`);
    return detail;
  };

  // `dirty`/`isSaving` are read through refs, not effect deps: this timer
  // must survive every dirty-flip while the user types, or autosave keeps
  // restarting its countdown from zero and effectively never fires (see
  // git history for the bug this replaced). The effect only restarts the
  // interval for changes that should legitimately restart it: switching
  // to a different work item, or the autosave interval setting itself.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const isSavingRef = useRef(isSaving);
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    if (!work?.project_id) return undefined;
    const intervalMs = (settings.autosave_interval_minutes || 5) * 60 * 1000;
    const handle = window.setInterval(() => {
      if (!dirtyRef.current || isSavingRef.current || document.hidden) return;
      checkpoint("auto").catch(() => {});
    }, intervalMs);
    return () => window.clearInterval(handle);
  }, [checkpoint, settings.autosave_interval_minutes, work?.project_id]);

  const daysRemaining = useMemo(() => {
    if (!expiresAt) return null;
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }, [expiresAt]);

  const value = useMemo(
    () => ({
      work,
      currentEstimationId,
      status,
      lastCheckpointAt,
      expiresAt,
      daysRemaining,
      settings,
      dirty,
      saveError,
      isSaving,
      markDirty,
      actions: {
        newWork: createNewWork,
        openWork,
        checkpoint,
        refresh,
        updateSettings: async (nextSettings) => {
          const merged = { ...settings, ...nextSettings };
          const response = await authAPI.updateSettings(merged);
          const savedSettings = {
            ...DEFAULT_SETTINGS,
            ...(response.data || merged),
          };
          setSettings(savedSettings);
          localStorage.setItem("workSettings", JSON.stringify(savedSettings));
          return savedSettings;
        },
      },
    }),
    [
      work,
      currentEstimationId,
      status,
      lastCheckpointAt,
      expiresAt,
      daysRemaining,
      settings,
      dirty,
      saveError,
      isSaving,
    ],
  );

  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}

export function useWork() {
  const context = useContext(WorkContext);
  if (!context) {
    throw new Error("useWork must be used within a WorkProvider");
  }
  return context;
}
