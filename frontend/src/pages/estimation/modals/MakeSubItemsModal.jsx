import React, { useEffect, useMemo, useState } from "react";
import { generateSubItems } from "../../../api/estimations";
import { elementLabel } from "../../../utils/elementLabel";

const MODES = [
  {
    key: "bridge",
    label: "Bridge",
    hint: "Abutments and piers — A1, P1 … Pn, A2",
  },
  { key: "road", label: "Road", hint: "Chainage segments — 0+000 - 1+250" },
  { key: "other", label: "Other", hint: "Your own named parts" },
];

// Break one item into several sub-items, one per structural element, so a
// single item can be estimated separately on each part of the work and still
// roll up into one row.
export default function MakeSubItemsModal({
  estimationId,
  line,
  depth = 0,
  elements = [],
  workTypes = [],
  activeWorkType,
  onClose,
  onCreated,
}) {
  const isNested = depth > 0;
  const initialMode = isNested
    ? "custom"
    : activeWorkType === "bridge" || activeWorkType === "road"
      ? activeWorkType
      : "other";
  const [mode, setMode] = useState(initialMode);
  const [source, setSource] = useState("new"); // 'new' | 'existing'
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bridge
  const [pierCount, setPierCount] = useState(2);
  const [includeAbutments, setIncludeAbutments] = useState(true);

  // Road
  const [roadIntervals, setRoadIntervals] = useState([
    { start: "0+000", end: "" },
  ]);

  // Other
  const [names, setNames] = useState([""]);
  const [otherWorkType, setOtherWorkType] = useState(
    activeWorkType || workTypes[0]?.code || "",
  );

  // Reuse existing elements
  const [selectedElementIds, setSelectedElementIds] = useState([]);

  const alreadyUsedElementIds = useMemo(
    () => new Set((line?.children || []).map((child) => child.element_id)),
    [line],
  );

  const availableElements = useMemo(() => {
    const wanted =
      mode === "bridge" ? "bridge" : mode === "road" ? "road" : otherWorkType;
    return [...elements]
      .filter((el) => (wanted ? el.work_type === wanted : true))
      .sort(
        (a, b) =>
          (a.sort_order || 0) - (b.sort_order || 0) ||
          a.element_id - b.element_id,
      );
  }, [elements, mode, otherWorkType]);

  // A framework can only be reused if one exists for this mode.
  useEffect(() => {
    if (!availableElements.length && source === "existing") setSource("new");
  }, [availableElements, source]);

  useEffect(() => {
    setSelectedElementIds([]);
    setError("");
  }, [mode, source]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const bridgePreview = useMemo(() => {
    const count = Math.max(parseInt(pierCount, 10) || 0, 0);
    const shown = Array.from(
      { length: Math.min(count, 6) },
      (_, i) => `P${i + 1}`,
    );
    const parts = [
      ...(includeAbutments ? ["A1"] : []),
      ...shown,
      ...(count > 6 ? ["…", `P${count}`] : []),
      ...(includeAbutments ? ["A2"] : []),
    ];
    return parts.join(", ");
  }, [pierCount, includeAbutments]);

  const toggleElement = (elementId) =>
    setSelectedElementIds((prev) =>
      prev.includes(elementId)
        ? prev.filter((id) => id !== elementId)
        : [...prev, elementId],
    );

  const updateName = (index, value) =>
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)));

  const updateRoadInterval = (index, field, value) =>
    setRoadIntervals((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );

  const addRoadInterval = () =>
    setRoadIntervals((prev) => [...prev, { start: "", end: "" }]);

  const removeRoadInterval = (index) =>
    setRoadIntervals((prev) => prev.filter((_, i) => i !== index));

  const buildPayload = () => {
    if (source === "existing") {
      if (!selectedElementIds.length) {
        return { error: "Pick at least one element to estimate against." };
      }
      return { payload: { mode, element_ids: selectedElementIds } };
    }

    if (mode === "bridge") {
      const count = parseInt(pierCount, 10);
      if (Number.isNaN(count) || count < 0) {
        return { error: "Number of piers cannot be negative." };
      }
      if (count === 0 && !includeAbutments) {
        return { error: "That would create no parts." };
      }
      return {
        payload: {
          mode: "bridge",
          pier_count: count,
          include_abutments: includeAbutments,
        },
      };
    }

    if (mode === "road") {
      if (!roadIntervals.length) {
        return { error: "Add at least one road interval." };
      }

      const intervals = [];
      for (const item of roadIntervals) {
        const start = (item.start || "").trim();
        const end = (item.end || "").trim();

        if (!start || !end) {
          return { error: "Start and end chainage are both required." };
        }

        intervals.push({
          start,
          end,
        });
      }

      return { payloads: intervals };
    }

    const cleaned = names.map((n) => n.trim()).filter(Boolean);
    if (!cleaned.length) {
      return { error: "Give each part a distinct name." };
    }
    if (!otherWorkType && mode !== "custom") {
      return { error: "Choose which work type these belong to." };
    }
    return {
      payload: {
        mode: mode,
        work_type: mode === "custom" ? undefined : otherWorkType,
        names: cleaned,
      },
    };
  };

  const submit = async (e, { skipComplete = false } = {}) => {
    e.preventDefault();
    const result = buildPayload();
    const { payload, payloads, error: validationError } = result || {};
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      let allLines = null;
      if (mode === "road" && Array.isArray(payloads)) {
        for (const intervalPayload of payloads) {
          allLines = await generateSubItems(estimationId, line.line_id, {
            mode: "road",
            ...intervalPayload,
          });
        }
      } else {
        allLines = await generateSubItems(estimationId, line.line_id, payload);
      }
      // generateSubItems returns every line in the estimation, so the newly
      // created sub-items are whatever is under this parent that wasn't
      // there before the call.
      const previousChildIds = new Set(
        (line.children || []).map((child) => child.line_id),
      );
      const newChildren = (allLines || []).filter(
        (l) =>
          l.parent_line_id === line.line_id && !previousChildIds.has(l.line_id),
      );
      onCreated?.(newChildren, { skipComplete });
      onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        detail?.detail ||
          (typeof detail === "string" ? detail : null) ||
          "Couldn't create the parts.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

  return (
    <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto z-50 relative border border-gray-200">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
          Split into parts
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Estimate{" "}
          <span className="font-semibold text-gray-800">
            {line?.item?.item_code}
          </span>{" "}
          separately on each part of the work. The item row then shows the total
          of its parts.
        </p>
        <p className="mt-0.5 text-xs text-gray-500 truncate">
          {line?.item?.item_description}
        </p>

        {/* Mode */}
        {!isNested && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`rounded-lg border px-3 py-2.5 text-left transition ${
                  mode === m.key
                    ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600"
                    : "border-gray-300 bg-white hover:bg-gray-50"
                }`}
              >
                <span
                  className={`block text-sm font-semibold ${mode === m.key ? "text-teal-800" : "text-gray-800"}`}
                >
                  {m.label}
                </span>
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  {m.hint}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* New framework vs reuse an existing one */}
        {!isNested && availableElements.length > 0 && (
          <div className="mt-4 inline-flex rounded-lg overflow-hidden border border-gray-300 text-xs">
            <button
              type="button"
              className={`px-3 py-1.5 ${source === "new" ? "bg-teal-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              onClick={() => setSource("new")}
            >
              Add new
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 ${source === "existing" ? "bg-teal-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              onClick={() => setSource("existing")}
            >
              Use existing ({availableElements.length})
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-4 space-y-4">
          {source === "existing" ? (
            <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-lg border border-gray-200 p-2">
              {availableElements.map((el) => {
                const used = alreadyUsedElementIds.has(el.element_id);
                return (
                  <label
                    key={el.element_id}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${used ? "opacity-50" : "hover:bg-gray-50 cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      disabled={used}
                      checked={selectedElementIds.includes(el.element_id)}
                      onChange={() => toggleElement(el.element_id)}
                      className="accent-teal-600"
                    />
                    <span className="font-medium text-gray-800">
                      {elementLabel(el)}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {used ? "already a part" : el.kind}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : mode === "bridge" ? (
            <>
              <label className="block space-y-1 text-sm text-gray-700">
                <span className="font-medium">Number of piers</span>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={pierCount}
                  onChange={(e) => setPierCount(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={includeAbutments}
                  onChange={(e) => setIncludeAbutments(e.target.checked)}
                  className="accent-teal-600"
                />
                Include abutments (A1 and A2)
              </label>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                <span className="text-xs text-gray-500">Parts: </span>
                <span className="text-xs font-mono font-semibold text-gray-800">
                  {bridgePreview || "—"}
                </span>
              </div>
            </>
          ) : mode === "road" ? (
            <div className="space-y-3">
              {roadIntervals.map((interval, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block space-y-1 text-sm text-gray-700">
                      <span className="font-medium">Start chainage</span>
                      <input
                        value={interval.start}
                        onChange={(e) =>
                          updateRoadInterval(index, "start", e.target.value)
                        }
                        placeholder="0+000"
                        className={`${fieldClass} font-mono`}
                      />
                    </label>
                    <label className="block space-y-1 text-sm text-gray-700">
                      <span className="font-medium">End chainage</span>
                      <input
                        value={interval.end}
                        onChange={(e) =>
                          updateRoadInterval(index, "end", e.target.value)
                        }
                        placeholder="3+500"
                        className={`${fieldClass} font-mono`}
                      />
                    </label>
                  </div>
                  {roadIntervals.length > 1 && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeRoadInterval(index)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addRoadInterval}
                className="text-xs font-medium text-teal-700 hover:text-teal-900"
              >
                + Add another
              </button>
            </div>
          ) : (
            <>
              {workTypes.length > 1 && mode !== "custom" && (
                <label className="block space-y-1 text-sm text-gray-700">
                  <span className="font-medium">Work type</span>
                  <select
                    value={otherWorkType}
                    onChange={(e) => setOtherWorkType(e.target.value)}
                    className={fieldClass}
                  >
                    {workTypes.map((wt) => (
                      <option key={wt.code} value={wt.code}>
                        {wt.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="space-y-2">
                <span className="block text-sm font-medium text-gray-700">
                  Part names
                </span>
                {names.map((name, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={name}
                      onChange={(e) => updateName(index, e.target.value)}
                      placeholder={`e.g. ${index === 0 ? "Toilet Block" : "Guard Room"}`}
                      className={fieldClass}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNames((prev) => prev.filter((_, i) => i !== index))
                      }
                      disabled={names.length <= 1}
                      className="shrink-0 w-9 h-9 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                      aria-label="Remove"
                    >
                      −
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setNames((prev) => [...prev, ""])}
                  className="text-xs font-medium text-teal-700 hover:text-teal-900"
                >
                  + Add another
                </button>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={(e) => submit(e, { skipComplete: true })}
              className="rounded-lg border border-teal-600 bg-white px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60"
            >
              Save &amp; Exit
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {isSubmitting ? "Creating…" : "Create & Enter Numbers"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
