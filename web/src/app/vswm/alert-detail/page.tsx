"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";

interface Region {
  id: number;
  region_name: string;
  region_type_id: number;
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

  // Search states for dropdowns
  const [zoneSearch, setZoneSearch] = useState("");
  const [wardSearch, setWardSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [shiftSearch, setShiftSearch] = useState("");
  const [alertTypeSearch, setAlertTypeSearch] = useState("");

  // Dropdown open states
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);
  const [wardDropdownOpen, setWardDropdownOpen] = useState(false);
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);
  const [shiftDropdownOpen, setShiftDropdownOpen] = useState(false);
  const [alertTypeDropdownOpen, setAlertTypeDropdownOpen] = useState(false);

  // Refs for click outside
  const zoneRef = useRef<HTMLDivElement>(null);
  const wardRef = useRef<HTMLDivElement>(null);
  const vehicleRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);
  const alertTypeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (zoneRef.current && !zoneRef.current.contains(e.target as Node)) setZoneDropdownOpen(false);
      if (wardRef.current && !wardRef.current.contains(e.target as Node)) setWardDropdownOpen(false);
      if (vehicleRef.current && !vehicleRef.current.contains(e.target as Node)) setVehicleDropdownOpen(false);
      if (shiftRef.current && !shiftRef.current.contains(e.target as Node)) setShiftDropdownOpen(false);
      if (alertTypeRef.current && !alertTypeRef.current.contains(e.target as Node)) setAlertTypeDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const filteredZones = zones.filter(z => z.region_name.toLowerCase().includes(zoneSearch.toLowerCase()));
  const filteredWards = wards.filter(w => w.region_name.toLowerCase().includes(wardSearch.toLowerCase()));
  const filteredVehicles = vehicles.filter(v => v.registration_no.toLowerCase().includes(vehicleSearch.toLowerCase()));
  const filteredShifts = shifts.filter(s => s.shift_name.toLowerCase().includes(shiftSearch.toLowerCase()));
  const filteredAlertTypes = ALERT_TYPES.filter(t => t.toLowerCase().includes(alertTypeSearch.toLowerCase()));

  const selectedZoneName = zones.find(z => z.id === selectedZoneId)?.region_name || "Select Zone";
  const selectedWardName = wards.find(w => w.id === selectedWardId)?.region_name || "Select Ward";
  const selectedVehicleName = vehicles.find(v => v.id === selectedVehicleId)?.registration_no || "Select Vehicle";
  const selectedShiftName = shifts.find(s => s.id === selectedShiftId)?.shift_name || "Select Shift";
  const selectedAlertTypeName = selectedAlertType || "Select Alert Type";

  const SearchableDropdown = ({ label, selectedName, isSelected, isOpen, setOpen, search, setSearch, items, onSelect, dropdownRef, keyField, displayField, searchPlaceholder }: any) => {
    return (
      <div className="flex flex-col relative" ref={dropdownRef}>
        <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">{label}</span>
        <div
          className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2 text-xs cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition min-h-[38px]"
          onClick={() => setOpen(!isOpen)}
        >
          <span className={isSelected ? "text-theme-text font-medium truncate" : "text-theme-text-dim truncate"}>{selectedName}</span>
          <span className="text-theme-text-dim text-[10px] flex-shrink-0 ml-2">{isOpen ? "▲" : "▼"}</span>
        </div>
        {isOpen && (
          <div className="absolute top-[64px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
            <div className="p-2 border-b border-theme-border">
              <input
                type="text"
                placeholder={searchPlaceholder || `Search ${label}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-theme-text outline-none placeholder:text-theme-text-dim"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {items.length === 0 ? (
                <div className="px-4 py-2 text-xs text-theme-text-dim italic">No options found</div>
              ) : (
                items.map((item: any) => {
                  const id = keyField ? item[keyField] : item;
                  const text = displayField ? item[displayField] : item;
                  return (
                    <div
                      key={id}
                      className="px-4 py-2 text-xs text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer transition"
                      onClick={() => onSelect(id)}
                    >
                      {text}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8 print:p-0 print:bg-white print:text-black">
      <PageHeader
        title="Alert Detail Report"
        description="Comprehensive summary of triggered alerts, overspeed events, geofence breaches, and device reporting statuses."
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Alert Detail Report" }]}
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

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8 print:overflow-visible print:pb-0">
        <Card className="relative z-20 !overflow-visible print:hidden">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <SearchableDropdown
                label="Zone"
                selectedName={selectedZoneName}
                isSelected={!!selectedZoneId}
                isOpen={zoneDropdownOpen}
                setOpen={setZoneDropdownOpen}
                search={zoneSearch}
                setSearch={setZoneSearch}
                items={filteredZones}
                dropdownRef={zoneRef}
                keyField="id"
                displayField="region_name"
                onSelect={(id: number) => {
                  if (selectedZoneId === id) {
                    setSelectedZoneId(null);
                  } else {
                    setSelectedZoneId(id);
                  }
                  setZoneDropdownOpen(false);
                  setZoneSearch("");
                }}
              />

              <SearchableDropdown
                label="Ward"
                selectedName={selectedWardName}
                isSelected={!!selectedWardId}
                isOpen={wardDropdownOpen}
                setOpen={setWardDropdownOpen}
                search={wardSearch}
                setSearch={setWardSearch}
                items={filteredWards}
                dropdownRef={wardRef}
                keyField="id"
                displayField="region_name"
                onSelect={(id: number) => {
                  if (selectedWardId === id) {
                    setSelectedWardId(null);
                  } else {
                    setSelectedWardId(id);
                  }
                  setWardDropdownOpen(false);
                  setWardSearch("");
                }}
              />

              <SearchableDropdown
                label="Vehicle(s) RTO"
                selectedName={selectedVehicleName}
                isSelected={!!selectedVehicleId}
                isOpen={vehicleDropdownOpen}
                setOpen={setVehicleDropdownOpen}
                search={vehicleSearch}
                setSearch={setVehicleSearch}
                items={filteredVehicles}
                dropdownRef={vehicleRef}
                keyField="id"
                displayField="registration_no"
                onSelect={(id: number) => {
                  if (selectedVehicleId === id) {
                    setSelectedVehicleId(null);
                  } else {
                    setSelectedVehicleId(id);
                  }
                  setVehicleDropdownOpen(false);
                  setVehicleSearch("");
                }}
              />

              <SearchableDropdown
                label="Shift"
                selectedName={selectedShiftName}
                isSelected={!!selectedShiftId}
                isOpen={shiftDropdownOpen}
                setOpen={setShiftDropdownOpen}
                search={shiftSearch}
                setSearch={setShiftSearch}
                items={filteredShifts}
                dropdownRef={shiftRef}
                keyField="id"
                displayField="shift_name"
                onSelect={(id: number) => {
                  if (selectedShiftId === id) {
                    setSelectedShiftId(null);
                  } else {
                    setSelectedShiftId(id);
                  }
                  setShiftDropdownOpen(false);
                  setShiftSearch("");
                }}
              />

              <SearchableDropdown
                label="Alert Type"
                selectedName={selectedAlertTypeName}
                isSelected={!!selectedAlertType}
                isOpen={alertTypeDropdownOpen}
                setOpen={setAlertTypeDropdownOpen}
                search={alertTypeSearch}
                setSearch={setAlertTypeSearch}
                items={filteredAlertTypes}
                dropdownRef={alertTypeRef}
                onSelect={(t: string) => {
                  if (selectedAlertType === t) {
                    setSelectedAlertType("");
                  } else {
                    setSelectedAlertType(t);
                  }
                  setAlertTypeDropdownOpen(false);
                  setAlertTypeSearch("");
                }}
              />

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2 text-xs text-theme-text placeholder:text-theme-text-dim outline-none hover:border-theme-accent/40 focus:border-theme-accent transition min-h-[38px]"
                />
              </div>
            </div>

            <div className="flex justify-start pt-4 border-t border-theme-border">
              <Button onClick={loadReport} variant="accent" loading={loading} loadingText="Loading...">
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
