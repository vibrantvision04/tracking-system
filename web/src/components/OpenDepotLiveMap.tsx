/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import DepotMap from "@/components/DepotMap";

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
  
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedWard, setSelectedWard] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [depotsRes, zonesRes, wardsRes] = await Promise.all([
        api<{ success: boolean; data: OpenDepot[] }>("/api/open-depots"),
        api<{ success: boolean; data: Zone[] }>("/api/zones"),
        api<{ success: boolean; data: Ward[] }>("/api/wards"),
      ]);

      if (depotsRes.success) setDepots(depotsRes.data || []);
      if (zonesRes.success) setZones(zonesRes.data || []);
      if (wardsRes.success) setWards(wardsRes.data || []);
    } catch (err) {
      toast.error("Failed to load map data.");
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f4f6f9] relative">
      
      {/* Top Filter Banner */}
      <div className="bg-white border-b border-gray-150 px-6 py-4 flex flex-wrap items-center gap-4 z-[1000] shadow-sm">
        
        {/* Search Input */}
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Search Depot</label>
          <input
            type="text"
            placeholder="🔍 Search depots..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3.5 py-2 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-emerald-500 transition w-48 shadow-inner"
          />
        </div>

        {/* Zone Filter */}
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Zone</label>
          <select
            value={selectedZone}
            onChange={(e) => {
              setSelectedZone(e.target.value);
              setSelectedWard(""); // Reset ward when zone changes
            }}
            className="px-3.5 py-2 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-emerald-500 transition cursor-pointer shadow-sm w-44"
          >
            <option value="">All Zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.region_name}</option>
            ))}
          </select>
        </div>

        {/* Ward Filter */}
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ward</label>
          <select
            value={selectedWard}
            onChange={(e) => setSelectedWard(e.target.value)}
            className="px-3.5 py-2 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-emerald-500 transition cursor-pointer shadow-sm w-44"
          >
            <option value="">All Wards</option>
            {wards
              .filter((w) => !selectedZone || w.parent_id === parseInt(selectedZone))
              .map((w) => (
                <option key={w.id} value={w.id}>{w.region_name}</option>
              ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3.5 py-2 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-emerald-500 transition cursor-pointer shadow-sm w-36"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {/* Refresh button */}
        <button
          onClick={loadData}
          disabled={loading}
          className="self-end px-3.5 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold transition shadow-sm h-[34px]"
        >
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>

      </div>

      {/* Map Element */}
      <div className="flex-1 w-full h-full min-h-0 relative z-0">
        {loading && depots.length === 0 ? (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3">
            <span className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider animate-pulse">Loading depot layers...</span>
          </div>
        ) : null}
        <DepotMap depots={filteredDepots} previewOnly={true} />
      </div>

    </div>
  );
}
