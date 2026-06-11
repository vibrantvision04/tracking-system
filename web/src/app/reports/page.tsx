"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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
}

interface ReportsResponse {
  success: boolean;
  data: MovementReport[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<MovementReport[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [zones, setZones] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const limit = 10;

  const load = (d: string, p: number, vId: string) => {
    setLoading(true);
    const vParam = vId ? `&vehicle_id=${vId}` : "";
    api<ReportsResponse>(`/api/reports?from=${d}&to=${d}&page=${p}&limit=${limit}${vParam}&force=true`)
      .then((r) => {
        setReports(r.data || []);
        setTotalPages(r.total_pages || 1);
        setPage(r.page || 1);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(date, page, selectedVehicle);
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

  const formatCoord = (jsonStr: string) => {
    try {
      const obj = JSON.parse(jsonStr);
      return `${obj.lat.toFixed(4)}, ${obj.lng.toFixed(4)}`;
    } catch (e) {
      return jsonStr;
    }
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
              <div>
                <label className="block text-xs font-medium text-theme-text-dim mb-2">Zone</label>
                <select className="w-full px-3 py-2.5 bg-theme-surface border border-theme-border rounded-lg text-sm outline-none focus:border-indigo-500">
                  <option>Select Zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.region_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-theme-text-dim mb-2">Ward</label>
                <select className="w-full px-3 py-2.5 bg-theme-surface border border-theme-border rounded-lg text-sm outline-none focus:border-indigo-500">
                  <option>Select Ward</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>{w.region_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-theme-text-dim mb-2">Vehicle(s) RTO</label>
                <select 
                  value={selectedVehicle}
                  onChange={(e) => setSelectedVehicle(e.target.value)}
                  className="w-full px-3 py-2.5 bg-theme-surface border border-theme-border rounded-lg text-sm outline-none focus:border-indigo-500"
                >
                  <option value="">All Vehicles</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.registration_no}</option>
                  ))}
                </select>
              </div>
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
              <div>
                <button 
                  onClick={() => load(date, 1, selectedVehicle)}
                  className="px-6 py-2.5 bg-green-600 text-theme-text text-sm font-medium rounded-lg hover:bg-green-700 transition shadow-sm shadow-green-600/20"
                >
                  Load
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
                    <th className="px-3 py-3 font-bold text-center">TOTAL STOPPAGES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-theme-text">
                  {loading ? (
                    <tr>
                      <td colSpan={18} className="px-4 py-8 text-center text-theme-text-dim">Loading reports...</td>
                    </tr>
                  ) : reports.length === 0 ? (
                    <tr>
                      <td colSpan={18} className="px-4 py-8 text-center text-theme-text-dim">No reports found for this date.</td>
                    </tr>
                  ) : (
                    reports.map((r, i) => (
                      <tr key={r.id} className="hover:bg-theme-surface transition">
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
                        <td className="px-3 py-3 font-mono">{r.total_active_duration}</td>
                        <td className="px-3 py-3 font-mono font-bold text-slate-900 text-center">{r.total_distance.toFixed(2)}</td>
                        <td className="px-3 py-3 font-mono text-center">{r.average_speed.toFixed(1)}</td>
                        <td className="px-3 py-3 font-mono font-bold text-center text-indigo-600">{r.actual_ignition_on_duration}</td>
                        <td className="px-3 py-3 font-mono">{r.total_ignition_on_duration}</td>
                        <td className="px-3 py-3 font-mono">{r.total_stoppage_duration}</td>
                        <td className="px-3 py-3 font-mono">{r.total_idle_duration}</td>
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
