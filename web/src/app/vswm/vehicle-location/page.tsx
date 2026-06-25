"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";
import ReportHeader from "@/components/shared/ReportHeader";

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
      <ReportHeader title="Vehicle Live Location Tracking" />

      {/* Main full-screen viewport */}
      <div className="flex-1 flex min-h-[300px] relative bg-theme-base">
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
