import React from "react";
import { FaCopy, FaEdit, FaSitemap, FaTrash } from "react-icons/fa";
import DropdownMenu from "../../components/ui/DropdownMenu";

const base =
  "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
const plain = `${base} border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:hover:bg-white`;
const primary = `${base} border-teal-700 bg-teal-700 text-white hover:bg-teal-800 disabled:hover:bg-teal-700`;
const danger = `${base} border-red-300 bg-white text-red-700 hover:bg-red-50`;

// Actions for the selected lines. Single-line actions disable (with a
// reason) when several lines are selected; rarer ones live under More.
export default function SelectionToolbar({
  count,
  canEdit,
  onEdit,
  onSplit,
  onDuplicate,
  onDelete,
  onClear,
  moreItems,
}) {
  const single = count === 1;
  const needsOne = single ? undefined : "Select a single line";
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
      role="toolbar"
      aria-label="Selected lines"
    >
      <span className="inline-flex h-8 items-center rounded-md border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700">
        {count} selected
      </span>
      <span className="h-6 w-px bg-gray-300" aria-hidden="true" />
      {canEdit && (
        <>
          <button type="button" className={plain} onClick={onEdit} disabled={!single} title={needsOne} aria-label="Edit">
            <FaEdit className="h-3 w-3" /> <span className="hidden lg:inline">Edit</span>
          </button>
          <button
            type="button"
            className={primary}
            onClick={onSplit}
            disabled={!single}
            title={needsOne || "Break this item into parts: bridge parts, road chainages or named parts"}
          >
            <FaSitemap className="h-3 w-3" /> Split into parts
          </button>
          <button type="button" className={plain} onClick={onDuplicate} aria-label="Duplicate" title="Duplicate">
            <FaCopy className="h-3 w-3" /> <span className="hidden lg:inline">Duplicate</span>
          </button>
          <button type="button" className={danger} onClick={onDelete} aria-label="Delete" title="Delete">
            <FaTrash className="h-3 w-3" /> <span className="hidden lg:inline">Delete</span>
          </button>
        </>
      )}
      <DropdownMenu label="More" align="left" buttonClassName={plain} items={moreItems} />
      <button type="button" className={`${plain} ml-auto`} onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
