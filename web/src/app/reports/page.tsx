"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface MovementReport {
  id: number;
  report_date: string;
  registration_no: string;
  vehicle_type: string;
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
  alert: number;
  zone_id: number;
  ward_id: number;
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
  const limit = 10;

  const load = (d: string, p: number) => {
    setLoading(true);
    api<ReportsResponse>(`/api/reports?date=${d}&page=${p}&limit=${limit}`)
      .then((r) => {
        setReports(r.data || []);
        setTotalPages(r.total_pages || 1);
        setPage(r.page || 1);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(date, page);
  }, [date, page]);

  useEffect(() => {
    api<{success: boolean, data: any[]}>("/api/zones")
      .then((r) => setZones(r.data || []))
      .catch(() => {});
      
    api<{success: boolean, data: any[]}>("/api/wards")
      .then((r) => setWards(r.data || []))
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

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateStr;
    }
  };

  const getZoneName = (id: number) => {
    const zone = zones.find((z: any) => z.id === id);
    return zone ? zone.region_name : "-";
  };

  const getWardName = (id: number) => {
    const ward = wards.find((w: any) => w.id === id);
    return ward ? ward.region_name : "-";
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#f8fafc]">
      <div className="max-w-[1600px] mx-auto">
        <h1 className="text-xl font-bold text-slate-800 mb-6">ISWM - NAGAR NIGAM JAIPUR</h1>

        {/* Filters Grid */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Zone</label>
              <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500">
                <option>Select Zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.region_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Ward</label>
              <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500">
                <option>Select Ward</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>{w.region_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Vehicle(s) RTO</label>
              <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500">
                <option>Select Vehicle</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">From Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">To Date</label>
              <input type="date" value={date}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <button 
                onClick={() => load(date, 1)}
                className="px-6 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition shadow-sm shadow-green-600/20"
              >
                Load
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">S. NO.</th>
                  <th className="px-4 py-3 font-semibold">DATE</th>
                  <th className="px-4 py-3 font-semibold">VEHICLE(S) RTO</th>
                  <th className="px-4 py-3 font-semibold">VEHICLE TYPE</th>
                  <th className="px-4 py-3 font-semibold">ZONE</th>
                  <th className="px-4 py-3 font-semibold">WARD</th>
                  <th className="px-4 py-3 font-semibold">START POINT</th>
                  <th className="px-4 py-3 font-semibold">END POINT</th>
                  <th className="px-4 py-3 font-semibold">START TIME</th>
                  <th className="px-4 py-3 font-semibold">END TIME</th>
                  <th className="px-4 py-3 font-semibold">ACTIVE HOURS</th>
                  <th className="px-4 py-3 font-semibold">TOTAL DISTANCE (KM)</th>
                  <th className="px-4 py-3 font-semibold">AVERAGE SPEED (KM/H)</th>
                  <th className="px-4 py-3 font-semibold">ACTUAL IGNITION ON</th>
                  <th className="px-4 py-3 font-semibold">TOTAL IGNITION ON</th>
                  <th className="px-4 py-3 font-semibold">STOPPAGE DURATION</th>
                  <th className="px-4 py-3 font-semibold">IDLE DURATION</th>
                  <th className="px-4 py-3 font-semibold">STOPPAGES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={18} className="px-4 py-8 text-center text-slate-400">Loading reports...</td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="px-4 py-8 text-center text-slate-400">No reports found for this date.</td>
                  </tr>
                ) : (
                  reports.map((r, i) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3">{(page - 1) * limit + i + 1}</td>
                      <td className="px-4 py-3">{new Date(r.report_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.registration_no}</td>
                      <td className="px-4 py-3">{r.vehicle_type || "Vehicle"}</td>
                      <td className="px-4 py-3">{getZoneName(r.zone_id)}</td>
                      <td className="px-4 py-3">{getWardName(r.ward_id)}</td>
                      <td className="px-4 py-3 text-indigo-600 font-mono">{formatCoord(r.start_point)}</td>
                      <td className="px-4 py-3 text-indigo-600 font-mono">{formatCoord(r.end_point)}</td>
                      <td className="px-4 py-3">{formatTime(r.start_time)}</td>
                      <td className="px-4 py-3">{formatTime(r.end_time)}</td>
                      <td className="px-4 py-3 font-mono">{r.total_active_duration}</td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">{r.total_distance.toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono">{r.average_speed.toFixed(1)}</td>
                      <td className="px-4 py-3 font-mono">{r.actual_ignition_on_duration}</td>
                      <td className="px-4 py-3 font-mono">{r.total_ignition_on_duration}</td>
                      <td className="px-4 py-3 font-mono">{r.total_stoppage_duration}</td>
                      <td className="px-4 py-3 font-mono">{r.total_idle_duration}</td>
                      <td className="px-4 py-3">{r.alert || 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="text-xs text-slate-500">
              Page <span className="font-medium text-slate-700">{page}</span> of <span className="font-medium text-slate-700">{totalPages}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
