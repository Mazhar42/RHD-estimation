import React, { useEffect, useRef, useState } from "react";
import { listDivisions } from "../../../api/items";
import { listOrganizations, listRegions } from "../../../api/orgs";
import {
  createSpecialItemRequest,
  updateSpecialItemRequest,
} from "../../../api/estimations";
import { uploadAttachment } from "../../../api/attachments";
import {
  parseDimensionInput,
  getInitialDimensionValue,
} from "../../../utils/dimensions";
import { elementLabel } from "../../../utils/elementLabel";

// Allowed input rules by unit -- a cubic unit wants L*W*T, a square unit
// L*W, a linear unit just L, and anything else a straight quantity.
export const supportsDualMode = (unit) => {
  const norm = String(unit || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isCubic =
    norm.includes("cumeter") || norm.includes("m3") || norm.includes("cubic");
  const isSquare =
    norm.includes("sqmeter") ||
    norm.includes("sqm") ||
    norm.includes("m2") ||
    norm.includes("square");
  return isCubic || isSquare;
};

export const allowedInputsForUnit = (unit, mode) => {
  const norm = String(unit || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isCubic =
    norm.includes("cumeter") || norm.includes("m3") || norm.includes("cubic");
  const isSquare =
    norm.includes("sqmeter") ||
    norm.includes("sqm") ||
    norm.includes("m2") ||
    norm.includes("square");
  const isLinear =
    !isCubic &&
    !isSquare &&
    (norm.includes("linm") || norm.includes("rm") || norm.includes("meter"));
  if (isCubic) {
    return mode === "quantity"
      ? ["no_of_units", "quantity"]
      : ["no_of_units", "length", "width", "thickness"];
  }
  if (isSquare) {
    return mode === "quantity"
      ? ["no_of_units", "quantity"]
      : ["no_of_units", "length", "width"];
  }
  if (isLinear) return ["no_of_units", "length"];
  return ["no_of_units", "quantity"];
};

const normalizeOrg = (s) => (s || "RHD").trim().toUpperCase();

const emptyForm = {
  item_description: "",
  rate: "",
  unit: "",
  sub_description: "",
  element_id: "",
  no_of_units: 1,
  length: "",
  width: "",
  thickness: "",
  quantity: "",
};

// Create or edit a single Special Item Request. Lives on the dedicated
// Special Items page -- the estimation screen no longer creates these.
export default function SpecialItemModal({
  estimationId,
  region,
  elements = [],
  request = null, // null => create, otherwise edit that pending request
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(request);
  const [form, setForm] = useState(() =>
    request
      ? {
          item_description: request.item_description || "",
          rate: request.rate ?? "",
          unit: request.unit || "",
          sub_description: request.sub_description || "",
          element_id:
            request.element_id != null ? String(request.element_id) : "",
          no_of_units: getInitialDimensionValue(
            request.no_of_units_expr,
            request.no_of_units,
          ),
          length: getInitialDimensionValue(request.length_expr, request.length),
          width: getInitialDimensionValue(request.width_expr, request.width),
          thickness: getInitialDimensionValue(
            request.thickness_expr,
            request.thickness,
          ),
          quantity: request.quantity ?? "",
        }
      : emptyForm,
  );
  const [unitMode, setUnitMode] = useState("default"); // 'default' | 'quantity'
  const [keepOpen, setKeepOpen] = useState(!isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");

  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganizationName, setSelectedOrganizationName] = useState(
    request?.organization || "RHD",
  );
  const [orgRegions, setOrgRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState(
    request?.region || region || "",
  );
  const [divisions, setDivisions] = useState([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState(
    request?.division_id != null ? String(request.division_id) : "",
  );

  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentFile, setAttachmentFile] = useState(null);
  const fileInputRef = useRef(null);

  const sortedElements = [...elements].sort(
    (a, b) =>
      (a.sort_order || 0) - (b.sort_order || 0) || a.element_id - b.element_id,
  );

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const res = await listOrganizations();
        setOrganizations(res || []);
        if (!isEdit) {
          const rhd = (res || []).find(
            (o) => normalizeOrg(o.name) === "RHD",
          );
          if (rhd) setSelectedOrganizationName(rhd.name);
        }
      } catch (e) {
        console.error("Failed to fetch organizations", e);
      }
    };
    fetchOrgs();
  }, [isEdit]);

  useEffect(() => {
    const fetchDivs = async () => {
      try {
        const res = await listDivisions();
        setDivisions(
          (res || []).map((d) => ({
            id: d.division_id ?? d.id,
            name: d.name,
            organization_id: d.organization_id,
          })),
        );
      } catch (e) {
        console.error("Failed to fetch divisions", e);
      }
    };
    fetchDivs();
  }, []);

  // Regions belong to the selected organization; RHD stays pinned to the
  // estimation's own region so a special item can't drift out of it.
  useEffect(() => {
    const loadRegions = async () => {
      try {
        const org = (organizations || []).find(
          (o) => normalizeOrg(o.name) === normalizeOrg(selectedOrganizationName),
        );
        if (!org) {
          setOrgRegions([]);
          return;
        }
        const regs = await listRegions(org.org_id);
        setOrgRegions(
          (regs || [])
            .map((r) => r.name)
            .filter(Boolean)
            .sort(),
        );
      } catch (e) {
        console.error("Failed to fetch regions for organization", e);
        setOrgRegions([]);
      }
    };
    loadRegions();
  }, [organizations, selectedOrganizationName]);

  useEffect(() => {
    if (normalizeOrg(selectedOrganizationName) === "RHD") {
      setSelectedRegion(region || "");
    } else if (!selectedRegion || !orgRegions.includes(selectedRegion)) {
      setSelectedRegion(orgRegions[0] || "");
    }
  }, [selectedOrganizationName, region, orgRegions]);

  // Esc closes, Enter submits.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        const formEl = document.getElementById("special-item-form");
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

  const allowedInputs = allowedInputsForUnit(form.unit, unitMode);

  const parseDimension = (label, raw, allowed) => {
    if (!allowed) return { value: null, expr: null, error: null };
    const result = parseDimensionInput(raw);
    if (result.error)
      return { ...result, error: `${label} equation is invalid.` };
    return result;
  };

  const submit = async (e) => {
    e.preventDefault();
    const noUnits = parseDimension(
      "No. of units",
      form.no_of_units,
      allowedInputs.includes("no_of_units"),
    );
    const length = parseDimension(
      "Length",
      form.length,
      allowedInputs.includes("length"),
    );
    const width = parseDimension(
      "Width",
      form.width,
      allowedInputs.includes("width"),
    );
    const thickness = parseDimension(
      "Thickness",
      form.thickness,
      allowedInputs.includes("thickness"),
    );
    const dimensionError =
      noUnits.error || length.error || width.error || thickness.error;
    if (dimensionError) {
      setSubmitError(dimensionError);
      return;
    }
    if (!selectedDivisionId) {
      setSubmitError("Division is required.");
      return;
    }
    if (!form.item_description.trim()) {
      setSubmitError("Item description is required.");
      return;
    }
    // A drawing/justification is what makes a special item reviewable, so a
    // brand-new request must carry one. An edit keeps whatever it already has.
    if (!isEdit && !attachmentFile) {
      setSubmitError("An attachment is required for a special item.");
      return;
    }

    const payload = {
      division_id: parseInt(selectedDivisionId, 10),
      item_description: form.item_description.trim(),
      unit: form.unit || null,
      rate: form.rate !== "" ? parseFloat(form.rate) : null,
      region: selectedRegion || region || "Default",
      organization: selectedOrganizationName || "RHD",
      element_id: form.element_id ? parseInt(form.element_id, 10) : null,
      sub_description: form.sub_description || null,
      no_of_units: noUnits.value ?? 1,
      no_of_units_expr: noUnits.expr,
      length: length.value,
      width: width.value,
      thickness: thickness.value,
      length_expr: length.expr,
      width_expr: width.expr,
      thickness_expr: thickness.expr,
      quantity: form.quantity !== "" ? parseFloat(form.quantity) : null,
    };

    try {
      setIsSubmitting(true);
      setSubmitError("");
      setSubmitNotice("");

      const saved = isEdit
        ? await updateSpecialItemRequest(request.request_id, payload)
        : await createSpecialItemRequest(estimationId, payload);

      if (attachmentFile) {
        try {
          const trimmedName = (attachmentName || "").trim();
          const fileToUpload = trimmedName
            ? new File([attachmentFile], trimmedName, {
                type: attachmentFile.type,
              })
            : attachmentFile;
          await uploadAttachment({
            ownerType: "special_item_request",
            ownerId: saved.request_id,
            file: fileToUpload,
          });
        } catch (uploadErr) {
          setSubmitError(
            "Saved, but the attachment failed to upload: " +
              (uploadErr?.response?.data?.detail || uploadErr.message),
          );
        }
      }

      onSaved?.();

      if (isEdit || !keepOpen) {
        onClose();
        return;
      }
      setForm({ ...emptyForm });
      setAttachmentName("");
      setAttachmentFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSubmitNotice("Special item submitted for approval.");
    } catch (err) {
      setSubmitError(
        (isEdit ? "Failed to update special item: " : "Failed to submit special item: ") +
          (err?.response?.data?.detail || err.message),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const visibleDivisions = divisions.filter((d) => {
    if (!selectedOrganizationName) return true;
    const org = organizations.find((o) => o.name === selectedOrganizationName);
    if (!org) return true;
    return (
      d.organization_id === org.org_id ||
      (d.organization_id == null && normalizeOrg(org.name) === "RHD")
    );
  });

  return (
    <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto z-50 relative border border-gray-200">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition"
          aria-label="Close"
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
        <h3 className="text-lg sm:text-xl font-semibold mb-1 text-gray-900">
          {isEdit ? "Edit Special Item" : "New Special Item"}
        </h3>
        <p className="mb-4 text-xs text-gray-600">
          Special items are not in the item master. They are submitted for
          approval and only join the estimation once approved.
        </p>

        <form
          id="special-item-form"
          onSubmit={submit}
          className="grid grid-cols-1 gap-3"
        >
          <div>
            <label className="text-xs text-gray-700">Organization</label>
            <select
              value={selectedOrganizationName}
              onChange={(e) => {
                setSelectedOrganizationName(e.target.value);
                setSelectedDivisionId("");
              }}
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            >
              <option value="">Select Organization</option>
              {organizations.map((o) => (
                <option key={o.org_id} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-700">Region</label>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              disabled={normalizeOrg(selectedOrganizationName) === "RHD"}
              className={`border ${normalizeOrg(selectedOrganizationName) === "RHD" ? "opacity-60 cursor-not-allowed" : ""} border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs`}
            >
              <option value="">Select Region</option>
              {orgRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-700">Division</label>
            <select
              value={selectedDivisionId}
              onChange={(e) => setSelectedDivisionId(e.target.value)}
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            >
              <option value="">Select Division</option>
              {visibleDivisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <input
            name="item_description"
            value={form.item_description}
            onChange={handleChange}
            placeholder="Item Name / Description"
            className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              name="rate"
              type="number"
              step="any"
              value={form.rate}
              onChange={handleChange}
              placeholder="Rate"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
            <input
              name="unit"
              value={form.unit}
              onChange={handleChange}
              placeholder="Unit (e.g. LS, m2)"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          </div>

          {supportsDualMode(form.unit) && (
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

          <input
            name="sub_description"
            value={form.sub_description}
            onChange={handleChange}
            placeholder="Sub Division / Sub Description"
            className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
          />

          {elements.length > 0 && (
            <div>
              <label className="text-xs text-gray-700">
                Element (pier / abutment / chainage)
              </label>
              <select
                name="element_id"
                value={form.element_id}
                onChange={handleChange}
                className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
              >
                <option value="">— Unassigned —</option>
                {sortedElements.map((el) => (
                  <option key={el.element_id} value={el.element_id}>
                    {elementLabel(el)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {allowedInputs.includes("no_of_units") && (
            <input
              name="no_of_units"
              value={form.no_of_units}
              onChange={handleChange}
              placeholder="Nos"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          )}
          {allowedInputs.includes("quantity") && (
            <input
              name="quantity"
              value={form.quantity}
              onChange={handleChange}
              placeholder="Quantity"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          )}
          {allowedInputs.includes("length") && (
            <input
              name="length"
              value={form.length}
              onChange={handleChange}
              placeholder="Length"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          )}
          {allowedInputs.includes("width") && (
            <input
              name="width"
              value={form.width}
              onChange={handleChange}
              placeholder="Width"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          )}
          {allowedInputs.includes("thickness") && (
            <input
              name="thickness"
              value={form.thickness}
              onChange={handleChange}
              placeholder="Thickness/Depth"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            <input
              type="text"
              value={attachmentName}
              onChange={(e) => setAttachmentName(e.target.value)}
              placeholder="Attachment Name (e.g., A-01)"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-3 py-2 rounded bg-gradient-to-r from-rose-500 to-pink-600 text-white hover:from-rose-600 hover:to-pink-700"
              >
                Upload Attachment
              </button>
              <span
                className="text-[11px] text-gray-600 truncate max-w-[160px]"
                title={attachmentFile?.name}
              >
                {attachmentFile?.name ||
                  (isEdit && request?.attachments?.length
                    ? request.attachments[0].filename
                    : "No file selected")}
              </span>
            </div>
          </div>

          {submitError && (
            <div className="text-xs text-red-600">{submitError}</div>
          )}
          {submitNotice && (
            <div className="text-xs text-emerald-700">{submitNotice}</div>
          )}

          <div className="mt-2 flex justify-between items-center gap-3">
            {!isEdit ? (
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={keepOpen}
                  onChange={(e) => setKeepOpen(e.target.checked)}
                />
                Keep form open after submit
              </label>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 font-semibold py-1 px-3 rounded shadow-sm text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`${isSubmitting ? "opacity-70 cursor-not-allowed" : ""} bg-teal-700 hover:bg-teal-900 text-white font-medium py-1 px-3 rounded inline-flex items-center gap-1 text-xs`}
              >
                {isSubmitting
                  ? "Saving…"
                  : isEdit
                    ? "Save Changes"
                    : "Submit Item"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
