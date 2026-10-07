import { useEffect, useState } from "react";

const matches = (query) => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;

export function useMediaQuery(query) {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setValue(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return value;
}

// Phones get a read-only estimation view: the editor's 10+ columns and
// double-click editing don't work at that width.
export const PHONE_QUERY = "(max-width: 767px)";
