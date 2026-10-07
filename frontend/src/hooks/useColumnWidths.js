import { useCallback, useEffect, useRef, useState } from "react";

const MIN_WIDTH = 50;

function readSaved(storageKey, defaults) {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  } catch {
    return defaults;
  }
}

// Drag-to-resize column widths, remembered per browser.
export function useColumnWidths(storageKey, defaults) {
  const [widths, setWidths] = useState(() => readSaved(storageKey, defaults));
  const dragRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(widths));
      } catch {
        /* storage unavailable -- widths just won't persist */
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [storageKey, widths]);

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      setWidths((prev) => ({
        ...prev,
        [drag.column]: Math.max(MIN_WIDTH, drag.startWidth + e.clientX - drag.startX),
      }));
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = useCallback(
    (e, column) => {
      e.preventDefault();
      dragRef.current = { column, startX: e.clientX, startWidth: widths[column] };
      document.body.style.cursor = "col-resize";
    },
    [widths],
  );

  return [widths, startResize];
}
