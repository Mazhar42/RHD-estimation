import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

const storageKey = (id) => `estimationRegion:${id}`;

function readStored(id) {
  try {
    return localStorage.getItem(storageKey(id)) || "";
  } catch {
    return "";
  }
}

// The estimation's rate region. The URL (?region=) wins, then the server's
// saved value; localStorage only paints something before the server
// answers. Whatever is chosen is mirrored back to the URL and storage.
export function useEstimationRegion(estimationId, serverRegion) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlRegion = searchParams.get("region") || "";
  const [region, setRegion] = useState(() => urlRegion || readStored(estimationId));

  useEffect(() => {
    setRegion(urlRegion || readStored(estimationId));
    // Only on navigation to a different estimation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimationId]);

  useEffect(() => {
    if (!urlRegion && serverRegion) setRegion(serverRegion);
  }, [serverRegion, urlRegion]);

  useEffect(() => {
    if (!region) return;
    try {
      localStorage.setItem(storageKey(estimationId), region);
    } catch {
      /* storage unavailable */
    }
    if (searchParams.get("region") !== region) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("region", region);
          return next;
        },
        { replace: true },
      );
    }
  }, [region, estimationId, searchParams, setSearchParams]);

  return region;
}
