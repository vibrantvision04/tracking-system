"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Alert } from "@/lib/types";
import PageHeader from "@/components/ui/PageHeader";
import Select from "@/components/ui/Select";

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
    <div className="flex-1 flex flex-col h-full bg-theme-base">
      <PageHeader
        title="Alerts & Notifications"
        description="Monitor system events, violations, and real-time notifications."
        icon="🔔"
      >
        <div className="flex gap-2 w-[400px]">
          <Select
            value={typeF}
            onChange={(e) => setTypeF(e.target.value)}
            options={[
              { value: "", label: "All Types" },
              { value: "overspeed", label: "Overspeed" },
              { value: "stoppage", label: "Stoppage" },
              { value: "geofence", label: "Geofence" },
              { value: "unauthorized", label: "Unauthorized" }
            ]}
          />
          <Select
            value={sevF}
            onChange={(e) => setSevF(e.target.value)}
            options={[
              { value: "", label: "All Severity" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" }
            ]}
          />
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-3 max-w-4xl mx-auto w-full">
        {filtered.map((a, idx) => (
          <div key={`${a.id}-${idx}`} className={`bg-theme-surface border border-theme-border rounded-xl p-4 flex gap-3 transition ${a.is_resolved ? "opacity-40" : ""}`}>
            <div className={`w-1 rounded-full shrink-0 ${sevColor[a.severity] || "bg-theme-surface0"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <span className="font-semibold text-sm text-theme-text">{a.alert_type}</span>
                <span className="text-[10px] text-theme-text-dim shrink-0">{new Date(a.alert_time).toLocaleString()}</span>
              </div>
              <div className="text-xs text-theme-text-dim mb-2 leading-relaxed">{a.detail}</div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-theme-accent font-medium">{a.registration_no || a.imei}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${a.is_resolved ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                  {a.is_resolved ? "Resolved" : "Open"}
                </span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-theme-text-dim">
            <div className="text-3xl mb-3">🔕</div>
            <p className="text-sm">No alerts. They're auto-generated when vehicles overspeed, stop, or exit geofences.</p>
          </div>
        )}
      </div>
    </div>
  );
}
