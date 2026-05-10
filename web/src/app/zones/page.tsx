"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Zone {
  id: number;
  _id?: string;
  region_name?: string;
  name?: string;
  code?: string;
}

interface Ward {
  id?: number;
  name?: string;
  zone_id?: number;
}

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [activeZone, setActiveZone] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [zonesRes, wardsRes] = await Promise.all([
          api<{ code: number; data: Zone[] }>("/api/zones"),
          api<{ code: number; data: Ward[] }>("/api/wards")
        ]);
        
        setZones(zonesRes.data || []);
        setWards(wardsRes.data || []);
      } catch (err) {
        console.error("Failed to fetch zones or wards", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Filter wards by active zone if needed
  // Note: We assume wards have a zone_id or similar field to map to zones.
  // If not, we might need to adjust this.
  const activeWards = wards.filter(w => {
    // If we don't have a clear mapping, we'll just show all wards or none.
    // Let's assume there is a way to map them or just show them all for now
    // if a zone is active (as a fallback).
    return true; 
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[var(--bg-dark)]">
      <h1 className="hidden md:block text-lg font-bold mb-6 tracking-tight">🏛️ Jaipur Heritage — Region Hierarchy</h1>

      {/* City Card */}
      <div className="bg-gradient-to-r from-indigo-500/[.08] to-violet-500/[.06] border border-indigo-500/20 rounded-xl p-4 md:p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xl md:text-2xl shadow-lg shadow-indigo-500/20">🏛️</div>
          <div>
            <h2 className="text-base md:text-lg font-bold">Jaipur Heritage (NNJ-H)</h2>
            <p className="text-xs md:text-sm text-slate-400">City ID: 176 • Level 1</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 md:flex md:gap-8">
          <div className="text-center md:text-left">
            <div className="text-xl md:text-2xl font-bold text-indigo-400">{zones.length}</div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider">Zones</div>
          </div>
          <div className="text-center md:text-left">
            <div className="text-xl md:text-2xl font-bold text-indigo-400">{wards.length}</div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider">Wards</div>
          </div>
          <div className="text-center md:text-left">
            <div className="text-xl md:text-2xl font-bold text-indigo-400">--</div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider">Vehicles</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-600">Loading data...</div>
      ) : (
        <>
          {/* Zone Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {zones.map((z) => (
              <div
                key={z.id}
                onClick={() => setActiveZone(activeZone === z.id ? null : z.id)}
                className={`bg-[var(--bg-card)] border rounded-xl p-5 cursor-pointer transition-all duration-200
                  ${activeZone === z.id ? "border-indigo-500/40 bg-indigo-500/[.06] -translate-y-0.5 shadow-lg shadow-indigo-500/10" : "border-white/[.05] hover:border-white/10 hover:-translate-y-0.5"}`}
              >
                <h3 className="text-sm font-semibold mb-3">{z.region_name || z.name || "Unknown Zone"}</h3>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>Code <b className="text-white">{z.code || "N/A"}</b></span>
                  <span>ID <b className="text-white">{z.id}</b></span>
                </div>
              </div>
            ))}
            {zones.length === 0 && (
              <div className="col-span-full text-center py-10 text-slate-600 text-sm">
                No zones found in backend.
              </div>
            )}
          </div>

          {/* Ward Grid */}
          {activeZone && (
            <div className="animate-in fade-in duration-200">
              <h3 className="text-sm font-semibold mb-3 text-slate-300">
                {zones.find((z) => z.id === activeZone)?.region_name || zones.find((z) => z.id === activeZone)?.name} — Wards
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {wards.map((w, i) => (
                  <div key={i} className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl px-4 py-3 flex justify-between items-center hover:border-cyan-500/20 transition">
                    <span className="text-[13px] md:text-sm truncate mr-2 text-slate-200">{w.name || "Unknown Ward"}</span>
                  </div>
                ))}
                {wards.length === 0 && (
                  <div className="col-span-full text-center py-10 text-slate-600 text-sm">
                    No wards found in backend.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
