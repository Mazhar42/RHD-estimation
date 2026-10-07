import axios from "axios";
import { writeFinished, writeStarted } from "./saveStatus";

// The API lives under /api on the app's own origin: the Vite dev proxy and
// the production reverse proxy both strip the prefix before the backend.
// Keeping API paths out of the root also stops them colliding with SPA
// routes like /estimations/5 on a page reload. VITE_API_URL overrides this
// for deployments where the API is on a different host.
const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 second default timeout for most requests
  withCredentials: true, // send/receive the httpOnly auth cookies
});

function readCookie(name) {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

const UNSAFE_METHODS = new Set(["post", "put", "patch", "delete"]);

// Writes other than sign-in/out feed the header's "Saving… / Saved"
// indicator. A 401 that gets retried after a token refresh finishes once,
// on the retry.
const isTrackedWrite = (config) =>
  UNSAFE_METHODS.has((config.method || "get").toLowerCase()) && !String(config.url || "").startsWith("/auth/");

function finishWrite(config, ok) {
  if (config?._saveTracked && !config._saveFinished) {
    config._saveFinished = true;
    writeFinished(ok);
  }
}

// Request interceptor: attach the CSRF header (double-submit cookie) on
// every state-changing request. Login/logout/refresh/invite-accept don't
// need it (they're not authenticated by the cookie being protected, or in
// the login/accept case there's no session yet) -- the backend only
// enforces it when the access-token cookie is actually present, so simply
// always attaching it when the csrf cookie exists is safe and simplest.
apiClient.interceptors.request.use(
  (config) => {
    const method = (config.method || "get").toLowerCase();
    if (UNSAFE_METHODS.has(method)) {
      const csrfToken = readCookie("csrf_token");
      if (csrfToken) {
        config.headers = config.headers || {};
        config.headers["X-CSRF-Token"] = csrfToken;
      }
    }
    if (!config._saveTracked && isTrackedWrite(config)) {
      config._saveTracked = true;
      writeStarted();
    }
    return config;
  },
  (error) => Promise.reject(error),
);

let refreshPromise = null;

function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post("/auth/refresh")
      .catch((err) => {
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Response interceptor: on a 401, try exactly one silent refresh (the
// access-token cookie is short-lived by design) before giving up and
// sending the user back to login.
apiClient.interceptors.response.use(
  (response) => {
    finishWrite(response.config, true);
    return response;
  },
  async (error) => {
    const { response, config } = error;
    const isAuthEndpoint = config?.url?.includes("/auth/login") || config?.url?.includes("/auth/refresh");

    if (response && response.status === 401 && config && !config._retried && !isAuthEndpoint) {
      config._retried = true;
      try {
        await refreshSession();
        return apiClient(config);
      } catch (refreshError) {
        finishWrite(config, false);
        console.warn("Session refresh failed - logging out...");
        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      }
    }

    finishWrite(config, false);
    return Promise.reject(error);
  },
);
