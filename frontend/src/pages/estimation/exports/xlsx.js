import * as XLSX from "xlsx";
import {
  groupByElementThenDivision,
  elementSectionTitle,
  flattenForExport,
} from "./grouping";

export function downloadXlsx({
  estimationId,
  standardRootLines,
  approvedSpecialRootLines,
  elements = [],
  includeChildren = true,
}) {
  const wb = XLSX.utils.book_new();
  // Only approved special items are part of the estimation -- ones still
  // awaiting review live on the Special Items page and are not exported.
  const grandTotal =
    standardRootLines.reduce((sum, line) => sum + (line.amount || 0), 0) +
    approvedSpecialRootLines.reduce((sum, line) => sum + (line.amount || 0), 0);

  const hasElements = elements.length > 0;
  const HEADERS = hasElements
    ? [
        "Element",
        "Item Code",
        "Description",
        "Sub Desc",
        "No.",
        "Length",
        "Width",
        "Thickness",
        "Quantity",
        "Rate",
        "Unit",
        "Amount",
      ]
    : [
        "Item Code",
        "Description",
        "Sub Desc",
        "No.",
        "Length",
        "Width",
        "Thickness",
        "Quantity",
        "Rate",
        "Unit",
        "Amount",
      ];
  const LAST_COL = HEADERS.length - 1;
  const LABEL_COL = LAST_COL - 1;

  let aoa = [HEADERS];
  const merges = [];
  let currentRow = 0;
  const boldStyle = { font: { bold: true } };
  currentRow++; // For header row

  const subtotalRow = (label, amount) => {
    const row = new Array(LAST_COL + 1).fill("");
    row[LABEL_COL] = label;
    row[LAST_COL] = amount;
    return row;
  };

  // flattenForExport was imported but never applied here, so sub-items never
  // reached the sheet -- only the root aggregate rows did.
  const standardLines = flattenForExport(standardRootLines, {
    includeChildren,
    elements,
  });
  const specialLines = flattenForExport(approvedSpecialRootLines, {
    includeChildren,
    elements,
  });

  const addSectionToAoa = (lines, sectionTitle) => {
    if (lines.length === 0) return;

    // Section Header
    if (sectionTitle) {
      aoa.push([sectionTitle.toUpperCase()]);
      merges.push({
        s: { r: currentRow, c: 0 },
        e: { r: currentRow, c: LAST_COL },
      });
      currentRow++;
    }

    groupByElementThenDivision(lines, elements).forEach((section) => {
      if (hasElements) {
        aoa.push([`Element: ${elementSectionTitle(section.element)}`]);
        merges.push({
          s: { r: currentRow, c: 0 },
          e: { r: currentRow, c: LAST_COL },
        });
        currentRow++;
      }
      let elementSubtotal = 0;

      Object.entries(section.divisions).forEach(
        ([divisionName, divisionLines]) => {
          // Division name row
          aoa.push([divisionName]);
          merges.push({
            s: { r: currentRow, c: 0 },
            e: { r: currentRow, c: LAST_COL },
          });
          currentRow++;

          // Add line items
          divisionLines.forEach((l) => {
            const row = [
              l.item?.item_code,
              l.item?.item_description,
              l.sub_description,
              l.no_of_units,
              l.length,
              l.width,
              l.thickness,
              l.calculated_qty ?? l.quantity,
              l.rate,
              l.item?.unit,
              l.amount,
            ];
            aoa.push(hasElements ? [section.element?.code || "", ...row] : row);
            currentRow++;
          });

          // Add subtotal row
          const divisionSubtotal = divisionLines.reduce(
            (sum, line) =>
              sum + (line.parent_line_id == null ? line.amount || 0 : 0),
            0,
          );
          elementSubtotal += divisionSubtotal;
          aoa.push(subtotalRow("Subtotal", divisionSubtotal));
          currentRow++;

          // Add blank row
          aoa.push([]);
          currentRow++;
        },
      );

      if (hasElements) {
        aoa.push(subtotalRow("Element Subtotal", elementSubtotal));
        currentRow++;
        aoa.push([]);
        currentRow++;
      }
    });
  };

  addSectionToAoa(standardLines, "Item Master");
  addSectionToAoa(specialLines, "Special Items (Approved)");

  // Add grand total row
  aoa.push(subtotalRow("Grand Total", grandTotal));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;

  // Apply styles by iterating through the worksheet
  // Bold main headers
  for (let C = 0; C <= LAST_COL; ++C) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[cellAddress]) ws[cellAddress].s = boldStyle;
  }

  // Apply styles to section headers, division headers, and subtotals
  aoa.forEach((row, r) => {
    if (!row || r === 0) return;
    // Section, element or division header (merged row with single string)
    if (row.length === 1 && typeof row[0] === "string") {
      const addr = XLSX.utils.encode_cell({ r, c: 0 });
      if (ws[addr])
        ws[addr].s = { ...boldStyle, alignment: { horizontal: "center" } };
    }
    // Subtotal, Element Subtotal, or Grand Total
    if (
      row[LABEL_COL] === "Subtotal" ||
      row[LABEL_COL] === "Element Subtotal" ||
      row[LABEL_COL] === "Grand Total"
    ) {
      const addr = XLSX.utils.encode_cell({ r, c: LAST_COL });
      if (ws[addr]) ws[addr].s = boldStyle;
    }
  });

  XLSX.utils.book_append_sheet(wb, ws, "Estimation");
  XLSX.writeFile(wb, `estimation_${estimationId}.xlsx`);
}
