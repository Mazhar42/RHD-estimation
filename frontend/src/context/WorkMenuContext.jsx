import React, { createContext, useContext, useMemo, useState } from "react";
import { useWork } from "./WorkContext";
import NewWorkDialog from "../components/works/NewWorkDialog.jsx";
import OpenWorkDialog from "../components/works/OpenWorkDialog.jsx";
import SettingsDialog from "../components/works/SettingsDialog.jsx";

const WorkMenuContext = createContext(null);

export function WorkMenuProvider({ children }) {
  const { work, isSaving, settings, actions } = useWork();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isOpenOpen, setIsOpenOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const menuItems = useMemo(
    () => [
      {
        label: "New Work",
        onSelect: () => setIsNewOpen(true),
      },
      {
        label: "Open Work",
        onSelect: () => setIsOpenOpen(true),
      },
      { type: "separator" },
      {
        label: "Checkpoint now",
        description:
          "Keep a restorable copy of this work as it is now. Edits are already saved.",
        disabled: !work?.project_id || isSaving,
        onSelect: () => {
          actions.checkpoint("manual").catch(() => {});
        },
      },
      { type: "separator" },
      {
        label: "Settings",
        description: "Checkpoint and print preferences.",
        onSelect: () => setIsSettingsOpen(true),
      },
    ],
    [work?.project_id, isSaving, actions],
  );

  const value = useMemo(
    () => ({
      menuItems,
      openNewWork: () => setIsNewOpen(true),
      openOpenWork: () => setIsOpenOpen(true),
      openSettings: () => setIsSettingsOpen(true),
    }),
    [menuItems],
  );

  return (
    <WorkMenuContext.Provider value={value}>
      {children}
      <NewWorkDialog
        open={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onCreate={actions.newWork}
      />
      <OpenWorkDialog
        open={isOpenOpen}
        onClose={() => setIsOpenOpen(false)}
        onOpenWork={actions.openWork}
      />
      <SettingsDialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={actions.updateSettings}
      />
    </WorkMenuContext.Provider>
  );
}

export function useWorkMenuItems() {
  const context = useContext(WorkMenuContext);
  if (!context) {
    throw new Error("useWorkMenuItems must be used within a WorkMenuProvider");
  }
  return context;
}
