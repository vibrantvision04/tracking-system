"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import { Calendar, MapPin, Building2, ChevronDown, X } from "lucide-react";

import ReportHeader from "@/components/shared/ReportHeader";
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";

interface ZoneOption { id: number; name: string }
interface WardOption { id: number; name: string; parent_id: number }

interface UnauthorizedMovementRow {
  vehicle_id: number;
  registration_no: string;
  vehicle_type: string;
  driver_name: string;
  assigned_zone: string;
  assigned_ward: string;
  unauthorized_start: string;
  unauthorized_end: string;
  total_duration_sec: number;
  total_duration: string;
  status: string;
  latitude: number;
  longitude: number;
  last_gps_time: string;
  ts_trip_count: number;
}

interface SearchableDropdownProps {
  label: string;
  placeholder?: string;
  options: { id: number; label: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  icon?: React.ReactNode;
}

function SearchableDropdown({ label, placeholder = "Select…", options, selectedId, onSelect, icon }: SearchableDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.id === selectedId);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="flex flex-col gap-1.5 text-left w-full">
      <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
        {icon && <span className="text-theme-accent">{icon}</span>}{label}
      </label>
      <div onClick={() => setOpen((o) => !o)}
        className={`relative bg-theme-surface border rounded-xl px-3.5 py-2.5 text-xs cursor-pointer flex items-center justify-between transition-all duration-150 ${open ? "border-[#10B981] ring-2 ring-[#10B981]/10" : "border-theme-border hover:border-theme-accent/40"}`}>
        <span className={selected ? "text-theme-text font-medium truncate" : "text-theme-text-dim truncate"}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {selected && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(null); }}
              className="text-theme-text-dim hover:text-rose-400 transition"><X size={12} /></button>
          )}
          <ChevronDown size={14} className={`text-theme-text-dim transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
        {open && (
          <div className="absolute left-0 top-[calc(100%+6px)] w-full bg-theme-surface border border-theme-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="p-2 border-b border-theme-border">
              <input autoFocus placeholder={`Search ${label}…`} value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-theme-text placeholder:text-theme-text-dim outline-none" />
            </div>
            <div className="max-h-52 overflow-y-auto custom-scrollbar">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-xs text-theme-text-dim italic text-center">No options found</div>
              ) : (
                filtered.map((opt) => (
                  <div key={opt.id} onClick={() => { onSelect(opt.id); setOpen(false); setSearch(""); }}
                    className={`px-4 py-2 cursor-pointer text-xs transition-colors text-left ${opt.id === selectedId ? "bg-[#10B981]/10 text-[#10B981] font-semibold" : "text-theme-text hover:bg-theme-base"}`}>
                    {opt.label}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UnauthorizedMovementReportPage() {
  const [reportData, setReportData] = useState<UnauthorizedMovementRow[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [wards, setWards] = useState<WardOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [reportDate, setReportDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    setReportDate(new Date().toLocaleDateString("en-CA"));
    loadFilters();
  }, []);

  const loadFilters = async () => {
    try {
      const [zoneRes, wardRes] = await Promise.all([
        api<{ data: { id: number; region_name: string }[] }>("/api/zones"),
        api<{ data: { id: number; region_name: string; parent_id: number }[] }>("/api/wards"),
      ]);
      if (zoneRes.data) setZones(zoneRes.data.map((z: any) => ({ id: z.id, name: z.region_name || z.name })));
      if (wardRes.data) setWards(wardRes.data.map((w: any) => ({ id: w.id, name: w.region_name || w.name, parent_id: w.parent_id })));
    } catch { /* ignore */ }
  };

  const filteredWardsOptions = useMemo(() => {
    if (!selectedZoneId) return wards;
    return wards.filter((w) => w.parent_id === selectedZoneId);
  }, [wards, selectedZoneId]);

  const zoneDropdownOptions = useMemo(() => zones.map((z) => ({ id: z.id, label: z.name })), [zones]);
  const wardDropdownOptions = useMemo(() => filteredWardsOptions.map((w) => ({ id: w.id, label: w.name })), [filteredWardsOptions]);

  const handleLoadReport = async () => {
    setLoading(true);
    setHasLoaded(false);
    try {
      const params = new URLSearchParams();
      if (reportDate) params.append("date", reportDate);
      if (selectedZoneId) params.append("zone_id", String(selectedZoneId));
      if (selectedWardId) params.append("ward_id", String(selectedWardId));
      if (statusFilter) params.append("status", statusFilter);

      const res = await api<{ success: boolean; data: UnauthorizedMovementRow[] }>(
        `/api/reports/unauthorized-movement?${params.toString()}`
      );
      setReportData(res.data || []);
      setHasLoaded(true);
      if (!res.data || res.data.length === 0) {
        toast.info("No unauthorized movements found for the selected filters.");
      }
    } catch {
      toast.error("Failed to load unauthorized movement report.");
      setReportData([]);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const activeCount = reportData.filter((r) => r.status === "Active").length;
  const completedCount = reportData.filter((r) => r.status === "Completed").length;

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans">
      <div className="print:hidden">
        <ReportHeader title="Unauthorized Movement Report" />
      </div>
      <div className="hidden print:block text-left mb-6">
        <h1 className="text-xl font-bold uppercase tracking-tight">Unauthorized Movement Report</h1>
        <p className="text-xs text-slate-500 mt-1">Date: {reportDate || new Date().toLocaleDateString()}</p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
        <Card className="shrink-0 border border-theme-border shadow-sm print:hidden">
          <CardContent className="p-4 md:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <SearchableDropdown label="Zone" placeholder="All Zones" options={zoneDropdownOptions}
                selectedId={selectedZoneId}
                onSelect={(id) => { setSelectedZoneId(id); setSelectedWardId(null); }}
                icon={<Building2 size={12} />} />
              <SearchableDropdown label="Ward" placeholder="All Wards" options={wardDropdownOptions}
                selectedId={selectedWardId} onSelect={setSelectedWardId} icon={<MapPin size={12} />} />
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <Calendar size={12} className="text-amber-500" /> Date
                </label>
                <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition cursor-pointer" />
              </div>
              <div className="flex flex-col gap-1.5 text-left w-full">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim">Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text outline-none focus:border-[#10B981] transition">
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-theme-border flex justify-start">
              <Button variant="accent" onClick={handleLoadReport} loading={loading} loadingText="Loading..." className="px-6">
                Load Report
              </Button>
            </div>
          </CardContent>
        </Card>

        {hasLoaded && reportData.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
            <div className="bg-theme-surface border border-theme-border rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center"><span className="text-red-500 font-bold text-lg">{reportData.length}</span></div>
              <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-theme-text-dim">Total Events</div><div className="text-lg font-bold text-theme-text">{reportData.length}</div></div>
            </div>
            <div className="bg-theme-surface border border-theme-border rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center"><span className="text-amber-500 font-bold text-lg">{activeCount}</span></div>
              <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-theme-text-dim">Active</div><div className="text-lg font-bold text-amber-500">{activeCount}</div></div>
            </div>
            <div className="bg-theme-surface border border-theme-border rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center"><span className="text-emerald-500 font-bold text-lg">{completedCount}</span></div>
              <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-theme-text-dim">Completed</div><div className="text-lg font-bold text-emerald-500">{completedCount}</div></div>
            </div>
          </div>
        )}

        <Card className="overflow-hidden border border-theme-border shadow-sm">
          <CardContent className="p-0">
            <Table
              headers={[
                <div key="s" className="text-center w-12 text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">#</div>,
                <span key="veh" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Vehicle</span>,
                <span key="type" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Type</span>,
                <span key="driver" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Driver</span>,
                <span key="azone" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Assigned Zone</span>,
                <span key="award" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Assigned Ward</span>,
                <span key="start" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Start</span>,
                <span key="end" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">End</span>,
                <span key="dur" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-right">Duration</span>,
                <span key="status" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-center">Status</span>,
                <span key="loc" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Last Location</span>,
                <span key="gps" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">Last GPS</span>,
                <span key="ts" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider text-right">TS Trips</span>,
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
                      <span className="text-[11px] font-semibold uppercase tracking-wider mt-2">No Unauthorized Movements</span>
                      <span className="text-[10px] mt-1">All vehicles are operating within their assigned areas.</span>
                    </div>
              }
            >
              {reportData.map((row, idx) => (
                <tr key={row.vehicle_id + row.unauthorized_start}
                  className="border-b border-theme-border/30 transition-colors print:border-black hover:bg-theme-base/30">
                  <td className="py-3 px-4 text-center text-theme-text-dim font-mono text-[10px]">{idx + 1}</td>
                  <td className="py-3 px-4 font-bold text-theme-text text-xs">{row.registration_no}</td>
                  <td className="py-3 px-4 text-xs text-theme-text-dim">{row.vehicle_type}</td>
                  <td className="py-3 px-4 text-xs text-theme-text">{row.driver_name || "-"}</td>
                  <td className="py-3 px-4 text-xs font-medium text-theme-text">{row.assigned_zone}</td>
                  <td className="py-3 px-4 text-xs text-theme-text-dim">{row.assigned_ward}</td>
                  <td className="py-3 px-4 text-xs font-mono text-theme-text-dim whitespace-nowrap">{row.unauthorized_start}</td>
                  <td className="py-3 px-4 text-xs font-mono text-theme-text-dim whitespace-nowrap">{row.unauthorized_end || "-"}</td>
                  <td className="py-3 px-4 text-xs font-mono font-semibold text-theme-text text-right whitespace-nowrap">{row.total_duration}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      row.status === "Active" ? "bg-amber-500/20 text-amber-600" : "bg-emerald-500/20 text-emerald-600"
                    }`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-theme-text-dim">
                    {row.latitude ? `${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}` : "-"}
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-theme-text-dim whitespace-nowrap">{row.last_gps_time}</td>
                  <td className="py-3 px-4 text-xs font-mono text-right text-theme-text-dim">{row.ts_trip_count}</td>
                </tr>
              ))}
            </Table>
            {hasLoaded && (
              <div className="bg-theme-surface border-t border-theme-border px-5 py-3 text-xs font-bold text-theme-text-dim uppercase tracking-wider shrink-0">
                {reportData.length} event{reportData.length !== 1 ? "s" : ""} found
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
