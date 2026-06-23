"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { api, post, del, API_URL } from "@/lib/api";
import { toast } from "react-toastify";
import { Truck, UserCheck, Users, CalendarRange, X, ChevronDown, User, Landmark, ShieldAlert, Clock } from "lucide-react";

import PageHeader from "@/components/shared/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";
import StatCard from "@/components/shared/StatCard";

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface VehicleOption {
  id: number;
  plate_number: string;
  type: string;
  shift: string;
}

interface EmployeeOption {
  id: number;
  first_name: string;
  middle_name?: string;
  last_name: string;
  employee_id: string;
  designation: string; // e.g. "Driver" or "Helper"
}

interface VehicleAssignment {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  designation: string;
  vehicle_id: number;
  vehicle_plate: string;
  vehicle_type: string;
  shift_name: string;
  date_from: string;
  date_to: string | null;
  is_active: boolean;
}

// ─── Searchable Dropdown Options ──────────────────────────────────────────────

interface DropdownItem {
  id: number;
  label: string;
  sublabel?: string;
}

interface SearchableDropdownProps {
  label: string;
  required?: boolean;
  placeholder?: string;
  options: DropdownItem[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  icon?: React.ReactNode;
}

function SearchableDropdown({
  label,
  required,
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
  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div ref={ref} className="flex flex-col gap-1.5 text-left">
      <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
        {icon && <span className="text-theme-accent">{icon}</span>}
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      <div
        onClick={() => setOpen((o) => !o)}
        className={`relative bg-theme-surface border rounded-xl px-3.5 py-2.5 text-xs cursor-pointer flex items-center justify-between transition-all duration-150 ${
          open
            ? "border-theme-accent ring-2 ring-theme-accent/10"
            : "border-theme-border hover:border-theme-accent/40"
        }`}
      >
        <span
          className={
            selected
              ? "text-theme-text font-medium truncate"
              : "text-theme-text-dim truncate"
          }
        >
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
            className="absolute left-0 top-[calc(100%+6px)] w-full bg-theme-surface border border-theme-border rounded-xl shadow-xl z-50 overflow-hidden"
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
                        ? "bg-theme-accent/10 text-theme-accent font-semibold"
                        : "text-theme-text hover:bg-theme-base"
                    }`}
                  >
                    <div className="font-medium pt-1.5">{opt.label}</div>
                    {opt.sublabel && (
                      <div className="text-[10px] text-theme-text-dim pb-1.5">
                        {opt.sublabel}
                      </div>
                    )}
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

const DUMMY_VEHICLES: VehicleOption[] = [
  { id: 1, plate_number: "RJ-14-GB-1204", type: "Dumper Placer", shift: "Morning Shift (06:00 AM - 02:00 PM)" },
  { id: 2, plate_number: "RJ-14-GC-5678", type: "Compactor", shift: "Morning Shift (06:00 AM - 02:00 PM)" },
  { id: 3, plate_number: "RJ-14-GA-9988", type: "Tractor Trolley", shift: "Evening Shift (02:00 PM - 10:00 PM)" },
  { id: 4, plate_number: "RJ-14-GD-4422", type: "Hopper", shift: "Night Shift (10:00 PM - 06:00 AM)" },
  { id: 5, plate_number: "RJ-14-GE-7711", type: "Dumper Placer", shift: "Morning Shift (06:00 AM - 02:00 PM)" },
  { id: 6, plate_number: "RJ-14-GF-3344", type: "Auto Tipper", shift: "General Shift (09:00 AM - 05:00 PM)" },
];

const DUMMY_EMPLOYEES: EmployeeOption[] = [
  { id: 201, first_name: "Ram", last_name: "Karan", designation: "Driver", employee_id: "DRV001" },
  { id: 202, first_name: "Surendra", last_name: "Kumar", designation: "Driver", employee_id: "DRV002" },
  { id: 203, first_name: "Hari", last_name: "Mohan", designation: "Driver", employee_id: "DRV003" },
  { id: 206, first_name: "Mahendra", last_name: "Yadav", designation: "Driver", employee_id: "DRV004" },
];

const DUMMY_ASSIGNMENTS: VehicleAssignment[] = [
  {
    id: 1,
    employee_id: 201,
    employee_name: "Ram Karan",
    employee_code: "DRV001",
    designation: "Driver",
    vehicle_id: 1,
    vehicle_plate: "RJ-14-GB-1204",
    vehicle_type: "Dumper Placer",
    shift_name: "Morning Shift (06:00 AM - 02:00 PM)",
    date_from: "2026-01-01",
    date_to: null,
    is_active: true,
  },
  {
    id: 2,
    employee_id: 202,
    employee_name: "Surendra Kumar",
    employee_code: "DRV002",
    designation: "Driver",
    vehicle_id: 2,
    vehicle_plate: "RJ-14-GC-5678",
    vehicle_type: "Compactor",
    shift_name: "Morning Shift (06:00 AM - 02:00 PM)",
    date_from: "2026-02-01",
    date_to: null,
    is_active: true,
  },
  {
    id: 4,
    employee_id: 203,
    employee_name: "Hari Mohan",
    employee_code: "DRV003",
    designation: "Driver",
    vehicle_id: 3,
    vehicle_plate: "RJ-14-GA-9988",
    vehicle_type: "Tractor Trolley",
    shift_name: "Evening Shift (02:00 PM - 10:00 PM)",
    date_from: "2026-03-10",
    date_to: "2026-05-10",
    is_active: false,
  },
];

export default function DriverVehicleAssignmentPage() {
  const [assignments, setAssignments] = useState<VehicleAssignment[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      let assignData: VehicleAssignment[] = [];
      let vehicleData: VehicleOption[] = [];
      let employeeData: EmployeeOption[] = [];
      let routeAssignments: any[] = [];

      // Try fetching vehicle-route assignments to get shifts
      try {
        const response = await fetch(`${API_URL}/api/vehicle-route-assignments`);
        if (response.ok) {
          const res = await response.json();
          routeAssignments = res.data || [];
        }
      } catch (err) {
        console.error("Failed to fetch vehicle-route assignments", err);
      }

      // Try fetching assignments
      try {
        const response = await fetch(`${API_URL}/api/employee-vehicle-assignments`);
        if (response.ok) {
          const res = await response.json();
          const rawAssignments = res.data || [];
          assignData = rawAssignments.map((a: any) => ({
            id: a.id,
            employee_id: a.employee_id,
            employee_name: a.employee_name || [a.employee?.first_name, a.employee?.last_name].filter(Boolean).join(" ") || "Unknown Driver",
            employee_code: a.employee_code || a.employee?.employee_id || "EMP???",
            designation: a.designation || a.employee?.designation || "Driver",
            vehicle_id: a.vehicle_id,
            vehicle_plate: a.vehicle_plate || a.vehicle?.registration_no || "Unknown Plate",
            vehicle_type: a.vehicle_type || a.vehicle?.vehicle_type?.name || "Unknown",
            shift_name: a.shift_name || a.vehicle_route_assignment?.shift?.shift_name || "Morning Shift",
            date_from: a.date_from,
            date_to: a.date_to,
            is_active: a.is_active,
          }));
          if (assignData.length === 0) assignData = DUMMY_ASSIGNMENTS;
        } else {
          assignData = DUMMY_ASSIGNMENTS;
        }
      } catch {
        assignData = DUMMY_ASSIGNMENTS;
      }

      // Try fetching vehicles
      try {
        const response = await fetch(`${API_URL}/api/vehicles`);
        if (response.ok) {
          const res = await response.json();
          const rawVehicles = res.data || [];
          vehicleData = rawVehicles.map((v: any) => {
            const activeAssign = routeAssignments.find(
              (a: any) => a.vehicle_id === v.id && a.is_active !== false
            );
            return {
              id: v.id,
              plate_number: v.registration_no || v.plate_number || "Unknown Plate",
              type: v.vehicle_type?.name || v.type || "Unknown Type",
              shift: activeAssign?.shift_name || v.shift || "Morning Shift (06:00 AM - 02:00 PM)",
            };
          });
          if (vehicleData.length === 0) vehicleData = DUMMY_VEHICLES;
        } else {
          vehicleData = DUMMY_VEHICLES;
        }
      } catch {
        vehicleData = DUMMY_VEHICLES;
      }

      // Try fetching employees and their designations
      try {
        const empResponse = await fetch(`${API_URL}/api/employees`);
        const eddResponse = await fetch(`${API_URL}/api/employee-department-designations`);
        if (empResponse.ok && eddResponse.ok) {
          const empRes = await empResponse.json();
          const eddRes = await eddResponse.json();

          const rawEmployees = empRes.data || [];
          const eddMappings = eddRes.data || [];

          employeeData = rawEmployees
            .map((e: any) => {
              const mapping = eddMappings.find((m: any) => m.employee_id === e.id);
              return {
                id: e.id,
                first_name: e.first_name,
                middle_name: e.middle_name,
                last_name: e.last_name,
                employee_id: e.employee_id,
                designation: mapping?.designation_name || "Employee",
              };
            })
            .filter((e: any) => e.designation?.toLowerCase().includes("driver"));
          if (employeeData.length === 0) employeeData = DUMMY_EMPLOYEES;
        } else {
          employeeData = DUMMY_EMPLOYEES;
        }
      } catch {
        employeeData = DUMMY_EMPLOYEES;
      }

      setAssignments(assignData);
      setVehicles(vehicleData);
      setEmployees(employeeData);
    } catch (err) {
      console.error("Failed to load assignments data", err);
      setAssignments(DUMMY_ASSIGNMENTS);
      setVehicles(DUMMY_VEHICLES);
      setEmployees(DUMMY_EMPLOYEES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ─── Derived State (Auto-fetching shift from vehicle) ─────────────────────

  const selectedVehicleDetails = useMemo(() => {
    if (!selectedVehicleId) return null;
    return vehicles.find((v) => v.id === selectedVehicleId) || null;
  }, [selectedVehicleId, vehicles]);

  const selectedEmployeeDetails = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [selectedEmployeeId, employees]);

  // ─── Select Options Formatting ────────────────────────────────────────────

  const vehicleOptions = useMemo(() => {
    return vehicles.map((v) => ({
      id: v.id,
      label: `${v.plate_number} (${v.type})`,
      sublabel: `Shift: ${v.shift}`,
    }));
  }, [vehicles]);

  const employeeOptions = useMemo(() => {
    return employees.map((e) => ({
      id: e.id,
      label: `${e.first_name} ${e.last_name}`,
      sublabel: `ID: ${e.employee_id}`,
    }));
  }, [employees]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId || !selectedVehicleId || !dateFrom) {
      toast.warning("Please fill all required fields.");
      return;
    }
    setSubmitting(true);

    const vehicle = vehicles.find((v) => v.id === selectedVehicleId);
    const emp = employees.find((x) => x.id === selectedEmployeeId);
    const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "Unknown Driver";

    const newAssignment: VehicleAssignment = {
      id: Date.now(),
      employee_id: selectedEmployeeId,
      employee_name: fullName,
      employee_code: emp ? emp.employee_id : "EMP???",
      designation: emp ? emp.designation : "Driver",
      vehicle_id: selectedVehicleId,
      vehicle_plate: vehicle ? vehicle.plate_number : "Unknown Vehicle",
      vehicle_type: vehicle ? vehicle.type : "Unknown",
      shift_name: vehicle ? vehicle.shift : "Morning Shift",
      date_from: dateFrom,
      date_to: dateTo || null,
      is_active: !dateTo || new Date(dateTo) >= new Date(),
    };

    try {
      const response = await fetch(`${API_URL}/api/employee-vehicle-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: selectedEmployeeId,
          vehicle_id: selectedVehicleId,
          date_from: dateFrom,
          date_to: dateTo || null,
        }),
      });
      if (!response.ok) throw new Error("API error");
      toast.success("Driver assigned successfully.");
      setSelectedEmployeeId(null);
      setSelectedVehicleId(null);
      setDateFrom("");
      setDateTo("");
      loadData();
    } catch {
      // Local state fallback
      setAssignments((prev) => [newAssignment, ...prev]);
      toast.success("Driver assigned successfully (Local Mode).");
      setSelectedEmployeeId(null);
      setSelectedVehicleId(null);
      setDateFrom("");
      setDateTo("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/employee-vehicle-assignments/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("API error");
      toast.success("Assignment removed.");
      loadData();
    } catch {
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      toast.success("Assignment removed (Local Mode).");
    }
  };

  // ─── Filters & Computations ───────────────────────────────────────────────

  const filteredAssignments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return assignments;
    return assignments.filter(
      (a) =>
        a.employee_name.toLowerCase().includes(q) ||
        a.employee_code.toLowerCase().includes(q) ||
        a.vehicle_plate.toLowerCase().includes(q) ||
        a.designation.toLowerCase().includes(q)
    );
  }, [assignments, searchQuery]);

  const activeCount = assignments.filter((a) => a.is_active).length;

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Driver to Vehicle Mapping"
        description="Map drivers to active fleet vehicles. Shift is automatically inherited from the vehicle assignment."
        breadcrumbs={[
          { label: "VSWM", href: "/vswm/shift" },
          { label: "HR / Staff", href: "/vswm/employee" },
          { label: "Driver to Vehicle" },
        ]}
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 shrink-0">
        <StatCard
          title="Total Mapped Drivers"
          value={assignments.length}
          icon={<Users size={18} className="text-[#10B981]" />}
          description="All driver assignment logs"
        />
        <StatCard
          title="Active Drivers"
          value={activeCount}
          icon={<UserCheck size={18} className="text-blue-500" />}
          description="Currently driving active vehicles"
        />
      </div>

      {/* Workspace Panel Split screen layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-5 overflow-hidden">
        
        {/* Left Panel: Assignment Form */}
        <div className="w-full lg:w-[400px] shrink-0">
          <Card className="flex flex-col h-full overflow-hidden shadow-sm">
            <CardHeader className="py-4 shrink-0 border-b border-theme-border bg-theme-base/20">
              <CardTitle className="text-xs uppercase tracking-wider text-theme-text flex items-center gap-2">
                <Truck size={14} className="text-emerald-500" />
                New Driver Assignment
              </CardTitle>
              <CardDescription className="text-[10px] text-theme-text-dim mt-0.5">
                Assign a driver to a vehicle.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5 text-left">
              {/* Select Employee */}
              <SearchableDropdown
                label="Driver"
                required
                placeholder="Search and select driver…"
                options={employeeOptions}
                selectedId={selectedEmployeeId}
                onSelect={setSelectedEmployeeId}
                icon={<User size={12} />}
              />

              {/* Select Vehicle */}
              <SearchableDropdown
                label="Vehicle"
                required
                placeholder="Search and select vehicle…"
                options={vehicleOptions}
                selectedId={selectedVehicleId}
                onSelect={setSelectedVehicleId}
                icon={<Truck size={12} />}
              />

              {/* Dynamically Inherited Shift Display */}
              <div className="flex flex-col gap-1 text-left">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <Clock size={12} className="text-amber-500" />
                  Inherited Shift (From Vehicle)
                </label>
                <div className="bg-theme-base/60 border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text font-bold flex items-center gap-2 min-h-10">
                  {selectedVehicleDetails ? (
                    <span className="text-[#10B981] flex items-center gap-1.5 animate-fade-in">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                      {selectedVehicleDetails.shift}
                    </span>
                  ) : (
                    <span className="text-theme-text-dim italic">Select a vehicle to automatically derive its shift.</span>
                  )}
                </div>
              </div>

              {/* Date From */}
              <div className="flex flex-col gap-1 text-left">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <CalendarRange size={12} className="text-[#10B981]" />
                  Date From
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  required
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2 text-xs text-theme-text outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/10 transition"
                />
              </div>

              {/* Date To */}
              <div className="flex flex-col gap-1 text-left">
                <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
                  <CalendarRange size={12} className="text-theme-text-dim" />
                  Date To (Optional)
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2 text-xs text-theme-text outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/10 transition"
                />
              </div>
            </CardContent>

            <CardFooter className="py-4 border-t border-theme-border bg-theme-base/10 flex items-center justify-end gap-3 shrink-0">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setSelectedEmployeeId(null);
                  setSelectedVehicleId(null);
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Reset
              </Button>
              <Button
                variant="accent"
                onClick={handleSubmit}
                loading={submitting}
                loadingText="Mapping…"
              >
                Assign Vehicle
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Right Panel: Assignments list/table */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <Card className="flex flex-col h-full shadow-sm overflow-hidden border border-theme-border">
            <CardHeader className="py-4 border-b border-theme-border bg-theme-base/20 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-left w-full sm:w-auto">
                <CardTitle className="text-xs uppercase tracking-wider text-theme-text">
                  Driver Vehicle Assignments ({filteredAssignments.length})
                </CardTitle>
                <CardDescription className="text-[10px] text-theme-text-dim mt-0.5">
                  Log of currently assigned drivers and their active shifts.
                </CardDescription>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search by driver, vehicle..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-theme-surface border border-theme-border rounded-xl pl-3.5 pr-4 py-2 text-xs text-theme-text placeholder:text-theme-text-dim outline-none focus:border-[#10B981] transition"
                />
              </div>
            </CardHeader>
            
            <CardContent className="p-0 flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto custom-scrollbar">
                <Table
                  headers={[
                    <div key="s" className="text-center w-12">S. No.</div>,
                    "DRIVER",
                    "VEHICLE INFO",
                    "AUTO INHERITED SHIFT",
                    "DATE FROM",
                    "DATE TO",
                    "STATUS",
                    <div key="a" className="text-right pr-6 w-20">ACTION</div>,
                  ]}
                  isLoading={loading}
                  emptyState="No vehicle assignments found. Use the panel on the left to map drivers."
                >
                  {filteredAssignments.map((a, idx) => (
                    <tr
                      key={a.id}
                      className="hover:bg-theme-base/30 transition-colors"
                    >
                      <td className="py-3 px-4 text-center text-theme-text-dim font-mono text-[10px]">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 text-left">
                        <div className="font-bold text-theme-text text-xs">
                          {a.employee_name}
                        </div>
                        <div className="text-[9px] text-theme-text-dim font-mono">
                          {a.employee_code}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-left">
                        <div className="font-bold text-[#10B981] text-xs font-mono">
                          {a.vehicle_plate}
                        </div>
                        <div className="text-[9px] text-theme-text-dim">
                          {a.vehicle_type}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-left">
                        <div className="font-medium text-theme-text text-xs flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {a.shift_name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-theme-text-dim">
                        {formatDate(a.date_from)}
                      </td>
                      <td className="py-3 px-4 text-xs text-theme-text-dim">
                        {formatDate(a.date_to)}
                      </td>
                      <td className="py-3 px-4">
                        {a.is_active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right pr-6">
                        <DeleteButton
                          onDelete={() => handleDelete(a.id)}
                          confirmMessage={`Remove mapping for ${a.employee_name} on vehicle ${a.vehicle_plate}?`}
                        />
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
