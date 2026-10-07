import { useCallback, useEffect, useState } from "react";
import { listDivisions } from "../../../api/items";

export function useDivisions() {
  const [divisions, setDivisions] = useState([]);

  const reload = useCallback(async () => {
    try {
      setDivisions(await listDivisions());
    } catch {
      setDivisions([]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { divisions, reload };
}
