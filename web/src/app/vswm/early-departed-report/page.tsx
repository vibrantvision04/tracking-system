"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import {
  Calendar, Clock, AlertTriangle, CheckCircle, XCircle,
  MapPin, Building2, Truck, Gauge, Zap, Timer, Download
} from "lucide-react";

import ReportHeader from "@/components/shared/ReportHeader";
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";

interface ZoneOption { id: number; name: string }
interface WardOption { id: number; name: string; parent_id: number }
interface ShiftOption { id: number; shift_name: string; start_time: string; end_time: string }

interface EarlyDepartureRow {
  vehicle_id: number;
  registration_no: string;
  vehicle_type: string;
  driver_name: string;
  zone: string;
  ward: string;
  assigned_shift: string;
  shift_start: string;
  shift_end: string;
  configured_threshold: string;
  last_meaningful_ign_off: string;
  last_meaningful_ign_on: string;
  distance_after_restart: number;
  ignition_on_after_restart: string;
  movement_duration_after: string;
  is_early_departure: boolean;
  status: string;
  remarks: string;
  reason_code: string;
  distance_after_restart_km: number;
  ignition_after_restart_sec: number;
  movement_after_restart_sec: number;
}

interface BackendMeta {
  success: boolean;
  date: string;
  shift_name: string;
  shift_start: string;
  shift_end: string;
  shift_completed: boolean;
  configured_threshold: string;
  threshold_preset: string;
  min_distance_km: number;
  min_ignition_sec: number;
  min_movement_sec: number;
  validation_mode: string;
  data: EarlyDepartureRow[];
}

const THRESHOLD_PRESETS = [
  { value: "2h", label: "2 hrs before end (Default)" },
  { value: "1h", label: "1 hr before end" },
  { value: "3h", label: "3 hrs before end" },
  { value: "custom", label: "Custom time" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "early_departed", label: "Early Departed" },
  { value: "potential", label: "Potential Early Departure" },
  { value: "normal", label: "Normal" },
];

export default function EarlyDepartureReportPage() {
  const [data, setData] = useState<EarlyDepartureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [meta, setMeta] = useState<BackendMeta | null>(null);

  const [reportDate, setReportDate] = useState("");
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [selectedWardId, setSelectedWardId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [thresholdPreset, setThresholdPreset] = useState("2h");
  const [customThreshold, setCustomThreshold] = useState("13:00");
  const [minDist, setMinDist] = useState("0.5");
  const [minIgnSec, setMinIgnSec] = useState("300");
  const [minMovSec, setMinMovSec] = useState("300");

  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [wards, setWards] = useState<WardOption[]>([]);
  const [vehicles, setVehicles] = useState<{ id: number; reg_no: string }[]>([]);

  useEffect(() => {
    setReportDate(new Date().toLocaleDateString("en-CA"));
    loadFilters();
  }, []);

  const loadFilters = async () => {
    try {
      const [shiftRes, zoneRes, wardRes, vehRes] = await Promise.all([
        api<{ success: boolean; data: { id: number; shift_name: string; start_time: string; end_time: string }[] }>("/api/shifts"),
        api<{ success: boolean; data: { id: number; region_name: string }[] }>("/api/zones"),
        api<{ success: boolean; data: { id: number; region_name: string; parent_id: number }[] }>("/api/wards"),
        api<{ success: boolean; data: { id: number; registration_no: string }[] }>("/api/vehicles"),
      ]);
      if (shiftRes?.data) setShifts(shiftRes.data);
      if (zoneRes?.data) setZones(zoneRes.data.map((z: any) => ({ id: z.id, name: z.region_name || z.name })));
      if (wardRes?.data) setWards(wardRes.data.map((w: any) => ({ id: w.id, name: w.region_name || w.name, parent_id: w.parent_id })));
      if (vehRes?.data) setVehicles(vehRes.data.map((v: any) => ({ id: v.id, reg_no: v.registration_no })));
    } catch { /* ignore */ }
  };

  const filteredWards = useMemo(() => {
    if (!selectedZoneId) return wards;
    return wards.filter((w) => w.parent_id === parseInt(selectedZoneId));
  }, [wards, selectedZoneId]);

  const handleLoadReport = async () => {
    setLoading(true);
    setHasLoaded(false);
    try {
      const params = new URLSearchParams();
      if (reportDate) params.append("date", reportDate);
      if (selectedShiftId) params.append("shift_id", selectedShiftId);
      if (selectedZoneId) params.append("zone_id", selectedZoneId);
      if (selectedWardId) params.append("ward_id", selectedWardId);
      if (selectedVehicleId) params.append("vehicle_id", selectedVehicleId);
      if (statusFilter) params.append("status", statusFilter);
      params.append("threshold_preset", thresholdPreset);
      if (thresholdPreset === "custom") params.append("threshold", customThreshold + ":00");
      params.append("min_distance_km", minDist);
      params.append("min_ignition_duration_sec", minIgnSec);
      params.append("min_movement_duration_sec", minMovSec);

      const res = await api<BackendMeta>(`/api/reports/early-departed?${params.toString()}`);
      setMeta(res);
      setData(res?.data || []);
      setHasLoaded(true);
      if (!res?.data || res.data.length === 0) {
        toast.info("No vehicles found for the selected filters.");
      }
    } catch {
      toast.error("Failed to load early departure report.");
      setData([]);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const earlyCount = data.filter((r) => r.status === "Early Departed").length;
  const potentialCount = data.filter((r) => r.status === "Potential Early Departure").length;
  const normalCount = data.filter((r) => r.status === "Normal").length;

  const handleExportCSV = useCallback(() => {
    if (!data.length) { toast.info("No data to export."); return; }

    const headers = [
      "S.No", "Vehicle No", "Vehicle Type", "Zone", "Ward",
      "Shift", "Shift Window", "Threshold",
      "Last Ign OFF", "Last Ign ON",
      "Dist After (km)", "Ign After", "Mov After",
      "Status", "Reason Code", "Remarks"
    ];

    const rows = data.map((r, idx) => [
      idx + 1,
      r.registration_no,
      r.vehicle_type || "-",
      r.zone || "-",
      r.ward || "-",
      r.assigned_shift,
      `${r.shift_start}-${r.shift_end}`,
      r.configured_threshold,
      r.last_meaningful_ign_off,
      r.last_meaningful_ign_on,
      r.distance_after_restart > 0 ? r.distance_after_restart.toFixed(3) : "0",
      r.ignition_on_after_restart || "00:00:00",
      r.movement_duration_after || "00:00:00",
      r.status,
      r.reason_code,
      `"${r.remarks.replace(/"/g, '""')}"`,
    ]);

    const csv = [
      "\uFEFF" + headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `early-departure-report-${reportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully.");
  }, [data, reportDate]);

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans">
      <div className="print:hidden">
        <ReportHeader
          title="Early Departure Report"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleExportCSV} loading={loading}>
                <Download size={14} /> CSV
              </Button>
            </div>
          }
        />
      </div>
      <div className="hidden print:block text-left mb-6">
        <h1 className="text-xl font-bold uppercase tracking-tight">Early Departure Report</h1>
        <p className="text-xs text-slate-500 mt-1">Date: {reportDate || new Date().toLocaleDateString()}</p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
        <Card className="shrink-0 border border-theme-border shadow-sm print:hidden">
          <CardContent className="p-4 md:p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <Calendar size={12} className="text-amber-500" /> Date
                </label>
                <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer" />
              </div>
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <Clock size={12} className="text-blue-500" /> Shift
                </label>
                <select value={selectedShiftId} onChange={(e) => setSelectedShiftId(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer">
                  <option value="">Auto Detect</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>{s.shift_name} ({s.start_time?.slice(0,5)}-{s.end_time?.slice(0,5)})</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <Building2 size={12} className="text-indigo-500" /> Zone
                </label>
                <select value={selectedZoneId} onChange={(e) => { setSelectedZoneId(e.target.value); setSelectedWardId(""); }}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer">
                  <option value="">All Zones</option>
                  {zones.map((z) => (<option key={z.id} value={z.id}>{z.name}</option>))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <MapPin size={12} className="text-purple-500" /> Ward
                </label>
                <select value={selectedWardId} onChange={(e) => setSelectedWardId(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer">
                  <option value="">All Wards</option>
                  {filteredWards.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <Truck size={12} className="text-teal-500" /> Vehicle
                </label>
                <select value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer">
                  <option value="">All Vehicles</option>
                  {vehicles.map((v) => (<option key={v.id} value={v.id}>{v.reg_no}</option>))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <Timer size={12} className="text-rose-500" /> Threshold
                </label>
                <select value={thresholdPreset} onChange={(e) => setThresholdPreset(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer">
                  {THRESHOLD_PRESETS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
                </select>
              </div>
              {thresholdPreset === "custom" && (
                <div className="flex flex-col gap-1.5 text-left w-full">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                    <Clock size={12} className="text-rose-500" /> Custom Time
                  </label>
                  <input type="time" value={customThreshold} onChange={(e) => setCustomThreshold(e.target.value)}
                    className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer" />
                </div>
              )}
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <Gauge size={12} className="text-sky-500" /> Min Dist (km)
                </label>
                <input type="number" step="0.1" min="0" value={minDist} onChange={(e) => setMinDist(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition" />
              </div>
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <Zap size={12} className="text-yellow-500" /> Min Ign (sec)
                </label>
                <input type="number" step="10" min="0" value={minIgnSec} onChange={(e) => setMinIgnSec(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition" />
              </div>
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500" /> Status
                </label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer">
                  {STATUS_OPTIONS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-theme-border flex items-center gap-4 flex-wrap">
              <Button variant="accent" onClick={handleLoadReport} loading={loading} loadingText="Loading..." className="px-6">
                Load Report
              </Button>
              {meta && (
                <div className="text-[10px] text-theme-text-dim italic flex flex-wrap gap-x-4 gap-y-1">
                  <span>Threshold: {meta.configured_threshold}</span>
                  <span>Mode: {meta.validation_mode}</span>
                  <span>Min: {meta.min_distance_km}km / {meta.min_ignition_sec}s / {meta.min_movement_sec}s</span>
                  {!meta.shift_completed && (
                    <span className="text-amber-500 font-semibold">⚠ Shift still active</span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {hasLoaded && data.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 shrink-0">
            <div className="bg-theme-surface border border-theme-border rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center"><Truck size={18} className="text-blue-500" /></div>
              <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-theme-text-dim">Analyzed</div><div className="text-lg font-bold text-theme-text">{data.length}</div></div>
            </div>
            <div className="bg-theme-surface border border-theme-border rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center"><XCircle size={18} className="text-rose-500" /></div>
              <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-theme-text-dim">Early Departed</div><div className="text-lg font-bold text-rose-500">{earlyCount}</div></div>
            </div>
            <div className="bg-theme-surface border border-theme-border rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center"><AlertTriangle size={18} className="text-amber-500" /></div>
              <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-theme-text-dim">Potential</div><div className="text-lg font-bold text-amber-500">{potentialCount}</div></div>
            </div>
            <div className="bg-theme-surface border border-theme-border rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center"><CheckCircle size={18} className="text-emerald-500" /></div>
              <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-theme-text-dim">Normal</div><div className="text-lg font-bold text-emerald-500">{normalCount}</div></div>
            </div>
          </div>
        )}

        <Card className="overflow-hidden border border-theme-border shadow-sm">
          <CardContent className="p-0">
            <Table
              headers={[
                <div key="s" className="text-center w-12 text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">#</div>,
                <span key="veh" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Vehicle</span>,
                <span key="zone" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Zone</span>,
                <span key="ward" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Ward</span>,
                <span key="shift" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Shift</span>,
                <span key="threshold" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Thresh</span>,
                <span key="lastOff" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Ign OFF</span>,
                <span key="lastOn" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Ign ON</span>,
                <span key="dist" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-right">Dist</span>,
                <span key="ign" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-right">Ign</span>,
                <span key="mov" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-right">Mov</span>,
                <span key="status" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-center">Status</span>,
                <span key="remarks" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Remarks</span>,
              ]}
              isLoading={loading}
              emptyState={
                !hasLoaded
                  ? <div className="flex flex-col items-center justify-center py-12 text-theme-text-dim/60">
                      <span className="text-3xl">📊</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider mt-2">Report Not Loaded</span>
                      <span className="text-[10px] mt-1">Select filters and click &quot;Load Report&quot;.</span>
                    </div>
                  : <div className="flex flex-col items-center justify-center py-12 text-theme-text-dim/60">
                      <span className="text-3xl">✅</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider mt-2">No Vehicles Found</span>
                      <span className="text-[10px] mt-1">All vehicles completed their shift normally.</span>
                    </div>
              }
            >
              {data.map((row, idx) => {
                const isEarly = row.reason_code === "early_departure" || row.reason_code === "ignition_manipulation";
                const isPotential = row.reason_code === "shift_active";
                return (
                  <tr key={row.vehicle_id}
                    className={`border-b border-theme-border/30 transition-colors print:border-black hover:bg-theme-base/30 ${
                      isEarly ? "bg-rose-500/5" : isPotential ? "bg-amber-500/5" : ""
                    }`}>
                    <td className="py-3 px-4 text-center text-theme-text-dim font-mono text-[10px]">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-theme-text text-xs">{row.registration_no}</td>
                    <td className="py-3 px-4 text-xs text-theme-text-dim">{row.zone || "-"}</td>
                    <td className="py-3 px-4 text-xs text-theme-text-dim">{row.ward || "-"}</td>
                    <td className="py-3 px-4 text-xs font-mono text-theme-text-dim whitespace-nowrap">{row.shift_start}-{row.shift_end}</td>
                    <td className="py-3 px-4 text-xs font-mono font-semibold text-theme-text">{row.configured_threshold}</td>
                    <td className={`py-3 px-4 text-xs font-mono whitespace-nowrap ${isEarly ? "text-rose-500 font-bold" : "text-theme-text-dim"}`}>{row.last_meaningful_ign_off}</td>
                    <td className="py-3 px-4 text-xs font-mono text-theme-text-dim whitespace-nowrap">{row.last_meaningful_ign_on}</td>
                    <td className="py-3 px-4 text-xs font-mono text-right text-theme-text-dim">
                      {row.distance_after_restart > 0 ? `${row.distance_after_restart.toFixed(3)}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-right text-theme-text-dim">{row.ignition_on_after_restart || "—"}</td>
                    <td className="py-3 px-4 text-xs font-mono text-right text-theme-text-dim">{row.movement_duration_after || "—"}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isEarly ? "bg-rose-500/20 text-rose-600"
                          : isPotential ? "bg-amber-500/20 text-amber-600"
                          : "bg-emerald-500/20 text-emerald-600"
                      }`}>
                        {isEarly ? <XCircle size={10} /> : isPotential ? <AlertTriangle size={10} /> : <CheckCircle size={10} />}
                        {isEarly ? "Early" : isPotential ? "Potential" : "Normal"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[10px] text-theme-text-dim max-w-[240px]" title={row.remarks}>
                      <span className="line-clamp-2">{row.remarks}</span>
                    </td>
                  </tr>
                );
              })}
            </Table>
            {hasLoaded && meta && (
              <div className="bg-theme-surface border-t border-theme-border px-5 py-3 text-xs font-bold text-theme-text-dim uppercase tracking-wider shrink-0 flex items-center justify-between">
                <span>{data.length} vehicle{data.length !== 1 ? "s" : ""}</span>
                <span className="text-[10px] font-mono tracking-normal normal-case">
                  {meta.shift_name} ({meta.shift_start}-{meta.shift_end})
                  &nbsp;|&nbsp;Thresh: {meta.configured_threshold}
                  &nbsp;|&nbsp;Mode: {meta.validation_mode}
                  {!meta.shift_completed && <span className="text-amber-500 ml-2">⚠ Active</span>}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
