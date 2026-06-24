"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEffect, type ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: "ADMIN" | "USER";
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-dark)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
          <p className="text-xs font-semibold text-slate-400 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (requiredRole && user?.role !== requiredRole && user?.role !== "ADMIN") {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}

function ForbiddenPage() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[var(--bg-dark)]">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
          <span className="text-2xl font-black text-red-500">403</span>
        </div>
        <h2 className="text-lg font-black text-slate-800 mb-1">Access Denied</h2>
        <p className="text-xs font-medium text-slate-500 mb-6">
          You don&apos;t have the required permissions to access this page. Contact your administrator.
        </p>
        <button
          onClick={() => (window.location.href = "/")}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-lg"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}