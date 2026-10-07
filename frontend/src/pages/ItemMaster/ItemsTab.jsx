import React, { useEffect, useMemo, useState } from "react";
import { FaPlus, FaUpload } from "react-icons/fa";
import { apiClient } from "../../api/axios";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DropdownMenu from "../../components/ui/DropdownMenu.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import ItemRateTable from "./ItemRateTable.jsx";
import Pagination from "./Pagination.jsx";
import SelectionBar from "./SelectionBar.jsx";
import AddDivisionModal from "./modals/AddDivisionModal.jsx";
import AddItemModal from "./modals/AddItemModal.jsx";
import EditItemGroupModal from "./modals/EditItemGroupModal.jsx";
import ImportItemsModal from "./modals/ImportItemsModal.jsx";
import ManageOrganizationsModal from "./modals/ManageOrganizationsModal.jsx";
import ManageRegionsModal from "./modals/ManageRegionsModal.jsx";
import MassDeleteModal from "./modals/MassDeleteModal.jsx";
import { useColumnWidths } from "../../hooks/useColumnWidths";
import {
  ITEM_COLUMN_WIDTHS,
  divisionsForOrg,
  groupItemRows,
  groupToForm,
  isSearchActive,
  itemsInGroup,
} from "./itemMasterUtils";
import { errorDetail } from "./styles";

const toolbarBtn =
  "inline-flex h-7 items-center gap-1 rounded px-3 text-xs font-medium";
const BANNER_TONE = {
  error: "bg-red-50 text-red-700 border-red-300",
  warning: "bg-orange-50 text-orange-700 border-orange-300",
  info: "bg-indigo-50 text-indigo-700 border-indigo-300",
  success: "bg-emerald-50 text-emerald-700 border-emerald-300",
};

export default function ItemsTab({
  isAdmin,
  orgs,
  divisions,
  reloadDivisions,
  list,
  units,
}) {
  const { showToast } = useToast();
  const [widths, startResize] = useColumnWidths(
    "productsColumnWidths",
    ITEM_COLUMN_WIDTHS,
  );
  const [dialog, setDialog] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [duplicateForm, setDuplicateForm] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [banner, setBanner] = useState(null);

  const { selectedOrg, regionNames } = orgs;
  const orgDivisions = useMemo(
    () => divisionsForOrg(divisions, selectedOrg),
    [divisions, selectedOrg],
  );
  const rows = useMemo(
    () => groupItemRows(list.rows, { byYear: true }),
    [list.rows],
  );
  const years = useMemo(
    () =>
      [
        ...new Set(
          list.rows.map((it) => it.rate_year).filter((y) => y != null),
        ),
      ].sort((a, b) => b - a),
    [list.rows],
  );
  const selectedItems = useMemo(
    () => (selectedKey ? itemsInGroup(list.rows, selectedKey) : []),
    [list.rows, selectedKey],
  );

  // Success/warning banners fade; info and error stay until dismissed.
  useEffect(() => {
    if (!banner || banner.type === "info" || banner.type === "error")
      return undefined;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    setSelectedKey(null);
  }, [list.page, selectedOrg]);

  const close = () => setDialog(null);

  const deleteGroup = async () => {
    setDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedItems.map((it) => apiClient.delete(`/items/${it.item_id}`)),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length === 0) {
        showToast(`Deleted ${results.length} region rate(s)`);
      } else {
        showToast(
          `${failed.length} of ${results.length} rate(s) couldn't be deleted: ${errorDetail(failed[0].reason, "in use")}`,
          "error",
        );
      }
      setSelectedKey(null);
      setDialog(null);
      await list.refetch();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Item Master</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="mr-2 flex items-center gap-2 text-xs font-semibold text-emerald-700">
            Organization
            <select
              className="h-7 rounded border border-gray-300 px-3 text-xs font-normal text-gray-900"
              value={selectedOrg?.org_id || ""}
              onChange={(e) => orgs.selectOrg(e.target.value)}
            >
              <option value="">Select</option>
              {orgs.organizations.map((o) => (
                <option key={o.org_id} value={o.org_id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          {orgs.orgsError && (
            <span className="text-xs text-red-600">
              {orgs.orgsError}{" "}
              <button
                type="button"
                onClick={orgs.reload}
                className="underline hover:text-red-800"
              >
                Retry
              </button>
            </span>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => {
                  setDuplicateForm(null);
                  setDialog("addItem");
                }}
                className={`${toolbarBtn} bg-teal-700 text-white hover:bg-teal-900`}
              >
                <FaPlus className="h-3 w-3" /> Add Item
              </button>
              <button
                onClick={() => setDialog("import")}
                className={`${toolbarBtn} bg-teal-600 text-white hover:bg-teal-700`}
              >
                <FaUpload className="h-3 w-3" /> Import
              </button>
              <DropdownMenu
                label="Manage"
                buttonClassName={`${toolbarBtn} border border-teal-600 bg-white text-teal-700 hover:bg-teal-50`}
                items={[
                  {
                    label: "Add division…",
                    onSelect: () => setDialog("addDivision"),
                  },
                  { label: "Regions…", onSelect: () => setDialog("regions") },
                  {
                    label: "Organizations…",
                    onSelect: () => setDialog("orgs"),
                  },
                  {
                    label: "Mass delete…",
                    danger: true,
                    onSelect: () => setDialog("massDelete"),
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`mb-3 rounded-md border p-3 text-sm ${BANNER_TONE[banner.type] || BANNER_TONE.info}`}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <span>{banner.message}</span>
            <button
              className="text-xs opacity-70 hover:opacity-100"
              onClick={() => setBanner(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {list.error && (
        <div className="mb-3 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>{list.error}</span>
          <button type="button" onClick={list.refetch} className="underline">
            Retry
          </button>
        </div>
      )}

      <ItemRateTable
        rows={rows}
        regionNames={regionNames}
        divisions={orgDivisions}
        search={list.search}
        onSearchChange={list.setSearch}
        units={units}
        years={years}
        showYear
        selectable={isAdmin}
        selectedKey={selectedKey}
        onToggleSelect={(key) =>
          setSelectedKey((prev) => (prev === key ? null : key))
        }
        widths={widths}
        startResize={startResize}
        loading={list.loading}
        emptyMessage={
          isSearchActive(list.search)
            ? "No items match these filters."
            : isAdmin
              ? "No items yet. Use Add Item or Import to add some."
              : "No items yet."
        }
        footer={
          selectedKey ? (
            <SelectionBar
              label={`${selectedItems[0]?.item_code ?? ""} selected (${selectedItems.length} region rate${selectedItems.length === 1 ? "" : "s"})`}
              actions={[
                {
                  label: "Edit",
                  tone: "primary",
                  onClick: () => {
                    setEditForm(groupToForm(selectedItems, regionNames));
                    setDialog("editGroup");
                  },
                },
                {
                  label: "Duplicate",
                  tone: "accent",
                  onClick: () => {
                    const { rate_year: _year, ...form } = groupToForm(
                      selectedItems,
                      regionNames,
                    );
                    setDuplicateForm(form);
                    setDialog("addItem");
                  },
                },
                {
                  label: "Delete",
                  tone: "danger",
                  onClick: () => setDialog("deleteGroup"),
                },
                {
                  label: "Clear selection",
                  onClick: () => setSelectedKey(null),
                },
              ]}
            />
          ) : isSearchActive(list.search) ? (
            <SelectionBar
              label="Filters applied"
              actions={[{ label: "Clear all", onClick: list.clearSearch }]}
            />
          ) : null
        }
      />
      <Pagination
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        perPage={list.perPage}
        onPageChange={list.setPage}
        onPerPageChange={list.setPerPage}
      />

      <AddDivisionModal
        open={dialog === "addDivision"}
        onClose={close}
        selectedOrg={selectedOrg}
        onAdded={reloadDivisions}
      />
      <AddItemModal
        open={dialog === "addItem"}
        onClose={close}
        initialForm={duplicateForm}
        divisions={orgDivisions}
        units={units}
        regionNames={regionNames}
        selectedOrg={selectedOrg}
        onAdded={list.refetch}
        onDivisionsChanged={reloadDivisions}
      />
      <ManageRegionsModal
        open={dialog === "regions"}
        onClose={close}
        selectedOrg={selectedOrg}
        regions={orgs.regions}
        regionsError={orgs.regionsError}
        onRetry={orgs.refreshRegions}
        onChanged={orgs.refreshRegions}
      />
      <ManageOrganizationsModal
        open={dialog === "orgs"}
        onClose={close}
        organizations={orgs.organizations}
        selectedOrg={selectedOrg}
        orgsError={orgs.orgsError}
        onRetry={orgs.reload}
        onSelect={orgs.selectOrg}
        fetchOrganizations={orgs.fetchOrganizations}
      />
      <ImportItemsModal
        open={dialog === "import"}
        onClose={close}
        regionNames={regionNames}
        onImported={list.refetch}
        onBanner={setBanner}
      />
      <MassDeleteModal
        open={dialog === "massDelete"}
        onClose={close}
        items={list.rows}
        onDeleted={list.refetch}
      />
      <EditItemGroupModal
        open={dialog === "editGroup"}
        onClose={close}
        initialForm={editForm}
        groupItems={selectedItems}
        isSpecial={false}
        divisions={divisions}
        units={units}
        regionNames={regionNames}
        onSaved={list.refetch}
      />
      <ConfirmDialog
        open={dialog === "deleteGroup"}
        title="Delete item"
        message={`Delete ${selectedItems[0]?.item_code ?? "this item"}${
          selectedItems[0]?.rate_year ? ` (${selectedItems[0].rate_year})` : ""
        } for all ${selectedItems.length} region(s)? This can't be undone.`}
        busy={deleting}
        busyLabel="Deleting…"
        onCancel={close}
        onConfirm={deleteGroup}
      />
    </div>
  );
}
