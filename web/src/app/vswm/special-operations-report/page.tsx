"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";
import { Card, CardContent } from "@/components/ui/Card";
import StatCard from "@/components/shared/StatCard";
import PageHeader from "@/components/shared/PageHeader";

interface SpecialOpsRow {
  vehicle_id: number;
  registration_no: string;
  vehicle_type: string;
  route_id: number;
  route_name: string;
  covered_percentage: number | null;
  distance_travelled: number;
  trip_count: number;
  running_hours: string;
  idle_hours: string;
  engine_hours: string;
  movement_summary: string;
  imei: string;
}

interface Shift {
  id: number;
  shift_name: string;
}

export default function SpecialOperationsReportPage() {
  const [data, setData] = useState<SpecialOpsRow[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeShiftName, setActiveShiftName] = useState("");

  const [filters, setFilters] = useState({
    date: new Date().toISOString().split("T")[0],
    shift_id: "",
  });

  const loadShifts = async () => {
    try {
      const res = await api<{ data: Shift[] }>("/api/shifts?group=SPECIAL_OPERATIONS");
      setShifts(res.data || []);
    } catch {
      toast.error("Failed to load operational shifts.");
    }
  };

  const loadReport = async () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const isHistorical = filters.date < todayStr;
    if (isHistorical && !filters.shift_id) {
      toast.warning("Shift selection is mandatory for historical dates.");
      return;
    }

    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filters.date) {
        queryParams.append("date", filters.date);
      }
      if (filters.shift_id) {
        queryParams.append("shift_id", filters.shift_id);
      }

      const res = await api<{
        success: boolean;
        shift_name: string;
        data: SpecialOpsRow[];
      }>(`/api/reports/special-operations?${queryParams.toString()}`);

      setData(res.data || []);
      setActiveShiftName(res.shift_name || "");
      setHasLoaded(true);
      toast.success("Special operations report loaded.");
    } catch (err: any) {
      toast.error(err.message || "Failed to load special operations report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  // Calculate summary statistics
  const totalDistance = data.reduce((acc, row) => acc + row.distance_travelled, 0);
  const totalTrips = data.reduce((acc, row) => acc + row.trip_count, 0);
  const activeVehicles = data.filter((row) => row.distance_travelled > 0).length;

  const routedVehicles = data.filter((row) => row.covered_percentage !== null);
  const averageCoverage =
    routedVehicles.length > 0
      ? Math.round(
          routedVehicles.reduce((acc, row) => acc + (row.covered_percentage || 0), 0) /
            routedVehicles.length
        )
      : null;

  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = [
      "S. NO.",
      "VEHICLE NO",
      "TYPE",
      "ASSIGNED ROUTE",
      "COVERAGE",
      "DISTANCE (KM)",
      "TRIP COUNT",
      "RUNNING HOURS",
      "IDLE HOURS",
      "ENGINE HOURS",
      "MOVEMENT SUMMARY",
    ];
    const rows = data.map((row, idx) => [
      idx + 1,
      `"${row.registration_no}"`,
      `"${row.vehicle_type}"`,
      `"${row.route_name || "N/A"}"`,
      row.covered_percentage !== null ? `"${row.covered_percentage}%"` : `"N/A"`,
      row.distance_travelled.toFixed(2),
      row.trip_count,
      `"${row.running_hours}"`,
      `"${row.idle_hours}"`,
      `"${row.engine_hours}"`,
      `"${row.movement_summary}"`,
    ]);
    const csvContent =
      "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `special_operations_report_${filters.date}_shift_${filters.shift_id || "active"}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f8fafc] text-slate-800 overflow-hidden font-sans w-full">
      {/* Sub-header with Title & Action Exports */}
      <div className="bg-white px-6 py-3 border-b border-slate-200 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-700">Special Operations Report</h2>
          <div className="h-[3px] w-8 bg-emerald-500 mt-1"></div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            onClick={() => window.print()}
            variant="outline"
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700"
          >
            PDF
          </Button>
          <Button
            onClick={handleExportCSV}
            variant="outline"
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700"
          >
            CSV
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
        {/* Filter Card Panel */}
        <Card className="border border-slate-200 bg-white rounded-xl shadow-sm print:hidden">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {/* Date */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Date
                </span>
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => setFilters((prev) => ({ ...prev, date: e.target.value }))}
                  className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px]"
                />
              </div>

              {/* Shift */}
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Shift
                </span>
                <select
                  value={filters.shift_id}
                  onChange={(e) => setFilters((prev) => ({ ...prev, shift_id: e.target.value }))}
                  className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px] cursor-pointer"
                >
                  {filters.date < new Date().toISOString().split("T")[0] ? (
                    <option value="">Select Shift *</option>
                  ) : (
                    <option value="">Active Shift (Auto)</option>
                  )}
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shift_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Load Button */}
              <div className="flex items-end">
                <Button
                  onClick={loadReport}
                  variant="accent"
                  loading={loading}
                  loadingText="Loading..."
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold w-full py-2.5 rounded-lg text-xs transition min-h-[38px]"
                >
                  Load Report
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        {hasLoaded && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden animate-fade-in">
            <StatCard
              title="Average Route Coverage"
              value={averageCoverage !== null ? `${averageCoverage}%` : "N/A"}
              icon={<span className="text-emerald-600 font-bold">%</span>}
            />
            <StatCard
              title="Total Distance"
              value={`${totalDistance.toFixed(2)} km`}
              icon={<span className="text-indigo-600 font-bold">KM</span>}
            />
            <StatCard
              title="Active Vehicles"
              value={`${activeVehicles} / ${data.length}`}
              icon={<span className="text-teal-600 font-bold">🚛</span>}
            />
            <StatCard
              title="Total Trips"
              value={totalTrips}
              icon={<span className="text-amber-600 font-bold">🔄</span>}
            />
          </div>
        )}

        {/* Results Table Card */}
        <Card className="border border-slate-200 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px] print:border-none print:shadow-none">
          <CardContent className="p-0 flex-1 flex flex-col justify-between overflow-hidden">
            {hasLoaded && activeShiftName && (
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Active Shift: {activeShiftName}</span>
                <span className="font-mono">Date: {filters.date}</span>
              </div>
            )}
            <div className="flex-1 overflow-x-auto">
              <Table
                headers={[
                  <div key="s" className="text-center w-16 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">S. No.</div>,
                  <span key="reg" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Vehicle No</span>,
                  <span key="type" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Vehicle Type</span>,
                  <span key="route" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Assigned Route</span>,
                  <span key="cov" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider text-center block">Coverage</span>,
                  <span key="dist" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Distance</span>,
                  <span key="trips" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider text-center block">Trips</span>,
                  <span key="run" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Running</span>,
                  <span key="idle" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Idle</span>,
                  <span key="eng" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Engine Hours</span>,
                  <span key="summ" className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Summary</span>,
                ]}
                isLoading={loading}
                emptyState={
                  !hasLoaded ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-slate-400">
                      <span className="text-3xl">📊</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider">Report Not Loaded</span>
                      <span className="text-[10px]">Select filters and click "Load Report" to fetch logs.</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-slate-400">
                      <span className="text-3xl">📭</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider">No records found</span>
                      <span className="text-[10px]">Try adjusting your filters or dates.</span>
                    </div>
                  )
                }
              >
                {data.map((row, idx) => (
                  <tr
                    key={row.vehicle_id}
                    className="hover:bg-slate-50/50 border-b border-slate-100 transition-colors print:border-black"
                  >
                    <td className="py-3 px-5 text-center text-slate-400 font-mono text-[11px] print:text-black">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-5 font-bold text-slate-850 text-[12px] print:text-black">
                      {row.registration_no}
                    </td>
                    <td className="py-3 px-5 text-[12px] text-slate-500">{row.vehicle_type}</td>
                    <td className="py-3 px-5 text-[12px] font-semibold text-slate-700">
                      {row.route_name}
                    </td>
                    <td className="py-3 px-5 text-center">
                      {row.covered_percentage !== null ? (
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold shadow-sm ${
                          row.covered_percentage >= 80
                            ? "bg-emerald-600 text-white"
                            : row.covered_percentage >= 50
                            ? "bg-yellow-500 text-black"
                            : "bg-rose-600 text-white"
                        }`}>
                          {row.covered_percentage}%
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold text-[10px] uppercase">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-5 font-mono text-[12px] font-semibold text-slate-800">
                      {row.distance_travelled.toFixed(2)} km
                    </td>
                    <td className="py-3 px-5 text-center font-bold text-slate-700 text-[12px]">
                      {row.trip_count}
                    </td>
                    <td className="py-3 px-5 font-mono text-[11px] text-slate-500">
                      {row.running_hours}
                    </td>
                    <td className="py-3 px-5 font-mono text-[11px] text-slate-500">
                      {row.idle_hours}
                    </td>
                    <td className="py-3 px-5 font-mono text-[11px] text-slate-700 font-semibold">
                      {row.engine_hours}
                    </td>
                    <td className="py-3 px-5 text-[11px] text-slate-500 max-w-xs break-words">
                      {row.movement_summary}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>

            {hasLoaded && (
              <div className="bg-slate-100 border-t border-slate-200 px-5 py-3 text-xs font-bold text-slate-500 select-none uppercase tracking-wider shrink-0">
                {data.length} vehicles listed
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
