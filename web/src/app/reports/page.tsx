"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { MovementReport } from "@/lib/types";

export default function ReportsPage() {
  const [reports, setReports] = useState<MovementReport[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = (d: string) => {
    api<{ data: MovementReport[] }>(`/api/reports?date=${d}`).then((r) => setReports(r.data || [])).catch(() => { });
  };
  useEffect(() => load(date), [date]);

  const totDist = reports.reduce((s, r) => s + (r.total_distance || 0), 0);
  const avgSpd = reports.length ? reports.reduce((s, r) => s + (r.average_speed || 0), 0) / reports.length : 0;
  const maxSpd = reports.length ? Math.max(...reports.map((r) => r.max_speed || 0)) : 0;
  const totAlerts = reports.reduce((s, r) => s + (r.alert || 0), 0);

  const r = expanded !== null ? reports.find((rr) => rr.id === expanded) : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[var(--bg-dark)]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="hidden md:block text-lg font-bold tracking-tight">📊 Movement Reports</h1>
        <div className="flex flex-wrap gap-3 items-center w-full sm:w-auto">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="flex-1 sm:flex-none px-3 py-2 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-sm text-white outline-none" />
          <div className="flex gap-2 w-full sm:w-auto">
            <button className="flex-1 sm:flex-none px-4 py-2 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-xs text-white hover:bg-red-600/20 transition font-medium">📄 PDF</button>
            <button className="flex-1 sm:flex-none px-4 py-2 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-xs text-white hover:bg-green-600/20 transition font-medium">📊 CSV</button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total Distance", value: `${totDist.toFixed(1)} km`, sub: `${reports.length} vehicles` },
          { label: "Avg Speed", value: `${avgSpd.toFixed(1)} km/h`, sub: "fleet avg" },
          { label: "Max Speed", value: `${maxSpd} km/h`, sub: "peak recorded" },
          { label: "Alerts", value: `${totAlerts}`, sub: "overspeed + stoppage", color: totAlerts > 0 ? "text-red-400" : "text-green-400" },
        ].map((c, i) => (
          <div key={i} className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.color || ""}`}>{c.value}</div>
            <div className="text-[10px] text-slate-600 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[.06] text-slate-500 text-[10px] uppercase tracking-wider">
                {["Reg No", "Type", "Zone/Ward", "Dist(km)", "Avg Spd", "Max Spd", "Active", "Idle", "Stoppage", "Parking", "Ign ON", "Alerts"].map((h) => (
                  <th key={h} className="text-left px-3 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map((rr) => (
                <tr key={rr.id} onClick={() => setExpanded(expanded === rr.id ? null : rr.id)}
                  className="border-b border-white/[.04] hover:bg-white/[.015] cursor-pointer transition">
                  <td className="px-3 py-2.5 font-semibold text-[13px]">{rr.registration_no || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">{rr.vehicle_type || "—"}</td>
                  <td className="px-3 py-2.5 text-xs">{rr.zone || "—"}<br /><span className="text-slate-500">{rr.ward || ""}</span></td>
                  <td className="px-3 py-2.5 text-xs">{rr.total_distance?.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-xs">{rr.average_speed?.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-xs">{rr.max_speed}</td>
                  <td className="px-3 py-2.5 text-xs text-green-400">{rr.total_active_duration}</td>
                  <td className="px-3 py-2.5 text-xs text-amber-400">{rr.total_idle_duration}</td>
                  <td className="px-3 py-2.5 text-xs text-red-400">{rr.total_stoppage_duration}</td>
                  <td className="px-3 py-2.5 text-xs">{rr.in_parking_duration}</td>
                  <td className="px-3 py-2.5 text-xs">{rr.total_ignition_on_duration}</td>
                  <td className="px-3 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${rr.alert > 0 ? "bg-red-500/10 text-red-400" : "bg-slate-500/10 text-slate-500"}`}>{rr.alert}</span></td>
                </tr>
              ))}
              {reports.length === 0 && <tr><td colSpan={12} className="text-center py-10 text-slate-600 text-sm">No reports for {date}. Reports are auto-generated from GPS data.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expanded Detail */}
      {r && (
        <div className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-4 md:p-5 mt-4">
          <h3 className="text-sm font-bold mb-4">{r.registration_no} — Detailed Report</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              ["Distance", `${r.total_distance} km`],
              ["Avg Speed", `${r.average_speed} km/h`],
              ["Max Speed", `${r.max_speed} km/h`],
              ["Active", r.total_active_duration],
              ["Idle", r.total_idle_duration],
              ["Stoppage", r.total_stoppage_duration],
              ["Parking", r.in_parking_duration],
              ["Ignition ON", r.total_ignition_on_duration],
              ["Actual Ign ON", r.actual_ignition_on_duration],
              ["Running", r.total_running_duration],
              ["Fuel (ltr)", `${r.fuel_in_ltr}`],
              ["Fuel Used", `${r.fuel_consumption}`],
              ["Overspeed", r.overspeed_count],
              ["OS Dist", `${r.overspeed_distance} km`],
              ["Alerts", `${r.alert}`],
              ["IMEI", r.imei],
            ].map(([label, value]) => (
              <div key={label} className="bg-[var(--bg-surface)] rounded-lg p-3">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
                <div className="text-[13px] font-semibold truncate text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
