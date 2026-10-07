import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../api/auth";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // The session lives in an httpOnly cookie the app can't read directly, so
  // on mount we ask the server who (if anyone) it belongs to.
  useEffect(() => {
    let cancelled = false;
    authAPI
      .getMe()
      .then((res) => {
        if (!cancelled) setUser(res.data);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (username, password) => {
      setLoading(true);
      setError(null);
      try {
        const response = await authAPI.login(username, password);
        const userData = response.data.user;
        setUser(userData);
        navigate("/projects");
        return userData;
      } catch (err) {
        const errorMessage = err.response?.data?.detail || "Login failed";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [navigate],
  );

  const acceptInvite = useCallback(
    async (token, username, password, fullName = "") => {
      setLoading(true);
      setError(null);
      try {
        const response = await authAPI.acceptInvite(token, username, password, fullName);
        const userData = response.data.user;
        setUser(userData);
        navigate("/projects");
        return userData;
      } catch (err) {
        const errorMessage =
          err.response?.data?.detail || "Could not complete registration";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [navigate],
  );

  const logout = useCallback(() => {
    authAPI.logout().catch(() => {
      // Cookies may already be gone (expired session) -- clear local state
      // regardless so the UI doesn't get stuck.
    });
    setUser(null);
    setError(null);
    navigate("/login");
  }, [navigate]);

  const isAuthenticated = !!user;

  const hasRole = useCallback(
    (roleName) => {
      if (!user) return false;
      return user.roles?.some((role) => role.name === roleName) ?? false;
    },
    [user],
  );

  const hasPermission = useCallback(
    (permissionName) => {
      if (!user) return false;
      return (
        user.roles?.some((role) =>
          role.permissions?.some((perm) => perm.name === permissionName),
        ) ?? false
      );
    },
    [user],
  );

  const isSuperadmin = useCallback(() => {
    return hasRole("superadmin");
  }, [hasRole]);

  const value = {
    user,
    loading,
    isAuthenticated,
    error,
    setError,
    login,
    acceptInvite,
    logout,
    hasRole,
    hasPermission,
    isSuperadmin,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
