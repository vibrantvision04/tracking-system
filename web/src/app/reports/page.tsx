"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import SearchableDropdown from "@/components/shared/SearchableDropdown";

interface MovementReport {
  id: number;
  report_date: string;
  registration_no: string;
  vehicle_type: string;
  zone: string;
  ward: string;
  start_point: string;
  end_point: string;
  start_time: string;
  end_time: string;
  total_active_duration: string;
  total_distance: number;
  average_speed: number;
  actual_ignition_on_duration: string;
  total_ignition_on_duration: string;
  total_stoppage_duration: string;
  total_idle_duration: string;
  stoppages_count: number;
  minor_stoppages: number;
  major_stoppages: number;
}

interface ReportsResponse {
  success: boolean;
  data: MovementReport[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

const formatDuration = (durationStr: string) => {
  if (!durationStr || durationStr === "00:00:00" || durationStr === "-") return "-";
  const parts = durationStr.split(":");
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseInt(parts[2], 10);
    const hStr = h > 0 ? `${h}h ` : '';
    const mStr = m > 0 ? `${m}m ` : '';
    const sStr = s > 0 ? `${s}s` : (h === 0 && m === 0 ? '0s' : '');
    const output = `${hStr}${mStr}${sStr}`.trim();
    return output || "-";
  }
  return durationStr;
};

export default function ReportsPage() {
  const [reports, setReports] = useState<MovementReport[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [zones, setZones] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [selectedWard, setSelectedWard] = useState<string>("");
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");

  const [zoneSearch, setZoneSearch] = useState("");
  const [wardSearch, setWardSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");

  const [zoneOpen, setZoneOpen] = useState(false);
  const [wardOpen, setWardOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);

  const zoneRef = useRef<HTMLDivElement>(null);
  const wardRef = useRef<HTMLDivElement>(null);
  const vehicleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (zoneRef.current && !zoneRef.current.contains(e.target as Node)) setZoneOpen(false);
      if (wardRef.current && !wardRef.current.contains(e.target as Node)) setWardOpen(false);
      if (vehicleRef.current && !vehicleRef.current.contains(e.target as Node)) setVehicleOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const limit = 10;

  const allowHistoricalRecalculation = true; // Set to false to disable recalculation in UI

  const load = (d: string, p: number, vId: string, force: boolean = false) => {
    setLoading(true);
    const vParam = vId ? `&vehicle_id=${vId}` : "";
    const forceParam = force ? "&force=true" : "";
    api<ReportsResponse>(`/api/reports?from=${d}&to=${d}&page=${p}&limit=${limit}${vParam}${forceParam}`)
      .then((r) => {
        setReports(r.data || []);
        setTotalPages(r.total_pages || 1);
        setPage(r.page || 1);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(date, page, selectedVehicle, false);
  }, [date, page, selectedVehicle]);

  useEffect(() => {
    api<{success: boolean, data: any[]}>("/api/zones")
      .then((r) => setZones(r.data || []))
      .catch(() => {});
      
    api<{success: boolean, data: any[]}>("/api/wards")
      .then((r) => setWards(r.data || []))
      .catch(() => {});

    api<{success: boolean, data: any[]}>("/api/vehicles")
      .then((r) => setVehicles(r.data || []))
      .catch(() => {});
  }, []);

  const formatCoord = (val: any) => {
    if (!val) return "-";
    let obj = val;
    if (typeof val === "string") {
      try {
        obj = JSON.parse(val);
      } catch (e) {
        return val;
      }
    }
    if (obj && typeof obj === "object") {
      const lat = obj.lat !== undefined ? obj.lat : obj.y;
      const lng = obj.lng !== undefined ? obj.lng : obj.x;
      if (lat !== undefined && lng !== undefined) {
        return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
      }
    }
    return String(val);
  };

  const formatTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      // Show '—' for null/epoch (1970-01-01)
      if (d.getFullYear() <= 1970) return '—';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '—';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f8fafc] text-slate-800 overflow-hidden font-sans">
      {/* Sub-header with Title */}
      <div className="bg-white px-6 py-3 border-b border-slate-200 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-700">Vehicle Movement Report</h2>
          <div className="h-[3px] w-8 bg-emerald-500 mt-1"></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-[1600px] mx-auto">
          {/* Filters Grid */}
          <div className="bg-theme-surface rounded-xl border border-theme-border p-6 mb-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <SearchableDropdown
                label="Zone"
                selectedName={zones.find(z => z.id.toString() === selectedZone)?.region_name || "Select Zone"}
                isSelected={!!selectedZone}
                isOpen={zoneOpen}
                setOpen={setZoneOpen}
                search={zoneSearch}
                setSearch={setZoneSearch}
                items={zones.filter(z => z.region_name.toLowerCase().includes(zoneSearch.toLowerCase()))}
                onSelect={(id) => { setSelectedZone(id.toString()); setZoneOpen(false); }}
                dropdownRef={zoneRef}
                keyField="id"
                displayField="region_name"
              />
              <SearchableDropdown
                label="Ward"
                selectedName={wards.find(w => w.id.toString() === selectedWard)?.region_name || "Select Ward"}
                isSelected={!!selectedWard}
                isOpen={wardOpen}
                setOpen={setWardOpen}
                search={wardSearch}
                setSearch={setWardSearch}
                items={wards.filter(w => w.region_name.toLowerCase().includes(wardSearch.toLowerCase()))}
                onSelect={(id) => { setSelectedWard(id.toString()); setWardOpen(false); }}
                dropdownRef={wardRef}
                keyField="id"
                displayField="region_name"
              />
              <SearchableDropdown
                label="Vehicle(s) RTO"
                selectedName={vehicles.find(v => v.id.toString() === selectedVehicle)?.registration_no || "All Vehicles"}
                isSelected={!!selectedVehicle}
                isOpen={vehicleOpen}
                setOpen={setVehicleOpen}
                search={vehicleSearch}
                setSearch={setVehicleSearch}
                items={vehicles.filter(v => v.registration_no.toLowerCase().includes(vehicleSearch.toLowerCase()))}
                onSelect={(id) => {
                  // Allow deselecting to see "All Vehicles"
                  if (selectedVehicle === id.toString()) {
                    setSelectedVehicle("");
                  } else {
                    setSelectedVehicle(id.toString());
                  }
                  setVehicleOpen(false);
                }}
                dropdownRef={vehicleRef}
                keyField="id"
                displayField="registration_no"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div>
                <label className="block text-xs font-medium text-theme-text-dim mb-2">From Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-theme-surface border border-theme-border rounded-lg text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-theme-text-dim mb-2">To Date</label>
                <input type="date" value={date} readOnly
                  className="w-full px-3 py-2 bg-theme-surface border border-theme-border rounded-lg text-sm outline-none focus:border-indigo-500 bg-slate-100 cursor-not-allowed" />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => load(date, 1, selectedVehicle, false)}
                  className="px-6 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition shadow-sm shadow-green-600/20"
                >
                  Load
                </button>
                <button 
                  disabled={!allowHistoricalRecalculation}
                  onClick={() => load(date, 1, selectedVehicle, true)}
                  className={`px-6 py-2.5 text-sm font-medium rounded-lg transition shadow-sm ${
                    allowHistoricalRecalculation
                      ? "bg-rose-600 text-white hover:bg-rose-700 shadow-rose-600/20 cursor-pointer"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                  }`}
                  title={allowHistoricalRecalculation ? "Force recalculate historical report data for this date" : "Historical recalculation is disabled"}
                >
                  Recalculate
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-theme-surface rounded-xl border border-theme-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[10px]">
                <thead className="bg-theme-surface text-theme-text-dim border-b border-theme-border uppercase tracking-tighter">
                  <tr>
                    <th className="px-3 py-3 font-bold">S. NO.</th>
                    <th className="px-3 py-3 font-bold">DATE</th>
                    <th className="px-3 py-3 font-bold">VEHICLE(S) RTO</th>
                    <th className="px-3 py-3 font-bold">VEHICLE TYPE</th>
                    <th className="px-3 py-3 font-bold">ZONE</th>
                    <th className="px-3 py-3 font-bold">WARD</th>
                    <th className="px-3 py-3 font-bold">START POINT</th>
                    <th className="px-3 py-3 font-bold">END POINT</th>
                    <th className="px-3 py-3 font-bold">START TIME</th>
                    <th className="px-3 py-3 font-bold">END TIME</th>
                    <th className="px-3 py-3 font-bold">ACTIVE HOURS</th>
                    <th className="px-3 py-3 font-bold text-center">TOTAL DISTANCE (KM)</th>
                    <th className="px-3 py-3 font-bold text-center">AVERAGE SPEED (KM/H)</th>
                    <th className="px-3 py-3 font-bold">ACTUAL IGNITION ON DURATION</th>
                    <th className="px-3 py-3 font-bold">TOTAL IGNITION ON DURATION</th>
                    <th className="px-3 py-3 font-bold">TOTAL STOPPAGE DURATION</th>
                    <th className="px-3 py-3 font-bold">TOTAL IDLE DURATION</th>
                    <th className="px-3 py-3 font-bold text-center">MINOR STOPPAGES</th>
                    <th className="px-3 py-3 font-bold text-center">MAJOR STOPPAGES</th>
                    <th className="px-3 py-3 font-bold text-center">TOTAL STOPPAGES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-theme-text">
                  {loading ? (
                    <tr>
                      <td colSpan={20} className="px-4 py-8 text-center text-theme-text-dim">Loading reports...</td>
                    </tr>
                  ) : reports.length === 0 ? (
                    <tr>
                      <td colSpan={20} className="px-4 py-8 text-center text-theme-text-dim">No reports found for this date.</td>
                    </tr>
                  ) : (
                    reports.map((r, i) => (
                      <tr key={`${r.id}-${i}`} className="hover:bg-theme-surface transition">
                        <td className="px-3 py-3">{(page - 1) * limit + i + 1}</td>
                        <td className="px-3 py-3 whitespace-nowrap">{new Date(r.report_date).toLocaleDateString()}</td>
                        <td className="px-3 py-3 font-bold text-slate-900 whitespace-nowrap">{r.registration_no}</td>
                        <td className="px-3 py-3">{r.vehicle_type || "Vehicle"}</td>
                        <td className="px-3 py-3">{r.zone || "-"}</td>
                        <td className="px-3 py-3">{r.ward || "-"}</td>
                        <td className="px-3 py-3 text-indigo-600 font-mono whitespace-nowrap">{formatCoord(r.start_point)}</td>
                        <td className="px-3 py-3 text-indigo-600 font-mono whitespace-nowrap">{formatCoord(r.end_point)}</td>
                        <td className="px-3 py-3 whitespace-nowrap">{formatTime(r.start_time)}</td>
                        <td className="px-3 py-3 whitespace-nowrap">{formatTime(r.end_time)}</td>
                        <td className="px-3 py-3 font-mono">{formatDuration(r.total_active_duration)}</td>
                        <td className="px-3 py-3 font-mono font-bold text-slate-900 text-center">{r.total_distance.toFixed(2)}</td>
                        <td className="px-3 py-3 font-mono text-center">{r.average_speed.toFixed(1)}</td>
                        <td className="px-3 py-3 font-mono font-bold text-center text-indigo-600">{formatDuration(r.actual_ignition_on_duration)}</td>
                        <td className="px-3 py-3 font-mono">{formatDuration(r.total_ignition_on_duration)}</td>
                        <td className="px-3 py-3 font-mono">{formatDuration(r.total_stoppage_duration)}</td>
                        <td className="px-3 py-3 font-mono">{formatDuration(r.total_idle_duration)}</td>
                        <td className="px-3 py-3 font-semibold text-center text-slate-600">{r.minor_stoppages}</td>
                        <td className="px-3 py-3 font-semibold text-center text-slate-600">{r.major_stoppages}</td>
                        <td className="px-3 py-3 font-bold text-center text-indigo-600">{r.stoppages_count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-theme-border flex items-center justify-between bg-theme-surface">
              <div className="text-xs text-theme-text-dim">
                Page <span className="font-medium text-theme-text">{page}</span> of <span className="font-medium text-theme-text">{totalPages}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="px-3 py-1.5 border border-theme-border rounded-lg text-xs font-medium bg-theme-surface hover:bg-theme-surface disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                  className="px-3 py-1.5 border border-theme-border rounded-lg text-xs font-medium bg-theme-surface hover:bg-theme-surface disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
