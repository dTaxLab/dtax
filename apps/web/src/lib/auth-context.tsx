"use client";

/**
 * 认证上下文
 * 管理 JWT token 和用户状态，提供 login/register/logout 方法。
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { trackEvent, identifyUser, resetAnalytics } from "@/lib/analytics";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const TOKEN_KEY = "dtax_token";

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  requiresTwoFactor: boolean;
  tempToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  verifyTwoFactor: (totpToken?: string, recoveryCode?: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Schedule a token refresh before it expires */
  const scheduleRefresh = useCallback((jwt: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      const expiresAt = payload.exp * 1000;
      // Refresh 5 minutes before expiry (or immediately if < 5 min left)
      const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, 0);

      refreshTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
            method: "POST",
            headers: { Authorization: `Bearer ${jwt}` },
          });
          if (res.ok) {
            const data = await res.json();
            const newToken = data.data.token;
            localStorage.setItem(TOKEN_KEY, newToken);
            setToken(newToken);
            scheduleRefresh(newToken);
          } else {
            // Refresh failed — force logout
            localStorage.removeItem(TOKEN_KEY);
            setToken(null);
            setUser(null);
          }
        } catch {
          // Network error — will retry on next page load
        }
      }, refreshIn);
    } catch {
      // Invalid token format — skip scheduling
    }
  }, []);

  // 启动时从 localStorage 恢复 token
  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      scheduleRefresh(stored);
      fetchMe(stored).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh]);

  async function fetchMe(jwt: string) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.data);
      } else {
        // token 无效，清除
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
    }
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: { message: "Login failed" } }));
      throw new Error(err.error?.message || "Login failed");
    }

    const data = await res.json();

    // Check if 2FA is required
    if (data.data.requiresTwoFactor) {
      setTempToken(data.data.tempToken);
      setRequiresTwoFactor(true);
      return;
    }

    localStorage.setItem(TOKEN_KEY, data.data.token);
    setToken(data.data.token);
    setUser(data.data.user);
    scheduleRefresh(data.data.token);
    trackEvent("login");
    identifyUser(data.data.user.id);
  }

  async function verifyTwoFactor(totpToken?: string, recoveryCode?: string) {
    if (!tempToken) throw new Error("No pending 2FA session");

    const res = await fetch(`${API_BASE}/api/v1/auth/login/2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tempToken, totpToken, recoveryCode }),
    });

    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: { message: "2FA verification failed" } }));
      throw new Error(err.error?.message || "2FA verification failed");
    }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.data.token);
    setToken(data.data.token);
    setUser(data.data.user);
    setRequiresTwoFactor(false);
    setTempToken(null);
    scheduleRefresh(data.data.token);
    trackEvent("login", { method: "2fa" });
    identifyUser(data.data.user.id);
  }

  async function register(email: string, password: string, name?: string) {
    const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: { message: "Registration failed" } }));
      throw new Error(err.error?.message || "Registration failed");
    }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.data.token);
    setToken(data.data.token);
    setUser(data.data.user);
    scheduleRefresh(data.data.token);
    trackEvent("signup", { method: "email" });
    identifyUser(data.data.user.id);
  }

  function logout() {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setRequiresTwoFactor(false);
    setTempToken(null);
    resetAnalytics();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        requiresTwoFactor,
        tempToken,
        login,
        verifyTwoFactor,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
