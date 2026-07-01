"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { API_URL } from "@/lib/api";
import { toast } from "react-toastify";
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Map,
  MapPin,
  RefreshCw,
  Search,
  Clock,
  User,
  Truck,
  Building2,
  ChevronDown,
  X
} from "lucide-react";

import ReportHeader from "@/components/shared/ReportHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Table from "@/components/shared/Table";

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface ShiftOption {
  id: number;
  name: string;
}

interface ZoneOption {
  id: number;
  name: string;
}

interface WardOption {
  id: number;
  name: string;
  parent_id: number;
}

interface DeploymentRow {
  id: number;
  vehicle_reg: string;
  vehicle_type: string;
  zone: string;
  ward: string;
  shift: string;
  driver: string;
}

// ─── Dropdown Component ──────────────────────────────────────────────────────

interface SearchableDropdownProps {
  label: string;
  placeholder?: string;
  options: { id: number; label: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  icon?: React.ReactNode;
}

function SearchableDropdown({
  label,
  placeholder = "Select…",
  options,
  selectedId,
  onSelect,
  icon,
}: SearchableDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.id === selectedId);
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="flex flex-col gap-1.5 text-left w-full">
      <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
        {icon && <span className="text-theme-accent">{icon}</span>}
        {label}
      </label>
      <div
        onClick={() => setOpen((o) => !o)}
        className={`relative bg-theme-surface border rounded-xl px-3.5 py-2.5 text-xs cursor-pointer flex items-center justify-between transition-all duration-150 ${
          open
            ? "border-[#10B981] ring-2 ring-[#10B981]/10"
            : "border-theme-border hover:border-theme-accent/40"
        }`}
      >
        <span className={selected ? "text-theme-text font-medium truncate" : "text-theme-text-dim truncate"}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {selected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
              }}
              className="text-theme-text-dim hover:text-rose-400 transition"
            >
              <X size={12} />
            </button>
          )}
          <ChevronDown
            size={14}
            className={`text-theme-text-dim transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>

        {open && (
          <div
            className="absolute left-0 top-[calc(100%+6px)] w-full bg-theme-surface border border-theme-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-theme-border">
              <input
                type="text"
                autoFocus
                placeholder={`Search ${label}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-theme-text placeholder:text-theme-text-dim outline-none"
              />
            </div>
            <div className="max-h-52 overflow-y-auto custom-scrollbar">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-xs text-theme-text-dim italic text-center">
                  No options found
                </div>
              ) : (
                filtered.map((opt) => (
                  <div
                    key={opt.id}
                    onClick={() => {
                      onSelect(opt.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`px-4 py-2 cursor-pointer text-xs transition-colors text-left ${
                      opt.id === selectedId
                        ? "bg-[#10B981]/10 text-[#10B981] font-semibold"
                        : "text-theme-text hover:bg-theme-base"
                    }`}
                  >
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



export default function VehicleDeploymentReportPage() {
  const [reportData, setReportData] = useState<DeploymentRow[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [wards, setWards] = useState<WardOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter Form State (Interchanged order: Shift, Zone, Ward)
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);

  // ─── Setup Defaults ─────────────────────────────────────────────────────────

  useEffect(() => {
    loadFilters();
  }, []);

  const loadFilters = async () => {
    try {
      let shiftList: ShiftOption[] = [];
      let zoneList: ZoneOption[] = [];
      let wardList: WardOption[] = [];

      // Fetch Shifts
      try {
        const response = await fetch(`${API_URL}/api/shifts?group=VEHICLE_MOVEMENT`);
        if (response.ok) {
          const res = await response.json();
          shiftList = (res.data || []).map((s: any) => ({
            id: s.id,
            name: s.shift_name || s.name,
          }));
        }
      } catch {
        shiftList = [];
      }

      // Fetch Zones
      try {
        const response = await fetch(`${API_URL}/api/zones`);
        if (response.ok) {
          const res = await response.json();
          zoneList = (res.data || []).map((z: any) => ({
            id: z.id,
            name: z.region_name || z.name,
          }));
        }
      } catch {
        zoneList = [];
      }

      // Fetch Wards
      try {
        const response = await fetch(`${API_URL}/api/wards`);
        if (response.ok) {
          const res = await response.json();
          wardList = (res.data || []).map((w: any) => ({
            id: w.id,
            name: w.region_name || w.name,
            parent_id: w.parent_id,
          }));
        }
      } catch {
        wardList = [];
      }

      setShifts(shiftList);
      setZones(zoneList);
      setWards(wardList);
    } catch (err) {
      console.error("Failed to load filter items", err);
    }
  };

  // ─── Filter Mappings ────────────────────────────────────────────────────────

  const filteredWardsOptions = useMemo(() => {
    if (!selectedZoneId) return wards;
    return wards.filter((w) => w.parent_id === selectedZoneId);
  }, [wards, selectedZoneId]);

  const shiftDropdownOptions = useMemo(() => {
    return shifts.map((s) => ({ id: s.id, label: s.name }));
  }, [shifts]);

  const zoneDropdownOptions = useMemo(() => {
    return zones.map((z) => ({ id: z.id, label: z.name }));
  }, [zones]);

  const wardDropdownOptions = useMemo(() => {
    return filteredWardsOptions.map((w) => ({ id: w.id, label: w.name }));
  }, [filteredWardsOptions]);

  // ─── Load Report Action ─────────────────────────────────────────────────────

  const handleLoadReport = async () => {
    setLoading(true);
    try {
      // Fetch multiple APIs to combine deployment details dynamically
      const [assignmentsRes, vehiclesRes, driversRes] = await Promise.all([
        fetch(`${API_URL}/api/vehicle-route-assignments`),
        fetch(`${API_URL}/api/vehicles`),
        fetch(`${API_URL}/api/employee-vehicle-assignments`),
      ]);

      if (assignmentsRes.ok && vehiclesRes.ok && driversRes.ok) {
        const assignmentsData = await assignmentsRes.json();
        const vehiclesData = await vehiclesRes.json();
        const driversData = await driversRes.json();

        const activeAssignments = assignmentsData.data || [];
        const activeVehicles = vehiclesData.data || [];
        const driverMappings = driversData.data || [];

        // Map assignments to full deployment rows
        const mapped: DeploymentRow[] = activeAssignments.map((a: any, idx: number) => {
          // Find matching vehicle details
          const vehicle = activeVehicles.find((v: any) => v.id === a.vehicle_id);
          
          // Find matching driver mapped to this vehicle
          const driverMap = driverMappings.find((dm: any) => dm.vehicle_id === a.vehicle_id && dm.is_active !== false);

          const driverName = driverMap
            ? driverMap.employee_name || [driverMap.employee?.first_name, driverMap.employee?.last_name].filter(Boolean).join(" ")
            : "—";

          return {
            id: a.id || idx,
            vehicle_reg: a.vehicle_reg_no || vehicle?.registration_no || "Unknown",
            vehicle_type: vehicle?.vehicle_type?.name || "Hopper Tipper",
            zone: vehicle?.zone_name || "Unknown Zone",
            ward: a.ward_name || vehicle?.ward_name || "Unknown Ward",
            shift: a.shift_name || "Morning",
            driver: driverName,
          };
        });

        // Filter based on selected criteria
        let finalRows = mapped;
        if (selectedShiftId) {
          const shift = shifts.find((s) => s.id === selectedShiftId);
          if (shift) {
            finalRows = finalRows.filter((r) => r.shift.toLowerCase().includes(shift.name.toLowerCase()));
          }
        }
        if (selectedZoneId) {
          const zone = zones.find((z) => z.id === selectedZoneId);
          if (zone) {
            finalRows = finalRows.filter((r) => r.zone === zone.name);
          }
        }
        if (selectedWardId) {
          const ward = wards.find((w) => w.id === selectedWardId);
          if (ward) {
            finalRows = finalRows.filter((r) => r.ward === ward.name);
          }
        }

        setReportData(finalRows);
      } else {
        setReportData([]);
      }
    } catch (err) {
      console.error("Failed to load live vehicle deployments", err);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Export Actions ─────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    if (reportData.length === 0) {
      toast.warning("No data available to export.");
      return;
    }
    const headers = ["S. No.", "Vehicle Reg. No.", "Vehicle Type", "Zone", "Ward", "Shift", "Driver"];
    const rows = reportData.map((row, idx) => [
      idx + 1,
      row.vehicle_reg,
      row.vehicle_type,
      row.zone,
      row.ward,
      row.shift,
      row.driver,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `vehicle_deployment_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV report downloaded.");
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col bg-theme-base text-theme-text overflow-hidden font-sans">
      
      {/* Page Header */}
      <div className="print:hidden">
        <ReportHeader
          title="Vehicle Deployment Report"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex items-center gap-1.5 shadow-sm text-xs" onClick={handlePrintPDF}>
                <Printer size={14} /> PDF
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 shadow-sm text-xs bg-theme-elevated text-theme-text hover:bg-theme-border" onClick={handleExportCSV}>
                <Download size={14} /> CSV
              </Button>
            </div>
          }
        />
      </div>

      {/* Print-only title */}
      <div className="hidden print:block text-left mb-6">
        <h1 className="text-xl font-bold uppercase tracking-tight">Vehicle Deployment Report</h1>
        <p className="text-xs text-slate-500 mt-1">Generated Date: {new Date().toLocaleDateString()}</p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8 print:overflow-visible print:pb-0 print:p-0">
      {/* Filter Options Panel - Interchange Order: Shift, Zone, Ward */}
      <Card className="shrink-0 border border-theme-border shadow-sm print:hidden">
        <CardContent className="p-4 md:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            
            {/* Shift Selector */}
            <SearchableDropdown
              label="Shift"
              placeholder="Select Shift"
              options={shiftDropdownOptions}
              selectedId={selectedShiftId}
              onSelect={setSelectedShiftId}
              icon={<Clock size={12} className="text-amber-500" />}
            />

            {/* Zone Selector */}
            <SearchableDropdown
              label="Zone"
              placeholder="Select Zone"
              options={zoneDropdownOptions}
              selectedId={selectedZoneId}
              onSelect={(id) => {
                setSelectedZoneId(id);
                setSelectedWardId(null); // Reset ward selection when zone changes
              }}
              icon={<Building2 size={12} />}
            />

            {/* Ward Selector */}
            <SearchableDropdown
              label="Ward"
              placeholder="Select Ward"
              options={wardDropdownOptions}
              selectedId={selectedWardId}
              onSelect={setSelectedWardId}
              icon={<MapPin size={12} />}
            />

          </div>

          {/* Form Actions */}
          <div className="mt-4 pt-4 border-t border-theme-border flex justify-start">
            <Button
              variant="accent"
              onClick={handleLoadReport}
              loading={loading}
              loadingText="Loading Deployments..."
              className="px-6"
            >
              Load
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Data Log Grid */}
      <Card className="overflow-hidden border border-theme-border shadow-sm">
        <CardContent className="p-0">
            <Table
              headers={[
                <div key="s" className="text-center w-12">S. No.</div>,
                "VEHICLE REG. NO.",
                "VEHICLE TYPE",
                "ZONE",
                "WARD",
                "SHIFT",
                "DRIVER",
              ]}
              isLoading={loading}
              emptyState="No vehicle deployment reports configured. Set your filter criteria above and click 'Load'."
            >
              {reportData.map((row, idx) => (
                <tr
                  key={row.id}
                  className="hover:bg-theme-base/30 transition-colors"
                >
                  <td className="py-3.5 px-4 text-center text-theme-text-dim font-mono text-[10px]">
                    {idx + 1}
                  </td>
                  <td className="py-3.5 px-4 text-left font-bold text-theme-text text-xs font-mono">
                    {row.vehicle_reg}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs text-theme-text-dim">
                    {row.vehicle_type}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs text-theme-text font-medium">
                    {row.zone}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs text-theme-text-dim">
                    {row.ward}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs font-semibold text-theme-text">
                    {row.shift}
                  </td>
                  <td className="py-3.5 px-4 text-left text-xs font-semibold text-theme-text">
                    {row.driver || "—"}
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
