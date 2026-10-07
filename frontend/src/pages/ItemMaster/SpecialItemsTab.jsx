import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/axios";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import ItemRateTable from "./ItemRateTable.jsx";
import Pagination from "./Pagination.jsx";
import SelectionBar from "./SelectionBar.jsx";
import EditItemGroupModal from "./modals/EditItemGroupModal.jsx";
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

export default function SpecialItemsTab({
  isAdmin,
  orgs,
  divisions,
  list,
  units,
}) {
  const { showToast } = useToast();
  const [widths, startResize] = useColumnWidths(
    "productsSpecialColumnWidths",
    ITEM_COLUMN_WIDTHS,
  );
  const [selectedKey, setSelectedKey] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { selectedOrg, regionNames } = orgs;
  const orgDivisions = useMemo(
    () => divisionsForOrg(divisions, selectedOrg),
    [divisions, selectedOrg],
  );
  const rows = useMemo(
    () => groupItemRows(list.rows, { byYear: false }),
    [list.rows],
  );
  const selectedItems = useMemo(
    () => (selectedKey ? itemsInGroup(list.rows, selectedKey) : []),
    [list.rows, selectedKey],
  );

  useEffect(() => {
    setSelectedKey(null);
  }, [list.page, selectedOrg]);

  const deleteGroup = async () => {
    setDeleting(true);
    try {
      // Special items are backed by an Item row; deleting it removes both.
      const results = await Promise.allSettled(
        selectedItems.map((it) => apiClient.delete(`/items/${it.item_id}`)),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length === 0) {
        showToast(`Deleted ${results.length} special item rate(s)`);
      } else {
        showToast(
          `${failed.length} of ${results.length} couldn't be deleted: ${errorDetail(failed[0].reason, "in use")}`,
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
      <p className="mb-3 text-xs text-gray-600">
        Items requested from an estimate and approved by an admin. Organization:{" "}
        <strong>{selectedOrg?.name || "—"}</strong>
      </p>
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
        years={[]}
        showYear={false}
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
            ? "No special items match these filters."
            : "No special items yet."
        }
        footer={
          selectedKey ? (
            <SelectionBar
              label={`${selectedItems[0]?.item_code ?? ""} selected`}
              actions={[
                {
                  label: "Edit",
                  tone: "primary",
                  onClick: () => {
                    setEditForm(groupToForm(selectedItems, regionNames));
                    setDialog("edit");
                  },
                },
                {
                  label: "Delete",
                  tone: "danger",
                  onClick: () => setDialog("delete"),
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
      <EditItemGroupModal
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
        initialForm={editForm}
        groupItems={selectedItems}
        isSpecial
        divisions={divisions}
        units={units}
        regionNames={regionNames}
        onSaved={list.refetch}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete special item"
        message={`Delete ${selectedItems[0]?.item_code ?? "this special item"} for all ${selectedItems.length} region(s)? This can't be undone.`}
        busy={deleting}
        busyLabel="Deleting…"
        onCancel={() => setDialog(null)}
        onConfirm={deleteGroup}
      />
    </div>
  );
}
