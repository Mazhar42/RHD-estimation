import React, { useMemo, useState } from "react";
import InputWithUnit from "../../components/ui/InputWithUnit";
import { downloadLineAttachment } from "../../utils/download";
import { unitAdornment } from "../../utils/unitInputs";
import { flattenTree, formatAmount, hasDimensions, isReadOnlyLine, visibleColumns } from "./lineTree";
import { DIMENSION_FIELDS } from "./hooks/useInlineEdit";

const th = "px-2 py-1 text-left text-xs font-bold border-r text-gray-800 border-gray-200";
const td = "px-2 py-1 text-xs border-r text-gray-800 border-gray-200";
const editorClass =
  "w-full text-xs border border-teal-500 rounded px-2 py-1 focus:ring-2 focus:ring-teal-200 focus:outline-none shadow-sm";

function ResizableTh({ column, label, widths, startResize }) {
  return (
    <th className={`${th} relative group select-none`} style={{ width: widths[column], minWidth: widths[column] }}>
      {label}
      <div
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-teal-400 z-10"
        onMouseDown={(e) => startResize(e, column)}
      />
    </th>
  );
}

function InlineTextEditor({ inline, unit }) {
  return (
    <InputWithUnit
      unit={unitAdornment(unit, inline.cell?.field)}
      autoFocus
      value={inline.value}
      onChange={(e) => inline.setValue(e.target.value)}
      onBlur={inline.onBlur}
      onKeyDown={inline.onKeyDown}
      className={editorClass}
    />
  );
}

function InlineItemPicker({ inline, options, labelOf }) {
  return (
    <select
      autoFocus
      aria-label="Choose item"
      value={inline.value}
      onChange={(e) => inline.setValue(e.target.value)}
      onBlur={inline.onBlur}
      onKeyDown={inline.onKeyDown}
      onClick={(e) => e.stopPropagation()}
      className={editorClass}
    >
      {options.map((it) => (
        <option key={it.item_id} value={it.item_id}>
          {labelOf(it)}
        </option>
      ))}
    </select>
  );
}

// A dimension typed as an equation shows its value; clicking toggles the
// equation.
function DimensionValue({ line, field }) {
  const [showExpr, setShowExpr] = useState(false);
  const expr = line[field === "no_of_units" ? "no_of_units_expr" : `${field}_expr`];
  const value = line[field] ?? "";
  if (!expr) return value;
  return (
    <button
      type="button"
      onClick={() => setShowExpr((v) => !v)}
      className="w-full rounded border border-teal-200 bg-teal-50 px-2 py-1 text-left text-xs text-teal-900 hover:bg-teal-100"
      title={showExpr ? "Show value" : "Show equation"}
    >
      {showExpr ? expr : value}
    </button>
  );
}

function LineRow({ row, index, ctx }) {
  const { line: l, depth } = row;
  const { canEdit, inline, selected, onToggleSelect, collapsed, onToggleCollapse, columns, elementById, itemOptions } =
    ctx;
  const readOnly = isReadOnlyLine(l);
  const isParent = (l.children || []).length > 0;
  const editable = canEdit && !readOnly;
  const partLabel =
    l.parent_line_id != null ? l.label || (l.element_id != null ? elementById.get(l.element_id)?.code : null) : null;
  const quantityEditable = editable && !isParent && !hasDimensions(l);

  const cellProps = (field) => {
    const allowed = editable && !(isParent && (DIMENSION_FIELDS.includes(field) || field === "quantity"));
    return allowed
      ? {
          onDoubleClick: () => inline.start(l, field),
          title: "Double-click to edit",
          className: "cursor-text",
        }
      : {};
  };
  const editing = (field) => inline.isEditing(l.line_id, field);

  const dimensionCell = (field) => {
    const { className: extra = "", ...handlers } = cellProps(field);
    return (
      <td key={field} className={`${td} whitespace-nowrap ${extra}`} {...handlers}>
        {editing(field) ? (
          <InlineTextEditor inline={inline} unit={l.item?.unit} />
        ) : isParent ? (
          "—"
        ) : (
          <DimensionValue line={l} field={field} />
        )}
      </td>
    );
  };

  const codeCell = cellProps("item_code");
  const descCell = cellProps("description");
  const subCell = cellProps("sub_description");
  const options = itemOptions(l.item?.division_id);

  return (
    <tr
      data-ctx-scope={readOnly ? undefined : "line-row"}
      data-line-id={l.line_id}
      className={`${index % 2 === 0 ? "bg-white" : "bg-gray-50"} transition-colors hover:bg-teal-50 ${
        selected.has(l.line_id) ? "!bg-teal-100" : ""
      } ${isParent ? "border-t-2 border-gray-300 font-semibold" : ""}`}
    >
      {canEdit && (
        <td className="p-2">
          {!readOnly && (
            <input
              type="checkbox"
              aria-label={`Select ${l.item?.item_code ?? "line"}`}
              checked={selected.has(l.line_id)}
              onChange={() => onToggleSelect(l.line_id)}
            />
          )}
        </td>
      )}
      <td {...codeCell} className={`${td} whitespace-normal break-words ${codeCell.className || ""}`}>
        {editing("item_code") ? (
          <InlineItemPicker inline={inline} options={options.byCode} labelOf={(it) => it.item_code} />
        ) : (
          <div className="flex items-center gap-2" style={{ paddingLeft: depth * 18 }}>
            {isParent ? (
              <button
                type="button"
                className="text-gray-500"
                aria-label={collapsed.has(l.line_id) ? "Expand" : "Collapse"}
                onClick={() => onToggleCollapse(l.line_id)}
              >
                {collapsed.has(l.line_id) ? "▸" : "▾"}
              </button>
            ) : depth > 0 ? (
              <span className="text-gray-400">↳</span>
            ) : null}
            {partLabel ? (
              <span className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">
                {partLabel}
              </span>
            ) : (
              <span>{l.item?.item_code}</span>
            )}
            {readOnly && (
              <span
                className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800"
                title="Approved special item — edit it on the Special Items page"
              >
                SPECIAL
              </span>
            )}
          </div>
        )}
      </td>
      <td {...descCell} className={`${td} whitespace-normal break-words ${descCell.className || ""}`}>
        {editing("description") ? (
          <InlineItemPicker inline={inline} options={options.byDesc} labelOf={(it) => it.item_description} />
        ) : (
          l.item?.item_description
        )}
      </td>
      {columns.subDescription && (
        <td {...subCell} className={`${td} whitespace-normal break-words ${subCell.className || ""}`}>
          {editing("sub_description") ? <InlineTextEditor inline={inline} unit={l.item?.unit} /> : l.sub_description}
        </td>
      )}
      {dimensionCell("no_of_units")}
      {columns.length && dimensionCell("length")}
      {columns.width && dimensionCell("width")}
      {columns.thickness && dimensionCell("thickness")}
      {columns.quantity && (
        <td
          className={`${td} whitespace-nowrap ${quantityEditable ? "cursor-text" : "bg-gray-50"}`}
          onDoubleClick={quantityEditable ? () => inline.start(l, "quantity") : undefined}
          title={quantityEditable ? "Double-click to edit" : undefined}
        >
          {editing("quantity") ? (
            <input
              autoFocus
              type="number"
              aria-label="Quantity"
              value={inline.value}
              onChange={(e) => inline.setValue(e.target.value)}
              onBlur={inline.onBlur}
              onKeyDown={inline.onKeyDown}
              className={editorClass}
            />
          ) : (
            (l.calculated_qty ?? l.quantity)
          )}
        </td>
      )}
      <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{l.rate != null ? formatAmount(l.rate) : "—"}</td>
      <td className={`${td} whitespace-nowrap`}>{l.item?.unit}</td>
      {columns.attachment && (
        <td className={`${td} whitespace-nowrap`}>
          {l.attachments?.length ? (
            <span className="inline-flex items-center gap-2">
              <span className="font-medium">{l.attachments[0].filename}</span>
              <button
                type="button"
                onClick={() => downloadLineAttachment(l)}
                className="rounded bg-rose-600 px-2 py-1 text-white hover:bg-rose-700"
              >
                Download
              </button>
            </span>
          ) : (
            "—"
          )}
        </td>
      )}
      <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{formatAmount(l.amount)}</td>
    </tr>
  );
}

// One division's lines within the active work-type tab.
export default function EstimationTable({
  section,
  canEdit,
  selected,
  onToggleSelect,
  onSetSelected,
  collapsed,
  onToggleCollapse,
  widths,
  startResize,
  inline,
  elementById,
  itemOptions,
}) {
  const allRows = useMemo(
    () => section.lines.flatMap((node) => flattenTree(node, collapsed, 0, true).map((r) => r.line)),
    [section.lines, collapsed],
  );
  const rows = useMemo(() => section.lines.flatMap((node) => flattenTree(node, collapsed)), [section.lines, collapsed]);
  const columns = useMemo(() => visibleColumns(allRows), [allRows]);
  const selectableIds = useMemo(
    () => rows.filter((r) => !isReadOnlyLine(r.line)).map((r) => r.line.line_id),
    [rows],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const ctx = { canEdit, inline, selected, onToggleSelect, collapsed, onToggleCollapse, columns, elementById, itemOptions };

  return (
    <section className="mb-8" aria-label={section.title}>
      <h3 className="mb-2 rounded bg-gray-200 p-2 text-md font-semibold">{section.title}</h3>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10 border-b-2 border-gray-200 bg-gray-100">
            <tr>
              {canEdit && (
                <th className="w-4 p-2">
                  <input
                    type="checkbox"
                    aria-label={`Select all in ${section.title}`}
                    checked={allSelected}
                    onChange={(e) => onSetSelected(selectableIds, e.target.checked)}
                  />
                </th>
              )}
              <ResizableTh column="item_code" label="Item Code" widths={widths} startResize={startResize} />
              <ResizableTh column="description" label="Description" widths={widths} startResize={startResize} />
              {columns.subDescription && (
                <ResizableTh column="sub_description" label="Sub Desc" widths={widths} startResize={startResize} />
              )}
              <th className={`${th} min-w-[80px]`}>No.</th>
              {columns.length && <th className={`${th} min-w-[100px]`}>Length</th>}
              {columns.width && <th className={`${th} min-w-[100px]`}>Width</th>}
              {columns.thickness && <th className={`${th} min-w-[100px]`}>Thickness</th>}
              {columns.quantity && <th className={`${th} min-w-[100px]`}>Quantity</th>}
              <th className={`${th} min-w-[100px] text-right`}>Rate</th>
              <th className={`${th} min-w-[70px]`}>Unit</th>
              {columns.attachment && <th className={`${th} min-w-[140px]`}>Attachment</th>}
              <th className={`${th} min-w-[120px] text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {rows.map((row, i) => (
              <LineRow key={row.line.line_id} row={row} index={i} ctx={ctx} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex justify-end">
        <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-teal-900 shadow-sm">
          <span className="text-xs font-medium">Subtotal · {section.title}</span>
          <span className="text-xs font-semibold tabular-nums">{formatAmount(section.subtotal)}</span>
        </div>
      </div>
    </section>
  );
}
