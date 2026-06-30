"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "react-toastify";
import { Truck, UserCheck, Users, X, ChevronDown, User } from "lucide-react";

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
  is_active: boolean;
  created_at: string;
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

// ─── All data comes from the backend API — no dummy fallbacks ─────────────────

export default function DriverVehicleAssignmentPage() {
  const [assignments, setAssignments] = useState<VehicleAssignment[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const [assignData, vehicleData, empData, eddData] = await Promise.all([
        api<any>('/api/employee-vehicle-assignments').then(r => r.data || []).catch(() => []),
        api<any>('/api/vehicles').then(r => r.data || []).catch(() => []),
        api<any>('/api/employees').then(r => r.data || []).catch(() => []),
        api<any>('/api/employee-department-designations').then(r => r.data || []).catch(() => []),
      ]);

      setAssignments(assignData);

      setVehicles(vehicleData.map((v: any) => ({
        id: v.id,
        plate_number: v.registration_no || v.plate_number || "Unknown Plate",
        type: v.vehicle_type?.name || v.type || "Unknown Type",
        shift: "",
      })));

      const mapped = empData.map((e: any) => {
        const m = eddData.find((x: any) => x.employee_id === e.id);
        return {
          id: e.id,
          first_name: e.first_name,
          middle_name: e.middle_name,
          last_name: e.last_name,
          employee_id: e.employee_id,
          designation: m?.designation_name || "Employee",
        };
      });
      setEmployees(mapped.filter((e: any) => e.designation?.toLowerCase().includes("driver")));
    } catch (err) {
      console.error("Failed to load data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ─── Derived State ────────────────────────────────────────────────────────

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
      sublabel: `ID: ${v.id}`,
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
    if (!selectedEmployeeId || !selectedVehicleId) {
      toast.warning("Please select both a driver and a vehicle.");
      return;
    }
    setSubmitting(true);

    try {
      await api('/api/employee-vehicle-assignments', {
        method: "POST",
        body: JSON.stringify({
          employee_id: selectedEmployeeId,
          vehicle_id: selectedVehicleId,
        }),
      });
      toast.success("Driver assigned to vehicle successfully.");
      setSelectedEmployeeId(null);
      setSelectedVehicleId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to assign driver.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api(`/api/employee-vehicle-assignments/${id}`, { method: "DELETE" });
      toast.success("Assignment removed.");
      loadData();
    } catch {
      toast.error("Failed to remove assignment.");
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

  const formatDate = (d: string) => {
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

              {/* Info text */}
              <div className="flex flex-col gap-1 text-left">
                <div className="bg-theme-base/60 border border-theme-border rounded-xl px-3.5 py-2.5 text-xs text-theme-text">
                  <span className="text-theme-text-dim">Assignment is permanent until changed. Select a driver and a vehicle, then click Assign.</span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="py-4 border-t border-theme-border bg-theme-base/10 flex items-center justify-end gap-3 shrink-0">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setSelectedEmployeeId(null);
                  setSelectedVehicleId(null);
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
                      "SHIFT",
                      "ASSIGNED SINCE",
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
                            {a.shift_name || "—"}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-theme-text-dim">
                          {formatDate(a.created_at)}
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
