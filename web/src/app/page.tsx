"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import useSWR from "swr";

const fetcher = (url: string) => api<{ data?: any[] }>(url).then(res => res.data || []);

import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import StatCard from "@/components/dashboard/StatCard";
import CoverageChart from "@/components/dashboard/CoverageChart";
import RevenueCard from "@/components/dashboard/RevenueCard";
import InfrastructureCard from "@/components/dashboard/InfrastructureCard";
import DeviceCard from "@/components/dashboard/DeviceCard";
import RFIDCoverageCard from "@/components/dashboard/RFIDCoverageCard";
import { Map as MapIcon, Truck, Trash2 } from 'lucide-react';
import dynamic from "next/dynamic";

const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false });

export default function HomePage() {
  const vehicles = useStore((state) => state.vehicles);
  const devices = useStore((state) => state.devices);
  const loaded = useStore((state) => state.loaded);
  const loadAll = useStore((state) => state.loadAll);

  const { data: zones = [], isValidating: loadingZones } = useSWR("/api/zones", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: wards = [], isValidating: loadingWards } = useSWR("/api/wards", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: routes = [], isValidating: loadingRoutes } = useSWR("/api/routes", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });

  const zonesCount = loadingZones && zones.length === 0 ? "..." : zones.length;
  const wardsCount = loadingWards && wards.length === 0 ? "..." : wards.length;
  const routesCount = loadingRoutes && routes.length === 0 ? "..." : routes.length;

  // Mocked for now based on user instruction
  const gvpCount = "24"; 
  const d2dCoverage = 85;
  const liftedGvp = 92;

  useEffect(() => {
    if (!loaded) {
      loadAll();
    }
  }, [loaded, loadAll]);

  const loading = !loaded;
  const activeVehiclesCount = vehicles.filter((v) => v.status !== "offline").length;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 text-slate-800 overflow-hidden font-sans">
      <DashboardHeader />
      
      <DashboardGrid
        row1={
          <>
            <StatCard 
              title="Zones & Wards" 
              value={zonesCount} 
              secondaryText={`Total Wards: ${wardsCount}`} 
              icon={<MapIcon size={24} />} 
              accentColor="blue"
            />
            <StatCard 
              title="Fleet Status" 
              value={loading ? "..." : vehicles.length} 
              secondaryText={`Active Vehicles: ${loading ? "..." : activeVehiclesCount}`} 
              icon={<Truck size={24} />} 
              accentColor="emerald"
            />
            <StatCard 
              title="Open Depots (GVP)" 
              value={gvpCount} 
              secondaryText="Total Identified GVPs" 
              icon={<Trash2 size={24} />} 
              accentColor="amber"
            />
          </>
        }
        row2Left={
          <div className="grid grid-cols-2 gap-6 h-full">
            <CoverageChart title="D2D Coverage" percentage={d2dCoverage} color="#10b981" subtitle="Households" />
            <CoverageChart title="GVP Lifting" percentage={liftedGvp} color="#f59e0b" subtitle="Cleared" />
          </div>
        }
        row2Right={
          <InfrastructureCard routesCount={routesCount} />
        }
        row3Left={
          <>
            <RFIDCoverageCard percentage={78} />
            <RevenueCard />
          </>
        }
        row3Right={
          <DeviceCard gpsDevicesCount={loading ? "..." : devices.length} />
        }
        mapCard={
          <div className="flex-1 bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-md flex flex-col relative group">
            {/* Map Header Overlay */}
            <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm pointer-events-none select-none flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wider leading-none">
                Live Map View
              </span>
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 gap-3">
                <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
                <div className="text-slate-500 text-xs font-semibold animate-pulse">
                  Connecting to Leaflet telemetry...
                </div>
              </div>
            ) : (
              <LiveMap vehicles={vehicles} showMenu={false} />
            )}
          </div>
        }
      />
    </div>
  );
}
