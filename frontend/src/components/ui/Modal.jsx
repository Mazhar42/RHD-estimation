import React, { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open modals, innermost last. Only the top one reacts to Escape/Tab, so a
// confirm dialog opened on top of another dialog doesn't close both.
const modalStack = [];

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer = null,
  maxWidthClassName = "max-w-2xl",
  onSubmit,
  closeDisabled = false,
}) {
  const containerRef = useRef(null);
  const bodyRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  // Callers routinely pass inline arrow functions; keeping onClose in a ref
  // stops the effect below from re-running (and re-grabbing focus) on every
  // parent render.
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!open) return undefined;

    const token = {};
    modalStack.push(token);
    previouslyFocusedRef.current = document.activeElement;

    const initial =
      containerRef.current?.querySelector("[data-autofocus]") ||
      bodyRef.current?.querySelector(FOCUSABLE_SELECTOR) ||
      containerRef.current?.querySelector(FOCUSABLE_SELECTOR);
    if (initial && typeof initial.focus === "function") initial.focus();

    const onKeyDown = (event) => {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!closeDisabledRef.current) onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) return;
      const focusables = containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const idx = modalStack.indexOf(token);
      if (idx !== -1) modalStack.splice(idx, 1);
      const toRestore = previouslyFocusedRef.current;
      if (toRestore && typeof toRestore.focus === "function" && toRestore.isConnected) {
        toRestore.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const requestClose = () => {
    if (!closeDisabled) onClose?.();
  };

  const content = (
    <>
      <div ref={bodyRef} className="px-6 py-5">
        {children}
      </div>
      {footer && (
        <div className="border-t border-gray-200 px-6 py-4">{footer}</div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="absolute inset-0" onClick={requestClose} aria-hidden="true" />
      <div
        ref={containerRef}
        className={`relative max-h-[90vh] w-full ${maxWidthClassName} overflow-y-auto rounded-2xl bg-white shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={closeDisabled}
            className="text-2xl leading-none text-gray-500 hover:text-gray-700 disabled:opacity-40"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {onSubmit ? (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(event);
            }}
          >
            {content}
          </form>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
