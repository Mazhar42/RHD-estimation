import { useCallback, useRef, useState } from "react";
import { updateEstimationLine } from "../../../api/estimations";
import { parseDimensionInput } from "../../../utils/dimensions";

export const DIMENSION_FIELDS = ["length", "width", "thickness", "no_of_units"];
const ITEM_FIELDS = ["item_id", "item_code", "description"];

function payloadFor(line) {
  return {
    item_id: line.item_id,
    sub_description: line.sub_description,
    no_of_units: line.no_of_units,
    length: line.length,
    width: line.width,
    thickness: line.thickness,
    length_expr: line.length_expr,
    width_expr: line.width_expr,
    thickness_expr: line.thickness_expr,
    quantity: line.quantity,
  };
}

// Returns { changes } to send, { error } to show, or null if nothing changed.
export function inlineChange(line, field, raw) {
  if (ITEM_FIELDS.includes(field)) {
    const id = parseInt(raw, 10);
    return id !== line.item_id ? { changes: { item_id: id } } : null;
  }
  if (field === "sub_description") {
    return raw !== (line.sub_description ?? "") ? { changes: { sub_description: raw } } : null;
  }
  if (DIMENSION_FIELDS.includes(field)) {
    const res = parseDimensionInput(raw);
    if (res.error) return { error: res.error };
    const exprKey = `${field}_expr`;
    const changed = res.value !== line[field] || (res.expr || null) !== (line[exprKey] || null);
    return changed ? { changes: { [field]: res.value, [exprKey]: res.expr } } : null;
  }
  if (field === "quantity") {
    const qty = parseFloat(raw);
    const next = Number.isNaN(qty) ? null : qty;
    return next !== line.quantity ? { changes: { quantity: next } } : null;
  }
  return null;
}

function initialValue(line, field) {
  if (DIMENSION_FIELDS.includes(field)) return line[`${field}_expr`] || (line[field] ?? "");
  if (ITEM_FIELDS.includes(field)) return line.item_id;
  return line[field] ?? "";
}

// One cell at a time; saves on Enter or blur, Escape cancels.
export function useInlineEdit({ lines, onSaved, onError }) {
  const [cell, setCell] = useState(null); // { lineId, field }
  const [value, setValue] = useState("");
  const savingRef = useRef(false);

  const cancel = useCallback(() => {
    setCell(null);
    setValue("");
  }, []);

  const start = useCallback((line, field) => {
    setCell({ lineId: line.line_id, field });
    setValue(initialValue(line, field));
  }, []);

  const save = useCallback(async () => {
    if (!cell || savingRef.current) return;
    const line = lines.find((l) => l.line_id === cell.lineId);
    if (!line) return cancel();
    const result = inlineChange(line, cell.field, value);
    if (!result) return cancel();
    if (result.error) {
      onError(result.error);
      return;
    }
    savingRef.current = true;
    try {
      const updated = await updateEstimationLine(line.line_id, { ...payloadFor(line), ...result.changes });
      cancel();
      await onSaved(updated);
    } catch (e) {
      onError(`Couldn't save: ${e?.response?.data?.detail || e.message}`);
    } finally {
      savingRef.current = false;
    }
  }, [cell, value, lines, cancel, onSaved, onError]);

  const onBlur = useCallback(
    (e) => {
      const next = e?.relatedTarget;
      if (next && (next === e.currentTarget || e.currentTarget?.contains?.(next))) return;
      save();
    },
    [save],
  );

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel],
  );

  const isEditing = (lineId, field) => cell?.lineId === lineId && cell?.field === field;

  return { cell, value, setValue, start, save, cancel, onBlur, onKeyDown, isEditing };
}
