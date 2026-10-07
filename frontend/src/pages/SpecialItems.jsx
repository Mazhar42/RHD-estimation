import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FaPlus, FaPaperclip } from "react-icons/fa";
import {
  getEstimation,
  listElements,
  listSpecialItemRequests,
  approveSpecialItemRequest,
  rejectSpecialItemRequest,
  deleteSpecialItemRequest,
} from "../api/estimations";
import { useAuth } from "../hooks/useAuth.js";
import { useWork } from "../context/WorkContext";
import { downloadAttachmentFile } from "../utils/download";
import { elementLabel } from "../utils/elementLabel";
import SpecialItemModal from "./estimation/modals/SpecialItemModal.jsx";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const statusBadgeClass = (status) => {
  if (status === "approved") return "bg-green-100 text-green-700";
  if (status === "rejected") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
};

const formatAmount = (n) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

// Requests carry raw dimensions rather than a server-computed amount, so the
// page derives quantity/amount the same way the estimation lines do.
const derive = (req) => {
  const num = (v, fallback) => {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const quantity =
    req.quantity != null && req.quantity !== ""
      ? num(req.quantity, 0)
      : num(req.no_of_units, 1) *
        num(req.length, 1) *
        num(req.width, 1) *
        num(req.thickness, 1);
  return { quantity, amount: quantity * num(req.rate, 0) };
};

// Dedicated page for creating and reviewing Special Item Requests. These used
// to be a nested tab of the estimation screen; they now live here so the
// estimation screen only deals with item-master lines plus approved specials.
export default function SpecialItems() {
  const { estimationId } = useParams();
  const { hasRole, user } = useAuth();
  const { markDirty } = useWork();
  const isAdmin = hasRole("admin") || hasRole("superadmin");

  const [estimation, setEstimation] = useState(null);
  const [elements, setElements] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [workTypeFilter, setWorkTypeFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const canEdit =
    isAdmin || (estimation && estimation.created_by_id === user?.user_id);

  const region =
    localStorage.getItem(`estimationRegion:${estimationId}`) ||
    estimation?.region ||
    "";
  const estimationTitle =
    localStorage.getItem(`estimationName:${estimationId}`) ||
    estimation?.estimation_name ||
    `Estimation #${estimationId}`;

  const fetchRequests = async () => {
    try {
      setError("");
      const data = await listSpecialItemRequests(estimationId);
      setRequests(data || []);
    } catch (e) {
      setError(
        e?.response?.data?.detail || "Failed to load special item requests",
      );
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [est, els] = await Promise.all([
          getEstimation(estimationId),
          listElements(estimationId),
        ]);
        if (cancelled) return;
        setEstimation(est);
        setElements(els || []);
      } catch (e) {
        if (!cancelled) console.error("Failed to load estimation", e);
      }
      await fetchRequests();
      if (!cancelled) setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [estimationId]);

  const elementById = useMemo(() => {
    const map = new Map();
    elements.forEach((el) => map.set(el.element_id, el));
    return map;
  }, [elements]);

  const workTypes = estimation?.work_types || [];

  const visibleRequests = useMemo(() => {
    return requests.filter((req) => {
      if (
        statusFilter !== "all" &&
        (req.status || "pending") !== statusFilter
      ) {
        return false;
      }
      if (workTypeFilter !== "all") {
        const el =
          req.element_id != null ? elementById.get(req.element_id) : null;
        // Requests with no element aren't attributable to a work type, so they
        // only show under "All" rather than being silently hidden everywhere.
        if (!el || el.work_type !== workTypeFilter) return false;
      }
      return true;
    });
  }, [requests, statusFilter, workTypeFilter, elementById]);

  const counts = useMemo(() => {
    const acc = { all: requests.length, pending: 0, approved: 0, rejected: 0 };
    requests.forEach((r) => {
      const s = r.status || "pending";
      if (acc[s] != null) acc[s] += 1;
    });
    return acc;
  }, [requests]);

  const totals = useMemo(() => {
    const acc = { pending: 0, approved: 0, visible: 0 };
    requests.forEach((r) => {
      const { amount } = derive(r);
      const s = r.status || "pending";
      if (s === "pending") acc.pending += amount;
      if (s === "approved") acc.approved += amount;
    });
    visibleRequests.forEach((r) => {
      acc.visible += derive(r).amount;
    });
    return acc;
  }, [requests, visibleRequests]);

  const runAction = async (fn, successMessage) => {
    try {
      setError("");
      await fn();
      await fetchRequests();
      markDirty();
      setNotice(successMessage);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Action failed");
    }
  };

  const handleApprove = (req) =>
    runAction(
      () => approveSpecialItemRequest(req.request_id),
      "Special item approved and added to the estimation.",
    );

  const openReject = (req) => {
    setRejectingRequest(req);
    setRejectReason("");
  };

  const submitReject = () => {
    const req = rejectingRequest;
    if (!req) return;
    setRejectingRequest(null);
    runAction(
      () =>
        rejectSpecialItemRequest(
          req.request_id,
          rejectReason.trim() || "Rejected by reviewer",
        ),
      "Special item rejected. The requester can edit it and resubmit.",
    );
  };

  const handleDelete = (req) => {
    if (
      !window.confirm(
        `Delete special item "${req.item_description}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    runAction(
      () => deleteSpecialItemRequest(req.request_id),
      "Special item deleted.",
    );
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const openCreate = () => {
    setEditingRequest(null);
    setIsModalOpen(true);
  };

  const openEdit = (req) => {
    setEditingRequest(req);
    setIsModalOpen(true);
  };

  return (
    <div className="relative bg-white p-4 sm:p-6 -mx-6 -mb-6 w-[calc(100%+3rem)]">
      {/* Items / Special Items page tabs */}
      <div className="flex gap-1 -mt-1 mb-1">
        <Link
          to={`/estimations/${estimationId}${region ? `?region=${encodeURIComponent(region)}` : ""}`}
          className="px-4 py-1.5 text-sm font-semibold rounded-t-md bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          Items
        </Link>
        <span className="px-4 py-1.5 text-sm font-semibold rounded-t-md bg-teal-700 text-white">
          Special Items
        </span>
      </div>
      <div className="sticky top-0 z-30 bg-white mb-4 py-2 border-b border-gray-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              Special Items : {estimationTitle}
            </h2>
            <p className="text-xs text-gray-600 mt-0.5">
              Items outside the item master. Approved items are added to the
              estimation automatically.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-700">Region:</span>
              <span className="text-xs text-gray-900">{region || "—"}</span>
            </div>
            {canEdit && (
              <button
                onClick={openCreate}
                className="bg-teal-700 hover:bg-teal-900 text-white text-xs font-medium py-1 px-4 rounded inline-flex items-center gap-1"
              >
                <FaPlus className="w-3 h-3" />
                <span>New Special Item</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-md border border-red-300 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 p-3 rounded-md border border-emerald-300 bg-emerald-50 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {/* Status tabs */}
      <div className="flex border-b border-gray-200 mb-3">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-2 text-sm font-medium focus:outline-none ${statusFilter === f.key ? "text-teal-600 border-b-2 border-teal-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            {f.label}
            <span className="ml-1 text-[10px] text-gray-400">
              ({counts[f.key] ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* Work-type filter mirrors the estimation screen's tabs */}
      {workTypes.length > 0 && (
        <div className="flex items-center gap-2 mb-4 text-xs">
          <span className="text-gray-600">Work type:</span>
          <button
            onClick={() => setWorkTypeFilter("all")}
            className={`px-3 py-1 rounded-full border ${workTypeFilter === "all" ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            All
          </button>
          {workTypes.map((wt) => (
            <button
              key={wt.code}
              onClick={() => setWorkTypeFilter(wt.code)}
              className={`px-3 py-1 rounded-full border ${workTypeFilter === wt.code ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
            >
              {wt.label}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-auto max-h-[70vh] pr-2">
        {loading ? (
          <div className="text-sm text-gray-500 p-6">
            Loading special items…
          </div>
        ) : visibleRequests.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-10 text-center">
            <p className="text-sm text-gray-600">
              No special items
              {statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}.
            </p>
            {canEdit && (
              <button
                onClick={openCreate}
                className="mt-3 bg-teal-700 hover:bg-teal-900 text-white text-xs font-medium py-1 px-4 rounded inline-flex items-center gap-1"
              >
                <FaPlus className="w-3 h-3" />
                <span>New Special Item</span>
              </button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg border-gray-200 overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-100 border-b-2 border-gray-200">
                <tr>
                  {[
                    "Item Code",
                    "Description",
                    "Sub Desc",
                    "Element",
                    "No.",
                    "Length",
                    "Width",
                    "Thickness",
                    "Quantity",
                    "Rate",
                    "Unit",
                    "Amount",
                    "Attachment",
                    "Status",
                    "Requested By",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-2 py-1 text-left text-xs font-bold border-r text-gray-800 border-gray-200 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {visibleRequests.map((req, i) => {
                  const { quantity, amount } = derive(req);
                  const status = req.status || "pending";
                  const el =
                    req.element_id != null
                      ? elementById.get(req.element_id)
                      : null;
                  const attachment = req.attachments?.[0];
                  return (
                    <tr
                      key={req.request_id}
                      className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-teal-50 transition-colors`}
                    >
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200 whitespace-nowrap">
                        {req.item_code || "—"}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200 max-w-[280px] break-words">
                        {req.item_description}
                        {status === "rejected" && req.reason && (
                          <div className="text-[10px] text-red-600 mt-0.5">
                            Reason: {req.reason}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200">
                        {req.sub_description || "—"}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200 whitespace-nowrap">
                        {el ? elementLabel(el) : "—"}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200">
                        {req.no_of_units ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200">
                        {req.length ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200">
                        {req.width ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200">
                        {req.thickness ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200">
                        {quantity}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200">
                        {req.rate ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200">
                        {req.unit || "—"}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200 whitespace-nowrap">
                        {formatAmount(amount)}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200">
                        {attachment ? (
                          <button
                            type="button"
                            onClick={() =>
                              downloadAttachmentFile(attachment).catch((e) => {
                                console.error("Attachment download failed", e);
                                setError("Failed to download attachment.");
                              })
                            }
                            className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 underline"
                            title={attachment.filename}
                          >
                            <FaPaperclip className="w-3 h-3" />
                            <span className="truncate max-w-[110px]">
                              {attachment.filename}
                            </span>
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusBadgeClass(status)}`}
                        >
                          {status.toUpperCase()}
                        </span>
                        {(status === "approved" || status === "rejected") &&
                          req.reviewed_by?.username && (
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              by {req.reviewed_by.username}
                            </div>
                          )}
                        {status === "approved" && req.line_id == null && (
                          <div className="text-[10px] text-amber-600 mt-0.5">
                            line removed
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 text-xs border-r text-gray-800 border-gray-200 whitespace-nowrap">
                        {req.requested_by?.username || "—"}
                      </td>
                      <td className="px-2 py-1 text-xs text-gray-800 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {(status === "pending" || status === "rejected") &&
                            canEdit && (
                              <button
                                onClick={() => openEdit(req)}
                                className="bg-teal-600 hover:bg-teal-700 text-white px-2 py-0.5 rounded"
                              >
                                {status === "rejected"
                                  ? "Edit & Resubmit"
                                  : "Edit"}
                              </button>
                            )}
                          {status === "pending" && isAdmin && (
                            <>
                              <button
                                onClick={() => handleApprove(req)}
                                className="bg-green-600 hover:bg-green-700 text-white px-2 py-0.5 rounded"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => openReject(req)}
                                className="bg-orange-600 hover:bg-orange-700 text-white px-2 py-0.5 rounded"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {status !== "approved" && canEdit && (
                            <button
                              onClick={() => handleDelete(req)}
                              className="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded"
                            >
                              Delete
                            </button>
                          )}
                          {status === "approved" && (
                            <span className="text-[10px] text-gray-500">
                              {req.line_id == null
                                ? "master item kept"
                                : "In estimation"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && visibleRequests.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 mt-4 pb-4">
            <div className="inline-flex items-center gap-2 bg-yellow-50 text-yellow-900 border border-yellow-200 rounded-full px-3 py-1">
              <span className="text-xs font-medium">Pending total</span>
              <span className="text-xs font-semibold">
                {formatAmount(totals.pending)}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 bg-green-50 text-green-900 border border-green-200 rounded-full px-3 py-1">
              <span className="text-xs font-medium">
                Approved total (in estimation)
              </span>
              <span className="text-xs font-semibold">
                {formatAmount(totals.approved)}
              </span>
            </div>
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-900 border border-teal-200 rounded-lg px-4 py-2">
              <span className="text-sm font-semibold">Current view total</span>
              <span className="text-xl font-bold">
                {formatAmount(totals.visible)}
              </span>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <SpecialItemModal
          estimationId={estimationId}
          region={region}
          elements={elements}
          request={editingRequest}
          onClose={() => {
            setIsModalOpen(false);
            setEditingRequest(null);
          }}
          onSaved={() => {
            fetchRequests();
            markDirty();
          }}
        />
      )}

      {rejectingRequest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Reject special item
            </h3>
            <p className="text-xs text-gray-600 mb-3">
              {rejectingRequest.item_description}
            </p>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Reason (shown to the requester)
            </label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
              placeholder="e.g. rate looks too high — attach the source quote and resubmit"
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRejectingRequest(null)}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitReject}
                className="px-3 py-1.5 text-sm rounded bg-orange-600 text-white hover:bg-orange-700"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
