import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatAmount } from "./lineTree.js";

const MAX_RESULTS = 50;

export const itemLabel = (it) =>
  `${it.item_code} — ${it.item_description}${it.rate_year ? ` (${it.rate_year})` : ""}`;

// Every word must appear in the code or description; code-prefix matches
// rank first, then code matches, then description-only matches.
export function searchItems(items, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  const scored = [];
  for (const it of items) {
    const code = String(it.item_code || "").toLowerCase();
    const haystack = `${code} ${String(it.item_description || "").toLowerCase()}`;
    if (!words.every((w) => haystack.includes(w))) continue;
    const rank = code.startsWith(words[0])
      ? 0
      : code.includes(words[0])
        ? 1
        : 2;
    scored.push([rank, it]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, it]) => it);
}

export default function ItemPicker({
  items,
  value,
  onChange,
  hasMore,
  loading,
  onLoadMore,
  disabled,
}) {
  const listId = useId();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = useMemo(
    () => items.find((it) => String(it.item_id) === String(value)) || null,
    [items, value],
  );
  const matches = useMemo(() => searchItems(items, query), [items, query]);
  const shown = matches.slice(0, MAX_RESULTS);

  useEffect(() => setActive(0), [query]);

  const choose = (it) => {
    onChange(it);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && shown[active]) {
      e.preventDefault();
      e.stopPropagation();
      choose(shown[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <label className="text-xs text-gray-700" htmlFor={`${listId}-input`}>
        Item
      </label>
      <input
        id={`${listId}-input`}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && shown[active]
            ? `${listId}-${shown[active].item_id}`
            : undefined
        }
        disabled={disabled}
        value={open ? query : selected ? itemLabel(selected) : query}
        placeholder={
          disabled
            ? "Choose an organization first"
            : "Search by item code or description"
        }
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-gray-300 p-3 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {shown.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-500">
              {loading
                ? "Loading items…"
                : query
                  ? "No items match."
                  : "No items for this selection."}
            </li>
          )}
          {shown.map((it, i) => (
            <li
              key={it.item_id}
              id={`${listId}-${it.item_id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(it)}
              className={`cursor-pointer px-3 py-2 text-xs ${i === active ? "bg-teal-50" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-gray-900">
                  {it.item_code}
                </span>
                <span className="whitespace-nowrap tabular-nums text-gray-600">
                  {it.rate != null ? formatAmount(it.rate) : "—"} /{" "}
                  {it.unit || "—"}
                  {it.rate_year ? ` · ${it.rate_year}` : ""}
                </span>
              </div>
              <div className="text-gray-700">{it.item_description}</div>
            </li>
          ))}
          {(matches.length > MAX_RESULTS || hasMore) && (
            <li className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500">
              <span>
                {matches.length > MAX_RESULTS
                  ? `Showing ${MAX_RESULTS} of ${matches.length} — keep typing to narrow.`
                  : "More items are available."}
              </span>
              {hasMore && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onLoadMore}
                  disabled={loading}
                  className="rounded border border-teal-600 px-2 py-0.5 text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
