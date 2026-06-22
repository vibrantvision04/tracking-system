"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import SearchableSelect from "@/components/ui/SearchableSelect";

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
    <button onClick={onUp} className="text-emerald-500 hover:text-emerald-600 focus:outline-none text-[12px] font-bold py-0.5 px-2">
      ▲
    </button>
    <div className="bg-slate-100 border border-slate-200 rounded px-2.5 py-1 text-sm font-mono font-bold text-slate-700 w-12 text-center shadow-sm">
      {value}
    </div>
    <button onClick={onDown} className="text-emerald-500 hover:text-emerald-600 focus:outline-none text-[12px] font-bold py-0.5 px-2">
      ▼
    </button>
  </div>
);

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
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Zone</span>
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

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Ward</span>
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

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Vehicle(s) RTO</span>
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

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Shift</span>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-2">From Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-2">To Date</label>
                <input type="date" value={date} readOnly
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none bg-slate-100 cursor-not-allowed text-slate-500" />
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

            {/* Time-Based Filter Section */}
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="use-time-filter"
                  checked={useTime}
                  onChange={(e) => setUseTime(e.target.checked)}
                  className="h-4 w-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="use-time-filter" className="text-xs font-semibold text-slate-700 select-none cursor-pointer">
                  Time
                </label>
              </div>

              {useTime && (
                <div className="flex items-center gap-8 animate-fadeIn">
                  {/* Start Time */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500">Start Time</span>
                    <div className="flex items-center gap-1">
                      <TimeInputBox
                        value={pad(startTime.hh)}
                        onUp={() => adjustTime("start", "hh", 1)}
                        onDown={() => adjustTime("start", "hh", -1)}
                      />
                      <span className="text-xs font-bold text-slate-400">:</span>
                      <TimeInputBox
                        value={pad(startTime.mm)}
                        onUp={() => adjustTime("start", "mm", 1)}
                        onDown={() => adjustTime("start", "mm", -1)}
                      />
                      <span className="text-xs font-bold text-slate-400">:</span>
                      <TimeInputBox
                        value={pad(startTime.ss)}
                        onUp={() => adjustTime("start", "ss", 1)}
                        onDown={() => adjustTime("start", "ss", -1)}
                      />
                    </div>
                  </div>

                  {/* End Time */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500">End Time</span>
                    <div className="flex items-center gap-1">
                      <TimeInputBox
                        value={pad(endTime.hh)}
                        onUp={() => adjustTime("end", "hh", 1)}
                        onDown={() => adjustTime("end", "hh", -1)}
                      />
                      <span className="text-xs font-bold text-slate-400">:</span>
                      <TimeInputBox
                        value={pad(endTime.mm)}
                        onUp={() => adjustTime("end", "mm", 1)}
                        onDown={() => adjustTime("end", "mm", -1)}
                      />
                      <span className="text-xs font-bold text-slate-400">:</span>
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
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[10px]">
                <thead className="bg-[#f8fafc] text-slate-500 border-b border-slate-200 uppercase tracking-tighter">
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
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={20} className="px-4 py-8 text-center text-slate-400">Loading reports...</td>
                    </tr>
                  ) : reports.length === 0 ? (
                    <tr>
                      <td colSpan={20} className="px-4 py-8 text-center text-slate-400">No reports found for this date.</td>
                    </tr>
                  ) : (
                    reports.map((r, i) => (
                      <tr key={`${r.id}-${i}`} className="hover:bg-slate-50 transition">
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
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="text-xs text-slate-500">
                Page <span className="font-medium text-slate-700">{page}</span> of <span className="font-medium text-slate-700">{totalPages}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
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
