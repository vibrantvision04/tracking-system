"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";

const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false });

export default function VehicleLocationPage() {
  const vehicles = useStore((state) => state.vehicles);
  const loaded = useStore((state) => state.loaded);
  const loadAll = useStore((state) => state.loadAll);

  useEffect(() => {
    if (!loaded) {
      loadAll();
    }
  }, [loaded, loadAll]);

  const loading = !loaded;

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none">
      {/* Premium light-grey header bar matching dashboard */}
      <header className="h-16 bg-theme-surface px-6 flex items-center justify-between border-b border-theme-border shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-theme-accent text-white font-bold text-[13px] shadow-md shadow-emerald-500/20 shrink-0">
            VT
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-theme-text tracking-tight leading-none uppercase">
              Vehicle Live Location Tracking
            </h1>
            <span className="text-[9px] text-theme-text-dim font-bold uppercase tracking-wider">
              Nagar Nigam Jaipur Heritage - Realtime GPS Fleet Monitoring
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-[11px] font-bold text-theme-text leading-none">Admin User</div>
            <span className="text-[8px] font-semibold text-theme-accent uppercase tracking-wider">
              Online
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-500/20">
            AD
          </div>
        </div>
      </header>

      {/* Main full-screen viewport */}
      <div className="flex-1 flex min-h-0 relative bg-theme-base">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-theme-surface gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-theme-border border-t-emerald-600 animate-spin" />
            <div className="text-theme-text-dim text-xs font-semibold animate-pulse">
              Connecting to Leaflet telemetry...
            </div>
          </div>
        ) : (
          <LiveMap vehicles={vehicles} />
        )}
      </div>
    </div>
  );
}
