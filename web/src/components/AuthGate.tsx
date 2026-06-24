"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEffect, type ReactNode } from "react";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated && pathname !== "/login") {
      router.replace("/login");
    } else if (isAuthenticated && pathname === "/login") {
      router.replace("/");
    }
  }, [loading, isAuthenticated, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
          <p className="text-xs font-semibold text-slate-400 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && pathname !== "/login") return null;
  if (isAuthenticated && pathname === "/login") return null;

  return <>{children}</>;
}