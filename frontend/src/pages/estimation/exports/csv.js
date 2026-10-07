import * as XLSX from "xlsx";
import {
  groupByElementThenDivision,
  elementSectionTitle,
  flattenForExport,
} from "./grouping";

export function downloadCsv({
  estimationId,
  standardRootLines,
  approvedSpecialRootLines,
  elements = [],
  includeChildren = true,
}) {
  const grandTotal =
    standardRootLines.reduce((sum, line) => sum + (line.amount || 0), 0) +
    approvedSpecialRootLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  standardRootLines.reduce((sum, line) => sum + (line.amount || 0), 0) +
    approvedSpecialRootLines.reduce((sum, line) => sum + (line.amount || 0), 0);

  const hasElements = elements.length > 0;

  let aoa = [
    hasElements
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
        ],
  ];

  const subtotalRow = (label, amount) =>
    hasElements
      ? ["", "", "", "", "", "", "", "", "", "", label, amount]
      : ["", "", "", "", "", "", "", "", "", label, amount];

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
    if (sectionTitle) aoa.push([sectionTitle.toUpperCase()]);

    groupByElementThenDivision(lines, elements).forEach((section) => {
      if (hasElements) {
        aoa.push([`Element: ${elementSectionTitle(section.element)}`]);
      }
      let elementSubtotal = 0;

      Object.entries(section.divisions).forEach(
        ([divisionName, divisionLines]) => {
          // Division heading
          aoa.push([divisionName]);

          // Line items
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
          });

          // Subtotal row
          const divisionSubtotal = divisionLines.reduce(
            (sum, line) =>
              sum + (line.parent_line_id == null ? line.amount || 0 : 0),
            0,
          );
          elementSubtotal += divisionSubtotal;
          aoa.push(subtotalRow("Subtotal", divisionSubtotal));

          // Blank spacer
          aoa.push([]);
        },
      );

      if (hasElements) {
        aoa.push(subtotalRow("Element Subtotal", elementSubtotal));
        aoa.push([]);
      }
    });
  };

  addSectionToAoa(standardLines, "Item Master");
  addSectionToAoa(specialLines, "Special Items (Approved)");

  // Grand total
  aoa.push(subtotalRow("Grand Total", grandTotal));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const csv = XLSX.utils.sheet_to_csv(ws);

  const blob = new Blob(["﻿", csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `estimation_${estimationId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
