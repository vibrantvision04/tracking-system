"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Alert } from "@/lib/types";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [typeF, setTypeF] = useState("");
  const [sevF, setSevF] = useState("");

  useEffect(() => {
    api<{ data: Alert[] }>("/api/alerts?limit=100").then((r) => setAlerts(r.data || [])).catch(() => {});
  }, []);

  const filtered = alerts
    .filter((a) => !typeF || a.alert_type.toLowerCase().includes(typeF.toLowerCase()))
    .filter((a) => !sevF || a.severity === sevF);

  const sevColor: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-cyan-500" };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-dark)]">
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <h1 className="text-lg font-bold tracking-tight">🔔 Alerts & Notifications</h1>
        <div className="flex gap-2">
          <select value={typeF} onChange={(e) => setTypeF(e.target.value)}
            className="px-3 py-2 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-xs text-white outline-none">
            <option value="">All Types</option>
            <option value="overspeed">Overspeed</option>
            <option value="stoppage">Stoppage</option>
            <option value="geofence">Geofence</option>
            <option value="unauthorized">Unauthorized</option>
          </select>
          <select value={sevF} onChange={(e) => setSevF(e.target.value)}
            className="px-3 py-2 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-xs text-white outline-none">
            <option value="">All Severity</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((a) => (
          <div key={a.id} className={`bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-4 flex gap-3 transition ${a.is_resolved ? "opacity-40" : ""}`}>
            <div className={`w-1 rounded-full shrink-0 ${sevColor[a.severity] || "bg-slate-500"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <span className="font-semibold text-sm">{a.alert_type}</span>
                <span className="text-[10px] text-slate-500 shrink-0">{new Date(a.alert_time).toLocaleString()}</span>
              </div>
              <div className="text-xs text-slate-400 mb-2 leading-relaxed">{a.detail}</div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-indigo-400 font-medium">{a.registration_no || a.imei}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${a.is_resolved ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                  {a.is_resolved ? "Resolved" : "Open"}
                </span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-600">
            <div className="text-3xl mb-3">🔕</div>
            <p className="text-sm">No alerts. They&apos;re auto-generated when vehicles overspeed, stop, or exit geofences.</p>
          </div>
        )}
      </div>
    </div>
  );
}
