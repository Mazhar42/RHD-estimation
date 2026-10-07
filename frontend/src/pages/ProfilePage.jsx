import React from "react";
import { useAuth } from "../hooks/useAuth.js";

export default function ProfilePage() {
  const { user, logout } = useAuth();

  return (
    <div className="max-w-2xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-600">Username</div>
          <div className="text-sm text-gray-900">{user?.username || "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Email</div>
          <div className="text-sm text-gray-900">{user?.email || "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Full Name</div>
          <div className="text-sm text-gray-900">{user?.full_name || "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Roles</div>
          <div className="text-sm text-gray-900">
            {(user?.roles || []).map((r) => r.name).join(", ") || "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-600">Status</div>
          <div className="text-sm text-gray-900">{user?.is_active ? "Active" : "Inactive"}</div>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={logout}
          className="bg-teal-700 hover:bg-teal-900 text-white text-sm font-medium px-4 py-2 rounded"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
