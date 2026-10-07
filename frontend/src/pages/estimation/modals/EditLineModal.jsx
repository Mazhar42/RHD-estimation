import React, { useEffect, useState } from "react";
import {
  getInitialDimensionValue,
  parseDimensionInput,
} from "../../../utils/dimensions";
import { elementLabel } from "../../../utils/elementLabel";
import { unitAdornment } from "../../../utils/unitInputs";
import InputWithUnit from "../../../components/ui/InputWithUnit";

export default function EditLineModal({ line, elements = [], onClose, onSave }) {
  const isRoot = line.parent_line_id == null;
  const unit = line.item?.unit;
  const [editForm, setEditForm] = useState({
    sub_description: line.sub_description || "",
    no_of_units: getInitialDimensionValue(
      line.no_of_units_expr,
      line.no_of_units,
    ),
    length: getInitialDimensionValue(line.length_expr, line.length),
    width: getInitialDimensionValue(line.width_expr, line.width),
    thickness: getInitialDimensionValue(line.thickness_expr, line.thickness),
    quantity: line.quantity || "",
  });
  const [elementId, setElementId] = useState(
    line.element_id != null ? String(line.element_id) : "",
  );
  const [submitError, setSubmitError] = useState("");
  const currentElement = elements.find(
    (el) => el.element_id === line.element_id,
  );
  const sortedElements = [...elements].sort(
    (a, b) =>
      (a.sort_order || 0) - (b.sort_order || 0) || a.element_id - b.element_id,
  );

  const handleChange = (e) =>
    setEditForm({ ...editForm, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    const noUnitsResult = parseDimensionInput(editForm.no_of_units);
    const lengthResult = parseDimensionInput(editForm.length);
    const widthResult = parseDimensionInput(editForm.width);
    const thicknessResult = parseDimensionInput(editForm.thickness);
    const dimensionError =
      noUnitsResult.error ||
      lengthResult.error ||
      widthResult.error ||
      thicknessResult.error;
    if (dimensionError) {
      setSubmitError(dimensionError);
      return;
    }
    setSubmitError("");
    const payload = {
      item_id: line.item_id, // item_id is not editable
      sub_description: editForm.sub_description || null,
      no_of_units: noUnitsResult.value ?? 1,
      no_of_units_expr: noUnitsResult.expr,
      length: lengthResult.value,
      width: widthResult.value,
      thickness: thicknessResult.value,
      length_expr: lengthResult.expr,
      width_expr: widthResult.expr,
      thickness_expr: thicknessResult.expr,
      quantity: editForm.quantity ? parseFloat(editForm.quantity) : null,
    };
    // Only a root line's element is settable; a child always follows its
    // parent's, so sending it here for a child would be a no-op at best.
    if (isRoot) {
      payload.element_id = elementId === "" ? null : parseInt(elementId, 10);
    }
    onSave(payload);
  };

  // Key handling: Esc closes, Enter submits form
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        const formEl = document.getElementById("edit-line-form");
        if (formEl) {
          e.preventDefault();
          if (formEl.requestSubmit) formEl.requestSubmit();
          else formEl.submit();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto z-50 relative border border-gray-200">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>
        </button>
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-gray-900">
          Edit Line
        </h3>
        <p className="mb-2 text-xs text-gray-600">
          Item: {line.item.item_code} — {line.item.item_description}
        </p>
        <p className="mb-3 text-xs text-gray-600">Rate: {line.rate} (fixed)</p>
        {submitError && (
          <div className="mb-2 text-xs text-red-600">{submitError}</div>
        )}
        <form
          id="edit-line-form"
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 mt-2"
        >
          <input
            name="sub_description"
            value={editForm.sub_description}
            onChange={handleChange}
            placeholder="Sub description"
            className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
          />
          {elements.length > 0 && (
            <label className="space-y-1 text-xs text-gray-700">
              <span className="font-medium">Element</span>
              {isRoot ? (
                <select
                  value={elementId}
                  onChange={(e) => setElementId(e.target.value)}
                  className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
                >
                  <option value="">— Unassigned —</option>
                  {sortedElements.map((el) => (
                    <option key={el.element_id} value={el.element_id}>
                      {elementLabel(el)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="border border-gray-200 bg-gray-50 text-gray-500 p-3 rounded-lg w-full text-xs">
                  {currentElement
                    ? `Inherited from parent: ${elementLabel(currentElement)}`
                    : "Inherited from parent (unassigned)"}
                </div>
              )}
            </label>
          )}
          <InputWithUnit
            unit={unitAdornment(unit, "no_of_units")}
            name="no_of_units"
            value={editForm.no_of_units}
            onChange={handleChange}
            placeholder="No. of units"
            className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
          />
          <InputWithUnit
            unit={unitAdornment(unit, "quantity")}
            name="quantity"
            value={editForm.quantity}
            onChange={handleChange}
            placeholder="Quantity (direct)"
            className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
          />
          <InputWithUnit
            unit={unitAdornment(unit, "length")}
            name="length"
            value={editForm.length}
            onChange={handleChange}
            placeholder="Length"
            className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
          />
          <InputWithUnit
            unit={unitAdornment(unit, "width")}
            name="width"
            value={editForm.width}
            onChange={handleChange}
            placeholder="Width"
            className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
          />
          <InputWithUnit
            unit={unitAdornment(unit, "thickness")}
            name="thickness"
            value={editForm.thickness}
            onChange={handleChange}
            placeholder="Thickness"
            className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
          />
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 font-semibold py-1 px-3 rounded shadow-sm text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-teal-700 hover:bg-teal-900 text-white font-medium py-1 px-3 rounded inline-flex items-center gap-1 text-xs"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
