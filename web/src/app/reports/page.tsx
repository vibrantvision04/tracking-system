"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import SearchableSelect from "@/components/ui/SearchableSelect";
import FilterBar from "@/components/shared/FilterBar";
import Table from "@/components/shared/Table";
import { DatePicker } from "@/components/ui/DatePicker";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import ReportHeader from "@/components/shared/ReportHeader";

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

interface TimeVal {
  hh: number;
  mm: number;
  ss: number;
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

const TimeInputBox = ({ value, onUp, onDown }: { value: string; onUp: () => void; onDown: () => void }) => (
  <div className="flex flex-col items-center select-none">
    <button onClick={onUp} className="text-[#16A34A] hover:text-[#15803D] focus:outline-none text-[12px] font-bold py-0.5 px-2">
      ▲
    </button>
    <div className="bg-theme-card border border-theme-border rounded px-2.5 py-1 text-sm font-mono font-bold text-theme-text w-12 text-center shadow-sm">
      {value}
    </div>
    <button onClick={onDown} className="text-[#16A34A] hover:text-[#15803D] focus:outline-none text-[12px] font-bold py-0.5 px-2">
      ▼
    </button>
  </div>
);

const TABLE_HEADERS = [
  "S. NO.",
  "VEHICLE DETAILS",
  "ZONE / WARD",
  "START / END COORDINATES",
  "TIMELINE",
  "DISTANCE & SPEED",
  "IGNITION DURATION",
  "STOPPAGE & IDLE",
  "STOPPAGES BREAKDOWN",
];

export default function ReportsPage() {
  const [reports, setReports] = useState<MovementReport[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [zones, setZones] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

  const [selectedZone, setSelectedZone] = useState<string>("");
  const [selectedWard, setSelectedWard] = useState<string>("");
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [selectedShift, setSelectedShift] = useState<string>("");

  const [useTime, setUseTime] = useState(false);
  const [startTime, setStartTime] = useState<TimeVal>({ hh: 0, mm: 0, ss: 0 });
  const [endTime, setEndTime] = useState<TimeVal>({ hh: 0, mm: 0, ss: 0 });

  const limit = 10;
  const allowHistoricalRecalculation = true;

  const pad = (num: number) => String(num).padStart(2, '0');

  const adjustTime = (
    type: "start" | "end",
    field: "hh" | "mm" | "ss",
    amount: number
  ) => {
    const setter = type === "start" ? setStartTime : setEndTime;
    setter((prev) => {
      let val = prev[field] + amount;
      if (field === "hh") {
        if (val < 0) val = 23;
        if (val > 23) val = 0;
      } else {
        if (val < 0) val = 59;
        if (val > 59) val = 0;
      }
      return { ...prev, [field]: val };
    });
  };

  const load = (d: string, p: number, vId: string, force: boolean = false) => {
    setLoading(true);
    const vParam = vId ? `&vehicle_id=${vId}` : "";
    const forceParam = force ? "&force=true" : "";
    const zParam = selectedZone ? `&zone_id=${selectedZone}` : "";
    const wParam = selectedWard ? `&ward_id=${selectedWard}` : "";
    const sParam = selectedShift ? `&shift_id=${selectedShift}` : "";

    let timeParams = "";
    if (useTime) {
      timeParams = `&use_time=true&start_time=${pad(startTime.hh)}:${pad(startTime.mm)}:${pad(startTime.ss)}&end_time=${pad(endTime.hh)}:${pad(endTime.mm)}:${pad(endTime.ss)}`;
    }

    api<ReportsResponse>(`/api/reports?from=${d}&to=${d}&page=${p}&limit=${limit}${vParam}${zParam}${wParam}${sParam}${timeParams}${forceParam}`)
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

  // Fetch dedicated shifts reactively
  useEffect(() => {
    const params = new URLSearchParams();
    params.append("group", "VEHICLE_MOVEMENT");
    if (selectedZone) params.append("zone_id", selectedZone);
    if (selectedWard) params.append("ward_id", selectedWard);
    if (selectedVehicle) params.append("vehicle_id", selectedVehicle);

    api<{success: boolean, data: any[]}>(`/api/shifts?${params.toString()}`)
      .then((r) => {
        setShifts(r.data || []);
        // Reset shift selection if it's no longer in the filtered list
        if (selectedShift && !r.data.some((s: any) => s.id.toString() === selectedShift)) {
          setSelectedShift("");
        }
      })
      .catch(() => {});
  }, [selectedZone, selectedWard, selectedVehicle]);

  // Derived options for filters
  const filteredWards = wards.filter(w => !selectedZone || w.parent_id?.toString() === selectedZone);

  const filteredVehicles = vehicles.filter(v => {
    if (selectedWard && v.ward_id?.toString() !== selectedWard) return false;
    if (selectedZone && v.zone_id?.toString() !== selectedZone) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans">
      <ReportHeader title="Vehicle Movement Report" />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="w-full mx-auto">

          {/* Filters */}
          <div className="mb-6">
            <FilterBar
              actions={
                <>
                  <Button
                    variant="success"
                    onClick={() => load(date, 1, selectedVehicle, false)}
                  >
                    Load
                  </Button>
                </>
              }
            >
              {/* Zone */}
              <div className="flex flex-col min-w-[160px]">
                <span className="text-xs font-semibold text-theme-text-dim mb-1.5 uppercase tracking-wider">Zone</span>
                <SearchableSelect
                  value={selectedZone}
                  onChange={(val) => {
                    setSelectedZone(val);
                    setSelectedWard("");
                    setSelectedVehicle("");
                  }}
                  options={[
                    { value: "", label: "All Zones" },
                    ...zones.map(z => ({ value: z.id.toString(), label: z.region_name }))
                  ]}
                  placeholder="Select Zone"
                />
              </div>

              {/* Ward */}
              <div className="flex flex-col min-w-[160px]">
                <span className="text-xs font-semibold text-theme-text-dim mb-1.5 uppercase tracking-wider">Ward</span>
                <SearchableSelect
                  value={selectedWard}
                  onChange={(val) => {
                    setSelectedWard(val);
                    setSelectedVehicle("");
                    if (val) {
                      const w = wards.find(x => x.id.toString() === val);
                      if (w && w.parent_id) {
                        setSelectedZone(w.parent_id.toString());
                      }
                    }
                  }}
                  options={[
                    { value: "", label: "All Wards" },
                    ...filteredWards.map(w => ({ value: w.id.toString(), label: w.region_name }))
                  ]}
                  placeholder="Select Ward"
                />
              </div>

              {/* Vehicle */}
              <div className="flex flex-col min-w-[160px]">
                <span className="text-xs font-semibold text-theme-text-dim mb-1.5 uppercase tracking-wider">Vehicle(s) RTO</span>
                <SearchableSelect
                  value={selectedVehicle}
                  onChange={(val) => setSelectedVehicle(val)}
                  options={[
                    { value: "", label: "All Vehicles" },
                    ...filteredVehicles.map(v => ({ value: v.id.toString(), label: v.registration_no }))
                  ]}
                  placeholder="All Vehicles"
                />
              </div>

              {/* Shift */}
              <div className="flex flex-col min-w-[160px]">
                <span className="text-xs font-semibold text-theme-text-dim mb-1.5 uppercase tracking-wider">Shift</span>
                <SearchableSelect
                  value={selectedShift}
                  onChange={(val) => setSelectedShift(val)}
                  options={[
                    { value: "", label: "All Shifts" },
                    ...shifts.map(s => ({ value: s.id.toString(), label: s.shift_name }))
                  ]}
                  placeholder="Select Shift"
                />
              </div>

              {/* From Date */}
              <div className="flex flex-col min-w-[140px]">
                <DatePicker
                  label="From Date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              {/* To Date (read-only) */}
              <div className="flex flex-col min-w-[140px]">
                <DatePicker
                  label="To Date"
                  value={date}
                  readOnly
                  className="!bg-slate-100 cursor-not-allowed !text-black !border-slate-300"
                />
              </div>

              {/* Time-Based Filter */}
              <div className="flex items-end gap-4 pt-1">
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    id="use-time-filter"
                    checked={useTime}
                    onChange={(e) => setUseTime(e.target.checked)}
                    className="h-4 w-4 text-[#16A34A] border-theme-border rounded focus:ring-[#16A34A] cursor-pointer"
                  />
                  <label htmlFor="use-time-filter" className="text-xs font-semibold text-theme-text select-none cursor-pointer">
                    Time
                  </label>
                </div>

                {useTime && (
                  <div className="flex items-center gap-8 animate-fadeIn">
                    {/* Start Time */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-theme-text-dim">Start Time</span>
                      <div className="flex items-center gap-1">
                        <TimeInputBox
                          value={pad(startTime.hh)}
                          onUp={() => adjustTime("start", "hh", 1)}
                          onDown={() => adjustTime("start", "hh", -1)}
                        />
                        <span className="text-xs font-bold text-theme-text-dim">:</span>
                        <TimeInputBox
                          value={pad(startTime.mm)}
                          onUp={() => adjustTime("start", "mm", 1)}
                          onDown={() => adjustTime("start", "mm", -1)}
                        />
                        <span className="text-xs font-bold text-theme-text-dim">:</span>
                        <TimeInputBox
                          value={pad(startTime.ss)}
                          onUp={() => adjustTime("start", "ss", 1)}
                          onDown={() => adjustTime("start", "ss", -1)}
                        />
                      </div>
                    </div>

                    {/* End Time */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-theme-text-dim">End Time</span>
                      <div className="flex items-center gap-1">
                        <TimeInputBox
                          value={pad(endTime.hh)}
                          onUp={() => adjustTime("end", "hh", 1)}
                          onDown={() => adjustTime("end", "hh", -1)}
                        />
                        <span className="text-xs font-bold text-theme-text-dim">:</span>
                        <TimeInputBox
                          value={pad(endTime.mm)}
                          onUp={() => adjustTime("end", "mm", 1)}
                          onDown={() => adjustTime("end", "mm", -1)}
                        />
                        <span className="text-xs font-bold text-theme-text-dim">:</span>
                        <TimeInputBox
                          value={pad(endTime.ss)}
                          onUp={() => adjustTime("end", "ss", 1)}
                          onDown={() => adjustTime("end", "ss", -1)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </FilterBar>
          </div>

          {/* Table Container Card */}
          <Card className="p-0 flex flex-col overflow-hidden border border-theme-border shadow-sm rounded-2xl bg-theme-surface">
            <Table
              headers={TABLE_HEADERS}
              isLoading={loading}
              paginate={false}
              dense={true}
              nested={true}
              emptyState={
                <p className="text-sm text-theme-text-dim">No reports found for this date.</p>
              }
            >
              {reports.map((r, i) => (
                <tr key={`${r.id}-${i}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-xs text-theme-text-dim font-medium">{(page - 1) * limit + i + 1}</td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-bold text-theme-text">{r.registration_no}</div>
                    <div className="text-[10px] text-theme-text-dim mt-0.5 font-medium">{r.vehicle_type || "Vehicle"}</div>
                    <div className="text-[10px] text-theme-text-dim/70 mt-0.5">{r.report_date ? new Date(r.report_date).toLocaleDateString() : "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-semibold text-theme-text">{r.zone || "-"}</div>
                    <div className="text-[10px] text-theme-text-dim mt-0.5">{r.ward || "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="text-[#06B6D4] font-mono text-[10.5px]">Start: {formatCoord(r.start_point)}</div>
                    <div className="text-[#06B6D4] font-mono text-[10.5px] mt-0.5">End: {formatCoord(r.end_point)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-medium text-theme-text">{formatTime(r.start_time)} - {formatTime(r.end_time)}</div>
                    <div className="text-[10.5px] text-theme-text-dim mt-0.5 font-mono">Active: {formatDuration(r.total_active_duration)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-bold text-theme-text font-mono">{r.total_distance.toFixed(2)} KM</div>
                    <div className="text-[10px] text-theme-text-dim mt-0.5 font-mono">Avg: {r.average_speed.toFixed(1)} KM/H</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-bold text-[#06B6D4] font-mono">Act: {formatDuration(r.actual_ignition_on_duration)}</div>
                    <div className="text-[10px] text-theme-text-dim mt-0.5 font-mono">Tot: {formatDuration(r.total_ignition_on_duration)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-medium text-theme-text font-mono">Stop: {formatDuration(r.total_stoppage_duration)}</div>
                    <div className="text-[10px] text-theme-text-dim mt-0.5 font-mono">Idle: {formatDuration(r.total_idle_duration)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-bold text-[#06B6D4]">{r.stoppages_count} Total</div>
                    <div className="text-[10px] text-theme-text-dim mt-0.5 font-mono">{r.minor_stoppages} Min / {r.major_stoppages} Maj</div>
                  </td>
                </tr>
              ))}
            </Table>

            {/* Server-side Pagination */}
            <div className="px-5 py-3.5 border-t border-theme-border flex items-center justify-between bg-theme-surface rounded-b-2xl">
              <div className="text-xs text-theme-text-dim font-medium">
                Page <span className="font-bold text-theme-text">{page}</span> of <span className="font-bold text-theme-text">{totalPages}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="px-3 py-1.5 border border-theme-border rounded-lg text-xs font-semibold bg-theme-card hover:bg-theme-elevated text-theme-text disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                  className="px-3 py-1.5 border border-theme-border rounded-lg text-xs font-semibold bg-theme-card hover:bg-theme-elevated text-theme-text disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
