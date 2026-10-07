import React, { useEffect, useState } from "react";
import Modal from "../ui/Modal.jsx";

const FONT_OPTIONS = [
  { value: "helvetica", label: "Helvetica" },
  { value: "times", label: "Times" },
  { value: "courier", label: "Courier" },
  { value: "noto-sans-bengali", label: "Bangla (Noto Sans Bengali)" },
];

export default function SettingsDialog({ open, onClose, settings, onSave }) {
  const [formState, setFormState] = useState(settings);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormState(settings);
  }, [settings]);

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
        onClick={async () => {
          setIsSaving(true);
          setError("");
          try {
            await onSave(formState);
            onClose();
          } catch (saveError) {
            setError(
              saveError?.response?.data?.detail || "Failed to save settings.",
            );
          } finally {
            setIsSaving(false);
          }
        }}
        disabled={isSaving}
        className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {isSaving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      maxWidthClassName="max-w-xl"
      footer={footer}
    >
      <div className="space-y-5">
        <div>
          <div className="text-sm font-medium text-gray-800">
            Automatic checkpoint
          </div>
          <p className="mb-2 text-xs text-gray-500">
            Edits are saved as you make them. A checkpoint is a restorable copy
            of the whole work, taken this often while you have changes.
          </p>
          <div className="flex flex-wrap gap-3">
            {[5, 10, 30].map((minutes) => (
              <label
                key={minutes}
                className="inline-flex items-center gap-2 text-sm text-gray-700"
              >
                <input
                  type="radio"
                  name="autosave"
                  checked={formState.autosave_interval_minutes === minutes}
                  onChange={() =>
                    setFormState((prev) => ({
                      ...prev,
                      autosave_interval_minutes: minutes,
                    }))
                  }
                />
                Every {minutes} minutes
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-gray-700">
            <span className="font-medium">Print font family</span>
            <select
              value={formState.print_font_family}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  print_font_family: event.target.value,
                }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2"
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-gray-700">
            <span className="font-medium">Print font size</span>
            <input
              type="number"
              min={6}
              max={18}
              value={formState.print_font_size}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  print_font_size: Number(event.target.value),
                }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Preview
          </div>
          <div
            className="space-y-2 text-gray-900"
            style={{
              fontFamily:
                formState.print_font_family === "noto-sans-bengali"
                  ? '"Noto Sans Bengali", sans-serif'
                  : formState.print_font_family,
              fontSize: `${formState.print_font_size}px`,
            }}
          >
            <div className="font-semibold">Estimate preview heading</div>
            <div>Sample line item text for printing output.</div>
            <div>বাংলা নমুনা টেক্সট</div>
          </div>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
