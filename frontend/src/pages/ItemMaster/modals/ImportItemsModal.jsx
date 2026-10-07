import React, { useEffect, useRef, useState } from "react";
import { FaUpload } from "react-icons/fa";
import Modal from "../../../components/ui/Modal";
import { importItems } from "../../../api/items";
import { btnPrimary, btnSecondary, errorDetail } from "../styles";

function downloadTemplate(regionNames) {
  const headers = ["Item Code", "Division", "Description", "Unit", ...regionNames, "Organization"];
  const blob = new Blob([`${headers.join(",")}\n`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ItemMasterTemplate.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Turns the import endpoint's { processed, skipped, errors, total_errors }
// into the banner shown on the page plus an optional inline error.
export function summarizeImport(res) {
  const processed = res?.processed ?? 0;
  const skipped = res?.skipped ?? 0;
  const errors = res?.errors ?? [];
  const totalErrors = res?.total_errors ?? errors.length;
  if (totalErrors > 0 && processed === 0) {
    const preview = errors.slice(0, 5).map((e) => `• ${e}`).join("\n");
    const more = totalErrors > 5 ? `\n\n… and ${totalErrors - 5} more` : "";
    return {
      banner: { type: "error", message: `Import failed: ${totalErrors} row(s) had errors.` },
      inlineError: `Import failed: ${totalErrors} parsing error(s).\n\n${preview}${more}`,
    };
  }
  if (totalErrors > 0) {
    return {
      banner: {
        type: "warning",
        message: `Imported ${processed} item(s); ${totalErrors} row(s) had errors and were skipped.`,
      },
    };
  }
  return {
    banner: {
      type: "success",
      message:
        processed > 0
          ? `Imported ${processed} item(s)${skipped > 0 ? `, skipped ${skipped}` : ""}.`
          : "No items were imported.",
    },
  };
}

export default function ImportItemsModal({ open, onClose, regionNames, onImported, onBanner }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("append");
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

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
    setBusy(true);
    setProgress(0);
    onBanner({ type: "info", message: "Importing item master… Please wait." });
    try {
      const res = await importItems(
        file,
        mode,
        (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
        },
        year,
      );
      const { banner, inlineError } = summarizeImport(res);
      onBanner(banner);
      if ((res?.processed ?? 0) > 0) await onImported();
      if (inlineError) {
        setError(inlineError);
      } else {
        onClose();
      }
    } catch (e) {
      const msg = errorDetail(e, "Import failed. Check the file format and try again.");
      setError(msg);
      onBanner({ type: "error", message: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Item Master"
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
      <p className="mb-4 text-sm text-gray-600">
        Upload a CSV or XLSX in the Item Master format.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="hidden"
        data-testid="import-file-input"
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
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => downloadTemplate(regionNames)}
          className="text-xs text-emerald-700 underline hover:text-emerald-900"
        >
          Download CSV template
        </button>
        {file && (
          <button
            type="button"
            disabled={busy}
            onClick={() => pick(null)}
            className="text-xs text-gray-700 underline hover:text-gray-900"
          >
            Remove file
          </button>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className="mb-1 text-xs text-gray-600">When an item already exists</legend>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="importMode" value="append" checked={mode === "append"} onChange={() => setMode("append")} />
            Add on top (update matches)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="importMode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} />
            Replace this organization + year's items
          </label>
        </div>
      </fieldset>

      <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
        Rate year
        <input
          type="number"
          min="2000"
          max="2100"
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10) || "")}
          className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <span className="text-xs text-gray-500">Used for rows with no Year column.</span>
      </label>

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
          <p className="mt-1 text-[11px] text-gray-600">
            {progress && progress < 100 ? `Uploading… ${progress}%` : "Processing file…"}
          </p>
        </div>
      )}
    </Modal>
  );
}
