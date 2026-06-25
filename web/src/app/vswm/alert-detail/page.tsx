"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";

import ReportHeader from "@/components/shared/ReportHeader";
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DatePicker from "@/components/ui/DatePicker";

interface Region {
  id: number;
  region_name: string;
  region_type_id: number;
  parent_id?: number;
}

interface Vehicle {
  id: number;
  registration_no: string;
}

interface Shift {
  id: number;
  shift_name: string;
}

interface AlertDetailRow {
  id: number;
  zone_name: string;
  ward_name: string;
  registration_no: string;
  vehicle_type_name: string;
  alert_type: string;
  alert_detail: string;
  status: string;
  reason: string;
  time_reported: string;
  shift_name: string;
}

const ALERT_TYPES = [
  "Overspeed",
  "Stoppage",
  "Geofence Exit",
  "Idle",
  "GPS Not Reporting"
];

export default function AlertDetailReportPage() {
  const [data, setData] = useState<AlertDetailRow[]>([]);
  const [zones, setZones] = useState<Region[]>([]);
  const [wards, setWards] = useState<Region[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);

  // Filters state
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [selectedAlertType, setSelectedAlertType] = useState<string>("");
  const [date, setDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  const loadMetaData = async () => {
    setMetaLoading(true);
    try {
      const [regRes, vehRes, shiftRes] = await Promise.all([
        api<Region[]>("/api/regions"),
        api<{ data: Vehicle[] }>("/api/vehicles"),
        api<{ data: Shift[] }>("/api/shifts?group=VEHICLE_MOVEMENT")
      ]);
      
      const allRegions = Array.isArray(regRes) ? regRes : (regRes as any).data || [];
      setZones(allRegions.filter((r: Region) => r.region_type_id === 2));
      setWards(allRegions.filter((r: Region) => r.region_type_id === 3));
      setVehicles(vehRes.data || []);
      setShifts(shiftRes.data || []);
    } catch {
      toast.error("Failed to load filter options.");
    } finally {
      setMetaLoading(false);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (date) params.append("date", date);
      if (selectedZoneId) params.append("zone_id", String(selectedZoneId));
      if (selectedWardId) params.append("ward_id", String(selectedWardId));
      if (selectedVehicleId) params.append("vehicle_id", String(selectedVehicleId));
      if (selectedShiftId) params.append("shift_id", String(selectedShiftId));
      if (selectedAlertType) params.append("alert_type", selectedAlertType);

      const res = await api<{ data: AlertDetailRow[] }>(`/api/reports/alert-detail?${params.toString()}`);
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

  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = ["S. NO.", "ZONE", "WARD", "VEHICLE(S) RTO", "VEHICLE TYPE", "ALERT TYPE", "ALERT DETAIL", "STATUS", "REASON"];
    const rows = data.map((row, idx) => [
      idx + 1,
      `"${row.zone_name.replace(/"/g, '""')}"`,
      `"${row.ward_name.replace(/"/g, '""')}"`,
      `"${row.registration_no.replace(/"/g, '""')}"`,
      `"${row.vehicle_type_name.replace(/"/g, '""')}"`,
      `"${row.alert_type.replace(/"/g, '""')}"`,
      `"${row.alert_detail.replace(/"/g, '""')}"`,
      `"${row.status.replace(/"/g, '""')}"`,
      `"${row.reason.replace(/"/g, '""')}"`
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `alert_detail_report_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredWards = selectedZoneId
    ? wards.filter((w: Region) => w.parent_id === selectedZoneId)
    : wards;

  const zoneOptions = zones.map(z => ({ value: String(z.id), label: z.region_name }));
  const wardOptions = filteredWards.map(w => ({ value: String(w.id), label: w.region_name }));
  const vehicleOptions = vehicles.map(v => ({ value: String(v.id), label: v.registration_no }));
  const shiftOptions = shifts.map(s => ({ value: String(s.id), label: s.shift_name }));
  const alertTypeOptions = ALERT_TYPES.map(t => ({ value: t, label: t }));

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans w-full">
  <ReportHeader
    title="Alert Detail Report"
    actions={
      <div className="flex gap-2">
        <Button onClick={() => window.print()} variant="outline" className="px-3 py-1.5 text-xs font-semibold">PDF</Button>
        <Button onClick={handleExportCSV} variant="outline" className="px-3 py-1.5 text-xs font-semibold">CSV</Button>
      </div>
    }
  />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
        <Card className="relative z-20 !overflow-visible print:hidden">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Zone</span>
                <SearchableSelect
                  value={selectedZoneId ? String(selectedZoneId) : ""}
                  onChange={(val) => {
                    setSelectedZoneId(val ? parseInt(val) : null);
                    setSelectedWardId(null);
                  }}
                  options={zoneOptions}
                  placeholder="Select Zone"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Ward</span>
                <SearchableSelect
                  value={selectedWardId ? String(selectedWardId) : ""}
                  onChange={(val) => setSelectedWardId(val ? parseInt(val) : null)}
                  options={wardOptions}
                  placeholder="Select Ward"
                  disabled={!selectedZoneId}
                />
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Vehicle(s) RTO</span>
                <SearchableSelect
                  value={selectedVehicleId ? String(selectedVehicleId) : ""}
                  onChange={(val) => setSelectedVehicleId(val ? parseInt(val) : null)}
                  options={vehicleOptions}
                  placeholder="Select Vehicle"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Shift</span>
                <SearchableSelect
                  value={selectedShiftId ? String(selectedShiftId) : ""}
                  onChange={(val) => setSelectedShiftId(val ? parseInt(val) : null)}
                  options={shiftOptions}
                  placeholder="Select Shift"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Alert Type</span>
                <SearchableSelect
                  value={selectedAlertType}
                  onChange={(val) => setSelectedAlertType(val)}
                  options={alertTypeOptions}
                  placeholder="Select Alert Type"
                />
              </div>

              <DatePicker
                label="Date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>

            <div className="flex justify-start pt-4 border-t border-theme-border">
              <Button onClick={loadReport} variant="success" loading={loading} loadingText="Loading...">
                Load
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col min-h-[500px] print:border-none print:shadow-none">
          <CardContent className="p-0 flex-1">
            <Table
              headers={[
                <div key="s" className="text-center w-16">S. NO.</div>,
                "ZONE",
                "WARD",
                "VEHICLE(S) RTO",
                "VEHICLE TYPE",
                "ALERT TYPE",
                "ALERT DETAIL",
                "STATUS",
                "REASON"
              ]}
              isLoading={loading || metaLoading}
              emptyState="No data to display"
            >
              {data.map((row, idx) => (
                <tr key={row.id} className="hover:bg-theme-base/40 transition-colors border-b border-theme-border/50 print:border-black">
                  <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px] print:text-black">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-5 font-semibold text-theme-text text-[12px] print:text-black">
                    {row.zone_name || "—"}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {row.ward_name || "—"}
                  </td>
                  <td className="py-3 px-5 font-bold text-theme-text text-[12px] print:text-black">
                    {row.registration_no}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {row.vehicle_type_name}
                  </td>
                  <td className="py-3 px-5 text-theme-accent font-semibold text-[12px] print:text-black">
                    {row.alert_type}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[11px] max-w-xs break-words print:text-black">
                    {row.alert_detail}
                  </td>
                  <td className="py-3 px-5 text-[11px] font-bold text-theme-text print:text-black">
                    {row.status}
                  </td>
                  <td className="py-3 px-5 text-theme-text-dim text-[12px] print:text-black">
                    {row.reason || "—"}
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
