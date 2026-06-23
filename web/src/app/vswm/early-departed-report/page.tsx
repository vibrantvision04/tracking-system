"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Table from "@/components/shared/Table";
import { 
  Search, 
  AlertTriangle,
  Play
} from "lucide-react";
import Link from "next/link";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DatePicker from "@/components/ui/DatePicker";

interface EarlyDepartureRecord {
  vehicle_id: number;
  registration_no: string;
  route_name: string;
  shift_name: string;
  shift_start_time: string;
  shift_end_time: string;
  first_active_time: string;
  last_active_time: string;
  early_depart_by: string;
}

export default function EarlyDepartureReportPage() {
  const [records, setRecords] = useState<EarlyDepartureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // Default to 2026-06-12 because it contains valid test assignments and data
  const [dateFilter, setDateFilter] = useState("2026-06-12");
  const [thresholdFilter, setThresholdFilter] = useState("12:00:00");
  const [endTimeFilter, setEndTimeFilter] = useState("15:00:00");

  const fetchEarlyDepartures = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        date: dateFilter,
        threshold: thresholdFilter,
        end_time: endTimeFilter
      });
      const res = await api<{ success: boolean; data: EarlyDepartureRecord[] }>(`/api/reports/early-departed?${queryParams.toString()}`);
      if (res.success) {
        setRecords(res.data || []);
      }
    } catch (err) {
      toast.error("Failed to load early departure report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEarlyDepartures();
  }, [dateFilter, thresholdFilter, endTimeFilter]);

  const filteredRecords = records.filter((rec) => {
    const regNo = rec.registration_no.toLowerCase();
    const route = rec.route_name.toLowerCase();
    const q = searchQuery.toLowerCase();
    return regNo.includes(q) || route.includes(q);
  });

  const thresholdOptions = [
    { value: "11:00:00", label: "11:00 AM" },
    { value: "12:00:00", label: "12:00 PM" },
    { value: "12:30:00", label: "12:30 PM" },
    { value: "13:00:00", label: "01:00 PM" }
  ];

  const endTimeOptions = [
    { value: "14:00:00", label: "02:00 PM" },
    { value: "15:00:00", label: "03:00 PM" },
    { value: "16:00:00", label: "04:00 PM" }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Early Departed Report"
        description="Identifies morning shift vehicles that ceased field operations early (e.g. final ignition off before threshold and no activity before shift end)."
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Early Departed Report" }]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-36">
              <DatePicker
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>

            <div className="w-40">
              <SearchableSelect
                value={thresholdFilter}
                onChange={(val) => setThresholdFilter(val)}
                options={thresholdOptions}
                placeholder="Threshold"
              />
            </div>

            <div className="w-40">
              <SearchableSelect
                value={endTimeFilter}
                onChange={(val) => setEndTimeFilter(val)}
                options={endTimeOptions}
                placeholder="Shift End"
              />
            </div>

            <button 
              onClick={fetchEarlyDepartures}
              disabled={loading}
              className="px-4 py-2 text-xs bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white rounded-lg font-bold transition shadow-sm h-9 flex items-center justify-center gap-1 cursor-pointer shrink-0"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Refreshing...</span>
                </>
              ) : (
                <span>↻ Refresh</span>
              )}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {/* Warning callout */}
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl flex items-start gap-3 text-xs leading-relaxed">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <div>
            <span className="font-bold">Early Departure Logic:</span> Shows vehicles assigned to the morning shift that had active GPS points during the day, but their final active status (ignition ON or speed &gt; 2 km/h) occurred before the threshold time, with no further activity recorded up to the Shift End time.
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Departed Vehicles List</CardTitle>
              <CardDescription>Vehicles flagging potential early departures on {dateFilter}.</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-text-dim" />
              <input
                type="text"
                placeholder="Search registration no, route..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-theme-base border border-theme-border rounded-xl text-xs text-theme-text outline-none focus:border-emerald-500 transition"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table
              headers={[
                <div key="s" className="w-12">S.No</div>,
                "Vehicle No",
                "Assigned Route",
                "Shift Window",
                "First Active Point",
                "Last Active Point (Departed)",
                "Early Departure Duration",
                <div key="a" className="text-right w-24">Actions</div>
              ]}
              isLoading={loading}
              emptyState={searchQuery ? "No matching records found" : "No early departures flagged for this configuration"}
            >
              {filteredRecords.map((rec, idx) => (
                <tr key={rec.vehicle_id} className="hover:bg-theme-base/40 transition-colors group text-theme-text-dim text-xs">
                  <td className="py-3.5 px-5 font-mono text-[11px]">{idx + 1}</td>
                  <td className="py-3.5 px-5 font-bold text-theme-text">{rec.registration_no}</td>
                  <td className="py-3.5 px-5 font-semibold text-theme-text-dim">{rec.route_name}</td>
                  <td className="py-3.5 px-5">
                    <span className="bg-theme-base px-2.5 py-1 rounded-lg border border-theme-border font-mono text-[10px]">
                      {rec.shift_start_time.slice(0, 5)} - {rec.shift_end_time.slice(0, 5)}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 font-mono text-[11px]">{rec.first_active_time}</td>
                  <td className="py-3.5 px-5 font-mono text-[11px] text-amber-400 font-semibold">{rec.last_active_time}</td>
                  <td className="py-3.5 px-5">
                    <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold font-mono text-[10px]">
                      {rec.early_depart_by} early
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <Link
                      href={`/playback?vehicle_id=${rec.vehicle_id}&date=${dateFilter}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-theme-base border border-theme-border hover:bg-theme-border/60 text-[10px] font-bold text-theme-text rounded-lg transition"
                    >
                      <Play className="w-3 h-3 text-emerald-400 fill-emerald-400/25" />
                      <span>Playback Route</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="p-4 border-t border-theme-border bg-theme-surface text-xs font-semibold text-theme-text-dim flex items-center justify-between">
              <span>{filteredRecords.length} vehicles flagged</span>
              <span className="text-[10px] text-theme-text-dim uppercase tracking-widest font-mono">VSWM REPORTING</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
