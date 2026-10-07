import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ensurePdfFont, resolvePdfFontFamily } from "../../../utils/pdfFonts";
import {
  groupByElementThenDivision,
  elementSectionTitle,
  flattenForExport,
} from "./grouping";

export async function downloadPdf({
  estimationId,
  estimationName,
  region,
  settings,
  standardRootLines,
  approvedSpecialRootLines,
  elements = [],
  includeChildren = true,
}) {
  const standardLines = flattenForExport(standardRootLines, {
    includeChildren,
    elements,
  });
  const specialLines = flattenForExport(approvedSpecialRootLines, {
    includeChildren,
    elements,
  });

  const hasElements = elements.length > 0;
  const title =
    estimationName ||
    localStorage.getItem(`estimationName:${estimationId}`) ||
    `Estimation #${estimationId}`;
  const doc = new jsPDF("landscape", "pt", "a4");
  const bodyFontSize = Math.max(6, Number(settings?.print_font_size || 9));
  const headingFontSize = bodyFontSize + 2;
  const titleFontSize = bodyFontSize + 7;
  const metaFontSize = Math.max(8, bodyFontSize);
  const footerFontSize = Math.max(8, bodyFontSize - 1);
  const sectionGap = Math.ceil(bodyFontSize * 3.2);
  const divisionGap = Math.ceil(bodyFontSize * 1.7);
  const sectionTotalGap = Math.ceil(bodyFontSize * 4);
  const grandTotalBoxHeight = Math.ceil(bodyFontSize * 5.4);
  const pdfFontFamily = await ensurePdfFont(
    doc,
    resolvePdfFontFamily(settings?.print_font_family),
  );

  // Only approved special items are part of the estimation -- ones still
  // awaiting review live on the Special Items page and are not exported.
  const grandTotal =
    standardRootLines.reduce((sum, line) => sum + (line.amount || 0), 0) +
    approvedSpecialRootLines.reduce((sum, line) => sum + (line.amount || 0), 0);

  const pageMargin = { top: 80, right: 20, bottom: 40, left: 20 };

  const drawHeaderFooter = () => {
    // Header
    doc.setFillColor(31, 41, 55); // Dark gray bg
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 60, "F");

    doc.setFontSize(titleFontSize);
    doc.setTextColor(255, 255, 255);
    doc.setFont(pdfFontFamily, "bold");
    doc.text(title, pageMargin.left, 35);

    doc.setFontSize(metaFontSize);
    doc.setFont(pdfFontFamily, "normal");
    doc.text(`Region: ${region || "No Region"}`, pageMargin.left, 50);
    doc.text(
      `Date: ${new Date().toLocaleDateString()}`,
      doc.internal.pageSize.getWidth() - pageMargin.right - 100,
      35,
    );

    // Footer with page numbers
    doc.setTextColor(100, 100, 100);
    const str = `Page ${doc.getNumberOfPages()}`;
    doc.setFontSize(footerFontSize);
    doc.text(
      str,
      doc.internal.pageSize.getWidth() -
        pageMargin.right -
        doc.getTextWidth(str),
      doc.internal.pageSize.getHeight() - 20,
    );
  };

  // Draw header on the first page immediately
  drawHeaderFooter();

  const pageHeight = doc.internal.pageSize.getHeight();
  const usableBottom = pageHeight - pageMargin.bottom;

  // Calculate totals for sections
  const standardTotal = standardRootLines.reduce(
    (sum, line) => sum + (line.amount || 0),
    0,
  );
  const specialTotal = approvedSpecialRootLines.reduce(
    (sum, line) => sum + (line.amount || 0),
    0,
  );

  // Flow divisions one after another; add a page only if needed
  let currentY = pageMargin.top + sectionGap;

  const addGroupsToPdf = (lines, sectionTitle, sectionTotal) => {
    if (lines.length === 0) return;

    // Section Title
    if (sectionTitle) {
      if (currentY > usableBottom - 50) {
        doc.addPage();
        drawHeaderFooter();
        currentY = pageMargin.top + sectionGap;
      }
      doc.setFillColor(240, 240, 240);
      doc.rect(
        pageMargin.left,
        currentY - 15,
        doc.internal.pageSize.getWidth() - pageMargin.left - pageMargin.right,
        25,
        "F",
      );
      doc.setFontSize(headingFontSize);
      doc.setTextColor(0, 0, 0);
      doc.setFont(pdfFontFamily, "bold");
      doc.text(sectionTitle.toUpperCase(), pageMargin.left + 5, currentY);
      doc.setFont(pdfFontFamily, "normal");
      currentY += sectionGap;
    }

    groupByElementThenDivision(lines, elements).forEach((section) => {
      if (hasElements) {
        if (currentY > usableBottom - 50) {
          doc.addPage();
          drawHeaderFooter();
          currentY = pageMargin.top + sectionGap;
        }
        doc.setFontSize(headingFontSize);
        doc.setTextColor(30, 30, 30);
        doc.setFont(pdfFontFamily, "bold");
        doc.text(
          `Element: ${elementSectionTitle(section.element)}`,
          pageMargin.left,
          currentY,
        );
        doc.setFont(pdfFontFamily, "normal");
        currentY += sectionGap;
      }
      let elementSubtotal = 0;

      Object.entries(section.divisions).forEach(
        ([divisionName, divisionLines]) => {
          // If not enough space for a heading and at least one row, add a page
          if (currentY > usableBottom - 50) {
            doc.addPage();
            drawHeaderFooter();
            currentY = pageMargin.top + sectionGap;
          }

          // Division heading
          doc.setFontSize(metaFontSize);
          doc.setTextColor(50, 50, 50);
          doc.setFont(pdfFontFamily, "bold");
          doc.text(`Division: ${divisionName}`, pageMargin.left, currentY);
          doc.setFont(pdfFontFamily, "normal");
          currentY += divisionGap;

          const body = divisionLines.map((l) => [
            l.item?.item_code || "",
            l.item?.item_description || "",
            l.sub_description || "",
            l.no_of_units ?? "",
            l.length ?? "",
            l.width ?? "",
            l.thickness ?? "",
            l.calculated_qty ?? l.quantity ?? "",
            l.rate ?? "",
            l.item?.unit || "",
            l.amount
              ? l.amount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "",
          ]);
          const divisionSubtotal = divisionLines.reduce(
            (sum, line) =>
              sum + (line.parent_line_id == null ? line.amount || 0 : 0),
            0,
          );
          elementSubtotal += divisionSubtotal;

          autoTable(doc, {
            startY: currentY,
            margin: pageMargin,
            head: [
              [
                "Item Code",
                "Description",
                "Sub Desc",
                "No.",
                "Length",
                "Width",
                "Thickness",
                "Qty",
                "Rate",
                "Unit",
                "Amount",
              ],
            ],
            body,
            foot: [
              [
                "Subtotal",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                divisionSubtotal.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
              ],
            ],
            styles: {
              font: pdfFontFamily,
              fontSize: Math.max(7, bodyFontSize - 1),
              cellPadding: 3,
              overflow: "linebreak",
              lineColor: [220, 220, 220],
              lineWidth: 0.1,
            },
            headStyles: {
              fillColor: [55, 65, 81],
              textColor: 255,
              fontStyle: "bold",
            },
            footStyles: {
              fillColor: [243, 244, 246],
              textColor: [17, 24, 39],
              fontStyle: "bold",
              halign: "right",
            },
            columnStyles: {
              0: { cellWidth: 50 },
              1: { cellWidth: 140 },
              2: { cellWidth: 100 },
              3: { cellWidth: 30, halign: "right" },
              4: { cellWidth: 40, halign: "right" },
              5: { cellWidth: 40, halign: "right" },
              6: { cellWidth: 40, halign: "right" },
              7: { cellWidth: 40, halign: "right" },
              8: { cellWidth: 40, halign: "right" },
              9: { cellWidth: 30, halign: "center" },
              10: { cellWidth: 60, halign: "right" },
            },
            didDrawPage: (data) => {
              // Header is drawn initially and on manual page breaks.
              // autoTable also triggers this. We can ensure we don't overdraw or just let it be.
              // To be safe against missing headers on auto-generated page breaks:
              if (data.pageNumber > 1 && data.pageCount === 1) {
                drawHeaderFooter();
              }
            },
          });

          // Update currentY to position next table below the finished one
          currentY =
            (doc.lastAutoTable?.finalY || pageMargin.top) +
            Math.ceil(bodyFontSize * 2.8);
        },
      );

      if (hasElements) {
        if (currentY > usableBottom - 30) {
          doc.addPage();
          drawHeaderFooter();
          currentY = pageMargin.top + sectionGap;
        }
        doc.setFontSize(metaFontSize + 1);
        doc.setFont(pdfFontFamily, "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(
          `Element Subtotal (${elementSectionTitle(section.element)}): ${elementSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          pageMargin.left,
          currentY,
        );
        doc.setFont(pdfFontFamily, "normal");
        currentY += Math.ceil(bodyFontSize * 2.2);
      }
    });

    // Section Total
    if (currentY > usableBottom - 30) {
      doc.addPage();
      drawHeaderFooter();
      currentY = pageMargin.top + sectionTotalGap;
    }
    doc.setFillColor(229, 231, 235); // Gray-200
    doc.rect(
      doc.internal.pageSize.getWidth() - pageMargin.right - 250,
      currentY - 10,
      250,
      25,
      "F",
    );
    doc.setFontSize(metaFontSize + 1);
    doc.setFont(pdfFontFamily, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(
      `Grand Total (${sectionTitle}): ${sectionTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      doc.internal.pageSize.getWidth() - pageMargin.right - 10,
      currentY + 7,
      { align: "right" },
    );
    currentY += sectionTotalGap;
  };

  addGroupsToPdf(standardLines, "Item Master", standardTotal);
  addGroupsToPdf(specialLines, "Special Items (Approved)", specialTotal);

  // Grand Total All Items
  if (currentY > usableBottom - 50) {
    doc.addPage();
    drawHeaderFooter();
    currentY = pageMargin.top + Math.ceil(bodyFontSize * 5.5);
  }

  // Big Grand Total Box
  currentY += 20;
  doc.setDrawColor(16, 185, 129); // Emerald-500
  doc.setLineWidth(2);
  doc.rect(
    pageMargin.left,
    currentY,
    doc.internal.pageSize.getWidth() - pageMargin.left - pageMargin.right,
    grandTotalBoxHeight,
  );

  doc.setFontSize(18);
  doc.setFontSize(titleFontSize);
  doc.setFont(undefined, "bold");
  doc.setFont(pdfFontFamily, "bold");
  doc.text(
    "GRAND TOTAL (ALL ITEMS)",
    pageMargin.left + 20,
    currentY + Math.ceil(grandTotalBoxHeight * 0.64),
  );
  doc.setTextColor(0, 0, 0);
  doc.text(
    grandTotal.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    doc.internal.pageSize.getWidth() - pageMargin.right - 20,
    currentY + Math.ceil(grandTotalBoxHeight * 0.64),
    { align: "right" },
  );

  doc.save(`estimation_${estimationId}.pdf`);
}
