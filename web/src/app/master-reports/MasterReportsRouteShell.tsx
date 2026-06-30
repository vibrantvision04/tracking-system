"use client";

import { usePermissions } from "@/hooks/usePermissions";
import MasterReportsPage from "./_components/MasterReportsPage";

/**
 * Client-side route shell for /master-reports.
 *
 * Responsibilities:
 *  1. Page-level permission gate on `reports.view` (Req 9.3, 9.4). Principals
 *     without the permission see an authorization error using the wording
 *     mandated by Req 1.7 ("no reports are accessible") and no Report_Definition
 *     metadata is exposed.
 *  2. Mounts `<MasterReportsPage>` — the client root that owns the four
 *     DOM-id'd regions from design §14.2 / §17 (task 19.2). Each region is
 *     filled in by tasks 19.3–19.8.
 */
export default function MasterReportsRouteShell() {
  const { hasPermission, loading } = usePermissions();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-theme-base">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
          <p className="text-xs font-semibold text-slate-400 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  if (!hasPermission("reports.view")) {
    return (
      <div
        role="alert"
        aria-labelledby="master-reports-access-denied-title"
        className="flex-1 flex items-center justify-center bg-theme-base"
      >
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
            <span className="text-2xl font-black text-red-500">403</span>
          </div>
          <h2
            id="master-reports-access-denied-title"
            className="text-lg font-black text-slate-800 mb-1"
          >
            Access Denied
          </h2>
          <p className="text-xs font-medium text-slate-500">
            No reports are accessible. Contact your administrator to request the
            <span className="font-mono"> reports.view </span>
            permission.
          </p>
        </div>
      </div>
    );
  }

  // Page-level gate passed — mount the real <MasterReportsPage> client root.
  return <MasterReportsPage />;
}
