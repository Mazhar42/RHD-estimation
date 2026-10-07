import * as XLSX from "xlsx";
import { listDivisions } from "../../api/items";
import {
  createEstimationLinesBatch,
  createSpecialItemRequestsBatch,
  deleteEstimationLines,
} from "../../api/estimations";
import { parseDimensionInput } from "../../utils/dimensions";

// Parses a CSV/XLSX file of estimation lines and imports it, matching each
// row to an existing item (or filing it as a Special Item Request when no
// match is found). `ctx` bundles the EstimationDetail state/callbacks this
// needs since the logic is too state-heavy to be a pure function.
export async function submitImportLines({
  importFile,
  importMode,
  lines,
  items: initialItems,
  region,
  itemsHasMoreRef,
  loadMoreItems,
  estimationId,
  fetchLines,
  onSpecialItemsChanged,
  setImportError,
  setIsImporting,
  setImportProgress,
  setImportBanner,
  setIsImportModalOpen,
  setImportFile,
}) {
  if (!importFile) {
    setImportError("Please select a CSV or XLSX file.");
    return;
  }
  try {
    setIsImporting(true);
    setImportProgress(0);
    const filename = importFile.name || "";
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (!["xlsx", "xlsm", "csv"].includes(ext)) {
      setImportError("Only .xlsx or .csv files are allowed.");
      setIsImporting(false);
      return;
    }
    // Optional replace: clear existing lines
    if (importMode === "replace" && lines.length) {
      const allIds = lines.map((l) => l.line_id);
      await deleteEstimationLines(allIds);
    }
    let wb;
    if (ext === "csv") {
      const reader = new FileReader();
      const fileText = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(importFile);
      });
      wb = XLSX.read(fileText, { type: "string" });
    } else {
      const reader = new FileReader();
      const fileArrayBuffer = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(importFile);
      });
      wb = XLSX.read(fileArrayBuffer, { type: "array" });
    }
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      blankrows: false,
      raw: false,
    });

    // Helpers: sanitize numbers, detect totals, normalize codes, and robust header mapping
    const parseNum = (val) => {
      if (val === null || val === undefined) return null;
      const s = String(val).trim();
      if (!s || s === "-") return null;
      const n = Number(s.replace(/[,\s]/g, ""));
      return isNaN(n) ? null : n;
    };
    const isTotalLikeRow = (row) => {
      return row.some((cell) => {
        const t = String(cell || "").toLowerCase();
        return t.includes("total") || t.includes("subtotal");
      });
    };
    const normCode = (code) =>
      String(code || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""); // Matches 01/02/04 as 010204, 01-02-04 as 010204, 01.02.04 as 010204

    // Precompute item maps for matching by code or description.
    // Items matching the current estimation region are preferred.

    // Fetch available divisions for fallback
    let divisionsList = [];
    try {
      divisionsList = await listDivisions({ skip: 0, limit: 1000 });
    } catch (e) {
      console.error("Failed to fetch divisions for import fallback", e);
    }
    // Use first division as default if no other info available
    const defaultDivisionId =
      divisionsList.length > 0 ? divisionsList[0].division_id : 1;

    // Grows as ensureItemForRow pages in more of the catalogue; matching
    // must search this, not the list passed in, or the extra pages are
    // loaded and then never looked at.
    const catalog = [...initialItems];
    const byCode = new Map();
    const byDesc = new Map();
    const indexItems = (list) => {
    for (const it of list) {
      // Add normalized code (stripping separators)
      const k = normCode(it.item_code);
      if (k) {
        // Prefer current region: overwrite only if we don't have a region match yet
        if (!byCode.has(k) || it.region === region) byCode.set(k, it);
      }

      // Also add exact code match to cover cases where delimiters matter but were stripped above
      const kExact = String(it.item_code || "")
        .trim()
        .toLowerCase();
      if (kExact && kExact !== k) {
        if (!byCode.has(kExact) || it.region === region)
          byCode.set(kExact, it);
      }

      const d = String(it.item_description || "")
        .trim()
        .toLowerCase();
      if (d) {
        if (!byDesc.has(d) || it.region === region) byDesc.set(d, it);
      }
    }
    };
    indexItems(catalog);
    const findItemForRow = (codeCell, descCell) => {
      const codeTrim = String(codeCell || "").trim();
      if (codeTrim) {
        // 1. Exact code match for current region
        if (region) {
          const exactRegion = catalog.find(
            (it) =>
              String(it.item_code).trim() === codeTrim &&
              it.region === region,
          );
          if (exactRegion) return exactRegion;
        }
        // 2. Exact code match any region
        const exact = catalog.find(
          (it) => String(it.item_code).trim() === codeTrim,
        );
        if (exact) return exact;

        // 3. Normalized code (stripping delimiters)
        // This handles cases where Excel has "01/02/04" but DB has "01.02.04" or vice versa
        const norm = byCode.get(normCode(codeTrim));
        if (norm) return norm;

        // 4. Try matching with/without leading zeros if standard delimiters are used
        // e.g. 1.2.4 vs 01.02.04
        // (This is partially covered by normCode but normCode doesn't handle removing zeros)
      }
      const dkey = String(descCell || "")
        .trim()
        .toLowerCase();
      if (dkey) {
        const byd = byDesc.get(dkey);
        if (byd) return byd;
        // Fallback: contains-based match, prefer current region
        const cands = catalog.filter((it) => {
          const descr = String(it.item_description || "")
            .trim()
            .toLowerCase();
          return descr.includes(dkey) || dkey.includes(descr);
        });
        if (cands.length === 1) return cands[0];
        if (cands.length > 1 && region) {
          const regionMatch = cands.find((it) => it.region === region);
          if (regionMatch) return regionMatch;
        }
      }
      return null;
    };
    const ensureItemForRow = async (codeCell, descCell) => {
      let item = findItemForRow(codeCell, descCell);
      let attempts = 0;
      while (!item && itemsHasMoreRef.current && attempts < 5) {
        const added = await loadMoreItems();
        if (!added || added.length === 0) break;
        catalog.push(...added);
        indexItems(added);
        item = findItemForRow(codeCell, descCell);
        attempts += 1;
      }
      return item;
    };

    // Detect header row: look for key columns with common names
    const headerKeywords = {
      item_code: ["item code", "code", "itemcode", "item"],
      description: ["item description", "description", "desc"],
      sub_description: [
        "sub-description",
        "sub description",
        "sub desc",
        "sub",
      ],
      // Recognized so header detection can name-match this column (present
      // in files exported once structural elements are in use) rather than
      // risk it being swallowed into the positional fallback.
      element: [
        "element",
        "structure element",
        "structural element",
        "chainage",
        "pier",
        "abutment",
      ],
      no_of_units: ["no.", "no", "units", "number"],
      length: ["length"],
      width: ["width"],
      thickness: ["thickness"],
      quantity: ["quantity", "qty"],
    };
    const headerRowIndex = rows.findIndex((r) => {
      const cells = r.map((c) =>
        String(c || "")
          .trim()
          .toLowerCase(),
      );
      const hasItem =
        cells.some((x) => headerKeywords.item_code.includes(x)) ||
        cells.some((x) => headerKeywords.description.includes(x));
      const hasDims =
        cells.some((x) => headerKeywords.length.includes(x)) &&
        cells.some((x) => headerKeywords.width.includes(x));
      return hasItem && hasDims;
    });
    let colMap = null;
    if (headerRowIndex >= 0) {
      const hdr = rows[headerRowIndex].map((c) =>
        String(c || "")
          .trim()
          .toLowerCase(),
      );
      const findCol = (keys) => {
        for (let i = 0; i < hdr.length; i++) {
          if (keys.includes(hdr[i])) return i;
        }
        return -1;
      };
      colMap = {
        item_code: findCol(headerKeywords.item_code),
        description: findCol(headerKeywords.description),
        sub_description: findCol(headerKeywords.sub_description),
        element: findCol(headerKeywords.element),
        no_of_units: findCol(headerKeywords.no_of_units),
        length: findCol(headerKeywords.length),
        width: findCol(headerKeywords.width),
        thickness: findCol(headerKeywords.thickness),
        quantity: findCol(headerKeywords.quantity),
      };
    }

    let importedCount = 0;
    let skippedCount = 0;
    let missingItemCount = 0;
    let apiErrorCount = 0;
    let processedRows = 0;
    const notFoundCodes = new Set();

    const isCellEmpty = (c) =>
      c === null || c === undefined || String(c).trim() === "";
    const isSectionHeaderRow = (
      codeCell,
      descCell,
      noUnitsCell,
      lengthCell,
      widthCell,
      thicknessCell,
      quantityCell,
    ) => {
      const text = `${codeCell || ""} ${descCell || ""}`.toLowerCase();
      if (!text.trim()) return false;
      const markers = [
        "division",
        "sub-total",
        "subtotal",
        "item code",
        "item description",
        "item master",
        "analysis",
        "particulars",
        "element",
      ];
      const headerTokens = new Set([
        ...headerKeywords.item_code,
        ...headerKeywords.description,
        ...headerKeywords.sub_description,
        ...headerKeywords.element,
        ...headerKeywords.no_of_units,
        ...headerKeywords.length,
        ...headerKeywords.width,
        ...headerKeywords.thickness,
        ...headerKeywords.quantity,
      ]);
      const cellLooksLikeHeader = (cell) =>
        headerTokens.has(
          String(cell || "")
            .trim()
            .toLowerCase(),
        );
      if (
        [
          codeCell,
          descCell,
          noUnitsCell,
          lengthCell,
          widthCell,
          thicknessCell,
          quantityCell,
        ].some(cellLooksLikeHeader)
      ) {
        return true;
      }
      const hasMarker = markers.some((m) => text.includes(m));
      const hasDims = !(
        isCellEmpty(noUnitsCell) &&
        isCellEmpty(lengthCell) &&
        isCellEmpty(widthCell) &&
        isCellEmpty(thicknessCell) &&
        isCellEmpty(quantityCell)
      );
      return hasMarker && !hasDims;
    };

    // Start parsing below header if found; else scan entire sheet
    const startIdx = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
    const candidateRows = rows.slice(startIdx).filter((row) => {
      if (!row || row.length === 0) return false;
      if (row.length === 1 || isTotalLikeRow(row)) return false;
      return true;
    });
    const totalRows = candidateRows.length || 1;
    let lastItem = null;
    const BATCH_SIZE = 50;
    let batch = [];
    let specialBatch = [];

    for (let ri = startIdx; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!row || row.length === 0) continue;
      // Skip visible totals or section headers
      if (row.length === 1 || isTotalLikeRow(row)) continue;

      // Read fields either by header map or by fixed positions fallback
      const codeCell =
        colMap && colMap.item_code >= 0 ? row[colMap.item_code] : row[0];
      const descCell =
        colMap && colMap.description >= 0 ? row[colMap.description] : row[1];
      const subDescCell =
        colMap && colMap.sub_description >= 0
          ? row[colMap.sub_description]
          : row[2];
      const noUnitsCell =
        colMap && colMap.no_of_units >= 0 ? row[colMap.no_of_units] : row[3];
      const lengthCell =
        colMap && colMap.length >= 0 ? row[colMap.length] : row[4];
      const widthCell =
        colMap && colMap.width >= 0 ? row[colMap.width] : row[5];
      const thicknessCell =
        colMap && colMap.thickness >= 0 ? row[colMap.thickness] : row[6];
      const quantityCell =
        colMap && colMap.quantity >= 0 ? row[colMap.quantity] : row[7];

      // Skip section headers or repeated header rows
      if (
        isSectionHeaderRow(
          codeCell,
          descCell,
          noUnitsCell,
          lengthCell,
          widthCell,
          thicknessCell,
          quantityCell,
        )
      ) {
        processedRows++;
        setImportProgress(Math.round((processedRows / totalRows) * 100));
        continue;
      }

      // Filter: Ignore rows where ALL dimension fields (No, Length, Width, Thickness) are empty.
      // Quantity alone is not required — any one dimension value makes the row valid.
      if (
        isCellEmpty(noUnitsCell) &&
        isCellEmpty(lengthCell) &&
        isCellEmpty(widthCell) &&
        isCellEmpty(thicknessCell)
      ) {
        skippedCount++;
        processedRows++;
        setImportProgress(Math.round((processedRows / totalRows) * 100));
        continue;
      }

      // Find item by code or description, or use lastItem if code/desc are empty
      let item = null;
      const codeTrimmed = String(codeCell || "").trim();
      const descTrimmed = String(descCell || "").trim();
      const hasIdentity = codeTrimmed || descTrimmed;

      if (hasIdentity) {
        item = await ensureItemForRow(codeCell, descCell);
        if (item) {
          lastItem = item;
        } else if (!descTrimmed && lastItem) {
          // Row has a code but no description and code doesn't match any item —
          // treat as a continuation/sub-measurement row (common in govt estimation
          // sheets where sub-rows have sequential numbering in the code column)
          item = lastItem;
        } else {
          lastItem = null;
        }
      } else {
        // Continuation row
        item = lastItem;
      }

      if (!item) {
        if (codeTrimmed) notFoundCodes.add(codeTrimmed);

        // Instead of skipping, create a Special Item Request
        const lengthRes = parseDimensionInput(lengthCell);
        const widthRes = parseDimensionInput(widthCell);
        const thicknessRes = parseDimensionInput(thicknessCell);
        const noUnitsRes = parseDimensionInput(noUnitsCell);

        // Use last item's division if available, else default
        const divId = lastItem?.division_id || defaultDivisionId;

        const specialPayload = {
          division_id: divId,
          item_description: String(
            descCell || codeCell || "Imported Item",
          ).trim(),
          item_code: codeTrimmed || null,
          sub_description: String(subDescCell || ""),
          no_of_units: noUnitsRes.value ?? 1,
          no_of_units_expr: noUnitsRes.expr,
          length: lengthRes.value,
          width: widthRes.value,
          thickness: thicknessRes.value,
          length_expr: lengthRes.expr,
          width_expr: widthRes.expr,
          thickness_expr: thicknessRes.expr,
          quantity: parseNum(quantityCell),
          unit: null, // Unknown unit
          rate: 0, // Unknown rate
          region: region || "Default",
          organization: "RHD",
        };

        specialBatch.push(specialPayload);

        // missingItemCount++; // Technically found/handled now? Let's not count as missing for error banner
        // skippedCount++;
        processedRows++;
        setImportProgress(Math.round((processedRows / totalRows) * 100));

        if (specialBatch.length >= BATCH_SIZE) {
          try {
            await createSpecialItemRequestsBatch(estimationId, specialBatch);
            importedCount += specialBatch.length;
          } catch (e) {
            console.error("Failed to import special batch", e);
            apiErrorCount += specialBatch.length;
          }
          specialBatch = [];
        }
        continue;
      }

      const lengthRes = parseDimensionInput(lengthCell);
      const widthRes = parseDimensionInput(widthCell);
      const thicknessRes = parseDimensionInput(thicknessCell);
      const noUnitsRes = parseDimensionInput(noUnitsCell);

      const payload = {
        item_id: item.item_id,
        sub_description: String(subDescCell || ""),
        no_of_units: noUnitsRes.value ?? 1,
        no_of_units_expr: noUnitsRes.expr,
        length: lengthRes.value,
        width: widthRes.value,
        thickness: thicknessRes.value,
        length_expr: lengthRes.expr,
        width_expr: widthRes.expr,
        thickness_expr: thicknessRes.expr,
        quantity: parseNum(quantityCell),
      };

      batch.push(payload);

      if (batch.length >= BATCH_SIZE) {
        try {
          await createEstimationLinesBatch(estimationId, batch);
          importedCount += batch.length;
        } catch (e) {
          console.error("Failed to import batch", e);
          apiErrorCount += batch.length;
        }
        batch = [];
      }

      processedRows++;
      setImportProgress(Math.round((processedRows / totalRows) * 100));
    }

    // Process remaining batch
    if (batch.length > 0) {
      try {
        await createEstimationLinesBatch(estimationId, batch);
        importedCount += batch.length;
      } catch (e) {
        console.error("Failed to import final batch", e);
        apiErrorCount += batch.length;
      }
    }

    // Process remaining special batch
    if (specialBatch.length > 0) {
      try {
        await createSpecialItemRequestsBatch(estimationId, specialBatch);
        importedCount += specialBatch.length;
      } catch (e) {
        console.error("Failed to import final special batch", e);
        apiErrorCount += specialBatch.length;
      }
    }

    await fetchLines();
    // Rows with no matching item are filed as special item requests, which
    // live on the Special Items page -- let the caller refresh its view of them.
    await onSpecialItemsChanged?.();
    setIsImporting(false);
    // Prepare banner and inline message
    if (importedCount === 0) {
      const codeList = notFoundCodes.size
        ? ` Not found codes: ${[...notFoundCodes].slice(0, 10).join(", ")}${notFoundCodes.size > 10 ? "..." : ""}`
        : "";
      const reason = missingItemCount
        ? `No matching items found for ${missingItemCount} row(s).${codeList}`
        : "Import encountered errors";
      setImportError(`Could not import any rows. ${reason}`);
      setImportBanner({
        type: "error",
        message: `Import failed: ${reason} Check region selection and item codes/descriptions.`,
      });
    } else {
      const codeList = notFoundCodes.size
        ? ` Not found: ${[...notFoundCodes].slice(0, 10).join(", ")}${notFoundCodes.size > 10 ? "..." : ""}`
        : "";
      const details = skippedCount
        ? `Imported ${importedCount}, skipped ${skippedCount} (missing items: ${missingItemCount}${apiErrorCount ? `, API errors: ${apiErrorCount}` : ""}).${codeList}`
        : `Imported ${importedCount} row(s).`;
      setImportBanner({
        type: skippedCount ? "warning" : "success",
        message: details,
      });
      setIsImportModalOpen(false);
      setImportFile(null);
      setImportError("");
      setImportProgress(0);
    }
  } catch (err) {
    console.error("Import failed:", err);
    const msg =
      err?.response?.data?.detail ||
      "Import failed. Please check the file format and try again.";
    setImportError(msg);
    setIsImporting(false);
    setImportBanner({ type: "error", message: msg });
  }
}
