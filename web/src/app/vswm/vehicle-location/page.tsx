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
      {/* Sub-header with Title */}
      <div className="bg-white px-6 py-3 border-b border-slate-200 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-700">Vehicle Live Location Tracking</h2>
          <div className="h-[3px] w-8 bg-emerald-500 mt-1"></div>
        </div>
      </div>

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
