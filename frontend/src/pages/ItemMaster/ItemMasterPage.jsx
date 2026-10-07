import React, { useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import ItemsTab from "./ItemsTab.jsx";
import SpecialItemsTab from "./SpecialItemsTab.jsx";
import { useDivisions } from "./hooks/useDivisions.js";
import { useOrganizations } from "./hooks/useOrganizations.js";
import { usePagedItems } from "./hooks/usePagedItems.js";

const TABS = [
  { id: "items", label: "Item Master" },
  { id: "special", label: "Special Items" },
];

export default function ItemMasterPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("superadmin");
  const [activeTab, setActiveTab] = useState("items");

  const orgs = useOrganizations();
  const { divisions, reload: reloadDivisions } = useDivisions();
  const orgName = orgs.selectedOrg?.name ?? null;
  const items = usePagedItems({
    endpoint: "/items",
    countEndpoint: "/items/count",
    orgName,
    enabled: orgs.ready,
  });
  const special = usePagedItems({
    endpoint: "/items/special",
    countEndpoint: "/items/special/count",
    orgName,
    enabled: orgs.ready,
  });

  const units = useMemo(
    () =>
      [
        ...new Set(
          [...items.rows, ...special.rows].map((it) => it.unit).filter(Boolean),
        ),
      ].sort(),
    [items.rows, special.rows],
  );

  return (
    <div className="item-master-font relative -m-6 flex h-[calc(100%+3rem)] w-[calc(100%+3rem)] flex-col overflow-hidden bg-white p-4 sm:p-6">
      <div
        className="mb-4 flex items-center gap-6 border-b border-gray-200"
        role="tablist"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              activeTab === tab.id
                ? "border-[var(--color-primary-600)] text-[var(--color-primary-700)]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "items" ? (
        <ItemsTab
          isAdmin={isAdmin}
          orgs={orgs}
          divisions={divisions}
          reloadDivisions={reloadDivisions}
          list={items}
          units={units}
        />
      ) : (
        <SpecialItemsTab
          isAdmin={isAdmin}
          orgs={orgs}
          divisions={divisions}
          list={special}
          units={units}
        />
      )}
    </div>
  );
}
