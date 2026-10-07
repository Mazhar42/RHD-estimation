import React, { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  listAllSpecialItemRequests,
  approveSpecialItemRequest,
  rejectSpecialItemRequest,
} from "../../api/estimations";
import { FaCheck, FaTimes, FaSpinner, FaDownload } from "react-icons/fa";
import { downloadAttachmentFile } from "../../utils/download";
import RetentionPurgePanel from "../../components/works/RetentionPurgePanel.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function NotificationsPage() {
  const { user, hasRole } = useAuth();
  const { showToast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'approve' | 'reject'
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");

  const deriveQty = (req) => {
    const n = (v, f) => {
      const p = parseFloat(v);
      return Number.isFinite(p) ? p : f;
    };
    if (req.quantity != null && req.quantity !== "") return n(req.quantity, 0);
    return (
      n(req.no_of_units, 1) *
      n(req.length, 1) *
      n(req.width, 1) *
      n(req.thickness, 1)
    );
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const dateStr = value.endsWith("Z") ? value : `${value}Z`;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "-";

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

  const filteredRequests = requests.filter((req) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (req.item_description &&
        req.item_description.toLowerCase().includes(s)) ||
      (req.item_code && req.item_code.toLowerCase().includes(s)) ||
      (req.division?.name && req.division.name.toLowerCase().includes(s)) ||
      (req.organization && req.organization.toLowerCase().includes(s)) ||
      (req.requested_by?.username &&
        req.requested_by.username.toLowerCase().includes(s))
    );
  });

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await listAllSpecialItemRequests(
        statusFilter === "all" ? undefined : statusFilter,
      );
      setRequests(res || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleOpenApproveModal = (req) => {
    setSelectedRequest(req);
    setModalType("approve");
    setIsModalOpen(true);
  };

  const handleOpenRejectModal = (req) => {
    setSelectedRequest(req);
    setModalType("reject");
    setRejectionReason("");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRequest(null);
    setModalType(null);
    setRejectionReason("");
  };

  const handleSubmitAction = async () => {
    if (!selectedRequest) return;
    const id = selectedRequest.request_id;

    try {
      setProcessingId(id);
      if (modalType === "approve") {
        await approveSpecialItemRequest(id);
      } else if (modalType === "reject") {
        await rejectSpecialItemRequest(
          id,
          rejectionReason.trim() || "No reason provided",
        );
      }
      handleCloseModal();
      await fetchRequests();
    } catch (err) {
      showToast(
        `Failed to ${modalType} request: ` +
          (err.response?.data?.detail || err.message),
        "error",
      );
    } finally {
      setProcessingId(null);
    }
  };

  const downloadAttachment = (req) => {
    const attachment = req.attachments?.[0];
    const action = attachment
      ? downloadAttachmentFile(attachment)
      : Promise.reject(new Error("Attachment metadata is missing."));

    action.catch(() => {
      showToast("Failed to download attachment.", "error");
    });
  };

  if (!hasRole("admin") && !hasRole("superadmin")) {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  return (
    <div className="bg-white p-4 sm:p-6 relative min-h-[600px] flex flex-col">
      {hasRole("superadmin") && <RetentionPurgePanel />}
      <div className="flex justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">
          Special Item Requests
        </h1>
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Search..."
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={fetchRequests}
            className="text-sm text-teal-600 hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-200 mb-4">
        {["pending", "approved", "rejected", "all"].map((key) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-4 py-2 text-sm font-medium capitalize focus:outline-none ${
              statusFilter === key
                ? "text-teal-600 border-b-2 border-teal-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <FaSpinner className="animate-spin text-teal-600 text-2xl" />
        </div>
      ) : error ? (
        <div className="text-red-600 bg-red-50 p-4 rounded">{error}</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
          No {statusFilter === "all" ? "" : `${statusFilter} `}requests found.
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm border-collapse table-fixed">
            <thead className="bg-blue-100 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[100px]">
                  Division
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[100px]">
                  Item Code
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[200px]">
                  Item Description
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[60px]">
                  No.
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[60px]">
                  Length
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[60px]">
                  Width
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[60px]">
                  Thickness
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[80px]">
                  Quantity
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[60px]">
                  Unit
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[80px]">
                  Rate
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[100px]">
                  Attachment
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[100px]">
                  Organization
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[100px]">
                  Submitted By
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[120px]">
                  Submitted At
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-800 border-r border-gray-200 min-w-[80px]">
                  Status
                </th>
                <th className="px-3 py-2 text-center text-xs font-bold text-gray-800 min-w-[120px]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredRequests.map((req) => (
                <tr
                  key={req.request_id}
                  className="hover:bg-blue-50 border-b border-gray-200"
                >
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.division?.name || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.item_code || "-"}
                  </td>
                  <td
                    className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate max-w-xs"
                    title={req.item_description}
                  >
                    {req.item_description}
                    {req.sub_description && (
                      <div className="text-[10px] text-gray-500 truncate">
                        {req.sub_description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.no_of_units || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.length || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.width || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.thickness || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {deriveQty(req) || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.unit || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.rate || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.attachments?.length ? (
                      <button
                        onClick={() => downloadAttachment(req)}
                        className="text-teal-600 hover:text-teal-800 flex items-center gap-1"
                      >
                        <FaDownload size={10} />{" "}
                        {req.attachments[0].filename.slice(0, 15)}
                        ...
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.organization || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {req.requested_by?.username || "Unknown"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-200 truncate">
                    {formatDate(req.created_at)}
                  </td>
                  <td className="px-3 py-2 text-xs border-r border-gray-200">
                    <span
                      className={`px-2 inline-flex text-[10px] leading-4 font-semibold rounded-full ${
                        req.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : req.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {req.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-medium border-l border-gray-200">
                    {req.status !== "pending" ? (
                      <span className="text-[10px] text-gray-400">
                        {req.reviewed_by?.username
                          ? `by ${req.reviewed_by.username}`
                          : "—"}
                      </span>
                    ) : (
                      <div className="flex justify-center gap-3">
                        <button
                          onClick={() => handleOpenApproveModal(req)}
                          disabled={processingId === req.request_id}
                          className="w-6 h-6 rounded-full border border-green-600 text-green-600 hover:bg-green-600 hover:text-white flex items-center justify-center transition-colors group relative"
                          title="Approve"
                        >
                          {processingId === req.request_id ? (
                            <FaSpinner className="animate-spin" />
                          ) : (
                            <FaCheck size={10} />
                          )}
                          <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            Approve
                          </span>
                        </button>
                        <button
                          onClick={() => handleOpenRejectModal(req)}
                          disabled={processingId === req.request_id}
                          className="w-6 h-6 rounded-full border border-red-600 text-red-600 hover:bg-red-600 hover:text-white flex items-center justify-center transition-colors group relative"
                          title="Reject"
                        >
                          {processingId === req.request_id ? (
                            <FaSpinner className="animate-spin" />
                          ) : (
                            <FaTimes size={10} />
                          )}
                          <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            Reject
                          </span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-gray-800">
              {modalType === "approve" ? "Approve Request" : "Reject Request"}
            </h2>

            {modalType === "approve" ? (
              <div className="mb-6">
                <p className="text-gray-700 mb-2">
                  Are you sure you want to approve this request?
                </p>
                <div className="bg-gray-50 p-3 rounded text-sm text-gray-600 border border-gray-200">
                  <div className="font-semibold">
                    {selectedRequest?.item_description}
                  </div>
                  <div>
                    Qty: {selectedRequest ? deriveQty(selectedRequest) : "-"} |
                    Rate: {selectedRequest?.rate}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  This item will be added to the item master.
                </p>
              </div>
            ) : (
              <div className="mb-6">
                <p className="text-gray-700 mb-2">
                  Please provide a reason for rejection:
                </p>
                <textarea
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  rows="3"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  autoFocus
                ></textarea>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium text-sm transition-colors"
                disabled={!!processingId}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAction}
                className={`px-4 py-2 text-white rounded-md flex items-center gap-2 font-medium text-sm transition-colors ${
                  modalType === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
                disabled={!!processingId}
              >
                {processingId ? (
                  <FaSpinner className="animate-spin" />
                ) : modalType === "approve" ? (
                  <FaCheck />
                ) : (
                  <FaTimes />
                )}
                {modalType === "approve" ? "Confirm Approve" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
