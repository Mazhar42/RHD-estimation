import React, { useEffect, useState } from "react";
import { listOrganizations, listRegions } from "../../api/orgs";
import { listWorkTypes } from "../../api/estimations";
import { checkWorkNameId } from "../../api/works";
import GpsInput from "../gps/GpsInput.jsx";
import Modal from "../ui/Modal.jsx";

const INITIAL_GPS = {
  geometry_kind: "point",
  points: [{ seq: 0, latitude: "", longitude: "", label: "" }],
};

const field = "w-full rounded border border-gray-300 px-3 py-2";

// "RHD-2026-DHAKA-BYPASS-ROAD" from the organization, year and project name.
export function draftWorkId(
  organization,
  projectName,
  year = new Date().getFullYear(),
) {
  const slug = projectName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
  return [organization || "WORK", year, slug].filter(Boolean).join("-");
}

function blankForm() {
  return {
    projectName: "",
    clientName: "",
    summary: "",
    workId: "",
    workIdEdited: false,
    estimationName: "Estimate 1",
    organization: "RHD",
    region: "",
    workTypes: ["road"],
    rateYear: "",
    gps: INITIAL_GPS,
  };
}

// Two short steps instead of one long form: what the work is, then how it
// is priced. Creating it opens the first estimate.
export default function NewWorkDialog({ open, onClose, onCreate }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(blankForm);
  const [organizations, setOrganizations] = useState([]);
  const [regions, setRegions] = useState([]);
  // Until the organization's regions arrive, form.region is still "" --
  // creating the work then would leave it without a rate region.
  const [regionsLoaded, setRegionsLoaded] = useState(false);
  const [workTypeOptions, setWorkTypeOptions] = useState([]);
  const [idStatus, setIdStatus] = useState(null); // { available, suggestion }
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setForm(blankForm());
    setError("");
    setIdStatus(null);
    setRegionsLoaded(false);
    listOrganizations()
      .then((items) => {
        setOrganizations(items || []);
        // No organizations means no regions will ever load.
        if (!items?.length) setRegionsLoaded(true);
      })
      .catch(() => {
        setOrganizations([]);
        setRegionsLoaded(true);
      });
    listWorkTypes()
      .then((items) => setWorkTypeOptions(items || []))
      .catch(() => setWorkTypeOptions([{ code: "road", label: "Road" }]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const org = organizations.find((o) => o.name === form.organization);
    if (!org) {
      if (organizations.length) setRegionsLoaded(true);
      return undefined;
    }
    let cancelled = false;
    setRegionsLoaded(false);
    listRegions(org.org_id)
      .then((items) => {
        if (cancelled) return;
        const names = (items || []).map((r) => r.name).filter(Boolean);
        setRegions(names);
        setForm((f) =>
          names.includes(f.region) ? f : { ...f, region: names[0] || "" },
        );
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      })
      .finally(() => {
        if (!cancelled) setRegionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.organization, organizations]);

  // Keep the Work ID following the project name until the user edits it.
  useEffect(() => {
    if (form.workIdEdited) return;
    set(
      "workId",
      form.projectName.trim()
        ? draftWorkId(form.organization, form.projectName)
        : "",
    );
  }, [form.projectName, form.organization, form.workIdEdited]);

  useEffect(() => {
    if (!open || !form.workId.trim()) {
      setIdStatus(null);
      return undefined;
    }
    const handle = window.setTimeout(async () => {
      try {
        setIdStatus(await checkWorkNameId(form.workId));
      } catch {
        setIdStatus(null);
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [form.workId, open]);

  if (!open) return null;

  const validateStep1 = () => {
    if (!form.projectName.trim()) return "Enter a project name.";
    if (!form.workId.trim()) return "Enter a Work ID.";
    if (idStatus && !idStatus.available)
      return `Work ID “${form.workId}” is already used. Try “${idStatus.suggestion}”.`;
    return "";
  };

  const validateStep2 = () => {
    if (!form.estimationName.trim())
      return "Enter a name for the first estimate.";
    if (form.workTypes.length === 0) return "Pick at least one work type.";
    const year = form.rateYear === "" ? null : Number(form.rateYear);
    if (
      year !== null &&
      (!Number.isInteger(year) || year < 2000 || year > 2100)
    ) {
      return "Rate year must be between 2000 and 2100, or blank for the newest rates.";
    }
    return "";
  };

  const submit = async () => {
    if (step === 1) {
      const problem = validateStep1();
      setError(problem);
      if (!problem) setStep(2);
      return;
    }
    const problem = validateStep1() || validateStep2();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await onCreate({
        name_id: form.workId.trim(),
        project_name: form.projectName.trim(),
        estimation_name: form.estimationName.trim(),
        client_name: form.clientName.trim() || null,
        summary: form.summary.trim() || null,
        organization: form.organization,
        region: form.region,
        work_type_codes: form.workTypes,
        rate_year: form.rateYear === "" ? null : Number(form.rateYear),
        geometry_kind: form.gps.geometry_kind,
        geo_points: form.gps.points.filter((p) => p.latitude && p.longitude),
      });
      onClose();
    } catch (submitError) {
      const detail = submitError?.response?.data?.detail;
      setError(
        detail?.detail === "name_id_taken"
          ? `Work ID is already used. Try “${detail.suggestion}”.`
          : detail?.detail ||
              (typeof detail === "string"
                ? detail
                : "Couldn't create the work."),
      );
      if (detail?.detail === "name_id_taken") setStep(1);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleWorkType = (code) =>
    set(
      "workTypes",
      form.workTypes.includes(code)
        ? form.workTypes.filter((c) => c !== code)
        : [...form.workTypes, code],
    );

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-500">Step {step} of 2</span>
      <div className="flex gap-3">
        {step === 2 ? (
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep(1);
            }}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || (step === 2 && !regionsLoaded)}
          className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {step === 1
            ? "Next"
            : isSubmitting
              ? "Creating…"
              : regionsLoaded
                ? "Create Work"
                : "Loading regions…"}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        step === 1 ? "New Work · Project" : "New Work · Pricing and location"
      }
      maxWidthClassName="max-w-2xl"
      footer={footer}
      onSubmit={submit}
      closeDisabled={isSubmitting}
    >
      {step === 1 ? (
        <div className="space-y-4">
          <label className="block space-y-1 text-sm text-gray-700">
            <span className="font-medium">Project name</span>
            <input
              value={form.projectName}
              onChange={(e) => set("projectName", e.target.value)}
              className={field}
            />
          </label>
          <label className="block space-y-1 text-sm text-gray-700">
            <span className="font-medium">Client (optional)</span>
            <input
              value={form.clientName}
              onChange={(e) => set("clientName", e.target.value)}
              className={field}
            />
          </label>
          <label className="block space-y-1 text-sm text-gray-700">
            <span className="font-medium">Work ID</span>
            <input
              value={form.workId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  workId: e.target.value,
                  workIdEdited: true,
                }))
              }
              className={`${field} font-mono`}
              placeholder="Filled in from the project name"
            />
            <span
              className={`text-xs ${idStatus && !idStatus.available ? "text-amber-700" : "text-gray-500"}`}
            >
              {idStatus && !idStatus.available ? (
                <>
                  Already used.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        workId: idStatus.suggestion,
                        workIdEdited: true,
                      }))
                    }
                  >
                    Use {idStatus.suggestion}
                  </button>
                </>
              ) : (
                "A unique reference for this work. Generated for you; change it if your office uses its own scheme."
              )}
            </span>
          </label>
          <label className="block space-y-1 text-sm text-gray-700">
            <span className="font-medium">Summary (optional)</span>
            <textarea
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
              rows={2}
              className={field}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">Organization</span>
              <select
                value={form.organization}
                onChange={(e) => set("organization", e.target.value)}
                className={field}
              >
                {(organizations.length
                  ? organizations
                  : [{ org_id: 0, name: "RHD" }]
                ).map((o) => (
                  <option key={o.org_id || o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">Region (sets the rates used)</span>
              <select
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
                className={field}
              >
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">Rate year</span>
              <input
                type="number"
                min="2000"
                max="2100"
                value={form.rateYear}
                onChange={(e) => set("rateYear", e.target.value)}
                placeholder="Newest"
                className={field}
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">First estimate name</span>
              <input
                value={form.estimationName}
                onChange={(e) => set("estimationName", e.target.value)}
                className={field}
              />
            </label>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-gray-700">
              Work types
            </legend>
            <div className="flex flex-wrap gap-4">
              {workTypeOptions.map((wt) => (
                <label
                  key={wt.code}
                  className="inline-flex items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={form.workTypes.includes(wt.code)}
                    onChange={() => toggleWorkType(wt.code)}
                  />
                  {wt.label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Each work type gets its own tab and subtotal.
            </p>
          </fieldset>
          <GpsInput value={form.gps} onChange={(gps) => set("gps", gps)} />
        </div>
      )}
      {error && (
        <div
          className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}
    </Modal>
  );
}
