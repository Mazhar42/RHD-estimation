import React, { useEffect, useRef, useState } from "react";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteAttachment,
  fetchAttachmentBlob,
  listAttachments,
  uploadAttachment,
} from "../../api/attachments";
import { downloadAttachmentFile } from "../../utils/download";

const blobUrlCache = new Map();
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

const formatBytes = (value) => {
  if (!value && value !== 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageFile = (attachment) => attachment?.kind === "image";

function AttachmentThumbnail({ attachment }) {
  const [src, setSrc] = useState(
    blobUrlCache.get(attachment.attachment_id) || "",
  );
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;

    if (!isVisible || src) {
      return undefined;
    }

    const load = async () => {
      const blob = await fetchAttachmentBlob(attachment.attachment_id);
      const objectUrl = URL.createObjectURL(blob);
      blobUrlCache.set(attachment.attachment_id, objectUrl);
      if (active) {
        setSrc(objectUrl);
      }
    };

    load().catch(() => {
      if (active) {
        setSrc("");
      }
    });

    return () => {
      active = false;
    };
  }, [attachment.attachment_id, isVisible, src]);

  return (
    <div
      ref={containerRef}
      className="h-16 w-16 overflow-hidden rounded border border-gray-200 bg-gray-50"
    >
      {src ? (
        <img
          src={src}
          alt={attachment.filename}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-gray-400">
          <ImageIcon size={18} />
        </div>
      )}
    </div>
  );
}

export default function AttachmentPanel({
  ownerType,
  ownerId,
  readOnly = false,
}) {
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!ownerType || !ownerId) {
        setAttachments([]);
        return;
      }
      setIsLoading(true);
      setError("");
      try {
        const data = await listAttachments({ ownerType, ownerId });
        if (active) {
          setAttachments(data || []);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError?.response?.data?.detail || "Failed to load attachments.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [ownerId, ownerType]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("File exceeds the 10 MB limit.");
      return;
    }

    setUploadingName(file.name);
    setUploadProgress(0);
    setError("");

    try {
      const created = await uploadAttachment({
        ownerType,
        ownerId,
        file,
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size;
          if (!total) return;
          setUploadProgress(Math.round((progressEvent.loaded / total) * 100));
        },
      });
      setAttachments((current) =>
        [...current, created].sort((left, right) => {
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }
          return left.attachment_id - right.attachment_id;
        }),
      );
    } catch (uploadError) {
      setError(
        uploadError?.response?.data?.detail || "Failed to upload attachment.",
      );
    } finally {
      setUploadingName("");
      setUploadProgress(0);
      event.target.value = "";
    }
  };

  const handleDelete = async (attachmentId) => {
    try {
      await deleteAttachment(attachmentId);
      const objectUrl = blobUrlCache.get(attachmentId);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        blobUrlCache.delete(attachmentId);
      }
      setAttachments((current) =>
        current.filter(
          (attachment) => attachment.attachment_id !== attachmentId,
        ),
      );
    } catch (deleteError) {
      setError(
        deleteError?.response?.data?.detail || "Failed to delete attachment.",
      );
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Attachments</h3>
          <p className="text-xs text-gray-500">
            Upload images or documents up to 10 MB.
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700"
          >
            <Upload size={14} />
            Add File
          </button>
        )}
      </div>

      {!readOnly && (
        <input
          ref={fileInputRef}
          type="file"
          accept={`${IMAGE_EXTENSIONS.join(",")},.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv`}
          onChange={handleUpload}
          className="hidden"
        />
      )}

      {uploadingName && (
        <div className="mb-3 rounded-md bg-teal-50 px-3 py-2 text-xs text-teal-800">
          Uploading {uploadingName} ({uploadProgress}%)
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-6 text-center text-sm text-gray-500">
          Loading attachments…
        </div>
      ) : attachments.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          No attachments yet.
        </div>
      ) : (
        <div className="space-y-3">
          {attachments.map((attachment) => (
            <div
              key={attachment.attachment_id}
              className="flex items-center gap-3 rounded-md border border-gray-200 p-3"
            >
              {isImageFile(attachment) ? (
                <AttachmentThumbnail attachment={attachment} />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-400">
                  <FileText size={18} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-900">
                  {attachment.filename}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {attachment.content_type} ·{" "}
                  {formatBytes(attachment.byte_size)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadAttachmentFile(attachment)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                <Download size={14} />
                Download
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDelete(attachment.attachment_id)}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
