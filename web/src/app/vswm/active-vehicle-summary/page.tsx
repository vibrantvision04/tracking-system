"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";

import ReportHeader from "@/components/shared/ReportHeader";
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";
import SearchableSelect from "@/components/ui/SearchableSelect";

interface Region {
  id: number;
  region_name: string;
  region_type_id: number;
}

interface VehicleType {
  id: number;
  name: string;
}

interface ActiveVehicleSummaryRow {
  zone_id: number;
  zone_name: string;
  total_vehicles: number;
  active_vehicles: number;
  inactive_vehicles: number;
}

export default function ActiveVehicleSummaryReportPage() {
  const [data, setData] = useState<ActiveVehicleSummaryRow[]>([]);
  const [zones, setZones] = useState<Region[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);

  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);

  // Filters state
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState<number | null>(null);

  const loadMetaData = async () => {
    setMetaLoading(true);
    try {
      const [regRes, vtRes] = await Promise.all([
        api<Region[]>("/api/regions"),
        api<{ data: VehicleType[] }>("/api/vehicle-types")
      ]);

      const allRegions = Array.isArray(regRes) ? regRes : (regRes as any).data || [];
      setZones(allRegions.filter((r: Region) => r.region_type_id === 2));
      setVehicleTypes(vtRes.data || []);
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
      if (selectedZoneId) params.append("zone_id", String(selectedZoneId));
      if (selectedVehicleTypeId) params.append("vehicle_type_id", String(selectedVehicleTypeId));

      const res = await api<{ data: ActiveVehicleSummaryRow[] }>(`/api/reports/active-vehicle-summary?${params.toString()}`);
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
    // Fetch initial report data on load
    const fetchInitialData = async () => {
      try {
        const res = await api<{ data: ActiveVehicleSummaryRow[] }>("/api/reports/active-vehicle-summary");
        setData(res.data || []);
      } catch {
        // Silently catch initial load errors
      }
    };
    fetchInitialData();
  }, []);

  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = ["S. NO.", "ZONE", "TOTAL VEHICLES", "ACTIVE VEHICLES", "INACTIVE VEHICLES"];
    const rows = data.map((row, idx) => [
      idx + 1,
      `"${row.zone_name.replace(/"/g, '""')}"`,
      row.total_vehicles,
      row.active_vehicles,
      row.inactive_vehicles
    ]);
    
    // Append totals row to CSV
    const totalRow = [
      "",
      "Total",
      totals.total,
      totals.active,
      totals.inactive
    ];
    rows.push(totalRow);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `active_vehicle_summary_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculations for totals
  const totals = data.reduce(
    (acc, curr) => {
      acc.total += curr.total_vehicles;
      acc.active += curr.active_vehicles;
      acc.inactive += curr.inactive_vehicles;
      return acc;
    },
    { total: 0, active: 0, inactive: 0 }
  );

  const zoneOptions = zones.map(z => ({ value: String(z.id), label: z.region_name }));
  const vehicleTypeOptions = vehicleTypes.map(vt => ({ value: String(vt.id), label: vt.name }));

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans w-full">
  <ReportHeader
    title="Active Vehicle Summary Report"
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Zone</span>
                <SearchableSelect
                  value={selectedZoneId ? String(selectedZoneId) : ""}
                  onChange={(val) => setSelectedZoneId(val ? parseInt(val) : null)}
                  options={zoneOptions}
                  placeholder="Select Zone"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Vehicle Type</span>
                <SearchableSelect
                  value={selectedVehicleTypeId ? String(selectedVehicleTypeId) : ""}
                  onChange={(val) => setSelectedVehicleTypeId(val ? parseInt(val) : null)}
                  options={vehicleTypeOptions}
                  placeholder="Select Vehicle Type"
                />
              </div>
            </div>

            <div className="flex justify-start pt-4 border-t border-theme-border">
              <Button onClick={loadReport} variant="success" loading={loading} loadingText="Loading...">
                Load
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col min-h-[500px] print:border-none print:shadow-none">
          <CardContent className="p-0 flex-1 flex flex-col justify-between">
            <div className="flex-1">
              <Table
                headers={[
                  <div key="s" className="text-center w-16">S. NO.</div>,
                  "ZONE",
                  "TOTAL VEHICLES",
                  "ACTIVE VEHICLES",
                  "INACTIVE VEHICLES"
                ]}
                isLoading={loading || metaLoading}
                emptyState="No records found."
                paginate={false}
              >
                {data.map((row, idx) => (
                  <tr key={row.zone_id} className="hover:bg-theme-base/40 transition-colors border-b border-theme-border/50 print:border-black">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px] print:text-black w-16">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-5 font-semibold text-theme-text text-[12px] print:text-black">
                      {row.zone_name}
                    </td>
                    <td className="py-3 px-5 font-medium text-theme-text text-[12px] print:text-black">
                      {row.total_vehicles}
                    </td>
                    <td className="py-3 px-5 text-emerald-400 font-semibold text-[12px] print:text-black">
                      {row.active_vehicles}
                    </td>
                    <td className="py-3 px-5 text-rose-400 font-semibold text-[12px] print:text-black">
                      {row.inactive_vehicles}
                    </td>
                  </tr>
                ))}
                {data.length > 0 && !loading && (
                  <tr className="bg-theme-base/50 font-bold border-t-2 border-theme-border/80 print:bg-slate-100 print:text-black print:border-black">
                    <td className="py-3 px-5 text-center w-16 print:text-black">—</td>
                    <td className="py-3 px-5 print:text-black">Total</td>
                    <td className="py-3 px-5 print:text-black">{totals.total}</td>
                    <td className="py-3 px-5 text-emerald-400 print:text-black">{totals.active}</td>
                    <td className="py-3 px-5 text-rose-400 print:text-black">{totals.inactive}</td>
                  </tr>
                )}
              </Table>
            </div>
            {data.length > 0 && !loading && (
              <div className="bg-theme-base/30 border-t border-theme-border px-5 py-3 text-xs text-theme-text-dim print:hidden rounded-b-xl select-none">
                {data.length} total
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
