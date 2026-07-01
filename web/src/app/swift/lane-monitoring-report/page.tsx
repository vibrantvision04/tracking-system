"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DatePicker from "@/components/ui/DatePicker";

interface Region {
  id: number;
  region_name: string;
  region_type_id: number;
  parent_id?: number | null;
}

interface Shift {
  id: number;
  shift_name: string;
}

interface Route {
  id: number;
  route_name: string;
  ward_id: number;
  shift_id: number;
}

interface LaneReportRow {
  lane_name: string;
  start_time: string | null;
  end_time: string | null;
}

export default function LaneMonitoringReportPage() {
  const [data, setData] = useState<LaneReportRow[]>([]);
  const [zones, setZones] = useState<Region[]>([]);
  const [wards, setWards] = useState<Region[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);

  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);

  // Filters state
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  const loadMetaData = async () => {
    setMetaLoading(true);
    try {
      const [regRes, shiftRes, routeRes] = await Promise.all([
        api<Region[]>("/api/regions"),
        api<{ data: Shift[] }>("/api/shifts?group=VEHICLE_MOVEMENT"),
        api<{ data: Route[] }>("/api/routes")
      ]);

      const allRegions = Array.isArray(regRes) ? regRes : (regRes as any).data || [];
      setZones(allRegions.filter((r: Region) => r.region_type_id === 2));
      setWards(allRegions.filter((r: Region) => r.region_type_id === 3));
      setShifts(shiftRes.data || []);
      setRoutes(routeRes.data || []);
    } catch {
      toast.error("Failed to load filter options.");
    } finally {
      setMetaLoading(false);
    }
  };

  const loadReport = async () => {
    if (!selectedRouteId) {
      toast.warning("Please select a Route to load the report.");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("route_id", String(selectedRouteId));
      if (date) params.append("date", date);

      const res = await api<{ data: LaneReportRow[] }>(`/api/reports/lane-monitoring?${params.toString()}`);
      setData(res.data || []);
      toast.success("Data loaded successfully!");
    } catch {
      toast.error("Failed to load report data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetaData();
  }, []);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "not arrived";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "not arrived";
    }
  };

  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = ["S. NO.", "LANE(S)", "START TIME", "END TIME"];
    const rows = data.map((row, idx) => [
      idx + 1,
      `"${row.lane_name.replace(/"/g, '""')}"`,
      `"${formatTime(row.start_time)}"`,
      `"${formatTime(row.end_time)}"`
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `lane_monitoring_report_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter dropdown options dynamically
  const filteredWards = wards.filter(w => !selectedZoneId || w.parent_id === selectedZoneId);
  const filteredRoutes = routes
    .filter(r => !selectedWardId || r.ward_id === selectedWardId)
    .filter(r => !selectedShiftId || r.shift_id === selectedShiftId);

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans w-full">
      <PageHeader
        title="Lane Monitoring Report"
        description="Monitor the start and end times of vehicles covering lanes on specific routes."
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Lane Monitoring Report" }]}
        actions={
          <div className="flex gap-2 print:hidden">
            <Button onClick={() => window.print()} variant="outline">
              PDF
            </Button>
            <Button onClick={handleExportCSV} variant="outline">
              CSV
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 p-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
        <Card hoverable className="relative z-20 !overflow-visible print:hidden">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Zone</span>
                <SearchableSelect
                  value={selectedZoneId ? selectedZoneId.toString() : ""}
                  onChange={(val) => {
                    const id = val ? parseInt(val) : null;
                    setSelectedZoneId(id);
                    setSelectedWardId(null);
                    setSelectedRouteId(null);
                  }}
                  options={[
                    { value: "", label: "Select Zone" },
                    ...zones.map((z) => ({ value: z.id.toString(), label: z.region_name }))
                  ]}
                  placeholder="Select Zone"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Ward</span>
                <SearchableSelect
                  value={selectedWardId ? selectedWardId.toString() : ""}
                  onChange={(val) => {
                    const id = val ? parseInt(val) : null;
                    setSelectedWardId(id);
                    if (id) {
                      const w = wards.find(x => x.id === id);
                      if (w && w.parent_id) {
                        setSelectedZoneId(w.parent_id);
                      }
                    }
                    setSelectedRouteId(null);
                  }}
                  options={[
                    { value: "", label: "Select Ward" },
                    ...filteredWards.map((w) => ({ value: w.id.toString(), label: w.region_name }))
                  ]}
                  placeholder="Select Ward"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Shift</span>
                <SearchableSelect
                  value={selectedShiftId ? selectedShiftId.toString() : ""}
                  onChange={(val) => {
                    const id = val ? parseInt(val) : null;
                    setSelectedShiftId(id);
                    setSelectedRouteId(null);
                  }}
                  options={[
                    { value: "", label: "Select Shift" },
                    ...shifts.map((s) => ({ value: s.id.toString(), label: s.shift_name }))
                  ]}
                  placeholder="Select Shift"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">Route</span>
                <SearchableSelect
                  value={selectedRouteId ? selectedRouteId.toString() : ""}
                  onChange={(val) => {
                    const id = val ? parseInt(val) : null;
                    setSelectedRouteId(id);
                    if (id) {
                      const r = routes.find(x => x.id === id);
                      if (r) {
                        if (r.ward_id) {
                          setSelectedWardId(r.ward_id);
                          const w = wards.find(x => x.id === r.ward_id);
                          if (w && w.parent_id) {
                            setSelectedZoneId(w.parent_id);
                          }
                        }
                        if (r.shift_id) {
                          setSelectedShiftId(r.shift_id);
                        }
                      }
                    }
                  }}
                  options={[
                    { value: "", label: "Select Route" },
                    ...filteredRoutes.map((r) => ({ value: r.id.toString(), label: r.route_name }))
                  ]}
                  placeholder="Select Route"
                />
              </div>

              <DatePicker
                label="Date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="flex justify-start pt-4 border-t border-theme-border/60">
              <Button onClick={loadReport} variant="primary" loading={loading} loadingText="Loading...">
                Load
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card hoverable className="flex flex-col min-h-[500px] print:border-none print:shadow-none">
          <CardContent className="p-0 flex-1">
            <Table
              headers={[
                <div key="s" className="text-center w-16 text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">S. NO.</div>,
                <span key="lane" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">LANE(S)</span>,
                <span key="start" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">START TIME</span>,
                <span key="end" className="text-theme-text-dim font-extrabold uppercase text-[10px] tracking-wider">END TIME</span>
              ]}
              isLoading={loading || metaLoading}
              emptyState={
                <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-theme-text-dim/60">
                  <span className="text-3xl">📭</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider">No data to display</span>
                  <span className="text-[10px]">Please select a route and click Load.</span>
                </div>
              }
            >
              {data.map((row, idx) => (
                <tr key={idx} className="border-b border-theme-border/30 transition-colors">
                  <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px] print:text-black">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-5 font-semibold text-theme-text text-[12px] print:text-black">
                    {row.lane_name}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {formatTime(row.start_time)}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {formatTime(row.end_time)}
                  </td>
                </tr>
              ))}
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
