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

import PageHeader from "@/components/shared/PageHeader";
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

// ─── Dummy Fallback Data ──────────────────────────────────────────────────────

const DUMMY_SHIFTS: ShiftOption[] = [
  { id: 1, name: "Morning" },
  { id: 2, name: "Evening" },
  { id: 3, name: "Night" },
  { id: 4, name: "General" },
];

const DUMMY_ZONES: ZoneOption[] = [
  { id: 1, name: "Zone 1 - Hawa Mahal-Aamer Zone" },
  { id: 2, name: "Zone 2 - Civil Lines Zone" },
  { id: 3, name: "Zone 3 - Mansarovar Zone" },
  { id: 4, name: "Zone 4 - Adarsh Nagar Zone" },
  { id: 5, name: "Zone 5 - Sanganer Zone" },
];

const DUMMY_WARDS: WardOption[] = [
  { id: 101, name: "Ward 28 - Ward - 28", parent_id: 1 },
  { id: 102, name: "Ward 12 - Ward - 12", parent_id: 1 },
  { id: 103, name: "Ward 10 - Ward - 10", parent_id: 1 },
  { id: 104, name: "Ward 3 - Ward - 3", parent_id: 1 },
  { id: 105, name: "Ward 13 - Ward - 13", parent_id: 1 },
  { id: 106, name: "Ward 9 - Ward - 9", parent_id: 1 },
  { id: 107, name: "Ward 8 - Ward - 8", parent_id: 1 },
  { id: 108, name: "Ward 7 - Ward - 7", parent_id: 1 },
  { id: 109, name: "Ward 6 - Ward - 6", parent_id: 1 },
  { id: 110, name: "Ward 4 - Ward - 4", parent_id: 1 },
  { id: 111, name: "Ward 2 - Ward - 2", parent_id: 1 },
];

const DUMMY_DEPLOYMENT: DeploymentRow[] = [
  { id: 21, vehicle_reg: "RJ14GN8106", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 28 - Ward - 28", shift: "Morning", driver: "Ram Karan" },
  { id: 22, vehicle_reg: "RJ14GN7685", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 12 - Ward - 12", shift: "Morning", driver: "Surendra Kumar" },
  { id: 23, vehicle_reg: "RJ14GN7686", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 10 - Ward - 10", shift: "Morning", driver: "Hari Mohan" },
  { id: 24, vehicle_reg: "RJ14GN4991", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 3 - Ward - 3", shift: "Morning", driver: "Mahendra Yadav" },
  { id: 25, vehicle_reg: "RJ14GN5032", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 13 - Ward - 13", shift: "Morning", driver: "Rajesh Patidar" },
  { id: 26, vehicle_reg: "RJ14GN7684", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 9 - Ward - 9", shift: "Morning", driver: "Sohan Lal" },
  { id: 27, vehicle_reg: "RJ14GN7678", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 8 - Ward - 8", shift: "Morning", driver: "Karan Singh" },
  { id: 28, vehicle_reg: "RJ14GN7670", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 7 - Ward - 7", shift: "Morning", driver: "Manoj Wadhwani" },
  { id: 29, vehicle_reg: "RJ14GN7681", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 6 - Ward - 6", shift: "Morning", driver: "Anil Sharma" },
  { id: 30, vehicle_reg: "RJ14GN7689", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 4 - Ward - 4", shift: "Morning", driver: "Vinod Yadav" },
  { id: 31, vehicle_reg: "RJ14GN7687", vehicle_type: "Partitioned Tipper", zone: "Zone 1 - Hawa Mahal-Aamer Zone", ward: "Ward 2 - Ward - 2", shift: "Morning", driver: "Suresh Meena" },
];

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
        } else {
          shiftList = DUMMY_SHIFTS;
        }
      } catch {
        shiftList = DUMMY_SHIFTS;
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
        } else {
          zoneList = DUMMY_ZONES;
        }
      } catch {
        zoneList = DUMMY_ZONES;
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
        } else {
          wardList = DUMMY_WARDS;
        }
      } catch {
        wardList = DUMMY_WARDS;
      }

      setShifts(shiftList);
      setZones(zoneList);
      setWards(wardList);
    } catch (err) {
      console.error("Failed to load filter items", err);
      setShifts(DUMMY_SHIFTS);
      setZones(DUMMY_ZONES);
      setWards(DUMMY_WARDS);
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

        setReportData(finalRows.length > 0 ? finalRows : DUMMY_DEPLOYMENT);
        if (finalRows.length === 0) {
          toast.info("No matching database logs found. Showing mock dataset.");
        }
      } else {
        setReportData(DUMMY_DEPLOYMENT);
        toast.info("Endpoint offline. Loaded demonstration logs.");
      }
    } catch (err) {
      console.error("Failed to load live vehicle deployments", err);
      setReportData(DUMMY_DEPLOYMENT);
      toast.info("Using demonstration logs.");
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
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 print:p-0 print:bg-white print:text-black">
      
      {/* Page Header */}
      <div className="print:hidden">
        <PageHeader
          title="Vehicle Deployment Report"
          description="View active fleet vehicle route deployments, mapped zones/wards, and assigned drivers."
          breadcrumbs={[
            { label: "VSWM", href: "/vswm/shift" },
            { label: "Reports", href: "/reports" },
            { label: "Vehicle Deployment" },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex items-center gap-1.5 shadow-sm text-xs"
                onClick={handlePrintPDF}
              >
                <Printer size={14} />
                PDF
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-1.5 shadow-sm text-xs bg-theme-elevated text-theme-text hover:bg-theme-border"
                onClick={handleExportCSV}
              >
                <Download size={14} />
                CSV
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
      <Card className="flex-1 flex flex-col overflow-hidden border border-theme-border shadow-sm">
        <CardContent className="p-0 flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto custom-scrollbar">
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
          </div>
        </CardContent>
      </Card>
      
    </div>
  );
}
