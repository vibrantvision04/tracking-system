/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import DepotMap from "@/components/DepotMap";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DatePicker from "@/components/ui/DatePicker";

interface OpenDepot {
  id: number;
  name: string;
  zone_id: number;
  ward_id: number;
  latitude: number;
  longitude: number;
  radius: number;
  status: string;
  cleaning_percentage: number;
  last_cleaned_at: string | null;
  total_submissions: number;
  total_approved: number;
  total_rejected: number;
  zone_name?: string;
  ward_name?: string;
  last_cleaning_status?: string | null;
}

interface Zone {
  id: number;
  region_name: string;
}

interface Ward {
  id: number;
  region_name: string;
  parent_id: number;
}

export default function OpenDepotLiveMap() {
  const [depots, setDepots] = useState<OpenDepot[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedWard, setSelectedWard] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [selectedShift, setSelectedShift] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);

  const [loading, setLoading] = useState(true);
  const [loadingDepots, setLoadingDepots] = useState(false);

  // Load static layers
  useEffect(() => {
    loadStaticData();
  }, []);

  // Fetch depots on shift/date change
  useEffect(() => {
    loadDepots();
  }, [selectedShift, selectedDate]);

  const loadStaticData = async () => {
    setLoading(true);
    try {
      const [zonesRes, wardsRes, regionsRes, shiftsRes] = await Promise.all([
        api<{ success: boolean; data: Zone[] }>("/api/zones"),
        api<{ success: boolean; data: Ward[] }>("/api/wards"),
        api<{ success: boolean; data: any[] }>("/api/regions"),
        api<{ success: boolean; data: any[] }>("/api/shifts?group=OPEN_DEPOT"),
      ]);

      if (zonesRes.success) setZones(zonesRes.data || []);
      if (wardsRes.success) setWards(wardsRes.data || []);
      if (regionsRes.success) setRegions(regionsRes.data || []);
      if (shiftsRes.success) setShifts(shiftsRes.data || []);
    } catch (err) {
      toast.error("Failed to load map data layers.");
    } finally {
      setLoading(false);
    }
  };

  const loadDepots = async () => {
    setLoadingDepots(true);
    try {
      const queryParams = new URLSearchParams({
        ...(selectedShift && { shift_id: selectedShift }),
        ...(selectedDate && { date: selectedDate }),
      });
      const res = await api<{ success: boolean; data: OpenDepot[] }>(`/api/open-depots?${queryParams.toString()}`);
      if (res.success) {
        setDepots(res.data || []);
      }
    } catch (err) {
      toast.error("Failed to load depots data.");
    } finally {
      setLoadingDepots(false);
    }
  };

  const handleRefresh = () => {
    loadStaticData();
    loadDepots();
  };

  // Filter depots based on selections
  const getFilteredDepots = () => {
    return depots.filter((d) => {
      if (selectedZone && d.zone_id !== parseInt(selectedZone)) return false;
      if (selectedWard && d.ward_id !== parseInt(selectedWard)) return false;
      if (selectedStatus && d.status !== selectedStatus) return false;
      if (
        searchQuery &&
        !d.name.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  };

  const filteredDepots = getFilteredDepots();

  const shiftOptions = [
    { value: "", label: "Live/Active Shift" },
    ...shifts.map((s) => ({ value: String(s.id), label: s.shift_name }))
  ];

  const zoneOptions = [
    { value: "", label: "All Zones" },
    ...zones.map((z) => ({ value: String(z.id), label: z.region_name }))
  ];

  const filteredWards = selectedZone
    ? wards.filter((w) => w.parent_id === parseInt(selectedZone))
    : wards;

  const wardOptions = [
    { value: "", label: "All Wards" },
    ...filteredWards.map((w) => ({ value: String(w.id), label: w.region_name }))
  ];

  const statusOptions = [
    { value: "", label: "All Statuses" },
    { value: "Active", label: "Active" },
    { value: "Inactive", label: "Inactive" }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base relative select-none">
      
      {/* Top Filter Banner */}
      <div className="bg-theme-surface border-b border-theme-border px-6 py-4 flex flex-wrap items-center gap-4 z-[1000] shadow-sm">
        
        {/* Search Input */}
        <div className="flex flex-col">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Search Depot</label>
          <input
            type="text"
            placeholder="Search depots..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 h-9 px-3 bg-white text-gray-900 border border-gray-300 rounded-[8px] text-xs outline-none focus:ring-2 focus:ring-red-600/30 transition-all duration-150 shadow-sm"
          />
        </div>

        {/* Date Filter */}
        <div className="w-36">
          <DatePicker
            label="Date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        {/* Shift Filter */}
        <div className="flex flex-col w-40">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Shift</label>
          <SearchableSelect
            value={selectedShift}
            onChange={(val) => setSelectedShift(val)}
            options={shiftOptions}
            placeholder="Live/Active Shift"
          />
        </div>

        {/* Zone Filter */}
        <div className="flex flex-col w-44">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Zone</label>
          <SearchableSelect
            value={selectedZone}
            onChange={(val) => {
              setSelectedZone(val);
              setSelectedWard("");
            }}
            options={zoneOptions}
            placeholder="All Zones"
          />
        </div>

        {/* Ward Filter */}
        <div className="flex flex-col w-44">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Ward</label>
          <SearchableSelect
            value={selectedWard}
            onChange={(val) => setSelectedWard(val)}
            options={wardOptions}
            placeholder="All Wards"
            disabled={!selectedZone}
          />
        </div>

        {/* Status Filter */}
        <div className="flex flex-col w-36">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Status</label>
          <SearchableSelect
            value={selectedStatus}
            onChange={(val) => setSelectedStatus(val)}
            options={statusOptions}
            placeholder="All Statuses"
          />
        </div>

        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={loading || loadingDepots}
          className="self-end px-4 py-2 text-xs bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white rounded-lg font-bold transition shadow-sm h-9 flex items-center justify-center gap-1 cursor-pointer"
        >
          {loading || loadingDepots ? (
            <>
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Refreshing...</span>
            </>
          ) : (
            <span>↻ Refresh</span>
          )}
        </button>

      </div>

      {/* Map Element */}
      <div className="flex-1 w-full h-full min-h-0 relative z-0">
        {(loading || loadingDepots) && depots.length === 0 ? (
          <div className="absolute inset-0 bg-theme-base/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3">
            <span className="w-8 h-8 border-4 border-theme-border border-t-theme-accent rounded-full animate-spin" />
            <span className="text-xs font-bold text-theme-text-dim uppercase tracking-wider animate-pulse">Loading depot layers...</span>
          </div>
        ) : null}
        <DepotMap 
          depots={filteredDepots} 
          previewOnly={true} 
          regions={regions}
          selectedZone={selectedZone}
          selectedWard={selectedWard}
        />
      </div>

    </div>
  );
}
