import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Menu from "./Menu.jsx";

const ContextMenuContext = createContext(null);

const NATIVE_MENU_SELECTOR = 'input, textarea, [contenteditable="true"], a';

export default function ContextMenuProvider({ children, globalItems = [] }) {
  const [state, setState] = useState({ open: false, x: 0, y: 0, items: [] });
  const scopesRef = useRef(new Map());
  const globalItemsRef = useRef(globalItems);
  globalItemsRef.current = globalItems;

  const registerScope = useCallback((name, resolver) => {
    scopesRef.current.set(name, resolver);
    return () => {
      if (scopesRef.current.get(name) === resolver) {
        scopesRef.current.delete(name);
      }
    };
  }, []);

  const close = useCallback(() => {
    setState((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  useEffect(() => {
    const handleContextMenu = (event) => {
      if (event.target.closest(NATIVE_MENU_SELECTOR)) {
        return;
      }

      let rowItems = [];
      const scopeEl = event.target.closest("[data-ctx-scope]");
      if (scopeEl) {
        const scopeName = scopeEl.getAttribute("data-ctx-scope");
        const resolver = scopesRef.current.get(scopeName);
        if (resolver) {
          rowItems = resolver(scopeEl, event) || [];
        }
      }

      const items = rowItems.length
        ? [...rowItems, { type: "separator" }, ...globalItemsRef.current]
        : globalItemsRef.current;

      if (!items.length) {
        return;
      }

      event.preventDefault();

      const estimatedHeight = Math.min(
        items.length * 40 + 16,
        window.innerHeight - 16,
      );
      const estimatedWidth = 240;
      let x = event.clientX;
      let y = event.clientY;
      if (x + estimatedWidth > window.innerWidth) {
        x = Math.max(8, window.innerWidth - estimatedWidth - 8);
      }
      if (y + estimatedHeight > window.innerHeight) {
        y = Math.max(8, window.innerHeight - estimatedHeight - 8);
      }

      setState({ open: true, x, y, items });
    };

    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  const value = useMemo(() => ({ registerScope }), [registerScope]);

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      <Menu
        open={state.open}
        onClose={close}
        items={state.items}
        position={{ x: state.x, y: state.y }}
      />
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu() {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error("useContextMenu must be used within a ContextMenuProvider");
  }
  return ctx;
}
