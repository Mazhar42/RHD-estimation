import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const ToastContext = createContext(null);

// Module-level bridge so non-component code (utils/download.js, a plain
// JS module that can't call hooks) can still raise a toast: the provider
// registers its `show` function here on mount, and this file's exported
// `toast.error`/`toast.success` calls whatever registered last.
let activeShow = null;

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message, type = "success", durationMs = 4000) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, message, type }]);
      if (durationMs > 0) {
        setTimeout(() => dismiss(id), durationMs);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    activeShow = show;
    return () => {
      if (activeShow === show) activeShow = null;
    };
  }, [show]);

  const value = useRef({
    showToast: (message, type = "success", durationMs) =>
      show(message, type, durationMs),
  }).current;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-lg shadow-lg border text-sm font-medium ${
              t.type === "error"
                ? "bg-white text-red-700 border-red-300"
                : t.type === "info"
                  ? "bg-white text-slate-700 border-slate-300"
                  : "bg-white text-emerald-700 border-emerald-300"
            }`}
          >
            <span>{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// Imperative API for non-component code. Silently no-ops if called before
// the provider has mounted (e.g. during initial module evaluation).
export const toast = {
  success: (message, durationMs) => activeShow?.(message, "success", durationMs),
  error: (message, durationMs) => activeShow?.(message, "error", durationMs),
  info: (message, durationMs) => activeShow?.(message, "info", durationMs),
};
