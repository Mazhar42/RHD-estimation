import React, { useEffect, useState } from "react";
import { listOrganizations, listRegions } from "../api/orgs";
import { listAllItems } from "../api/items";
import {
  listProjects,
  listEstimations,
  createEstimation,
} from "../api/projects";
import GpsInput from "../components/gps/GpsInput.jsx";
import {
  deleteEstimation,
  updateEstimation,
  listWorkTypes,
} from "../api/estimations";
import { useParams, Link, useNavigate } from "react-router-dom";
import { FaTrash, FaPlus, FaEdit } from "react-icons/fa";
import { useAuth } from "../hooks/useAuth";

export default function ProjectEstimations() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("superadmin");
  const { projectId } = useParams();
  const [estimations, setEstimations] = useState([]);
  const [name, setName] = useState("");
  const [regions, setRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [rateYear, setRateYear] = useState("");
  // The alignment drawn while creating the estimation; saved with it.
  const [geo, setGeo] = useState({ geometry_kind: "point", points: [] });
  const [workTypes, setWorkTypes] = useState([]);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [projectOwnerId, setProjectOwnerId] = useState(null);
  const [isCreateEstimationModalOpen, setIsCreateEstimationModalOpen] =
    useState(false);
  const [createError, setCreateError] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [estimationToDelete, setEstimationToDelete] = useState(null);
  const [isEditEstimationModalOpen, setIsEditEstimationModalOpen] =
    useState(false);
  const [editEstimationId, setEditEstimationId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editRegion, setEditRegion] = useState("");
  // Selection for single-row actions
  const [selectedEstimationId, setSelectedEstimationId] = useState(null);
  const [selectedEstimationIds, setSelectedEstimationIds] = useState([]);

  const toggleSelectEstimation = (id) => {
    setSelectedEstimationIds((prev) => (prev.includes(id) ? [] : [id]));
  };

  const handleEditEstimation = () => {
    if (selectedEstimationIds.length !== 1) return;
    const estimation = estimations.find(
      (e) => e.estimation_id === selectedEstimationIds[0],
    );
    if (!estimation) return;
    openEditEstimation(estimation);
  };

  const handleDeleteEstimation = () => {
    if (selectedEstimationIds.length !== 1) return;
    const estimation = estimations.find(
      (e) => e.estimation_id === selectedEstimationIds[0],
    );
    if (!estimation) return;
    openDeleteConfirm(estimation.estimation_id, estimation.estimation_name);
  };

  const formatDate = (value) => {
    if (!value) return "—";
    // Backend returns naive UTC string; append 'Z' to ensure it's treated as UTC
    const dateStr = value.endsWith("Z") ? value : `${value}Z`;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";

    // Format to BDT (Bangladesh Standard Time) with AM/PM
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  };

  const formatUser = (user, userId) => {
    const label = user?.full_name || user?.username;
    if (label) return label;
    if (userId) return `User #${userId}`;
    return "—";
  };

  useEffect(() => {
    fetchEstimations();
    fetchRegions();
    fetchProjectName();
    fetchWorkTypes();
  }, [projectId]);

  const fetchWorkTypes = async () => {
    try {
      const data = await listWorkTypes();
      setWorkTypes(data || []);
    } catch (e) {
      console.error("Failed to load work types", e);
    }
  };

  const toggleWorkType = (code, setter) => {
    setter((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const fetchEstimations = async () => {
    try {
      const data = await listEstimations(projectId);
      setEstimations(data);
    } catch (err) {
      console.error("Failed to fetch estimations", err);
    }
  };

  const fetchRegions = async () => {
    try {
      // Prefer authoritative list of regions from the RHD organization
      const orgs = await listOrganizations();
      const rhd = (orgs || []).find(
        (o) => (o.name || "").toUpperCase() === "RHD",
      );
      if (rhd) {
        const regs = await listRegions(rhd.org_id);
        const names = (regs || [])
          .map((r) => r.name)
          .filter(Boolean)
          .sort();
        setRegions(names);
        return;
      }
      // Fallback: derive regions from items but restrict to organization=RHD
      const items = await listAllItems({ organization: "RHD" });
      const unique = Array.from(new Set((items || []).map((it) => it.region)))
        .filter(Boolean)
        .sort();
      setRegions(unique);
    } catch (e) {
      console.error("Failed to load regions", e);
    }
  };

  const fetchProjectName = async () => {
    try {
      const data = await listProjects();
      const proj = (data || []).find(
        (p) => String(p.project_id) === String(projectId),
      );
      if (proj) {
        setProjectName(proj.project_name || "");
        setProjectOwnerId(proj.created_by_id);
      }
    } catch (e) {
      console.error("Failed to load project name", e);
    }
  };

  // New: create estimation with optional name (auto default) and mandatory region
  const createEstimationWithDefault = async (e) => {
    e.preventDefault();
    if (!selectedRegion) {
      setCreateError("Region should not be empty");
      return;
    }
    if (!selectedWorkTypes.length) {
      setCreateError("Select at least one work type");
      return;
    }
    const defaultName = `Estimation #${(estimations?.length || 0) + 1}`;
    const estimationNameToSend =
      name && name.trim() ? name.trim() : defaultName;
    try {
      const validGeoPoints = (geo.points || [])
        .filter((point) => point.latitude !== "" && point.longitude !== "")
        .map((point, index) => ({
          seq: index,
          latitude: point.latitude,
          longitude: point.longitude,
          label: point.label || null,
        }));
      const created = await createEstimation(projectId, {
        estimation_name: estimationNameToSend,
        work_type_codes: selectedWorkTypes,
        // Region used to live only in localStorage, so the server had no idea
        // which zone an estimation priced against.
        region: selectedRegion,
        rate_year: rateYear ? parseInt(rateYear, 10) : null,
        geometry_kind: validGeoPoints.length ? geo.geometry_kind : null,
        geo_points: validGeoPoints,
      });
      try {
        localStorage.setItem(
          `estimationRegion:${created.estimation_id}`,
          selectedRegion,
        );
        localStorage.setItem(
          `estimationName:${created.estimation_id}`,
          estimationNameToSend,
        );
      } catch {}
      setName("");
      setCreateError("");
      setSelectedWorkTypes([]);
      setRateYear("");
      setGeo({ geometry_kind: "point", points: [] });
      setIsCreateEstimationModalOpen(false);
      fetchEstimations();
    } catch (err) {
      setCreateError(
        err?.response?.data?.detail || "Failed to create estimation",
      );
    }
  };

  // Key handling for Create Estimation modal: Esc closes, Enter submits
  useEffect(() => {
    if (!isCreateEstimationModalOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        setIsCreateEstimationModalOpen(false);
      } else if (e.key === "Enter") {
        // Enter inside the map panel edits coordinates; it must not submit.
        if (document.activeElement?.closest("[data-gps-panel]")) return;
        const form = document.getElementById("create-estimation-form");
        if (form) {
          e.preventDefault();
          if (form.requestSubmit) form.requestSubmit();
          else form.submit();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isCreateEstimationModalOpen]);

  // Key handling for Delete Confirmation modal: Esc closes, Enter confirms delete
  useEffect(() => {
    if (!isDeleteConfirmOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        setIsDeleteConfirmOpen(false);
        setEstimationToDelete(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (estimationToDelete) {
          (async () => {
            try {
              await deleteEstimation(estimationToDelete.id);
              setIsDeleteConfirmOpen(false);
              setEstimationToDelete(null);
              fetchEstimations();
            } catch (err) {
              console.error("Failed to delete estimation", err);
            }
          })();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDeleteConfirmOpen, estimationToDelete]);

  // Removed the duplicate createEstimation function that was using raw axios
  /* 
  const createEstimation = async (e) => {
    ...
  }; 
  */

  const openDeleteConfirm = (id, name) => {
    setEstimationToDelete({ id, name });
    setIsDeleteConfirmOpen(true);
  };
  const confirmDeleteEstimation = async () => {
    if (!estimationToDelete) return;
    try {
      await deleteEstimation(estimationToDelete.id);
      setIsDeleteConfirmOpen(false);
      setEstimationToDelete(null);
      fetchEstimations();
    } catch (err) {
      console.error("Failed to delete estimation", err);
    }
  };
  const cancelDeleteEstimation = () => {
    setIsDeleteConfirmOpen(false);
    setEstimationToDelete(null);
  };

  const openEditEstimation = (es) => {
    setEditEstimationId(es.estimation_id);
    const currentRegion =
      es.region ||
      localStorage.getItem(`estimationRegion:${es.estimation_id}`) ||
      "";
    setEditRegion(currentRegion);
    setEditName(es.estimation_name || "");
    setEditError("");
    setIsEditEstimationModalOpen(true);
  };

  const submitEditEstimation = async (e) => {
    e.preventDefault();
    if (!editRegion) {
      setEditError("Region should not be empty");
      return;
    }
    try {
      await updateEstimation(editEstimationId, {
        estimation_name: editName || `Estimation #${editEstimationId}`,
        region: editRegion,
      });
      try {
        localStorage.setItem(
          `estimationRegion:${editEstimationId}`,
          editRegion,
        );
        if (editName)
          localStorage.setItem(`estimationName:${editEstimationId}`, editName);
      } catch {}
      setIsEditEstimationModalOpen(false);
      setEditEstimationId(null);
      setEditName("");
      setEditRegion("");
      setEditError("");
      fetchEstimations();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to update estimation";
      setEditError(msg);
    }
  };

  return (
    <div className="relative bg-white p-4 sm:p-6 -mx-6 -mb-6 w-[calc(100%+3rem)]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">
          Estimations for Project : {projectName || `#${projectId}`}
        </h2>
        {(isAdmin || projectOwnerId === user?.user_id) && (
          <button
            onClick={() => {
              setIsCreateEstimationModalOpen(true);
              setCreateError("");
              setSelectedRegion("");
              setSelectedWorkTypes([]);
            }}
            className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-extralight py-1 px-4 rounded inline-flex items-center gap-1"
          >
            <FaPlus className="w-3 h-3" />
            <span>Create Estimation</span>
          </button>
        )}
      </div>

      {isCreateEstimationModalOpen && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto z-50 relative border border-gray-200">
            <button
              onClick={() => setIsCreateEstimationModalOpen(false)}
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
            <h2 className="text-lg sm:text-xl font-semibold mb-2 text-gray-900">
              Create Estimation
            </h2>
            <p className="text-xs text-gray-600 mb-3">
              Name is optional. Region and work type are required; the rate year
              and map are optional.
            </p>
            {createError && (
              <p className="mb-3 text-sm text-red-600">{createError}</p>
            )}
            <form
              id="create-estimation-form"
              onSubmit={createEstimationWithDefault}
              className="grid grid-cols-1 gap-3 mt-2"
            >
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (createError && e.target.value.trim()) setCreateError("");
                }}
                placeholder="Estimation name"
                className="border border-gray-300 focus:ring-teal-500 p-3 rounded-lg w-full focus:outline-none focus:ring-2 text-sm"
              />
              <select
                value={selectedRegion}
                onChange={(e) => {
                  setSelectedRegion(e.target.value);
                  if (createError && e.target.value) setCreateError("");
                }}
                className={`border ${createError && !selectedRegion ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-teal-500"} p-3 rounded-lg w-full focus:outline-none focus:ring-2 text-sm`}
              >
                {regions.length === 0 ? (
                  <option value="">Loading regions…</option>
                ) : (
                  <>
                    <option value="">Select Region</option>
                    {regions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </>
                )}
              </select>

              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">
                  Work type(s) — at least one
                </p>
                <div
                  className={`flex flex-wrap gap-3 p-2 rounded-lg border ${createError && !selectedWorkTypes.length ? "border-red-500" : "border-gray-200"}`}
                >
                  {workTypes.length === 0 ? (
                    <span className="text-xs text-gray-500">
                      Loading work types…
                    </span>
                  ) : (
                    workTypes.map((wt) => (
                      <label
                        key={wt.code}
                        className="inline-flex items-center gap-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedWorkTypes.includes(wt.code)}
                          onChange={() => {
                            toggleWorkType(wt.code, setSelectedWorkTypes);
                            if (createError) setCreateError("");
                          }}
                          className="accent-teal-600"
                        />
                        {wt.label}
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label
                  className="block text-xs font-medium text-gray-700 mb-1"
                  htmlFor="new-est-rate-year"
                >
                  Rate year
                </label>
                <input
                  id="new-est-rate-year"
                  type="number"
                  min="2000"
                  max="2100"
                  value={rateYear}
                  onChange={(e) => setRateYear(e.target.value)}
                  placeholder="Newest available"
                  className="border border-gray-300 focus:ring-teal-500 p-3 rounded-lg w-full focus:outline-none focus:ring-2 text-sm"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Which year&apos;s item-master rates this estimation prices
                  against.
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">
                  Location / alignment (optional)
                </p>
                <GpsInput value={geo} onChange={setGeo} />
              </div>

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateEstimationModalOpen(false)}
                  className="bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 font-semibold py-1 px-3 rounded shadow-sm text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-teal-700 hover:bg-teal-900 text-white font-medium py-1 px-3 rounded inline-flex items-center gap-1 text-xs"
                  disabled={!selectedRegion || !selectedWorkTypes.length}
                >
                  <FaPlus className="w-3 h-3" />
                  <span>Create</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md z-50 relative border border-gray-200">
            <button
              onClick={cancelDeleteEstimation}
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
            <h2 className="text-lg sm:text-xl font-semibold mb-2 text-gray-900">
              Delete Estimation
            </h2>
            <p className="text-sm text-gray-700 mb-4">
              Are you sure you want to delete
              <span className="font-semibold">
                {" "}
                {estimationToDelete?.name ||
                  `Estimation #${estimationToDelete?.id}`}{" "}
              </span>
              ?
            </p>
            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelDeleteEstimation}
                className="bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 font-semibold py-1 px-3 rounded shadow-sm text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteEstimation}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-1 px-3 rounded inline-flex items-center gap-1 text-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditEstimationModalOpen && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-xl z-50 relative border border-gray-200">
            <button
              onClick={() => setIsEditEstimationModalOpen(false)}
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
            <h2 className="text-lg sm:text-xl font-semibold mb-2 text-gray-900">
              Edit Estimation
            </h2>
            <p className="text-xs text-gray-600 mb-3">
              Update estimation name (optional) and Region (mandatory).
            </p>
            {editError && (
              <p className="mb-3 text-sm text-red-600">{editError}</p>
            )}
            <form
              onSubmit={submitEditEstimation}
              className="grid grid-cols-1 gap-3 mt-2"
            >
              <input
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value);
                  if (editError && e.target.value.trim()) setEditError("");
                }}
                placeholder="Estimation name"
                className="border border-gray-300 focus:ring-teal-500 p-3 rounded-lg w-full focus:outline-none focus:ring-2 text-sm"
              />
              <select
                value={editRegion}
                onChange={(e) => {
                  setEditRegion(e.target.value);
                  if (editError && e.target.value) setEditError("");
                }}
                className={`border ${editError && !editRegion ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-teal-500"} p-3 rounded-lg w-full focus:outline-none focus:ring-2 text-sm`}
              >
                {regions.length === 0 ? (
                  <option value="">Loading regions…</option>
                ) : (
                  <>
                    <option value="">Select Region</option>
                    {regions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </>
                )}
              </select>
              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditEstimationModalOpen(false)}
                  className="bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 font-semibold py-1 px-3 rounded shadow-sm text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-teal-700 hover:bg-teal-900 text-white font-medium py-1 px-3 rounded inline-flex items-center gap-1 text-xs"
                  disabled={!editRegion}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table replacing card layout, mirroring the Projects table style */}
      <div className="border rounded-md overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="w-10 px-2 py-2 text-center border-r border-gray-200"></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 whitespace-nowrap">
                  Estimation Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 whitespace-nowrap">
                  Region
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 whitespace-nowrap">
                  Created By
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 whitespace-nowrap">
                  Created At
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 whitespace-nowrap">
                  Updated By
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 whitespace-nowrap">
                  Updated At
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {estimations.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-sm text-gray-600"
                  >
                    No estimations found
                  </td>
                </tr>
              ) : (
                estimations.map((es, i) => {
                  const isSelected = selectedEstimationIds.includes(
                    es.estimation_id,
                  );
                  return (
                    <tr
                      key={es.estimation_id}
                      className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-teal-50 transition-colors ${isSelected ? "bg-teal-100" : ""}`}
                    >
                      <td className="px-2 py-2 text-center border-r border-gray-200">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() =>
                            toggleSelectEstimation(es.estimation_id)
                          }
                          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-teal-700 font-medium whitespace-nowrap">
                        <Link
                          to={`/estimations/${es.estimation_id}?region=${encodeURIComponent(es.region || localStorage.getItem(`estimationRegion:${es.estimation_id}`) || "")}`}
                          className="hover:underline"
                        >
                          {es.estimation_name ||
                            `Estimation #${es.estimation_id}`}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-800 whitespace-nowrap">
                        {es.region ||
                          localStorage.getItem(
                            `estimationRegion:${es.estimation_id}`,
                          ) ||
                          "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-800 whitespace-nowrap">
                        {formatUser(es.created_by, es.created_by_id)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-800 whitespace-nowrap">
                        {formatDate(es.created_at)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-800 whitespace-nowrap">
                        {formatUser(es.updated_by, es.updated_by_id)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-800 whitespace-nowrap">
                        {formatDate(es.updated_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selection Bar */}
      {selectedEstimationIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white px-6 py-3 flex items-center gap-6 z-50 shadow-lg animate-slide-up">
          <div className="text-sm font-medium border-r border-gray-700 pr-6">
            {selectedEstimationIds.length} selected item(s)
          </div>
          <div className="flex items-center gap-3">
            {(isAdmin ||
              (selectedEstimationIds.length === 1 &&
                estimations.find(
                  (e) => e.estimation_id === selectedEstimationIds[0],
                )?.created_by_id === user?.user_id)) && (
              <>
                <button
                  onClick={handleDeleteEstimation}
                  className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800 rounded border border-gray-700 text-red-400 text-sm ${selectedEstimationIds.length !== 1 ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={selectedEstimationIds.length !== 1}
                >
                  <FaTrash className="w-3 h-3" /> Delete
                </button>
                <button
                  onClick={handleEditEstimation}
                  className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800 rounded border border-gray-700 text-sm ${selectedEstimationIds.length !== 1 ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={selectedEstimationIds.length !== 1}
                >
                  <FaEdit className="w-3 h-3" /> Edit
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
