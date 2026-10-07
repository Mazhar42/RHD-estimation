import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { FaPlus, FaUpload } from "react-icons/fa";
import {
  deleteEstimationLines,
  duplicateLines,
  updateEstimation,
  updateEstimationLine,
} from "../api/estimations";
import { useAuth } from "../hooks/useAuth.js";
import { useColumnWidths } from "../hooks/useColumnWidths";
import { PHONE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { useWork } from "../context/WorkContext";
import { useToast } from "../components/ui/Toast";
import { useContextMenu } from "../components/menu/ContextMenuProvider";
import LineGpsDialog from "../components/gps/LineGpsDialog.jsx";
import LineAttachmentsDialog from "../components/attachments/LineAttachmentsDialog.jsx";
import ElementsModal from "../components/elements/ElementsModal.jsx";
import AddLineModal from "./estimation/modals/AddLineModal.jsx";
import MakeSubItemsModal from "./estimation/modals/MakeSubItemsModal.jsx";
import CompleteSubItemsModal from "./estimation/modals/CompleteSubItemsModal.jsx";
import EditLineModal from "./estimation/modals/EditLineModal.jsx";
import ConfirmDeleteLinesModal from "./estimation/modals/ConfirmDeleteLinesModal.jsx";
import LineDetailModal from "./estimation/modals/LineDetailModal.jsx";
import ImportLinesModal from "./estimation/modals/ImportLinesModal.jsx";
import EstimationHeader from "./estimation/EstimationHeader";
import SelectionToolbar from "./estimation/SelectionToolbar";
import WorkInfoPanel from "./estimation/WorkInfoPanel";
import WorkTypeTabs, { SUMMARY_TAB } from "./estimation/WorkTypeTabs";
import PendingNotices from "./estimation/PendingNotices";
import SummaryPanel from "./estimation/SummaryPanel";
import EstimationTable from "./estimation/EstimationTable";
import { useEstimationData } from "./estimation/hooks/useEstimationData";
import { useEstimationRegion } from "./estimation/hooks/useEstimationRegion";
import { useItemCatalog } from "./estimation/hooks/useItemCatalog";
import { useInlineEdit } from "./estimation/hooks/useInlineEdit";
import {
  MAX_DEPTH,
  buildChildMap,
  buildSubtree,
  depthOf,
  descendantIds,
  divisionSections,
  formatAmount,
  isReadOnlyLine,
  rootLinesOf,
} from "./estimation/lineTree";
import { downloadCsv } from "./estimation/exports/csv";
import { downloadXlsx } from "./estimation/exports/xlsx";
import { downloadPdf } from "./estimation/exports/pdf";

const LINE_COLUMN_WIDTHS = {
  item_code: 150,
  description: 250,
  sub_description: 150,
};
const BANNER_TONE = {
  error: "bg-red-50 text-red-700 border-red-300",
  warning: "bg-orange-50 text-orange-700 border-orange-300",
  info: "bg-indigo-50 text-indigo-700 border-indigo-300",
  success: "bg-emerald-50 text-emerald-700 border-emerald-300",
};

function useCollapsedLines(estimationId) {
  const key = `estimationCollapsed:${estimationId}`;
  const [ids, setIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(ids));
    } catch {
      /* storage unavailable */
    }
  }, [key, ids]);
  const toggle = useCallback(
    (id) =>
      setIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      ),
    [],
  );
  return [useMemo(() => new Set(ids), [ids]), toggle];
}

export default function EstimationDetail() {
  const { estimationId } = useParams();
  const { hasRole, user } = useAuth();
  const { work, markDirty, settings } = useWork();
  const { showToast } = useToast();
  const { registerScope } = useContextMenu();

  const data = useEstimationData(estimationId);
  const { estimation, lines, elements } = data;
  const mayEdit =
    hasRole("admin") ||
    hasRole("superadmin") ||
    estimation?.created_by_id === user?.user_id;
  const isPhone = useMediaQuery(PHONE_QUERY);
  const canEdit = mayEdit && !isPhone;
  const region = useEstimationRegion(estimationId, estimation?.region);
  const catalog = useItemCatalog({
    region,
    rateYear: estimation?.rate_year,
    enabled: Boolean(estimation),
  });
  const [widths, startResize] = useColumnWidths(
    "estimationColumnWidths",
    LINE_COLUMN_WIDTHS,
  );
  const [collapsed, toggleCollapsed] = useCollapsedLines(estimationId);

  const [selectedIds, setSelectedIds] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [banner, setBanner] = useState(null);
  const [addLineParent, setAddLineParent] = useState(undefined); // undefined = closed, null = top level
  const [editingLine, setEditingLine] = useState(null);
  const [deletingIds, setDeletingIds] = useState(null);
  const [detailLine, setDetailLine] = useState(null);
  const [gpsLine, setGpsLine] = useState(null);
  const [attachmentsLine, setAttachmentsLine] = useState(null);
  const [splitLine, setSplitLine] = useState(null);
  const [completing, setCompleting] = useState(null); // { parentLine, subLines }
  const [elementsOpen, setElementsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const workTypes = estimation?.work_types || [];
  const title = estimation?.estimation_name || `Estimation #${estimationId}`;

  // --- tree ---------------------------------------------------------------
  const byId = useMemo(
    () => new Map(lines.map((l) => [l.line_id, l])),
    [lines],
  );
  const childMap = useMemo(() => buildChildMap(lines), [lines]);
  const roots = useMemo(() => rootLinesOf(lines), [lines]);
  const subtree = useCallback(
    (line) =>
      buildSubtree(line.line_id, byId, childMap) || { ...line, children: [] },
    [byId, childMap],
  );
  const elementById = useMemo(
    () => new Map(elements.map((el) => [el.element_id, el])),
    [elements],
  );
  const workTypeByElementId = useMemo(
    () => new Map(elements.map((el) => [el.element_id, el.work_type])),
    [elements],
  );
  const pendingLines = useMemo(
    () =>
      lines.filter((l) => l.entry_status === "pending" && !isReadOnlyLine(l)),
    [lines],
  );

  useEffect(() => {
    if (activeTab === null && workTypes.length) setActiveTab(workTypes[0].code);
  }, [activeTab, workTypes]);

  const sections = useMemo(
    () =>
      divisionSections({
        roots,
        byId,
        childMap,
        workTypeByElementId,
        activeWorkType: activeTab,
        isFirstTab: workTypes.length === 0 || activeTab === workTypes[0]?.code,
      }),
    [roots, byId, childMap, workTypeByElementId, activeTab, workTypes],
  );
  const tabTotal = sections.reduce((sum, s) => sum + s.subtotal, 0);
  const activeTabLabel =
    workTypes.find((wt) => wt.code === activeTab)?.label || "";

  // Item options for the inline item pickers, one entry per code/description.
  const itemOptionsByDivision = useMemo(() => {
    const map = new Map();
    for (const it of catalog.items) {
      if (!it.division_id) continue;
      if (!map.has(it.division_id))
        map.set(it.division_id, { codes: new Map(), descs: new Map() });
      const entry = map.get(it.division_id);
      if (!entry.codes.has(it.item_code)) entry.codes.set(it.item_code, it);
      if (!entry.descs.has(it.item_description))
        entry.descs.set(it.item_description, it);
    }
    return map;
  }, [catalog.items]);
  const itemOptions = useCallback(
    (divisionId) => {
      const entry = itemOptionsByDivision.get(divisionId);
      return {
        byCode: entry ? [...entry.codes.values()] : [],
        byDesc: entry ? [...entry.descs.values()] : [],
      };
    },
    [itemOptionsByDivision],
  );

  // --- mutations ----------------------------------------------------------
  const afterChange = useCallback(async () => {
    await data.refreshLines();
    markDirty();
  }, [data, markDirty]);

  const inline = useInlineEdit({
    lines,
    onSaved: afterChange,
    onError: (msg) => showToast(msg, "error"),
  });

  const tooDeep = (line) => depthOf(line, byId) >= MAX_DEPTH;

  const openSplit = (line) => {
    if (!line || isReadOnlyLine(line)) return;
    if (tooDeep(line))
      return showToast("Parts can be nested up to 5 levels deep.", "error");
    setSplitLine(subtree(line));
  };

  const openAddInside = (line) => {
    if (!line || isReadOnlyLine(line)) return;
    if (tooDeep(line))
      return showToast("Parts can be nested up to 5 levels deep.", "error");
    setAddLineParent(line);
  };

  const duplicate = async (ids) => {
    if (!ids.length) return;
    try {
      await duplicateLines(estimationId, {
        line_ids: ids,
        include_children: true,
        include_attachments: true,
        include_geo: true,
      });
      setSelectedIds([]);
      await afterChange();
    } catch {
      showToast("Couldn't duplicate the lines.", "error");
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteEstimationLines(deletingIds);
      setSelectedIds((prev) => prev.filter((id) => !deletingIds.includes(id)));
      setDeletingIds(null);
      await afterChange();
    } catch {
      showToast("Couldn't delete the lines.", "error");
    }
  };

  const saveEdit = async (payload) => {
    try {
      await updateEstimationLine(editingLine.line_id, payload);
      setEditingLine(null);
      setSelectedIds([]);
      await afterChange();
    } catch (e) {
      showToast(
        e?.response?.status === 409
          ? e.response.data.detail
          : "Couldn't update the line.",
        "error",
      );
    }
  };

  const setRateYear = async (year) => {
    try {
      const updated = await updateEstimation(estimationId, { rate_year: year });
      data.setEstimation((prev) => ({ ...prev, ...updated }));
      markDirty();
    } catch (e) {
      showToast(
        e?.response?.data?.detail || "Couldn't change the rate year.",
        "error",
      );
    }
  };

  const download = (format) => {
    const payload = {
      estimationId,
      estimationName: estimation?.estimation_name,
      region,
      settings,
      elements,
      standardRootLines: roots.filter((l) => !isReadOnlyLine(l)).map(subtree),
      approvedSpecialRootLines: roots.filter(isReadOnlyLine).map(subtree),
    };
    const run = { csv: downloadCsv, xlsx: downloadXlsx, pdf: downloadPdf }[
      format
    ];
    Promise.resolve()
      .then(() => run(payload))
      .catch(() => showToast("Export failed.", "error"));
  };

  // --- selection ----------------------------------------------------------
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedLine =
    selectedIds.length === 1 ? byId.get(selectedIds[0]) : null;

  // Selecting a line selects its whole subtree, since actions apply to it.
  const toggleSelect = (lineId) => {
    const line = byId.get(lineId);
    if (!line || isReadOnlyLine(line)) return;
    const ids = [lineId, ...descendantIds(lineId, childMap)];
    setSelectedIds((prev) =>
      ids.every((id) => prev.includes(id))
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])],
    );
  };
  const setSelected = (ids, checked) =>
    setSelectedIds((prev) =>
      checked
        ? [...new Set([...prev, ...ids])]
        : prev.filter((id) => !ids.includes(id)),
    );

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => byId.has(id)));
  }, [byId]);

  // --- right-click menu on rows -------------------------------------------
  useEffect(
    () =>
      registerScope("line-row", (scopeEl) => {
        const line = byId.get(Number(scopeEl.getAttribute("data-line-id")));
        if (!line || isReadOnlyLine(line)) return [];
        return [
          {
            label: "Edit",
            disabled: !canEdit,
            onSelect: () => setEditingLine(line),
          },
          {
            label: "Split into parts",
            disabled: !canEdit || tooDeep(line),
            onSelect: () => openSplit(line),
          },
          {
            label: "Add item inside",
            disabled: !canEdit || tooDeep(line),
            onSelect: () => openAddInside(line),
          },
          {
            label: "Duplicate",
            disabled: !canEdit,
            onSelect: () => duplicate([line.line_id]),
          },
          { label: "Set GPS", onSelect: () => setGpsLine(line) },
          { label: "Insert Picture", onSelect: () => setAttachmentsLine(line) },
          { type: "separator" },
          {
            label: "Delete",
            disabled: !canEdit,
            onSelect: () => setDeletingIds([line.line_id]),
          },
        ];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byId, canEdit, registerScope],
  );

  useEffect(() => {
    if (!banner || banner.type === "info" || banner.type === "error")
      return undefined;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  const summaryGeo = useMemo(
    () =>
      estimation?.geo_points?.length
        ? {
            points: estimation.geo_points,
            geometryKind: estimation.geometry_kind || "line",
          }
        : {
            points: work?.geo_points || [],
            geometryKind: work?.geometry_kind || "line",
          },
    [
      estimation?.geo_points,
      estimation?.geometry_kind,
      work?.geo_points,
      work?.geometry_kind,
    ],
  );

  const tabElements = elements.filter((el) => el.work_type === activeTab);
  const onSummary = activeTab === SUMMARY_TAB;

  return (
    <div className="relative -mx-6 -mb-6 w-[calc(100%+3rem)] bg-white p-4 sm:p-6">
      <EstimationHeader
        estimationId={estimationId}
        title={title}
        region={region}
        pendingSpecialCount={data.pendingSpecialCount}
        canEdit={canEdit}
        hasLines={lines.length > 0}
        onAddItem={() => setAddLineParent(null)}
        onImport={() => setImportOpen(true)}
        onDownload={download}
      >
        {selectedIds.length > 0 && (
          <SelectionToolbar
            count={selectedIds.length}
            canEdit={canEdit}
            onEdit={() => selectedLine && setEditingLine(selectedLine)}
            onSplit={() => openSplit(selectedLine)}
            onDuplicate={() => duplicate(selectedIds)}
            onDelete={() => setDeletingIds(selectedIds)}
            onClear={() => setSelectedIds([])}
            moreItems={[
              {
                label: "Line details",
                disabled: !selectedLine,
                onSelect: () => setDetailLine(selectedLine),
              },
              {
                label: "Add item inside",
                disabled: !canEdit || !selectedLine,
                onSelect: () => openAddInside(selectedLine),
              },
              {
                label: "Set GPS",
                disabled: !selectedLine,
                onSelect: () => setGpsLine(selectedLine),
              },
              {
                label: "Pictures",
                disabled: !selectedLine,
                onSelect: () => setAttachmentsLine(selectedLine),
              },
            ]}
          />
        )}
      </EstimationHeader>

      {mayEdit && isPhone && (
        <div
          className="mb-4 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"
          role="status"
        >
          Viewing only. Open this estimate on a tablet or computer to edit it.
        </div>
      )}
      {data.loadError && (
        <div
          className="mb-4 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          <span>{data.loadError}</span>
          <button
            type="button"
            className="underline"
            onClick={() => (data.refreshEstimation(), data.refreshLines())}
          >
            Retry
          </button>
        </div>
      )}
      {banner && (
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${BANNER_TONE[banner.type] || BANNER_TONE.info}`}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="whitespace-pre-line">{banner.message}</span>
            <button
              className="text-xs opacity-70 hover:opacity-100"
              onClick={() => setBanner(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <WorkInfoPanel
        work={work}
        rateYear={estimation?.rate_year}
        canEdit={canEdit}
        onRateYearChange={setRateYear}
      />
      <WorkTypeTabs
        workTypes={workTypes}
        active={activeTab}
        onChange={setActiveTab}
        onRenameParts={
          canEdit && elements.length > 0 ? () => setElementsOpen(true) : null
        }
      />

      {!onSummary && (
        <PendingNotices
          estimationId={estimationId}
          pendingSpecialCount={data.pendingSpecialCount}
          pendingLines={pendingLines}
          onResume={() => {
            const first = pendingLines[0];
            setCompleting({
              parentLine: byId.get(first.parent_line_id),
              subLines: pendingLines.filter(
                (l) => l.parent_line_id === first.parent_line_id,
              ),
            });
          }}
        />
      )}

      <div className="max-h-[75vh] overflow-auto pr-2">
        {onSummary ? (
          <SummaryPanel
            estimationId={estimationId}
            lines={lines}
            geo={summaryGeo}
          />
        ) : sections.length === 0 ? (
          data.linesLoaded && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
              <p className="text-sm font-medium text-gray-800">
                No items{activeTabLabel ? ` in ${activeTabLabel}` : ""} yet.
              </p>
              {canEdit && (
                <>
                  <p className="mt-1 text-xs text-gray-600">
                    Add items from the item master, or import a spreadsheet.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddLineParent(null)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                    >
                      <FaPlus className="h-3 w-3" /> Add Item
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-teal-600 bg-white px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
                    >
                      <FaUpload className="h-3 w-3" /> Import
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        ) : (
          <>
            {canEdit && (
              <p className="mb-2 text-xs text-gray-500">
                Tip: double-click a cell to edit it in place.
              </p>
            )}
            {sections.map((section) => (
              <EstimationTable
                key={section.title}
                section={section}
                canEdit={canEdit}
                selected={selectedSet}
                onToggleSelect={toggleSelect}
                onSetSelected={setSelected}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapsed}
                widths={widths}
                startResize={startResize}
                inline={inline}
                elementById={elementById}
                itemOptions={itemOptions}
              />
            ))}
            <div className="mt-4 flex justify-end pb-4">
              <div className="inline-flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-teal-900 shadow-sm">
                <span className="text-sm font-semibold">
                  Total{activeTabLabel ? ` (${activeTabLabel})` : ""}
                </span>
                <span
                  className="text-xl font-bold tabular-nums"
                  data-testid="tab-total"
                >
                  {formatAmount(tabTotal)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {addLineParent !== undefined && (
        <AddLineModal
          items={catalog.items}
          itemsHasMore={catalog.hasMore}
          itemsLoading={catalog.loading}
          onLoadMoreItems={catalog.loadMore}
          lines={lines}
          elements={tabElements}
          parentLine={addLineParent}
          onClose={() => setAddLineParent(undefined)}
          onSave={async () => {
            if (addLineParent) setSelectedIds([]);
            await afterChange();
          }}
          onCreateSubItems={
            addLineParent
              ? undefined
              : (created) => setSplitLine({ ...created, children: [] })
          }
          estimationId={estimationId}
          region={region}
        />
      )}
      {elementsOpen && (
        <ElementsModal
          estimationId={estimationId}
          elements={elements}
          allowedWorkTypes={workTypes.map((wt) => wt.code)}
          onClose={() => setElementsOpen(false)}
          onChanged={async () => {
            await data.refreshElements();
            await afterChange();
          }}
        />
      )}
      {splitLine && (
        <MakeSubItemsModal
          estimationId={estimationId}
          line={splitLine}
          depth={depthOf(splitLine, byId)}
          elements={elements}
          workTypes={workTypes}
          activeWorkType={activeTab}
          onClose={() => setSplitLine(null)}
          onCreated={async (newChildren, opts = {}) => {
            const parentLine = splitLine;
            setSelectedIds([]);
            await data.refreshElements();
            await afterChange();
            if (!opts.skipComplete && newChildren?.length)
              setCompleting({ parentLine, subLines: newChildren });
          }}
        />
      )}
      {completing && (
        <CompleteSubItemsModal
          parentLine={completing.parentLine}
          subLines={completing.subLines}
          elements={elements}
          onFinish={async () => {
            setCompleting(null);
            await afterChange();
          }}
        />
      )}
      {deletingIds && (
        <ConfirmDeleteLinesModal
          selectedIds={deletingIds}
          lines={lines}
          onClose={() => setDeletingIds(null)}
          onConfirm={confirmDelete}
        />
      )}
      {editingLine && (
        <EditLineModal
          line={editingLine}
          elements={elements}
          onClose={() => setEditingLine(null)}
          onSave={saveEdit}
        />
      )}
      {detailLine && (
        <LineDetailModal
          line={detailLine}
          elements={elements}
          onClose={() => setDetailLine(null)}
        />
      )}
      {gpsLine && (
        <LineGpsDialog
          line={gpsLine}
          onClose={() => setGpsLine(null)}
          onSaved={afterChange}
        />
      )}
      {attachmentsLine && (
        <LineAttachmentsDialog
          line={attachmentsLine}
          onClose={() => setAttachmentsLine(null)}
          readOnly={!canEdit}
        />
      )}
      <ImportLinesModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onBanner={setBanner}
        importContext={{
          lines,
          items: catalog.items,
          region,
          itemsHasMoreRef: catalog.hasMoreRef,
          loadMoreItems: catalog.loadMore,
          estimationId,
          fetchLines: afterChange,
          onSpecialItemsChanged: data.refreshPendingSpecial,
        }}
      />
    </div>
  );
}
