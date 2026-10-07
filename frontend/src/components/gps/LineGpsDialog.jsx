import React, { useEffect, useState } from "react";
import Modal from "../ui/Modal.jsx";
import GpsInput from "./GpsInput.jsx";
import { getGeoPoints, putGeoPoints } from "../../api/geo";

export default function LineGpsDialog({ line, onClose, onSaved }) {
  const [value, setValue] = useState({
    geometry_kind: line?.geometry_kind || "point",
    points: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!line) return;
    let cancelled = false;
    setIsLoading(true);
    getGeoPoints("estimation_line", line.line_id)
      .then((points) => {
        if (cancelled) return;
        setValue({
          geometry_kind: line.geometry_kind || "point",
          points: points || [],
        });
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load GPS points.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [line]);

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    try {
      await putGeoPoints("estimation_line", line.line_id, value);
      onSaved?.(value.geometry_kind);
      onClose();
    } catch (saveError) {
      setError(
        saveError?.response?.data?.detail || "Failed to save GPS points.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving || isLoading}
        className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {isSaving ? "Saving…" : "Save GPS"}
      </button>
    </div>
  );

  return (
    <Modal
      open={!!line}
      onClose={onClose}
      title={`Set GPS — ${line?.item?.item_code || "Line"}`}
      maxWidthClassName="max-w-lg"
      footer={footer}
    >
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <GpsInput value={value} onChange={setValue} />
      )}
      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </Modal>
  );
}
