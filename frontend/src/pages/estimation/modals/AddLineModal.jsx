import React, { useEffect, useState } from "react";
import { listDivisions } from "../../../api/items";
import { listOrganizations, listRegions } from "../../../api/orgs";
import { createEstimationLine } from "../../../api/estimations";
import { parseDimensionInput } from "../../../utils/dimensions";
import { elementLabel } from "../../../utils/elementLabel";
import {
  allowedInputsForUnit,
  supportsDualMode,
  unitAdornment,
} from "../../../utils/unitInputs";
import InputWithUnit from "../../../components/ui/InputWithUnit";
import ItemPicker from "../ItemPicker.jsx";

// Adds an item-master line. Items outside the master live on the dedicated
// Special Items page, so this modal only ever deals with catalogued items.
export default function AddLineModal({
  items,
  itemsHasMore,
  itemsLoading,
  onLoadMoreItems,
  lines,
  elements = [],
  onClose,
  onSave,
  onCreateSubItems,
  estimationId,
  region,
  // When set, the new line is created as a child of this line (meeting item 2):
  // it carries its own item/rate/dimensions and rolls up into the parent.
  parentLine = null,
}) {
  const isChildLine = parentLine != null;
  const [form, setForm] = useState({
    item_id: "",
    sub_description: "",
    element_id: "",
    no_of_units: 1,
    length: "",
    width: "",
    thickness: "",
    quantity: "",
  });
  const sortedElements = [...elements].sort(
    (a, b) =>
      (a.sort_order || 0) - (b.sort_order || 0) || a.element_id - b.element_id,
  );
  const [keepOpen, setKeepOpen] = useState(true);
  const [breakIntoSubItems, setBreakIntoSubItems] = useState(false);
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");

  // Organization selection state
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganizationName, setSelectedOrganizationName] =
    useState("RHD");
  const normalizeOrg = (s) => (s || "RHD").trim().toUpperCase();
  // Region selection (locked to passed-in region for RHD, selectable for other orgs)
  const [selectedRegion, setSelectedRegion] = useState(region || "");
  const [orgRegions, setOrgRegions] = useState([]);
  const canonRegion = (s) => {
    const x = String(s || "").toLowerCase();
    // unify common spellings and spacing around punctuation
    let y = x.replace(/\s+/g, " ").trim();
    y = y.replace(/\s*:\s*/g, ":"); // normalize colon spacing ("Zone-B :" -> "Zone-B:")
    // normalize synonyms
    y = y.replace(/cumilla/g, "comilla");
    y = y.replace(/chittagong/g, "chattogram");
    return y;
  };
  useEffect(() => {
    const orgIsRHD = normalizeOrg(selectedOrganizationName) === "RHD";
    if (orgIsRHD) {
      setSelectedRegion(region || "");
    } else {
      // When org changes away from RHD, default to first region from orgRegions
      if (!selectedRegion || !orgRegions.includes(selectedRegion)) {
        setSelectedRegion(orgRegions[0] || "");
      }
    }
  }, [selectedOrganizationName, region, orgRegions]);
  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const res = await listOrganizations();
        setOrganizations(res || []);
        // Default to RHD if available
        const rhd = (res || []).find(
          (o) => (o.name || "").toUpperCase() === "RHD",
        );
        if (rhd) setSelectedOrganizationName(rhd.name);
      } catch (e) {
        console.error("Failed to fetch organizations", e);
      }
    };
    fetchOrgs();
  }, []);

  // Load regions for the selected organization
  useEffect(() => {
    const loadRegions = async () => {
      try {
        const org = (organizations || []).find(
          (o) =>
            normalizeOrg(o.name) === normalizeOrg(selectedOrganizationName),
        );
        if (!org) {
          setOrgRegions([]);
          return;
        }
        const regs = await listRegions(org.org_id);
        const names = (regs || [])
          .map((r) => r.name)
          .filter(Boolean)
          .sort();
        setOrgRegions(names);
      } catch (e) {
        console.error("Failed to fetch regions for organization", e);
        setOrgRegions([]);
      }
    };
    loadRegions();
  }, [organizations, selectedOrganizationName]);

  // Division-first selection state: fetch all divisions from backend so "Special Item" is visible
  const [divisions, setDivisions] = useState([]);
  useEffect(() => {
    const fetchDivisions = async () => {
      try {
        const res = await listDivisions();
        const list = (res || []).map((d) => ({
          id: d.division_id ?? d.id,
          name: d.name,
          organization_id: d.organization_id,
        }));
        setDivisions(list);
      } catch (e) {
        console.error("Failed to fetch divisions", e);
      }
    };
    fetchDivisions();
  }, []);
  const [selectedDivisionId, setSelectedDivisionId] = useState("");

  // Unit and unit-based input rules
  const [selectedUnit, setSelectedUnit] = useState("");
  const [unitMode, setUnitMode] = useState("default"); // 'default' | 'quantity' for units that support both
  // Items available for current selection in this modal
  const [modalItems, setModalItems] = useState([]);
  const [modalItemsLoading, setModalItemsLoading] = useState(false);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });
  const parseDimension = (label, raw, allowed) => {
    if (!allowed) return { value: null, expr: null, error: null };
    const result = parseDimensionInput(raw);
    if (result.error)
      return { ...result, error: `${label} equation is invalid.` };
    return result;
  };

  const addLine = async (e) => {
    e.preventDefault();
    const allowed = allowedInputsForUnit(selectedUnit, unitMode);
    const noUnitsResult = parseDimension(
      "No. of units",
      form.no_of_units,
      allowed.includes("no_of_units"),
    );
    const lengthResult = parseDimension(
      "Length",
      form.length,
      allowed.includes("length"),
    );
    const widthResult = parseDimension(
      "Width",
      form.width,
      allowed.includes("width"),
    );
    const thicknessResult = parseDimension(
      "Thickness",
      form.thickness,
      allowed.includes("thickness"),
    );
    const dimensionError =
      noUnitsResult.error ||
      lengthResult.error ||
      widthResult.error ||
      thicknessResult.error;
    if (dimensionError) {
      setSubmitError(dimensionError);
      return;
    }

    if (!form.item_id) {
      setSubmitError("Select an item first.");
      return;
    }

    const sanitize = (key, val) => (allowed.includes(key) ? val : null);

    const payload = {
      item_id: parseInt(form.item_id),
      parent_line_id: isChildLine ? parentLine.line_id : null,
      // A child always inherits its parent's element; the picker is hidden.
      element_id: isChildLine
        ? null
        : form.element_id
          ? parseInt(form.element_id, 10)
          : null,
      sub_description: form.sub_description || null,
      no_of_units: noUnitsResult.value ?? 1,
      no_of_units_expr: noUnitsResult.expr,
      length: lengthResult.value,
      width: widthResult.value,
      thickness: thicknessResult.value,
      length_expr: lengthResult.expr,
      width_expr: widthResult.expr,
      thickness_expr: thicknessResult.expr,
      quantity: sanitize(
        "quantity",
        form.quantity ? parseFloat(form.quantity) : null,
      ),
    };

    let createdLine;
    try {
      setIsSubmitting(true);
      setSubmitError("");
      setSubmitNotice("");
      createdLine = await createEstimationLine(estimationId, payload);
      onSave();
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        "Failed to add line. Please check inputs.";
      setSubmitError(msg);
      return;
    } finally {
      setIsSubmitting(false);
    }

    try {
      if (form.item_id)
        localStorage.setItem(
          `lastLineByItem:${region}:${form.item_id}`,
          JSON.stringify(form),
        );
    } catch {}

    if (breakIntoSubItems) {
      // Hand off to the Make Sub-Items flow for the line we just created,
      // rather than keeping this form open.
      onCreateSubItems?.(createdLine);
      onClose();
      return;
    }

    if (keepOpen) {
      setForm((f) => ({ ...f }));
    } else {
      onClose();
    }
  };

  // Key handling: Esc closes, Enter submits form
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        const formEl = document.getElementById("add-line-form");
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

  // Load presets when item or region changes
  useEffect(() => {
    try {
      const all = JSON.parse(
        localStorage.getItem(`linePresets:${region}`) || "{}",
      );
      setPresets(all[form.item_id] || []);
    } catch {
      setPresets([]);
    }
  }, [form.item_id, region]);

  // When division changes, clear item selection
  useEffect(() => {
    setForm((f) => ({ ...f, item_id: "" }));
    setSelectedUnit("");
  }, [selectedDivisionId]);

  const refreshModalItems = () => {
    const orgIsRHD = normalizeOrg(selectedOrganizationName) === "RHD";
    const targetRegion = orgIsRHD ? region || "" : selectedRegion || "";
    const fromCache = (items || [])
      .filter(
        (it) =>
          !selectedDivisionId ||
          String(it.division_id) === String(selectedDivisionId),
      )
      .filter(
        (it) =>
          normalizeOrg(it.organization) ===
          normalizeOrg(selectedOrganizationName),
      )
      .filter((it) => !it.special_item)
      .filter((it) => {
        if (!targetRegion) return true;
        return canonRegion(it.region) === canonRegion(targetRegion);
      });
    setModalItems(fromCache);
  };

  const loadMoreModalItems = async () => {
    if (itemsLoading) return;
    setModalItemsLoading(true);
    await onLoadMoreItems?.();
    refreshModalItems();
    setModalItemsLoading(false);
  };

  // Keep items in the modal synced with current Organization/Region/Division selection
  useEffect(() => {
    if (selectedOrganizationName) {
      refreshModalItems();
    } else {
      setModalItems([]);
    }
  }, [
    items,
    selectedDivisionId,
    selectedOrganizationName,
    selectedRegion,
    region,
  ]);

  const applyLastForItem = () => {
    try {
      const raw = localStorage.getItem(
        `lastLineByItem:${region}:${form.item_id}`,
      );
      if (!raw) return;
      const tmpl = JSON.parse(raw);
      setForm({ ...form, ...tmpl, item_id: form.item_id });
    } catch {}
  };

  const savePreset = () => {
    if (!presetName || !form.item_id) return;
    const preset = {
      id: String(Date.now()),
      name: presetName,
      sub_description: form.sub_description || "",
      no_of_units: form.no_of_units || 1,
      length: form.length || "",
      width: form.width || "",
      thickness: form.thickness || "",
      quantity: form.quantity || "",
    };
    try {
      const key = `linePresets:${region}`;
      const all = JSON.parse(localStorage.getItem(key) || "{}");
      const arr = all[form.item_id] || [];
      const next = [...arr, preset];
      all[form.item_id] = next;
      localStorage.setItem(key, JSON.stringify(all));
      setPresets(next);
      setPresetName("");
    } catch {}
  };

  const applyPreset = () => {
    const p = presets.find((x) => x.id === selectedPresetId);
    if (!p) return;
    setForm({
      item_id: form.item_id,
      sub_description: p.sub_description,
      no_of_units: p.no_of_units,
      length: p.length,
      width: p.width,
      thickness: p.thickness,
      quantity: p.quantity,
    });
  };

  const allowedInputs = allowedInputsForUnit(selectedUnit, unitMode);

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
        <h3 className="text-lg sm:text-xl font-semibold mb-1 text-gray-900">
          {isChildLine ? "Add Item Inside" : "Add Item"}
        </h3>
        {isChildLine ? (
          <p className="mb-4 text-xs text-gray-600">
            New sub-line under{" "}
            <span className="font-medium">
              {parentLine?.label ||
                parentLine?.item?.item_code ||
                "the selected line"}
            </span>
            . It gets its own item and rate and rolls up into the parent.
          </p>
        ) : (
          <p className="mb-4 text-xs text-gray-600">
            Not in the item master? Add it from the{" "}
            <span className="font-medium">Special Items</span> page instead.
          </p>
        )}

        {(selectedRegion || region) && (
          <p className="mb-3 text-xs text-gray-600">
            Showing items for region:{" "}
            <span className="font-medium">{selectedRegion || region}</span>
          </p>
        )}
        <form
          id="add-line-form"
          onSubmit={addLine}
          className="grid grid-cols-1 gap-3 mt-2"
        >
          {/* Organization first */}
          <div>
            <label className="text-xs text-gray-700">Organization</label>
            <select
              value={selectedOrganizationName}
              onChange={(e) => {
                setSelectedOrganizationName(e.target.value);
                setForm((f) => ({ ...f, item_id: "" }));
                setSelectedUnit("");
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
          {/* Region (enabled only for non-RHD organizations) */}
          <div>
            <label className="text-xs text-gray-700">Region</label>
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                setForm((f) => ({ ...f, item_id: "" }));
                setSelectedUnit("");
              }}
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
          <label className="text-xs text-gray-700">
            Division (optional filter)
            <select
              value={selectedDivisionId}
              onChange={(e) => setSelectedDivisionId(e.target.value)}
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            >
              <option value="">All divisions</option>
              {divisions
                .filter((d) => {
                  if (!selectedOrganizationName) return true;
                  const org = organizations.find(
                    (o) => o.name === selectedOrganizationName,
                  );
                  if (org) {
                    // If division has an org ID, match it.
                    // If not (legacy/global), maybe show for all or just RHD?
                    // For now, let's assume strict matching if ID exists.
                    // If d.organization_id is null, it might be a legacy global division.
                    return (
                      d.organization_id === org.org_id ||
                      (d.organization_id == null && org.name === "RHD")
                    );
                  }
                  return true;
                })
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          {/* Item filtered by division */}
          <ItemPicker
            items={modalItems}
            value={form.item_id}
            onChange={(it) => {
              setForm((f) => ({ ...f, item_id: String(it.item_id) }));
              setSelectedUnit(it.unit || "");
              setUnitMode("default");
            }}
            hasMore={itemsHasMore}
            loading={modalItemsLoading || itemsLoading}
            onLoadMore={loadMoreModalItems}
            disabled={!selectedOrganizationName}
          />
          {/* Unit + mode */}
          {form.item_id && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="text-gray-800">
                <span className="font-semibold text-sm">Unit:</span>{" "}
                <span className="font-bold text-sm">{selectedUnit || "—"}</span>
              </div>
              {supportsDualMode(selectedUnit) && (
                <div className="flex items-center gap-2">
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
            </div>
          )}
          {form.item_id && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={applyLastForItem}
                  className="text-xs px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 border"
                >
                  Use last for item
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="text-xs border p-2 rounded w-full"
                >
                  <option value="">Apply preset…</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyPreset}
                  className="text-xs px-3 py-2 rounded bg-teal-600 text-white"
                >
                  Apply
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Save as preset name"
                  className="text-xs border p-2 rounded w-full"
                />
                <button
                  type="button"
                  onClick={savePreset}
                  className="text-xs px-3 py-2 rounded bg-gray-800 text-white"
                >
                  Save
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

          {elements.length > 0 && !isChildLine && (
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

          {/* Inputs governed by unit rules */}
          {allowedInputs.includes("no_of_units") && (
            <InputWithUnit
              unit={unitAdornment(selectedUnit, "no_of_units")}
              name="no_of_units"
              value={form.no_of_units}
              onChange={handleChange}
              placeholder="Nos"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          )}
          {allowedInputs.includes("quantity") && (
            <InputWithUnit
              unit={unitAdornment(selectedUnit, "quantity")}
              name="quantity"
              value={form.quantity}
              onChange={handleChange}
              placeholder="Quantity"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          )}
          {allowedInputs.includes("length") && (
            <InputWithUnit
              unit={unitAdornment(selectedUnit, "length")}
              name="length"
              value={form.length}
              onChange={handleChange}
              placeholder="Length"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          )}
          {allowedInputs.includes("width") && (
            <InputWithUnit
              unit={unitAdornment(selectedUnit, "width")}
              name="width"
              value={form.width}
              onChange={handleChange}
              placeholder="Width"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          )}
          {allowedInputs.includes("thickness") && (
            <InputWithUnit
              unit={unitAdornment(selectedUnit, "thickness")}
              name="thickness"
              value={form.thickness}
              onChange={handleChange}
              placeholder="Thickness/Depth"
              className="border border-gray-300 p-3 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
            />
          )}
          {submitError && (
            <div className="text-xs text-red-600">{submitError}</div>
          )}
          {submitNotice && (
            <div className="text-xs text-emerald-700">{submitNotice}</div>
          )}
          {!isChildLine && (
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={breakIntoSubItems}
                onChange={(e) => setBreakIntoSubItems(e.target.checked)}
              />
              Split into parts (bridge / road / other) after adding
            </label>
          )}
          <div className="mt-2 flex justify-between items-center gap-3">
            <label
              className={`flex items-center gap-2 text-xs text-gray-700 ${breakIntoSubItems ? "opacity-40" : ""}`}
            >
              <input
                type="checkbox"
                checked={keepOpen}
                disabled={breakIntoSubItems}
                onChange={(e) => setKeepOpen(e.target.checked)}
              />
              Keep form open after Add
            </label>
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
                ? "Adding…"
                : breakIntoSubItems
                  ? "Add & Split"
                  : "Add Line"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
