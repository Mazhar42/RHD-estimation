import React, { useEffect, useRef, useState } from "react";
import { FaUpload } from "react-icons/fa";
import Modal from "../../../components/ui/Modal";
import { submitImportLines } from "../importLines";

const btnSecondary =
  "rounded border border-teal-600 bg-white px-4 py-1 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60";
const btnPrimary =
  "rounded bg-teal-700 px-6 py-1 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60";

// Imports estimation lines from CSV/XLSX. Rows matching an item become
// lines; the rest are filed as special item requests (see importLines.js).
export default function ImportLinesModal({ open, onClose, importContext, onBanner }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("append");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setError("");
      setProgress(0);
    }
  }, [open]);

  const pick = (f) => {
    setFile(f || null);
    setError("");
    setDragging(false);
  };

  const submit = async () => {
    if (!file) {
      setError("Choose a CSV or XLSX file first.");
      fileInputRef.current?.click();
      return;
    }
    await submitImportLines({
      ...importContext,
      importFile: file,
      importMode: mode,
      setImportError: setError,
      setIsImporting: setBusy,
      setImportProgress: setProgress,
      setImportBanner: onBanner,
      setIsImportModalOpen: (isOpen) => {
        if (!isOpen) onClose();
      },
      setImportFile: setFile,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Estimation Lines"
      maxWidthClassName="max-w-xl"
      onSubmit={submit}
      closeDisabled={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      }
    >
      <p className="mb-4 text-xs text-gray-600">
        Upload a CSV or XLSX of estimation lines. Rows that don't match an item-master entry are filed as special item
        requests.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="hidden"
        data-testid="import-lines-file-input"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
        className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 p-5 text-center transition ${
          dragging ? "border-teal-400 bg-teal-50" : "border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100"
        } ${error ? "border-red-400" : ""}`}
      >
        <FaUpload className="h-6 w-6 text-gray-600" />
        {file ? (
          <span className="text-sm text-gray-800">
            Selected: <span className="font-medium">{file.name}</span>
          </span>
        ) : (
          <>
            <span className="text-sm text-gray-800">Click to choose a file, or drag & drop</span>
            <span className="text-xs text-gray-500">.csv or .xlsx</span>
          </>
        )}
      </button>
      {file && (
        <button
          type="button"
          disabled={busy}
          onClick={() => pick(null)}
          className="mt-2 text-xs text-gray-700 underline hover:text-gray-900"
        >
          Remove file
        </button>
      )}
      <fieldset className="mt-4">
        <legend className="mb-1 text-xs text-gray-600">Existing lines</legend>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="importLinesMode" checked={mode === "append"} onChange={() => setMode("append")} />
            Keep them and add these
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="importLinesMode" checked={mode === "replace"} onChange={() => setMode("replace")} />
            Replace all existing lines
          </label>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="mt-3 whitespace-pre-line text-sm text-red-600">
          {error}
        </p>
      )}
      {busy && (
        <div className="mt-3">
          <div className="h-2 rounded bg-gray-200">
            <div className="h-2 rounded bg-teal-600 transition-all" style={{ width: `${progress || 10}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-gray-600">Processing rows… {progress}%</p>
        </div>
      )}
    </Modal>
  );
}
