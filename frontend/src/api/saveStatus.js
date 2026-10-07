import { useSyncExternalStore } from "react";

// Every edit is sent to the server as it happens, so "saved" just means no
// write request is in flight and the last one succeeded. The axios client
// reports each write here; the header shows the result.
let pending = 0;
let lastFailed = false;
let hasWritten = false;
const listeners = new Set();

function snapshot() {
  if (pending > 0) return "saving";
  if (lastFailed) return "error";
  return hasWritten ? "saved" : "idle";
}

let current = snapshot();

function emit() {
  const next = snapshot();
  if (next === current) return;
  current = next;
  listeners.forEach((fn) => fn());
}

export function writeStarted() {
  pending += 1;
  hasWritten = true;
  emit();
}

export function writeFinished(ok) {
  pending = Math.max(0, pending - 1);
  lastFailed = !ok;
  emit();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSaveStatus() {
  return useSyncExternalStore(subscribe, () => current);
}
