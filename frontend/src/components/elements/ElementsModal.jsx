import React, { useState } from "react";
import {
  createElement,
  updateElement,
  deleteElement,
  generateBridgeElements,
  generateRoadElements,
} from "../../api/estimations";
import { elementLabel, elementKindLabel } from "../../utils/elementLabel";

export default function ElementsModal({
  estimationId,
  elements,
  allowedWorkTypes = ["road", "bridge"],
  onClose,
  onChanged,
}) {
  const [activeTab, setActiveTab] = useState("list"); // 'list' | 'bridge' | 'road'
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bridge generator form
  const [bridgeStructureName, setBridgeStructureName] = useState("");
  const [pierCount, setPierCount] = useState(2);
  const [includeAbutments, setIncludeAbutments] = useState(true);

  // Road generator form
  const [roadStructureName, setRoadStructureName] = useState("");
  const [roadMode, setRoadMode] = useState("breakpoints"); // 'breakpoints' | 'interval'
  const [breakpointsText, setBreakpointsText] = useState("0+000, 1+250");
  const [roadStart, setRoadStart] = useState("0+000");
  const [roadEnd, setRoadEnd] = useState("");
  const [segmentLength, setSegmentLength] = useState(1000);
  const [remainder, setRemainder] = useState("merge");

  // Rename state
  const [renamingId, setRenamingId] = useState(null);
  const [renameCode, setRenameCode] = useState("");
  const [renameLabel, setRenameLabel] = useState("");
  const [renameStructureName, setRenameStructureName] = useState("");

  // Delete-with-force state
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { element, lineCount }

  const sortedElements = [...elements].sort(
    (a, b) =>
      (a.sort_order || 0) - (b.sort_order || 0) || a.element_id - b.element_id,
  );

  const submitBridge = async (e) => {
    e.preventDefault();
    setError("");
    if (pierCount < 0) {
      setError("Pier count cannot be negative.");
      return;
    }
    setIsSubmitting(true);
    try {
      await generateBridgeElements(estimationId, {
        structure_name: bridgeStructureName.trim(),
        pier_count: parseInt(pierCount, 10) || 0,
        include_abutments: includeAbutments,
      });
      setBridgeStructureName("");
      setPierCount(2);
      onChanged();
      setActiveTab("list");
    } catch (err) {
      setError(
        err?.response?.data?.detail?.detail ||
          err?.response?.data?.detail ||
          "Failed to generate bridge elements.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRoad = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const payload = { structure_name: roadStructureName.trim() };
      if (roadMode === "breakpoints") {
        payload.breakpoints = breakpointsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        payload.start = roadStart.trim();
        payload.end = roadEnd.trim();
        payload.segment_length_m = parseFloat(segmentLength);
        payload.remainder = remainder;
      }
      await generateRoadElements(estimationId, payload);
      setBreakpointsText("0+000, 1+250");
      setRoadEnd("");
      onChanged();
      setActiveTab("list");
    } catch (err) {
      setError(
        err?.response?.data?.detail?.detail ||
          err?.response?.data?.detail ||
          "Failed to generate road elements.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const startRename = (element) => {
    setRenamingId(element.element_id);
    setRenameCode(element.code || "");
    setRenameLabel(element.label || "");
    setRenameStructureName(element.structure_name || "");
  };

  const saveRename = async (element) => {
    setError("");
    try {
      const payload = {
        label: renameLabel || null,
        structure_name: renameStructureName,
      };
      // A road chainage code is derived from its metres and cannot be typed.
      const nextCode = renameCode.trim();
      if (element.kind !== "chainage" && nextCode && nextCode !== element.code) {
        payload.code = nextCode;
      }
      await updateElement(estimationId, element.element_id, payload);
      setRenamingId(null);
      onChanged();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        detail?.detail === "element_code_taken"
          ? `The name "${renameCode.trim()}" is already used by another part.`
          : detail?.detail ||
              detail ||
              "Failed to rename element.",
      );
    }
  };

  const requestDelete = async (element) => {
    setError("");
    try {
      await deleteElement(estimationId, element.element_id, false);
      onChanged();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 409 && detail?.detail === "element_has_lines") {
        setDeleteConfirm({ element, lineCount: detail.line_count });
      } else {
        setError(detail?.detail || detail || "Failed to delete element.");
      }
    }
  };

  const confirmForceDelete = async () => {
    if (!deleteConfirm) return;
    setError("");
    try {
      await deleteElement(estimationId, deleteConfirm.element.element_id, true);
      setDeleteConfirm(null);
      onChanged();
    } catch (err) {
      setError(
        err?.response?.data?.detail?.detail ||
          err?.response?.data?.detail ||
          "Failed to delete element.",
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto z-50 relative border border-gray-200">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition"
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
        <h3 className="text-lg sm:text-xl font-semibold mb-4 text-gray-900">
          Structural Elements
        </h3>
        <p className="text-xs text-gray-600 mb-4">
          Break this estimate down by bridge pier / abutment or road chainage
          segment. Assign lines to an element from Add Line or Edit Line, or
          use "Assign Element" on a selection.
        </p>

        <div className="flex border-b border-gray-200 mb-4">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium focus:outline-none ${activeTab === "list" ? "text-teal-600 border-b-2 border-teal-600" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setActiveTab("list")}
          >
            Elements ({elements.length})
          </button>
          {allowedWorkTypes.includes("bridge") && (
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium focus:outline-none ${activeTab === "bridge" ? "text-teal-600 border-b-2 border-teal-600" : "text-gray-500 hover:text-gray-700"}`}
              onClick={() => setActiveTab("bridge")}
            >
              Generate Bridge
            </button>
          )}
          {allowedWorkTypes.includes("road") && (
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium focus:outline-none ${activeTab === "road" ? "text-teal-600 border-b-2 border-teal-600" : "text-gray-500 hover:text-gray-700"}`}
              onClick={() => setActiveTab("road")}
            >
              Generate Road
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === "list" && (
          <div className="space-y-2">
            {sortedElements.length === 0 ? (
              <div className="text-sm text-gray-500 py-6 text-center">
                No elements yet. Use "Generate Bridge" or "Generate Road" to
                create A1, P1…PN, A2 or chainage segments.
              </div>
            ) : (
              sortedElements.map((el) => (
                <div
                  key={el.element_id}
                  className="border border-gray-200 rounded-lg px-3 py-2"
                >
                  {renamingId === el.element_id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {el.kind === "chainage" ? (
                        <span className="text-xs font-semibold text-gray-700 w-16">
                          {el.code}
                        </span>
                      ) : (
                        <input
                          value={renameCode}
                          onChange={(e) => setRenameCode(e.target.value)}
                          placeholder="Name (e.g. A1)"
                          className="text-xs border border-gray-300 rounded px-2 py-1 w-24"
                        />
                      )}
                      <input
                        value={renameStructureName}
                        onChange={(e) =>
                          setRenameStructureName(e.target.value)
                        }
                        placeholder="Structure name"
                        className="text-xs border border-gray-300 rounded px-2 py-1 flex-1 min-w-[120px]"
                      />
                      <input
                        value={renameLabel}
                        onChange={(e) => setRenameLabel(e.target.value)}
                        placeholder="Label (optional)"
                        className="text-xs border border-gray-300 rounded px-2 py-1 flex-1 min-w-[120px]"
                      />
                      <button
                        type="button"
                        onClick={() => saveRename(el)}
                        className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="text-xs px-2 py-1 rounded border border-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                            {el.work_type}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 truncate">
                            {elementLabel(el)}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {elementKindLabel(el)}
                          {el.label ? ` · ${el.label}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startRename(el)}
                          className="text-xs text-gray-600 hover:text-gray-900 underline"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(el)}
                          className="text-xs text-red-600 hover:text-red-800 underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "bridge" && (
          <form onSubmit={submitBridge} className="space-y-4">
            <label className="block space-y-1 text-sm text-gray-700">
              <span className="font-medium">Structure name</span>
              <input
                value={bridgeStructureName}
                onChange={(e) => setBridgeStructureName(e.target.value)}
                placeholder="e.g. Bridge at Ch 2+400"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <span className="block text-xs text-gray-500">
                Needed if this estimate will have more than one bridge, so
                both can have an A1.
              </span>
            </label>
            <label className="block space-y-1 text-sm text-gray-700">
              <span className="font-medium">Number of piers</span>
              <input
                type="number"
                min="0"
                max="200"
                value={pierCount}
                onChange={(e) => setPierCount(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeAbutments}
                onChange={(e) => setIncludeAbutments(e.target.checked)}
              />
              Include abutments (A1 and A2)
            </label>
            <p className="text-xs text-gray-500">
              This will create:{" "}
              <span className="font-mono">
                {includeAbutments ? "A1, " : ""}
                {Array.from(
                  { length: Math.min(Math.max(parseInt(pierCount, 10) || 0, 0), 5) },
                  (_, i) => `P${i + 1}`,
                ).join(", ")}
                {parseInt(pierCount, 10) > 5 ? ", …" : ""}
                {includeAbutments ? ", A2" : ""}
              </span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {isSubmitting ? "Creating…" : "Generate"}
              </button>
            </div>
          </form>
        )}

        {activeTab === "road" && (
          <form onSubmit={submitRoad} className="space-y-4">
            <label className="block space-y-1 text-sm text-gray-700">
              <span className="font-medium">Road / corridor name</span>
              <input
                value={roadStructureName}
                onChange={(e) => setRoadStructureName(e.target.value)}
                placeholder="e.g. N1 Main Carriageway"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <span className="block text-xs text-gray-500">
                Needed if this estimate covers more than one road or service
                lane.
              </span>
            </label>

            <div className="inline-flex rounded overflow-hidden border border-gray-300 text-xs">
              <button
                type="button"
                className={`px-3 py-1.5 ${roadMode === "breakpoints" ? "bg-teal-600 text-white" : "bg-white text-gray-700"}`}
                onClick={() => setRoadMode("breakpoints")}
              >
                Breakpoints
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 ${roadMode === "interval" ? "bg-teal-600 text-white" : "bg-white text-gray-700"}`}
                onClick={() => setRoadMode("interval")}
              >
                Start / end / interval
              </button>
            </div>

            {roadMode === "breakpoints" ? (
              <label className="block space-y-1 text-sm text-gray-700">
                <span className="font-medium">Chainage breakpoints</span>
                <input
                  value={breakpointsText}
                  onChange={(e) => setBreakpointsText(e.target.value)}
                  placeholder="0+000, 1+250, 3+500"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                />
                <span className="block text-xs text-gray-500">
                  Comma-separated. Each pair of consecutive breakpoints
                  becomes one chainage segment.
                </span>
              </label>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1 text-sm text-gray-700">
                    <span className="font-medium">Start chainage</span>
                    <input
                      value={roadStart}
                      onChange={(e) => setRoadStart(e.target.value)}
                      placeholder="0+000"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                  <label className="block space-y-1 text-sm text-gray-700">
                    <span className="font-medium">End chainage</span>
                    <input
                      value={roadEnd}
                      onChange={(e) => setRoadEnd(e.target.value)}
                      placeholder="3+500"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-sm text-gray-700">
                  <span className="font-medium">Segment length (m)</span>
                  <input
                    type="number"
                    min="1"
                    value={segmentLength}
                    onChange={(e) => setSegmentLength(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block space-y-1 text-sm text-gray-700">
                  <span className="font-medium">
                    If the span doesn't divide evenly
                  </span>
                  <select
                    value={remainder}
                    onChange={(e) => setRemainder(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="merge">
                      Merge the leftover into the last segment
                    </option>
                    <option value="split">
                      Keep the leftover as its own short segment
                    </option>
                  </select>
                </label>
              </>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {isSubmitting ? "Creating…" : "Generate"}
              </button>
            </div>
          </form>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-sm w-full border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">
              {deleteConfirm.element.code} has{" "}
              {deleteConfirm.lineCount} item
              {deleteConfirm.lineCount === 1 ? "" : "s"} on it
            </h4>
            <p className="text-xs text-gray-600 mb-4">
              Deleting it will not delete those items — they'll become
              unassigned, and the estimate total won't change.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="text-xs px-3 py-1.5 rounded border border-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmForceDelete}
                className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete and unassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
