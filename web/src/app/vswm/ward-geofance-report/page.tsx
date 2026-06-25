"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import Button from "@/components/ui/Button";
import ReportHeader from "@/components/shared/ReportHeader";
import Table from "@/components/shared/Table";
import { Card, CardContent } from "@/components/ui/Card";

interface WardGeofenceEventRow {
  id: number;
  registration_no: string;
  ward_name: string;
  event_type: string;
  event_time: string;
}

export default function WardGeofenceReportPage() {
  const [data, setData] = useState<WardGeofenceEventRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters state - default to current date
  const [fromDate, setFromDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.append("from_date", fromDate);
      if (toDate) params.append("to_date", toDate);

      // Ensure we DO NOT load demo data: the backend queries actual database events.
      const res = await api<{ data: WardGeofenceEventRow[] }>(`/api/reports/ward-geofence?${params.toString()}`);
      setData(res.data || []);
      toast.success("Data loaded successfully!");
    } catch {
      toast.error("Failed to load report data.");
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      // Format as YYYY-MM-DD HH:MM:SS
      const pad = (num: number) => String(num).padStart(2, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return "—";
    }
  };

  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = ["S. NO.", "VEHICLE(S) RTO", "WARD", "EVENT TYPE", "EVENT DATE TIME"];
    const rows = data.map((row, idx) => [
      idx + 1,
      `"${row.registration_no.replace(/"/g, '""')}"`,
      `"${row.ward_name.replace(/"/g, '""')}"`,
      `"${row.event_type.toUpperCase().replace(/"/g, '""')}"`,
      `"${formatDateTime(row.event_time)}"`
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ward_geofence_report_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f8fafc] text-slate-800 overflow-hidden font-sans">
      <ReportHeader
        title="Ward Geofance Report"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => window.print()} variant="outline" className="px-3 py-1.5 text-xs font-semibold">PDF</Button>
            <Button onClick={handleExportCSV} variant="outline" className="px-3 py-1.5 text-xs font-semibold">CSV</Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
        {/* Filter controls matching layout */}
        <Card className="border border-slate-200 bg-white rounded-xl shadow-sm print:hidden">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">From Date</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px]"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To Date</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-700 outline-none hover:border-emerald-500/40 focus:border-emerald-500 transition min-h-[38px]"
                />
              </div>
            </div>

            <div className="flex justify-start pt-4 border-t border-slate-100">
              <Button onClick={loadReport} variant="success" loading={loading} loadingText="Loading..." className="font-semibold px-5 py-2 rounded-lg text-xs transition">
                Load
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Card */}
        <Card className="border border-slate-200 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px] print:border-none print:shadow-none">
          <CardContent className="p-0 flex-1 flex flex-col justify-between overflow-hidden">
            <div className="flex-1 overflow-x-auto">
              <Table
                headers={[
                  <div key="s" className="text-center w-16 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">S. NO.</div>,
                  <span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">VEHICLE(S) RTO</span>,
                  <span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">WARD</span>,
                  <span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">EVENT TYPE</span>,
                  <span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">EVENT DATE TIME</span>
                ]}
                isLoading={loading}
                emptyState="No data to display"
              >
                {data.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 border-b border-slate-100 transition-colors print:border-black">
                    <td className="py-3 px-5 text-center text-slate-400 font-mono text-[11px] print:text-black">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-5 font-bold text-slate-800 text-[12px] print:text-black">
                      {row.registration_no}
                    </td>
                    <td className="py-3 px-5 text-slate-600 text-[12px] print:text-black">
                      {row.ward_name || "—"}
                    </td>
                    <td className="py-3 px-5 text-[12px] print:text-black">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        row.event_type.toLowerCase() === "enter"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-orange-100 text-orange-700"
                      }`}>
                        {row.event_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-slate-600 text-[12px] print:text-black font-mono">
                      {formatDateTime(row.event_time)}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>

            {/* Total Row */}
            <div className="bg-slate-100 border-t border-slate-200 px-5 py-3 text-xs font-bold text-slate-500 select-none uppercase tracking-wider shrink-0">
              {data.length} total
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
