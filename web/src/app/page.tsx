/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import useSWR from "swr";

const fetcher = (url: string) => api<{ data?: any[] }>(url).then(res => res.data || []);
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import StatCard from "@/components/dashboard/StatCard";
import CoverageChart from "@/components/dashboard/CoverageChart";
import RevenueCard from "@/components/dashboard/RevenueCard";
import InfrastructureCard from "@/components/dashboard/InfrastructureCard";
import DeviceCard from "@/components/dashboard/DeviceCard";
import RFIDCoverageCard from "@/components/dashboard/RFIDCoverageCard";
import { Map as MapIcon, Truck, Trash2, X } from 'lucide-react';
import dynamic from "next/dynamic";

const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false });

const DEFAULT_CAPACITIES = [
  { id: 1, totalCapacity: "3.5", wet: "50", dry: "50", active: true },
  { id: 2, totalCapacity: "1.8", wet: "50", dry: "50", active: true },
  { id: 3, totalCapacity: "2.2", wet: "50", dry: "50", active: true }
];

export default function HomePage() {
  const vehicles = useStore((state) => state.vehicles);
  const devices = useStore((state) => state.devices);
  const loaded = useStore((state) => state.loaded);
  const loadAll = useStore((state) => state.loadAll);

  const { data: zones = [], isValidating: loadingZones } = useSWR("/api/zones", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: wards = [], isValidating: loadingWards } = useSWR("/api/wards", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: routes = [], isValidating: loadingRoutes } = useSWR("/api/routes", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: regions = [] } = useSWR("/api/regions", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });

  const { data: transferStations = [], isValidating: loadingTS } = useSWR("/api/transfer-stations", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: parkingSpots = [], isValidating: loadingPS } = useSWR("/api/parking-spots", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: fuelStations = [], isValidating: loadingFS } = useSWR("/api/fuel-stations", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: workshops = [], isValidating: loadingWS } = useSWR("/api/workshops", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: employees = [], isValidating: loadingEM } = useSWR("/api/employees", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });

  const todayStr = new Date().toISOString().split("T")[0];
  const { data: d2dPayload } = useSWR(`/api/reports/d2d-coverage?active_shift=true`, (url) => api<{ success: boolean; data?: any[]; active_shift_name?: string }>(url).then(res => res), { revalidateOnFocus: false, dedupingInterval: 30000 });
  const d2dReport = d2dPayload?.data || [];
  const d2dActiveShiftName = d2dPayload?.active_shift_name || "No Active Shift";
  const { data: openDepotDashboard } = useSWR("/api/open-depots/dashboard", (url) => api<{ data?: any }>(url).then(res => res.data), { refreshInterval: 10000 });

  // GTS Trips for Tonnage Calculation
  const { data: gtsPayload, isValidating: loadingGTS } = useSWR("/api/reports/gts-trips", (url) => api<{ success: boolean; data?: any[] }>(url).then(res => res), { revalidateOnFocus: false, dedupingInterval: 30000 });
  const gtsReport = gtsPayload?.data || [];

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isOpenDepotDrawerOpen, setIsOpenDepotDrawerOpen] = useState(false);
  const [isGarbageDrawerOpen, setIsGarbageDrawerOpen] = useState(false);
  const [vehiclesMeta, setVehiclesMeta] = useState<Record<string, any>>({});
  const [capacities, setCapacities] = useState<any[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cachedMeta = localStorage.getItem("vswm:vehicles-meta");
      if (cachedMeta) {
        try { setVehiclesMeta(JSON.parse(cachedMeta)); } catch (e) {}
      }
      const cachedCap = localStorage.getItem("vswm:vehicle-capacities");
      if (cachedCap) {
        try { setCapacities(JSON.parse(cachedCap)); } catch (e) {}
      } else {
        setCapacities(DEFAULT_CAPACITIES);
      }
    }
  }, []);

  const getVehicleCapacity = (vId: number) => {
    const meta = vehiclesMeta[vId] || {};
    const capId = meta.capacityId;
    const cap = capacities.find(c => c.id === capId) || DEFAULT_CAPACITIES.find(c => c.id === capId) || DEFAULT_CAPACITIES[0];
    return parseFloat(cap?.totalCapacity || "3.5");
  };

  let totalTonsCollected = 0;
  let totalValidTrips = 0;
  gtsReport.forEach((row: any) => {
    const cap = getVehicleCapacity(row.vehicle_id);
    totalTonsCollected += (row.trip_count || 0) * cap;
    totalValidTrips += (row.trip_count || 0);
  });

  // Calculate zone wise tonnage
  const zoneTonnageMap: Record<string, { name: string; tons: number; trips: number; rejected: number }> = {};
  gtsReport.forEach((row: any) => {
    const zoneName = row.zone_name || "Unknown Zone";
    const cap = getVehicleCapacity(row.vehicle_id);
    const tons = (row.trip_count || 0) * cap;
    
    if (!zoneTonnageMap[zoneName]) {
      zoneTonnageMap[zoneName] = {
        name: zoneName,
        tons: 0,
        trips: 0,
        rejected: 0,
      };
    }
    zoneTonnageMap[zoneName].tons += tons;
    zoneTonnageMap[zoneName].trips += (row.trip_count || 0);
    zoneTonnageMap[zoneName].rejected += (row.rejected_count || 0);
  });

  const zoneTonnages = Object.values(zoneTonnageMap).sort((a, b) => b.tons - a.tons);

  const zonesCount = loadingZones && zones.length === 0 ? "..." : zones.length;
  const wardsCount = loadingWards && wards.length === 0 ? "..." : wards.length;
  const routesCount = loadingRoutes && routes.length === 0 ? "..." : routes.length;

  // Aggregate zone-wise coverage
  const zoneCoverages = (regions.length > 0 ? regions.filter((r: any) => r.region_type_id === 2) : zones).map((zone: any) => {
    const zoneRows = d2dReport.filter((row: any) => row.zone_id === zone.id);
    let pct = 0;
    if (zoneRows.length > 0) {
      const sum = zoneRows.reduce((acc: number, r: any) => acc + (r.covered_percentage || 0), 0);
      pct = Math.round(sum / zoneRows.length);
    }
    return {
      id: zone.id,
      name: zone.region_name || zone.name,
      color: zone.color || '#10b981',
      percentage: pct,
    };
  });

  // Calculate overall D2D coverage (average of zone coverages)
  const computedD2D = d2dActiveShiftName === "No Active Shift"
    ? 0
    : (zoneCoverages.length > 0
        ? Math.round(zoneCoverages.reduce((acc, z) => acc + z.percentage, 0) / zoneCoverages.length)
        : 0);

  // Mocked for now based on user instruction
  const gvpCount = "24"; 
  const liftedGvp = 92;

  useEffect(() => {
    if (!loaded) {
      loadAll();
    }
  }, [loaded, loadAll]);

  const loading = !loaded;
  const activeVehiclesCount = vehicles.filter((v) => v.status !== "offline").length;

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans">
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
              title="Garbage Collected" 
              value={loadingGTS && gtsReport.length === 0 ? "..." : `${totalTonsCollected.toFixed(1)} Tons`} 
              secondaryText={`Total Trips: ${totalValidTrips} | Pending: ${openDepotDashboard?.kpis?.pending ?? 0}`} 
              icon={<Trash2 size={24} />} 
              accentColor="amber"
              onClick={() => setIsGarbageDrawerOpen(true)}
            />
          </>
        }
        row2Left={
          <div className="grid grid-cols-2 gap-6 h-full">
            <CoverageChart 
              title="D2D Coverage" 
              percentage={computedD2D} 
              color="#10B981" 
              subtitle={d2dActiveShiftName} 
              onClick={() => setIsDrawerOpen(true)}
            />
            <CoverageChart 
              title="Open Depot Coverage" 
              percentage={openDepotDashboard?.kpis?.coverage_percentage ?? 0} 
              color="#10B981" 
              subtitle={openDepotDashboard?.active_shift?.shift_name || "No Active Shift"} 
              onClick={() => setIsOpenDepotDrawerOpen(true)}
            />
          </div>
        }
        row2Right={
          <InfrastructureCard 
            routesCount={routesCount} 
            transferStationsCount={loadingTS && transferStations.length === 0 ? "..." : transferStations.length}
            parkingLotsCount={loadingPS && parkingSpots.length === 0 ? "..." : parkingSpots.length}
            fuelStationsCount={loadingFS && fuelStations.length === 0 ? "..." : fuelStations.length}
            workshopsCount={loadingWS && workshops.length === 0 ? "..." : workshops.length}
            employeesCount={loadingEM && employees.length === 0 ? "..." : employees.length}
          />
        }
        row3Left={
          <>
            <RFIDCoverageCard percentage={0} />
            <RevenueCard />
          </>
        }
        row3Right={
          <DeviceCard gpsDevicesCount={loading ? "..." : devices.length} />
        }
        mapCard={
          <div className="flex-1 bg-theme-card rounded-3xl border border-theme-border overflow-hidden shadow-md flex flex-col relative group">
            {/* Map Header Overlay */}
            <div className="absolute top-4 left-4 z-[1000] bg-theme-card/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-theme-border shadow-sm pointer-events-none select-none flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-theme-text uppercase tracking-wider leading-none">
                Live Map View
              </span>
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-theme-elevated gap-3">
                <div className="w-8 h-8 rounded-full border-4 border-theme-border border-t-emerald-600 animate-spin" />
                <div className="text-theme-text-dim text-xs font-semibold animate-pulse">
                  Connecting to Leaflet telemetry...
                </div>
              </div>
            ) : (
              <LiveMap vehicles={vehicles} showMenu={false} />
            )}
          </div>
        }
      />

      {/* Zone Coverage Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[9999] flex justify-end">
          {/* Backdrop Overlay */}
          <div 
            onClick={() => setIsDrawerOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
          />
          
          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-theme-card h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 transform translate-x-0">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-theme-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-theme-text">D2D Zone Coverage</h3>
                <p className="text-xs text-theme-text-dim font-medium mt-0.5">Today's breakdown by zone</p>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-theme-elevated transition text-theme-text-dim hover:text-theme-text"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            
            {/* Drawer Body - List of Zones */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 custom-scrollbar">
              {zoneCoverages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-theme-text-dim gap-2 py-10">
                  <div className="w-6 h-6 border-2 border-theme-border border-t-emerald-600 rounded-full animate-spin" />
                  <span className="text-xs font-semibold">Loading zone coverages...</span>
                </div>
              ) : (
                zoneCoverages.map((zone) => (
                  <div key={zone.id} className="bg-theme-elevated border border-theme-border rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span 
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-theme-border shadow-sm" 
                          style={{ backgroundColor: zone.color }}
                        />
                        <span className="font-bold text-theme-text text-sm">{zone.name}</span>
                      </div>
                      <span className="font-extrabold text-theme-text text-sm">{zone.percentage}%</span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-theme-base h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{ 
                          width: `${zone.percentage}%`,
                          backgroundColor: zone.color 
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Open Depot Coverage Drawer */}
      {isOpenDepotDrawerOpen && (
        <div className="fixed inset-0 z-[9999] flex justify-end">
          <div 
            onClick={() => setIsOpenDepotDrawerOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
          />
          
          <div className="relative w-full max-w-lg bg-theme-card h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 transform translate-x-0">
            {/* Header */}
            <div className="px-6 py-5 border-b border-theme-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-theme-text">Open Depot Live Coverage</h3>
                <p className="text-xs text-theme-text-dim font-medium mt-0.5">
                  Shift: <span className="text-amber-500 font-bold">{openDepotDashboard?.active_shift?.shift_name || "No Active Shift"}</span> | Date: {openDepotDashboard?.operational_date || todayStr}
                </p>
              </div>
              <button 
                onClick={() => setIsOpenDepotDrawerOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-theme-elevated transition text-theme-text-dim hover:text-theme-text"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">
              {/* Overall Shift KPIs */}
              <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-theme-text-dim uppercase tracking-wider">Overall Shift Coverage</span>
                  <span className="text-2xl font-black text-amber-500">{openDepotDashboard?.kpis?.coverage_percentage ?? 0}%</span>
                </div>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-theme-card border border-theme-border rounded-xl p-3 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-300 uppercase">Total Depots</span>
                    <span className="text-lg font-extrabold text-theme-text mt-1">{openDepotDashboard?.kpis?.total_open_depots ?? 0}</span>
                  </div>
                  <div className="bg-[#16A34A]/10 border border-[#16A34A]/20 rounded-xl p-3 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-[#16A34A] uppercase">Complete</span>
                    <span className="text-lg font-extrabold text-[#16A34A] mt-1">{openDepotDashboard?.kpis?.approved_complete ?? 0}</span>
                  </div>
                  <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-xl p-3 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-[#F59E0B] uppercase">Partial</span>
                    <span className="text-lg font-extrabold text-[#F59E0B] mt-1">{openDepotDashboard?.kpis?.approved_partial ?? 0}</span>
                  </div>
                  <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl p-3 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-[#EF4444] uppercase">Rejected</span>
                    <span className="text-lg font-extrabold text-[#EF4444] mt-1">{openDepotDashboard?.kpis?.rejected ?? 0}</span>
                  </div>
                  <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-xl p-3 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-[#F59E0B] uppercase">Pending</span>
                    <span className="text-lg font-extrabold text-[#F59E0B] mt-1">{openDepotDashboard?.kpis?.pending ?? 0}</span>
                  </div>
                  <div className="bg-theme-card border border-theme-border rounded-xl p-3 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-300 uppercase">Not Covered</span>
                    <span className="text-lg font-extrabold text-theme-text mt-1">{openDepotDashboard?.kpis?.not_covered ?? 0}</span>
                  </div>
                </div>
              </div>

              {/* Zone Breakdown */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider px-1">Zone Wise Breakdown</h4>
                
                {!openDepotDashboard?.zone_coverages || openDepotDashboard.zone_coverages.length === 0 ? (
                  <div className="text-center py-6 text-theme-text-dim text-xs font-semibold">
                    No zone data available for this shift.
                  </div>
                ) : (
                  openDepotDashboard.zone_coverages.map((zone: any) => (
                    <div key={zone.zone_id} className="bg-theme-elevated border border-theme-border rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-theme-text text-sm block">{zone.zone_name}</span>
                          <span className="text-[10px] text-theme-text-dim font-bold mt-0.5 block">
                            Resolved: {zone.resolved_depots} / {zone.total_depots}
                          </span>
                        </div>
                        <span className="font-extrabold text-theme-text text-base">{zone.coverage_percentage}%</span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-theme-base h-2 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out"
                          style={{ width: `${zone.coverage_percentage}%` }}
                        />
                      </div>
                      
                      {/* Sub-KPI Badges */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="text-[9px] font-bold bg-[#16A34A]/10 text-[#16A34A] px-2 py-0.5 rounded border border-[#16A34A]/20">
                          Complete: {zone.approved_complete}
                        </span>
                        <span className="text-[9px] font-bold bg-[#F59E0B]/10 text-[#F59E0B] px-2 py-0.5 rounded border border-[#F59E0B]/20">
                          Partial: {zone.approved_partial}
                        </span>
                        <span className="text-[9px] font-bold bg-[#EF4444]/10 text-[#EF4444] px-2 py-0.5 rounded border border-[#EF4444]/20">
                          Rejected: {zone.rejected}
                        </span>
                        <span className="text-[9px] font-bold bg-[#F59E0B]/10 text-[#F59E0B] px-2 py-0.5 rounded border border-[#F59E0B]/20">
                          Pending: {zone.pending}
                        </span>
                        <span className="text-[9px] font-bold bg-theme-card text-slate-300 px-2 py-0.5 rounded border border-theme-border">
                          Not Mapped: {zone.not_covered}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Garbage Collection Tonnage Drawer */}
      {isGarbageDrawerOpen && (
        <div className="fixed inset-0 z-[9999] flex justify-end">
          {/* Backdrop */}
          <div 
            onClick={() => setIsGarbageDrawerOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
          />
          
          {/* Drawer Panel */}
          <div className="relative w-full max-w-lg bg-theme-card h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 transform translate-x-0">
            {/* Header */}
            <div className="px-6 py-5 border-b border-theme-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-theme-text">Garbage Collection Tonnage</h3>
                <p className="text-xs text-theme-text-dim font-medium mt-0.5">
                  Today's zone-wise garbage collection breakdown
                </p>
              </div>
              <button 
                onClick={() => setIsGarbageDrawerOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-theme-elevated transition text-theme-text-dim hover:text-theme-text"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">
              {/* Overall KPIs */}
              <div className="bg-theme-elevated border border-theme-border rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-theme-text-dim uppercase tracking-wider">Total Tonnage Collected</span>
                  <span className="text-2xl font-black text-amber-500">{totalTonsCollected.toFixed(1)} Tons</span>
                </div>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-theme-card border border-theme-border rounded-xl p-3 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-300 uppercase">Total Valid Trips</span>
                    <span className="text-lg font-extrabold text-theme-text mt-1">{totalValidTrips}</span>
                  </div>
                  <div className="bg-theme-card border border-theme-border rounded-xl p-3 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-300 uppercase">Active Compactor Zones</span>
                    <span className="text-lg font-extrabold text-theme-text mt-1">{zoneTonnages.length}</span>
                  </div>
                </div>
              </div>

              {/* Zone Breakdown */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-theme-text-dim uppercase tracking-wider px-1">Zone Wise Breakdown</h4>
                
                {zoneTonnages.length === 0 ? (
                  <div className="text-center py-10 text-theme-text-dim text-xs font-semibold">
                    No garbage collection trips recorded for today.
                  </div>
                ) : (
                  zoneTonnages.map((zone) => {
                    const pctOfTotal = totalTonsCollected > 0 ? (zone.tons / totalTonsCollected) * 100 : 0;
                    return (
                      <div key={zone.name} className="bg-theme-elevated border border-theme-border rounded-2xl p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-theme-text text-sm block">{zone.name}</span>
                            <span className="text-[10px] text-theme-text-dim font-bold mt-0.5 block">
                              Valid Trips: {zone.trips} | Rejected Trips: {zone.rejected}
                            </span>
                          </div>
                          <span className="font-extrabold text-theme-text text-base">{zone.tons.toFixed(1)} Tons</span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-theme-base h-2 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out"
                            style={{ width: `${pctOfTotal}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
