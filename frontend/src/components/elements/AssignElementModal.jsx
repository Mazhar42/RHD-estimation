import React, { useState } from "react";
import { assignLinesToElement } from "../../api/estimations";
import { elementLabel } from "../../utils/elementLabel";

// Bulk-assigns the selected root lines to a structural element. Only roots
// are targeted server-side -- their children follow automatically.
export default function AssignElementModal({
  estimationId,
  elements,
  lineIds,
  onClose,
  onAssigned,
}) {
  const [elementId, setElementId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const sortedElements = [...elements].sort(
    (a, b) =>
      (a.sort_order || 0) - (b.sort_order || 0) || a.element_id - b.element_id,
  );

  const submit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const result = await assignLinesToElement(
        estimationId,
        lineIds,
        elementId === "" ? null : parseInt(elementId, 10),
      );
      onAssigned(result);
      onClose();
    } catch (err) {
      setError(
        err?.response?.data?.detail || "Failed to assign the selected lines.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm z-50 relative border border-gray-200">
        <h3 className="text-base font-semibold mb-1 text-gray-900">
          Assign to element
        </h3>
        <p className="text-xs text-gray-600 mb-4">
          {lineIds.length} line{lineIds.length === 1 ? "" : "s"} selected.
          Only whole (root) items can be assigned directly — any sub-items
          will follow automatically.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <select
            value={elementId}
            onChange={(e) => setElementId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">— Unassigned —</option>
            {sortedElements.map((el) => (
              <option key={el.element_id} value={el.element_id}>
                {elementLabel(el)}
              </option>
            ))}
          </select>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {isSubmitting ? "Assigning…" : "Assign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
