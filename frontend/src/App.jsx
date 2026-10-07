import React, { useState, useEffect, useRef } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import { User, LogOut } from "lucide-react";
import { AuthProvider, useAuth } from "./hooks/useAuth.js";
import { ToastProvider } from "./components/ui/Toast.jsx";
import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import LoginPage from "./pages/Auth/LoginPage.jsx";
import AcceptInvitePage from "./pages/Auth/AcceptInvitePage.jsx";
import ItemMasterPage from "./pages/ItemMaster/ItemMasterPage.jsx";
import Projects from "./pages/Projects.jsx";
import ProjectEstimations from "./pages/ProjectEstimations.jsx";
import EstimationDetail from "./pages/EstimationDetail.jsx";
import SpecialItems from "./pages/SpecialItems.jsx";
import UserManagerPage from "./pages/Admin/UserManagerPage.jsx";
import NotificationsPage from "./pages/Admin/NotificationsPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import { WorkProvider } from "./context/WorkContext.jsx";
import {
  WorkMenuProvider,
  useWorkMenuItems,
} from "./context/WorkMenuContext.jsx";
import WorkHeaderControls from "./components/works/WorkHeaderControls.jsx";
import ContextMenuProvider from "./components/menu/ContextMenuProvider.jsx";

function GlobalContextMenu({ children }) {
  const { menuItems } = useWorkMenuItems();
  return (
    <ContextMenuProvider globalItems={menuItems}>
      {children}
    </ContextMenuProvider>
  );
}

function AppContent() {
  const { user, logout, hasRole } = useAuth();
  const [isLauncherOpen, setIsLauncherOpen] = useState(false);
  const launcherRef = useRef(null);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileRef]);

  useEffect(() => {
    if (!isLauncherOpen) return;

    const container = launcherRef.current;
    if (container) {
      const focusables = container.querySelectorAll(
        'a, button, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length > 0) {
        // Focus the first actionable element for accessibility
        const firstEl = focusables[0];
        if (firstEl && typeof firstEl.focus === "function") firstEl.focus();
      }
    }

    const onKeyDown = (e) => {
      if (!launcherRef.current) return;
      const focusables = launcherRef.current.querySelectorAll(
        'a, button, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.key === "Escape") {
        e.preventDefault();
        setIsLauncherOpen(false);
        return;
      }
      if (e.key === "Tab" && focusables.length > 0) {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last && last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first && first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isLauncherOpen]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />

      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <WorkProvider>
              <WorkMenuProvider>
                <GlobalContextMenu>
                  <div className="flex flex-col h-screen overflow-hidden">
                    <header className="bg-teal-900 px-4 py-2 flex items-center justify-between flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsLauncherOpen(true)}
                          className="p-1 rounded hover:bg-teal-800 focus:outline-none"
                          aria-label="Open menu"
                          title="Menu"
                        >
                          <div className="grid grid-cols-3 gap-0.5">
                            <span className="w-1 h-1 bg-white/90 rounded-full"></span>
                            <span className="w-1 h-1 bg-white/90 rounded-full"></span>
                            <span className="w-1 h-1 bg-white/90 rounded-full"></span>
                            <span className="w-1 h-1 bg-white/90 rounded-full"></span>
                            <span className="w-1 h-1 bg-white/90 rounded-full"></span>
                            <span className="w-1 h-1 bg-white/90 rounded-full"></span>
                            <span className="w-1 h-1 bg-white/90 rounded-full"></span>
                            <span className="w-1 h-1 bg-white/90 rounded-full"></span>
                            <span className="w-1 h-1 bg-white/90 rounded-full"></span>
                          </div>
                        </button>
                        <div className="flex items-baseline gap-2 whitespace-nowrap leading-tight">
                          <h1 className="text-sm font-bold text-white">
                            RHD-CES
                          </h1>
                          <span className="hidden text-xs text-white/80 lg:inline">
                            Cost Estimation System
                          </span>
                        </div>
                        <WorkHeaderControls />
                      </div>
                      {/* Right-corner navigation */}
                      <nav className="flex items-center gap-2">
                        {/* On small screens these live in the Menu drawer instead. */}
                        <div className="hidden items-center gap-2 md:flex">
                          <Link
                            to="/item-master"
                            className="text-xs px-3 py-1 rounded text-white hover:bg-teal-800 focus:outline-none focus:ring-1 focus:ring-white/60"
                          >
                            Item Master
                          </Link>
                          <Link
                            to="/projects"
                            className="text-xs px-3 py-1 rounded text-white hover:bg-teal-800 focus:outline-none focus:ring-1 focus:ring-white/60"
                          >
                            Projects
                          </Link>
                          {(hasRole("admin") || hasRole("superadmin")) && (
                            <Link
                              to="/admin/notifications"
                              className="text-xs px-3 py-1 rounded text-white hover:bg-teal-800 focus:outline-none focus:ring-1 focus:ring-white/60"
                            >
                              Notifications
                            </Link>
                          )}
                          {(hasRole("admin") || hasRole("superadmin")) && (
                            <Link
                              to="/admin/users"
                              className="text-xs px-3 py-1 rounded text-white hover:bg-teal-800 focus:outline-none focus:ring-1 focus:ring-white/60"
                            >
                              Users
                            </Link>
                          )}
                        </div>
                        <div className="relative" ref={profileRef}>
                          <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="w-10 h-10 rounded-full bg-teal-800 flex items-center justify-center text-white hover:bg-teal-700 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm"
                            aria-label="Profile menu"
                          >
                            {user?.username ? (
                              <span className="font-semibold text-sm">
                                {user.username.charAt(0).toUpperCase()}
                              </span>
                            ) : (
                              <User size={20} />
                            )}
                          </button>

                          {isProfileOpen && (
                            <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl py-2 text-gray-800 z-50 animate-in fade-in zoom-in-95 duration-200 border border-gray-100 ring-1 ring-black/5">
                              <div className="px-4 py-3 border-b border-gray-100 mb-1 mx-2 shadow-sm rounded-lg bg-gray-50/50">
                                <p className="font-semibold text-gray-900">
                                  {user?.username || "User"}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                  {user?.email || "No email"}
                                </p>
                              </div>

                              <Link
                                to="/profile"
                                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-gray-700 mx-2 rounded-lg group"
                                onClick={() => setIsProfileOpen(false)}
                              >
                                <div className="w-9 h-9 rounded-full bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
                                  <User size={20} className="text-gray-600" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-medium text-sm">
                                    Profile
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    View your profile
                                  </span>
                                </div>
                              </Link>

                              <button
                                onClick={() => {
                                  logout();
                                  setIsProfileOpen(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left text-gray-700 mx-2 rounded-lg group"
                              >
                                <div className="w-9 h-9 rounded-full bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
                                  <LogOut size={20} className="text-gray-600" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-medium text-sm">
                                    Log Out
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    Sign out of your account
                                  </span>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                      </nav>
                    </header>
                    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-6">
                      <Routes>
                        <Route
                          path="/"
                          element={<Navigate to="/projects" replace />}
                        />
                        <Route
                          path="/item-master"
                          element={<ItemMasterPage />}
                        />
                        <Route
                          path="/products"
                          element={<Navigate to="/item-master" replace />}
                        />
                        <Route path="/projects" element={<Projects />} />
                        <Route
                          path="/projects/:projectId/estimations"
                          element={<ProjectEstimations />}
                        />
                        <Route
                          path="/estimations/:estimationId"
                          element={<EstimationDetail />}
                        />
                        <Route
                          path="/estimations/:estimationId/special-items"
                          element={<SpecialItems />}
                        />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route
                          path="/admin/notifications"
                          element={
                            <ProtectedRoute>
                              <NotificationsPage />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/admin/users"
                          element={
                            <ProtectedRoute
                              requiredRole={["admin", "superadmin"]}
                            >
                              <UserManagerPage />
                            </ProtectedRoute>
                          }
                        />
                      </Routes>
                    </div>

                    {isLauncherOpen && (
                      <div
                        className="fixed inset-0 z-50"
                        role="dialog"
                        aria-modal="true"
                      >
                        <div
                          className="absolute inset-0 bg-black/30"
                          onClick={() => setIsLauncherOpen(false)}
                        />
                        <aside
                          ref={launcherRef}
                          className="absolute top-0 left-0 h-full w-64 bg-teal-900 text-white shadow-lg p-4"
                        >
                          <div className="leading-tight mb-3">
                            <div className="text-sm font-bold text-white">
                              RHD-CES
                            </div>
                            <div className="text-xs text-white/80">
                              Cost Estimation System
                            </div>
                          </div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="font-semibold">Menu</span>
                            <button
                              onClick={() => setIsLauncherOpen(false)}
                              className="p-2 rounded hover:bg-teal-800"
                              aria-label="Close menu"
                              title="Close"
                            >
                              ×
                            </button>
                          </div>
                          <nav className="flex flex-col gap-2">
                            <Link
                              to="/item-master"
                              className="px-3 py-2 rounded hover:bg-teal-800"
                              onClick={() => setIsLauncherOpen(false)}
                            >
                              Item Master
                            </Link>
                            <Link
                              to="/projects"
                              className="px-3 py-2 rounded hover:bg-teal-800"
                              onClick={() => setIsLauncherOpen(false)}
                            >
                              Projects
                            </Link>
                            {(hasRole("admin") || hasRole("superadmin")) && (
                              <Link
                                to="/admin/notifications"
                                className="px-3 py-2 rounded hover:bg-teal-800"
                                onClick={() => setIsLauncherOpen(false)}
                              >
                                Notifications
                              </Link>
                            )}
                            {(hasRole("admin") || hasRole("superadmin")) && (
                              <Link
                                to="/admin/users"
                                className="px-3 py-2 rounded hover:bg-teal-800"
                                onClick={() => setIsLauncherOpen(false)}
                              >
                                Users
                              </Link>
                            )}
                            <Link
                              to="/profile"
                              className="px-3 py-2 rounded hover:bg-teal-800"
                              onClick={() => setIsLauncherOpen(false)}
                            >
                              Profile
                            </Link>
                            <button
                              onClick={() => {
                                setIsLauncherOpen(false);
                                logout();
                              }}
                              className="text-left px-3 py-2 rounded hover:bg-teal-800"
                            >
                              Logout
                            </button>
                          </nav>
                        </aside>
                      </div>
                    )}
                  </div>
                </GlobalContextMenu>
              </WorkMenuProvider>
            </WorkProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
