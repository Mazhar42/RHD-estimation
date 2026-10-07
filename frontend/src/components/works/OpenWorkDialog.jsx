import React, { useEffect, useMemo, useState } from "react";
import { listWorks } from "../../api/works";
import Modal from "../ui/Modal.jsx";

export default function OpenWorkDialog({ open, onClose, onOpenWork }) {
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    listWorks()
      .then((items) => setWorks(items || []))
      .catch((loadError) =>
        setError(loadError?.response?.data?.detail || "Failed to load works."),
      )
      .finally(() => setLoading(false));
  }, [open]);

  const filteredWorks = useMemo(() => {
    if (!query.trim()) return works;
    const term = query.trim().toLowerCase();
    return works.filter((work) =>
      [work.name_id, work.project_name, work.client_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [query, works]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Open Work"
      maxWidthClassName="max-w-3xl"
    >
      <div className="space-y-4 px-6 py-5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search works"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200">
          {loading ? (
            <div className="px-4 py-6 text-sm text-gray-500">
              Loading works…
            </div>
          ) : filteredWorks.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500">
              No works found.
            </div>
          ) : (
            filteredWorks.map((work) => {
              const isArchived = work.status === "archived";
              return (
                <button
                  key={work.project_id}
                  type="button"
                  disabled={isArchived}
                  onClick={async () => {
                    if (isArchived) return;
                    await onOpenWork(work.project_id);
                    onClose();
                  }}
                  className={`flex w-full items-start justify-between border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${isArchived ? "cursor-not-allowed opacity-60 hover:bg-transparent" : ""}`}
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {work.name_id}
                    </div>
                    <div className="text-sm text-gray-600">
                      {work.project_name}
                    </div>
                    {work.client_name && (
                      <div className="text-xs text-gray-500">
                        {work.client_name}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    {isArchived ? (
                      <>
                        <div>
                          Deleted
                          {work.purged_at
                            ? ` ${new Date(work.purged_at).toLocaleDateString()}`
                            : ""}
                        </div>
                        <div>
                          {work.archived_line_count ?? 0} lines · ৳
                          {Number(work.archived_total || 0).toLocaleString(
                            "en-US",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div>Active</div>
                        {work.expires_at && (
                          <div>
                            Expires{" "}
                            {new Date(work.expires_at).toLocaleDateString()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
