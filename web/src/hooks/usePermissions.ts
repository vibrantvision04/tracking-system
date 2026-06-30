"use client";

import { useState, useEffect, useCallback } from "react";
import { getStoredAccessToken } from "@/lib/api";

interface PermissionsResponse {
  success: boolean;
  data: string[];
}

interface UsePermissionsReturn {
  permissions: string[];
  loading: boolean;
  hasPermission: (permission: string) => boolean;
  isSuperAdmin: boolean;
}

/**
 * Hook to fetch and cache the current user's permissions.
 * Fetches from GET /api/rbac/me/permissions on mount (when authenticated).
 * Returns all permissions for Super_Admin (wildcard "*").
 * Items without a required permission are always visible (backwards compatible).
 */
export function usePermissions(): UsePermissionsReturn {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPermissions() {
      const token = getStoredAccessToken();
      if (!token) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      try {
        // Use skipAuth-style fetch to avoid triggering the 401→clearTokens→redirect cascade.
        // If this endpoint fails (user has no role, endpoint returns 401/403), we just
        // default to showing all menu items rather than logging the user out.
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
        const res = await fetch(`${API_URL}/api/rbac/me/permissions`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.success && Array.isArray(data.data)) {
            setPermissions(data.data);
          }
        }
        // If not ok (401, 403, 500, etc.) — silently fall through to empty permissions
        // Do NOT trigger logout or token clearing
      } catch {
        // Network error or other failure — default to showing all items
        if (!cancelled) {
          setPermissions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPermissions();

    return () => {
      cancelled = true;
    };
  }, []);

  const isSuperAdmin = permissions.includes("*");

  const hasPermission = useCallback(
    (permission: string): boolean => {
      // Super_Admin with wildcard has access to everything
      if (isSuperAdmin) return true;
      return permissions.includes(permission);
    },
    [permissions, isSuperAdmin]
  );

  return { permissions, loading, hasPermission, isSuperAdmin };
}
