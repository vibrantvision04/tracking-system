"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";

const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false });

export default function HomePage() {
  const { vehicles, loaded, loadAll } = useStore();

  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

  const loading = !loaded;

  const live = vehicles.filter((v) => v.status !== "offline").length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Topbar */}
      <header className="hidden md:flex h-14 bg-[var(--bg-card)] px-6 items-center justify-between border-b border-white/[.05] shrink-0">
        <h1 className="text-sm font-semibold tracking-tight">Live Tracking</h1>
        <div className="flex gap-4 text-xs text-slate-500">
          <span>Vehicles <b className="text-white">{vehicles.length}</b></span>
          <span>Live <b className="text-green-400">{live}</b></span>
        </div>
      </header>

      {/* Map */}
      <div className="flex-1 flex relative">
        {loading ? (
          <div className="flex items-center justify-center w-full h-full bg-[var(--bg-dark)]">
            <div className="text-slate-600 text-sm animate-pulse">Connecting to backend…</div>
          </div>
        ) : (
          <LiveMap vehicles={vehicles} />
        )}
      </div>
    </div>
  );
}
