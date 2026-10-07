import React, { useRef, useState } from "react";
import { useWork } from "../../context/WorkContext";
import { useWorkMenuItems } from "../../context/WorkMenuContext";
import { useSaveStatus } from "../../api/saveStatus";
import Menu from "../menu/Menu.jsx";

// The API sends naive UTC timestamps; without a zone the browser would
// read them as local time.
export function formatCheckpointTime(value, now = new Date()) {
  if (!value) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return date.toDateString() === now.toDateString()
    ? time
    : `${date.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

const SAVE_LABEL = {
  saving: { text: "Saving…", tone: "bg-white/10 text-white" },
  saved: { text: "All changes saved ✓", tone: "bg-white/10 text-white" },
  error: {
    text: "Couldn't save the last change",
    tone: "bg-red-100 text-red-800",
  },
};

export default function WorkHeaderControls() {
  const {
    work,
    daysRemaining,
    saveError,
    dirty,
    isSaving,
    lastCheckpointAt,
    actions,
  } = useWork();
  const { menuItems } = useWorkMenuItems();
  const saveStatus = useSaveStatus();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const hasWork = Boolean(work?.project_id);
  const save = SAVE_LABEL[saveStatus];
  const checkpointTime = formatCheckpointTime(lastCheckpointAt);

  return (
    <div className="flex items-center gap-3">
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsMenuOpen((value) => !value)}
          className="rounded bg-teal-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
        >
          File
        </button>
        <Menu
          open={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          items={menuItems}
          anchorRef={menuRef}
        />
      </div>
      {hasWork && save && (
        <span
          className={`hidden rounded-full px-3 py-1 text-xs font-medium sm:inline ${save.tone}`}
          role="status"
        >
          {save.text}
        </span>
      )}
      {hasWork && (
        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={() => actions.checkpoint("manual").catch(() => {})}
            disabled={isSaving}
            className="rounded border border-white/40 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-60"
            title="Keep a restorable copy of this work as it is now"
          >
            {isSaving ? "Checkpointing…" : "Checkpoint"}
          </button>
          <span
            className={`text-xs ${saveError ? "text-red-200" : "text-white/80"}`}
          >
            {saveError
              ? saveError
              : checkpointTime
                ? `Last checkpoint: ${checkpointTime}${dirty ? " · changed since" : ""}`
                : "No checkpoint yet"}
          </span>
        </div>
      )}
      {hasWork && daysRemaining != null && daysRemaining <= 3 && (
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            daysRemaining <= 1
              ? "bg-red-100 text-red-700"
              : "bg-amber-100 text-amber-800"
          }`}
          title="Works that aren't opened for a while are removed automatically"
        >
          {daysRemaining <= 1
            ? "Expires in under 24h"
            : `Expires in ${daysRemaining} days`}
        </span>
      )}
    </div>
  );
}
