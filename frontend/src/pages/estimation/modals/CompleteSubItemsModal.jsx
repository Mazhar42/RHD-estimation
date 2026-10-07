import React, { useEffect, useMemo, useState } from "react";
import { updateEstimationLine } from "../../../api/estimations";
import {
  getInitialDimensionValue,
  parseDimensionInput,
} from "../../../utils/dimensions";
import {
  allowedInputsForUnit,
  supportsDualMode,
  unitAdornment,
} from "../../../utils/unitInputs";
import { elementLabel } from "../../../utils/elementLabel";
import InputWithUnit from "../../../components/ui/InputWithUnit";

const FIELD_LABELS = {
  no_of_units: "No. of units",
  quantity: "Quantity",
  length: "Length",
  width: "Width",
  thickness: "Thickness",
};

const buildFormFromLine = (line) => ({
  sub_description: line?.sub_description || "",
  no_of_units: getInitialDimensionValue(
    line?.no_of_units_expr,
    line?.no_of_units ?? 1,
  ),
  length: getInitialDimensionValue(line?.length_expr, line?.length),
  width: getInitialDimensionValue(line?.width_expr, line?.width),
  thickness: getInitialDimensionValue(line?.thickness_expr, line?.thickness),
  quantity: line?.quantity ?? "",
});

// Walks the estimator through every sub-item Make Sub-Items just created, one
// at a time, so a batch of freshly split A1/P1.../chainage rows never gets
// left at their placeholder "1 unit" quantity by accident. There is no close
// button on purpose -- every sub-item must be saved before this can finish.
export default function CompleteSubItemsModal({
  parentLine,
  subLines,
  elements = [],
  onFinish,
}) {
  const [index, setIndex] = useState(0);
  const [savedLines, setSavedLines] = useState(subLines);
  const [unitMode, setUnitMode] = useState("default");
  const [form, setForm] = useState(() => buildFormFromLine(subLines[0]));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = savedLines.length;
  const currentLine = savedLines[index];
  const unit = parentLine?.item?.unit;
  const allowed = allowedInputsForUnit(unit, unitMode);
  const dualMode = supportsDualMode(unit);

  useEffect(() => {
    setForm(buildFormFromLine(savedLines[index]));
    setUnitMode("default");
    setError("");
  }, [index]);

  const elementById = useMemo(() => {
    const map = new Map();
    elements.forEach((el) => map.set(el.element_id, el));
    return map;
  }, [elements]);

  const currentElement =
    currentLine?.element_id != null
      ? elementById.get(currentLine.element_id)
      : null;

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const buildPayload = () => {
    const noUnitsResult = parseDimensionInput(form.no_of_units);
    const lengthResult = allowed.includes("length")
      ? parseDimensionInput(form.length)
      : { value: null, expr: null, error: null };
    const widthResult = allowed.includes("width")
      ? parseDimensionInput(form.width)
      : { value: null, expr: null, error: null };
    const thicknessResult = allowed.includes("thickness")
      ? parseDimensionInput(form.thickness)
      : { value: null, expr: null, error: null };
    const dimensionError =
      noUnitsResult.error ||
      lengthResult.error ||
      widthResult.error ||
      thicknessResult.error;
    if (dimensionError) return { error: dimensionError };

    return {
      payload: {
        item_id: currentLine.item_id,
        sub_description: form.sub_description || null,
        no_of_units: noUnitsResult.value ?? 1,
        no_of_units_expr: noUnitsResult.expr,
        length: lengthResult.value,
        width: widthResult.value,
        thickness: thicknessResult.value,
        length_expr: lengthResult.expr,
        width_expr: widthResult.expr,
        thickness_expr: thicknessResult.expr,
        quantity: allowed.includes("quantity")
          ? form.quantity
            ? parseFloat(form.quantity)
            : null
          : null,
      },
    };
  };

  const saveLineAndProceed = async (payload, exitAfter = false) => {
    setIsSubmitting(true);
    setError("");
    try {
      if (payload) {
        const updated = await updateEstimationLine(
          currentLine.line_id,
          payload,
        );
        const nextSaved = savedLines.map((l, i) => (i === index ? updated : l));
        setSavedLines(nextSaved);
      }
      if (exitAfter || index === total - 1) {
        onFinish();
      } else {
        setIndex((i) => i + 1);
      }
    } catch (err) {
      setError(
        err?.response?.data?.detail?.detail ||
          err?.response?.data?.detail ||
          err.message ||
          "Failed to save.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = async (e) => {
    e.preventDefault();
    const { payload, error: validationError } = buildPayload();
    if (validationError) {
      setError(validationError);
      return;
    }
    await saveLineAndProceed(payload, false);
  };

  const handleSaveAndExit = async () => {
    const { payload, error: validationError } = buildPayload();
    if (validationError) {
      setError(validationError);
      return;
    }
    await saveLineAndProceed(payload, true);
  };

  const handleSkip = async () => {
    // If skipping, we just proceed without saving anything
    await saveLineAndProceed(null, false);
  };

  const fieldClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

  if (!currentLine) return null;

  return (
    <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto z-50 relative border border-gray-200">
        <button
          onClick={onFinish}
          className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="flex items-center justify-between gap-3 pr-8">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
            Enter part numbers
          </h3>
          <span className="shrink-0 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold px-3 py-1">
            {index + 1} of {total}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          <span className="font-semibold text-gray-800">
            {parentLine?.item?.item_code}
          </span>{" "}
          was split into {total} part{total === 1 ? "" : "s"}. You can enter
          numbers now or skip and fill them in later from the estimation sheet.
        </p>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-gray-500">Part</span>
          <span className="text-sm font-semibold text-gray-900">
            {currentLine.label ||
              (currentElement ? elementLabel(currentElement) : "—")}
          </span>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleNext} className="mt-4 space-y-3">
          <input
            name="sub_description"
            value={form.sub_description}
            onChange={handleChange}
            placeholder="Sub description (optional)"
            className={fieldClass}
          />

          {dualMode && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">Calculation:</span>
              <div className="inline-flex rounded overflow-hidden border border-gray-300">
                <button
                  type="button"
                  className={`px-2 py-1 ${unitMode === "default" ? "bg-teal-600 text-white" : "bg-white text-gray-700"}`}
                  onClick={() => setUnitMode("default")}
                >
                  Dimensions
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 ${unitMode === "quantity" ? "bg-teal-600 text-white" : "bg-white text-gray-700"}`}
                  onClick={() => setUnitMode("quantity")}
                >
                  Quantity
                </button>
              </div>
            </div>
          )}

          {allowed.includes("no_of_units") && (
            <label className="block space-y-1 text-sm text-gray-700">
              <span className="font-medium">No. of units</span>
              <InputWithUnit
                unit={unitAdornment(unit, "no_of_units")}
                name="no_of_units"
                value={form.no_of_units}
                onChange={handleChange}
                className={fieldClass}
              />
            </label>
          )}
          {allowed.includes("quantity") && (
            <label className="block space-y-1 text-sm text-gray-700">
              <span className="font-medium">Quantity</span>
              <InputWithUnit
                unit={unitAdornment(unit, "quantity")}
                name="quantity"
                value={form.quantity}
                onChange={handleChange}
                className={fieldClass}
              />
            </label>
          )}
          {allowed.includes("length") && (
            <label className="block space-y-1 text-sm text-gray-700">
              <span className="font-medium">Length</span>
              <InputWithUnit
                unit={unitAdornment(unit, "length")}
                name="length"
                value={form.length}
                onChange={handleChange}
                className={fieldClass}
              />
            </label>
          )}
          {allowed.includes("width") && (
            <label className="block space-y-1 text-sm text-gray-700">
              <span className="font-medium">Width</span>
              <InputWithUnit
                unit={unitAdornment(unit, "width")}
                name="width"
                value={form.width}
                onChange={handleChange}
                className={fieldClass}
              />
            </label>
          )}
          {allowed.includes("thickness") && (
            <label className="block space-y-1 text-sm text-gray-700">
              <span className="font-medium">Thickness</span>
              <InputWithUnit
                unit={unitAdornment(unit, "thickness")}
                name="thickness"
                value={form.thickness}
                onChange={handleChange}
                className={fieldClass}
              />
            </label>
          )}

          <div className="flex justify-between gap-2 pt-2 border-t border-gray-100 flex-wrap">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0 || isSubmitting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40"
              >
                Skip
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveAndExit}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60"
              >
                Save & Exit
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {isSubmitting
                  ? "Saving…"
                  : index === total - 1
                    ? "Save & Finish"
                    : "Save & Next"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
