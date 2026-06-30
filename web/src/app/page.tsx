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
import DashboardCharts from "@/components/dashboard/DashboardCharts";
import { CardSkeleton, ChartSkeleton, MapSkeleton } from "@/components/ui/LoadingSkeleton";
import { Map as MapIcon, Truck, Trash2, X, MapPin, Home } from 'lucide-react';
import dynamic from "next/dynamic";

const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false, loading: () => <MapSkeleton /> });



export default function HomePage() {
  const vehicles = useStore((state) => state.vehicles);
  const devices = useStore((state) => state.devices);
  const loaded = useStore((state) => state.loaded);
  const loadAll = useStore((state) => state.loadAll);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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
  const [centerOnVehicleImei, setCenterOnVehicleImei] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [showRegNumbers, setShowRegNumbers] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cachedMeta = localStorage.getItem("vswm:vehicles-meta");
      if (cachedMeta) {
        try { setVehiclesMeta(JSON.parse(cachedMeta)); } catch (e) {}
      }
      const cachedCap = localStorage.getItem("vswm:vehicle-capacities");
      if (cachedCap) {
        try { setCapacities(JSON.parse(cachedCap)); } catch (e) {}
      }
    }
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.search-container')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const getVehicleCapacity = (vId: number) => {
    const meta = vehiclesMeta[vId] || {};
    const capId = meta.capacityId;
    const cap = capacities.find(c => c.id === capId);
    return parseFloat(cap?.totalCapacity || "0");
  };

  const zoneTonnages: any[] = [];

  const totalTonsCollected = 0;
  const totalValidTrips = 0;

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


  useEffect(() => {
    if (!loaded) {
      loadAll();
    }
  }, [loaded, loadAll]);

  const loading = !loaded;
  const activeVehiclesCount = vehicles.filter((v) => v.status !== "offline").length;

  if (!mounted) {
    return (
      <div className="flex-1 flex flex-col h-full bg-theme-base p-6 gap-6">
        <div className="grid grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <div className="flex-1 rounded-3xl border border-slate-200/80 bg-white">
          <MapSkeleton />
        </div>
      </div>
    );
  }

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
              value={`${totalTonsCollected.toFixed(1)} Tons`} 
              secondaryText={`Total Trips: ${totalValidTrips}`} 
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
        chartsRow={<DashboardCharts />}
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
          <div className="flex-1 bg-theme-card rounded-3xl border border-slate-200/80 overflow-hidden shadow-2xl flex flex-col relative group">
            {/* Map Header Overlay */}
            <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-md select-none flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none">
                Zone & Ward Boundaries
              </span>
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-theme-elevated gap-3">
                <div className="w-8 h-8 rounded-full border-4 border-theme-border border-t-emerald-600 animate-spin" />
                <div className="text-theme-text-dim text-xs font-semibold animate-pulse">
                  Loading Map Boundaries...
                </div>
              </div>
            ) : (
              <LiveMap vehicles={[]} showMenu={false} boundariesOnly={true} />
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
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
          />
          
          {/* Drawer Panel */}
          <div className="relative w-full sm:w-[80%] sm:max-w-[80vw] lg:max-w-md bg-theme-card h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 transform translate-x-0">
            {/* Drawer Header */}
            <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-theme-border flex items-center justify-between shrink-0 sticky top-0 bg-theme-card z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200/60 flex items-center justify-center shrink-0">
                  <MapPin size={18} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-theme-text leading-tight">D2D Zone Coverage</h3>
                  <p className="text-[10px] text-theme-text-dim font-semibold mt-0.5 uppercase tracking-wider">Today's breakdown by zone</p>
                </div>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-full flex items-center justify-center bg-theme-base/60 hover:bg-theme-elevated transition text-theme-text-dim hover:text-theme-text"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            
            {/* Drawer Body - List of Zones */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-3 custom-scrollbar">
              {zoneCoverages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-theme-text-dim gap-3 py-10">
                  <div className="w-7 h-7 border-2 border-theme-border border-t-emerald-600 rounded-full animate-spin" />
                  <span className="text-xs font-semibold">Loading zone coverages...</span>
                </div>
              ) : (
                zoneCoverages.map((zone) => (
                  <div key={zone.id} className="bg-theme-elevated/50 border border-theme-border/60 rounded-xl p-4 flex flex-col gap-2.5 hover:border-emerald-200/60 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span 
                          className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white shadow-sm" 
                          style={{ backgroundColor: zone.color }}
                        />
                        <span className="font-bold text-theme-text text-sm">{zone.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-black text-theme-text leading-none">{zone.percentage}</span>
                        <span className="text-[10px] font-bold text-theme-text-dim">%</span>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-theme-base h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-700 ease-out"
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
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
          />
          
          <div className="relative w-full sm:w-[80%] sm:max-w-[80vw] lg:max-w-lg bg-theme-card h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 transform translate-x-0">
            {/* Header */}
            <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-theme-border flex items-center justify-between shrink-0 sticky top-0 bg-theme-card z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200/60 flex items-center justify-center shrink-0">
                  <Home size={18} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-theme-text leading-tight">Open Depot Live Coverage</h3>
                  <p className="text-[10px] text-theme-text-dim font-semibold mt-0.5">
                    <span className="text-amber-500 font-bold">{openDepotDashboard?.active_shift?.shift_name || "No Active Shift"}</span> · {openDepotDashboard?.operational_date || todayStr}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpenDepotDrawerOpen(false)}
                className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-full flex items-center justify-center bg-theme-base/60 hover:bg-theme-elevated transition text-theme-text-dim hover:text-theme-text"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5 custom-scrollbar">
              {/* Overall Shift KPIs */}
              <div className="bg-linear-to-br from-amber-50/80 to-theme-elevated border border-amber-200/30 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider">Overall Shift Coverage</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-amber-500 leading-none">{openDepotDashboard?.kpis?.coverage_percentage ?? 0}</span>
                    <span className="text-xs font-bold text-amber-400">%</span>
                  </div>
                </div>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="bg-theme-card/80 border border-theme-border rounded-xl p-3 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-theme-text-dim uppercase tracking-wider">Total</span>
                    <span className="text-lg font-black text-theme-text">{openDepotDashboard?.kpis?.total_open_depots ?? 0}</span>
                  </div>
                  <div className="bg-emerald-50/60 border border-emerald-200/40 rounded-xl p-3 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Complete</span>
                    <span className="text-lg font-black text-emerald-600">{openDepotDashboard?.kpis?.approved_complete ?? 0}</span>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-200/40 rounded-xl p-3 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Partial</span>
                    <span className="text-lg font-black text-amber-600">{openDepotDashboard?.kpis?.approved_partial ?? 0}</span>
                  </div>
                  <div className="bg-red-50/60 border border-red-200/40 rounded-xl p-3 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Rejected</span>
                    <span className="text-lg font-black text-red-600">{openDepotDashboard?.kpis?.rejected ?? 0}</span>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-200/40 rounded-xl p-3 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Pending</span>
                    <span className="text-lg font-black text-amber-600">{openDepotDashboard?.kpis?.pending ?? 0}</span>
                  </div>
                  <div className="bg-theme-card/80 border border-theme-border rounded-xl p-3 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-theme-text-dim uppercase tracking-wider">Not Covered</span>
                    <span className="text-lg font-black text-theme-text">{openDepotDashboard?.kpis?.not_covered ?? 0}</span>
                  </div>
                </div>
              </div>

              {/* Zone Breakdown */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider px-1 flex items-center gap-2">
                  <span className="w-4 h-[2px] bg-amber-400 rounded-full" />
                  Zone Wise Breakdown
                </h4>
                
                {!openDepotDashboard?.zone_coverages || openDepotDashboard.zone_coverages.length === 0 ? (
                  <div className="text-center py-6 text-theme-text-dim text-xs font-semibold">
                    No zone data available for this shift.
                  </div>
                ) : (
                  openDepotDashboard.zone_coverages.map((zone: any) => (
                    <div key={zone.zone_id} className="bg-theme-elevated/50 border border-theme-border/60 rounded-xl p-4 flex flex-col gap-3 hover:border-amber-200/60 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-theme-text text-sm block">{zone.zone_name}</span>
                          <span className="text-[10px] text-theme-text-dim font-semibold mt-0.5 block">
                            {zone.resolved_depots} / {zone.total_depots} resolved
                          </span>
                        </div>
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-lg font-black text-theme-text leading-none">{zone.coverage_percentage}</span>
                          <span className="text-[10px] font-bold text-theme-text-dim">%</span>
                        </div>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-theme-base h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-amber-500 transition-all duration-700 ease-out"
                          style={{ width: `${zone.coverage_percentage}%` }}
                        />
                      </div>
                      
                      {/* Sub-KPI Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md border border-emerald-200/40">
                          ✓ {zone.approved_complete}
                        </span>
                        <span className="text-[9px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md border border-amber-200/40">
                          ◐ {zone.approved_partial}
                        </span>
                        <span className="text-[9px] font-bold bg-red-50 text-red-600 px-2 py-0.5 rounded-md border border-red-200/40">
                          ✕ {zone.rejected}
                        </span>
                        <span className="text-[9px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md border border-amber-200/40">
                          ⏳ {zone.pending}
                        </span>
                        <span className="text-[9px] font-bold bg-theme-base text-theme-text-dim px-2 py-0.5 rounded-md border border-theme-border">
                          — {zone.not_covered}
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
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
          />
          
          {/* Drawer Panel */}
          <div className="relative w-full sm:w-[80%] sm:max-w-[80vw] lg:max-w-lg bg-theme-card h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 transform translate-x-0">
            {/* Header */}
            <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-theme-border flex items-center justify-between shrink-0 sticky top-0 bg-theme-card z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200/60 flex items-center justify-center shrink-0">
                  <Truck size={18} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-theme-text leading-tight">Garbage Collection Tonnage</h3>
                  <p className="text-[10px] text-theme-text-dim font-semibold mt-0.5 uppercase tracking-wider">Today's zone-wise breakdown</p>
                </div>
              </div>
              <button 
                onClick={() => setIsGarbageDrawerOpen(false)}
                className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-full flex items-center justify-center bg-theme-base/60 hover:bg-theme-elevated transition text-theme-text-dim hover:text-theme-text"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5 custom-scrollbar">
              {/* Overall KPIs */}
              <div className="bg-linear-to-br from-emerald-50/80 to-theme-elevated border border-emerald-200/30 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider">Total Tonnage Collected</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-emerald-600 leading-none">{totalTonsCollected.toFixed(1)}</span>
                    <span className="text-xs font-bold text-emerald-400">Tons</span>
                  </div>
                </div>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-theme-card/80 border border-theme-border rounded-xl p-3 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-theme-text-dim uppercase tracking-wider">Valid Trips</span>
                    <span className="text-lg font-black text-theme-text">{totalValidTrips}</span>
                  </div>
                  <div className="bg-theme-card/80 border border-theme-border rounded-xl p-3 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-theme-text-dim uppercase tracking-wider">Active Zones</span>
                    <span className="text-lg font-black text-theme-text">{zoneTonnages.length}</span>
                  </div>
                </div>
              </div>

              {/* Zone Breakdown */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider px-1 flex items-center gap-2">
                  <span className="w-4 h-[2px] bg-emerald-400 rounded-full" />
                  Zone Wise Breakdown
                </h4>
                
                {zoneTonnages.length === 0 ? (
                  <div className="text-center py-10 text-theme-text-dim text-xs font-semibold">
                    No garbage collection trips recorded for today.
                  </div>
                ) : (
                  zoneTonnages.map((zone) => {
                    const pctOfTotal = totalTonsCollected > 0 ? (zone.tons / totalTonsCollected) * 100 : 0;
                    return (
                      <div key={zone.name} className="bg-theme-elevated/50 border border-theme-border/60 rounded-xl p-4 flex flex-col gap-3 hover:border-emerald-200/60 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-theme-text text-sm block">{zone.name}</span>
                            <span className="text-[10px] text-theme-text-dim font-semibold mt-0.5 block">
                              {zone.trips} valid trips
                            </span>
                          </div>
                          <div className="flex items-baseline gap-0.5">
                            <span className="text-lg font-black text-theme-text leading-none">{zone.tons.toFixed(1)}</span>
                            <span className="text-[10px] font-bold text-theme-text-dim ml-0.5">T</span>
                          </div>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-theme-base h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
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
