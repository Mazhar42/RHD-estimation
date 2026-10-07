import { useCallback, useEffect, useState } from "react";
import {
  getEstimation,
  listElements,
  listEstimationLines,
  listSpecialItemRequests,
} from "../../../api/estimations";

const detail = (e, fallback) => e?.response?.data?.detail || fallback;

// Everything the estimation screen loads from the server, with refreshers
// the page calls after each mutation.
export function useEstimationData(estimationId) {
  const [estimation, setEstimation] = useState(null);
  const [lines, setLines] = useState([]);
  const [elements, setElements] = useState([]);
  const [pendingSpecialCount, setPendingSpecialCount] = useState(0);
  const [linesLoaded, setLinesLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const refreshLines = useCallback(async () => {
    try {
      setLines((await listEstimationLines(estimationId)) || []);
      setLoadError("");
    } catch (e) {
      setLoadError(detail(e, "Couldn't load this estimation's lines."));
    } finally {
      setLinesLoaded(true);
    }
  }, [estimationId]);

  const refreshElements = useCallback(async () => {
    try {
      setElements((await listElements(estimationId)) || []);
    } catch (e) {
      console.error("Failed to fetch elements", e);
    }
  }, [estimationId]);

  const refreshPendingSpecial = useCallback(async () => {
    try {
      const data = await listSpecialItemRequests(estimationId, "pending");
      setPendingSpecialCount((data || []).length);
    } catch (e) {
      console.error("Failed to load pending special item count", e);
    }
  }, [estimationId]);

  const refreshEstimation = useCallback(async () => {
    try {
      setEstimation(await getEstimation(estimationId));
    } catch (e) {
      setLoadError(detail(e, "Couldn't load this estimation."));
    }
  }, [estimationId]);

  useEffect(() => {
    setEstimation(null);
    setLines([]);
    setLinesLoaded(false);
    refreshEstimation();
    refreshLines();
    refreshElements();
    refreshPendingSpecial();
  }, [refreshEstimation, refreshLines, refreshElements, refreshPendingSpecial]);

  return {
    estimation,
    setEstimation,
    lines,
    setLines,
    linesLoaded,
    elements,
    pendingSpecialCount,
    loadError,
    refreshLines,
    refreshElements,
    refreshPendingSpecial,
    refreshEstimation,
  };
}
