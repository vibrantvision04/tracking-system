"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Alert } from "@/lib/types";
import PageHeader from "@/components/shared/PageHeader";
import Select from "@/components/ui/Select";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [typeF, setTypeF] = useState("");
  const [sevF, setSevF] = useState("");

  useEffect(() => {
    api<{ data: Alert[] }>("/api/alerts?limit=100").then((r) => setAlerts(r.data || [])).catch(() => {});
  }, []);

  const getAlertTypeName = (alertType: any): string => {
    if (!alertType) return "";
    if (typeof alertType === "object" && alertType.alert_type_name) {
      return alertType.alert_type_name;
    }
    return String(alertType);
  };

  const filtered = alerts
    .filter((a) => {
      if (!typeF) return true;
      const name = getAlertTypeName(a.alert_type);
      return name.toLowerCase().includes(typeF.toLowerCase());
    })
    .filter((a) => !sevF || a.severity === sevF);

  const sevColor: Record<string, string> = { high: "bg-rose-500", medium: "bg-amber-500", low: "bg-blue-500" };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base select-none font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Alerts & Notifications"
        description="Monitor system events, violations, and real-time notifications."
        breadcrumbs={[
          { label: "Fleet", href: "/vehicles" },
          { label: "Alerts & Notifications" }
        ]}
        actions={
          <div className="flex gap-3 w-[400px]">
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
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 max-w-4xl mx-auto w-full pb-8">
        {filtered.map((a, idx) => (
          <div key={`${a.id}-${idx}`} className={`bg-gradient-to-br from-white/95 to-slate-50/50 border border-slate-200/60 rounded-xl p-4 flex gap-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${a.is_resolved ? "opacity-50" : ""}`}>
            <div className={`w-1 rounded-full shrink-0 ${sevColor[a.severity] || "bg-slate-350"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1.5">
                <span className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">{getAlertTypeName(a.alert_type)}</span>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{new Date(a.alert_time).toLocaleString()}</span>
              </div>
              <div className="text-[11px] font-medium text-slate-400 mb-2.5 leading-relaxed">{a.detail}</div>
              <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                <span className="text-[10px] font-bold text-emerald-600 font-mono tracking-tight">{a.registration_no || a.imei}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-widest border ${a.is_resolved ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100"}`}>
                  {a.is_resolved ? "Resolved" : "Open"}
                </span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400 select-none">
            <div className="text-3xl mb-3">🔕</div>
            <p className="text-xs font-black uppercase tracking-widest">No alerts recorded</p>
            <p className="text-[10px] text-slate-400 mt-1 leading-normal max-w-sm mx-auto">They are auto-generated when vehicles overspeed, stop, or exit geofences.</p>
          </div>
        )}
      </div>
    </div>
  );
}
