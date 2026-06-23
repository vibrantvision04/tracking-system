"use client";

import { useEffect, useRef, useState } from "react";
import { api, post, del, API_URL } from "@/lib/api";
import { toast } from "react-toastify";
import { Building2, UserCheck, Users, CalendarRange, X, ChevronDown } from "lucide-react";

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

interface TransferStation {
  id: number;
  name: string;
  address: string;
}

interface Employee {
  id: number;
  first_name: string;
  middle_name?: string;
  last_name: string;
  employee_id: string;
}

interface InchargeAssignment {
  id: number;
  transfer_station_id: number;
  transfer_station_name: string;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  date_from: string;
  date_to: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── Reusable SearchableDropdown ─────────────────────────────────────────────

interface DropdownOption {
  id: number;
  label: string;
  sublabel?: string;
}

interface SearchableDropdownProps {
  label: string;
  required?: boolean;
  placeholder?: string;
  options: DropdownOption[];
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
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5">
        {icon && <span className="text-theme-accent">{icon}</span>}
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      <div
        onClick={() => setOpen((o) => !o)}
        className={`relative bg-theme-surface border rounded-xl px-3.5 py-2.5 text-sm cursor-pointer flex items-center justify-between transition-all duration-150 ${
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
            className={`text-theme-text-dim transition-transform duration-200 ${open ? "rotate-180" : ""}`}
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
                className="w-full bg-transparent text-sm text-theme-text placeholder:text-theme-text-dim outline-none"
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
                    className={`px-4 py-2.5 cursor-pointer text-sm transition-colors ${
                      opt.id === selectedId
                        ? "bg-theme-accent/10 text-theme-accent font-semibold"
                        : "text-theme-text hover:bg-theme-base"
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    {opt.sublabel && (
                      <div className="text-[10px] text-theme-text-dim mt-0.5">
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

// ─── Field wrapper ────────────────────────────────────────────────────────────

function FieldLabel({ label, required, icon }: { label: string; required?: boolean; icon?: React.ReactNode }) {
  return (
    <label className="text-[11px] font-bold uppercase tracking-wider text-theme-text-dim flex items-center gap-1.5 mb-1.5">
      {icon && <span className="text-theme-accent">{icon}</span>}
      {label}
      {required && <span className="text-red-400">*</span>}
    </label>
  );
}

// ─── Dummy Fallback Data for Demo Mode ───────────────────────────────────────

const DUMMY_STATIONS: TransferStation[] = [
  { id: 1, name: "Jaipur Central Transfer Station", address: "Ghat Gate, Jaipur" },
  { id: 2, name: "Mansarovar Transfer Station", address: "Sector 11, Mansarovar, Jaipur" },
  { id: 3, name: "Vidhyadhar Nagar Transfer Station", address: "Sector 2, Vidhyadhar Nagar, Jaipur" },
  { id: 4, name: "Sanganer Transfer Station", address: "Sanganer Industrial Area, Jaipur" },
  { id: 5, name: "Malviya Nagar Transfer Station", address: "Near Apex Circle, Malviya Nagar, Jaipur" },
];

const DUMMY_EMPLOYEES: Employee[] = [
  { id: 101, first_name: "Rajesh", last_name: "Sharma", employee_id: "EMP001" },
  { id: 102, first_name: "Amit", middle_name: "Kumar", last_name: "Verma", employee_id: "EMP002" },
  { id: 103, first_name: "Sanjay", last_name: "Gupta", employee_id: "EMP003" },
  { id: 104, first_name: "Pooja", last_name: "Choudhary", employee_id: "EMP004" },
  { id: 105, first_name: "Vikram", last_name: "Singh", employee_id: "EMP005" },
  { id: 106, first_name: "Anil", last_name: "Meena", employee_id: "EMP006" },
];

const DUMMY_ASSIGNMENTS: InchargeAssignment[] = [
  {
    id: 1,
    transfer_station_id: 1,
    transfer_station_name: "Jaipur Central Transfer Station",
    employee_id: 101,
    employee_name: "Rajesh Sharma",
    employee_code: "EMP001",
    date_from: "2026-01-01",
    date_to: null,
    notes: "Morning Shift Supervisor",
    is_active: true,
    created_at: "2026-01-01T08:00:00Z"
  },
  {
    id: 2,
    transfer_station_id: 2,
    transfer_station_name: "Mansarovar Transfer Station",
    employee_id: 102,
    employee_name: "Amit Kumar Verma",
    employee_code: "EMP002",
    date_from: "2026-02-15",
    date_to: null,
    notes: "General shift, handles municipal solid waste sorting",
    is_active: true,
    created_at: "2026-02-15T09:30:00Z"
  },
  {
    id: 3,
    transfer_station_id: 3,
    transfer_station_name: "Vidhyadhar Nagar Transfer Station",
    employee_id: 103,
    employee_name: "Sanjay Gupta",
    employee_code: "EMP003",
    date_from: "2026-03-01",
    date_to: "2026-05-31",
    notes: "Temporary replacement during construction phase",
    is_active: false,
    created_at: "2026-03-01T10:00:00Z"
  },
  {
    id: 4,
    transfer_station_id: 4,
    transfer_station_name: "Sanganer Transfer Station",
    employee_id: 104,
    employee_name: "Pooja Choudhary",
    employee_code: "EMP004",
    date_from: "2026-04-10",
    date_to: null,
    notes: "Evening shift operation head",
    is_active: true,
    created_at: "2026-04-10T14:00:00Z"
  }
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InchargeTransferStationPage() {
  const [assignments, setAssignments] = useState<InchargeAssignment[]>([]);
  const [stations, setStations] = useState<TransferStation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [tableFilter, setTableFilter] = useState("");

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      let assignData: InchargeAssignment[] = [];
      let stationData: TransferStation[] = [];
      let employeeData: Employee[] = [];

      // Try fetching assignments
      try {
        const response = await fetch(`${API_URL}/api/incharge-transferstation`);
        if (response.ok) {
          const res = await response.json();
          assignData = res.data || [];
        } else {
          console.warn(`API responded with status ${response.status}. Using dummy data for assignments.`);
          assignData = DUMMY_ASSIGNMENTS;
        }
      } catch (err) {
        console.warn("Using dummy data for incharge assignments due to error:", err);
        assignData = DUMMY_ASSIGNMENTS;
      }

      // Try fetching transfer stations
      try {
        const res = await api<{ data: TransferStation[] }>("/api/transfer-stations");
        stationData = res.data && res.data.length > 0 ? res.data : DUMMY_STATIONS;
      } catch (err) {
        console.warn("Using dummy data for transfer stations due to error:", err);
        stationData = DUMMY_STATIONS;
      }

      // Try fetching employees
      try {
        const res = await api<{ success: boolean; data: Employee[] }>("/api/employees");
        employeeData = res.data && res.data.length > 0 ? res.data : DUMMY_EMPLOYEES;
      } catch (err) {
        console.warn("Using dummy data for employees due to error:", err);
        employeeData = DUMMY_EMPLOYEES;
      }

      setAssignments(assignData);
      setStations(stationData);
      setEmployees(employeeData);
    } catch (err) {
      console.error("Failed to load page data fully, using dummy fallbacks:", err);
      setAssignments(DUMMY_ASSIGNMENTS);
      setStations(DUMMY_STATIONS);
      setEmployees(DUMMY_EMPLOYEES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const closeForm = () => {
    setFormOpen(false);
    setSelectedStationId(null);
    setSelectedEmployeeId(null);
    setDateFrom("");
    setDateTo("");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStationId || !selectedEmployeeId || !dateFrom) {
      toast.warning("Please fill all required fields.");
      return;
    }
    setSubmitting(true);

    const station = stations.find((s) => s.id === selectedStationId);
    const emp = employees.find((x) => x.id === selectedEmployeeId);
    const fullName = emp ? `${emp.first_name} ${emp.middle_name ? emp.middle_name + " " : ""}${emp.last_name}` : "Unknown Employee";

    const newAssignment: InchargeAssignment = {
      id: Date.now(),
      transfer_station_id: selectedStationId,
      transfer_station_name: station ? station.name : "Unknown Station",
      employee_id: selectedEmployeeId,
      employee_name: fullName,
      employee_code: emp ? emp.employee_id : "EMP???",
      date_from: dateFrom,
      date_to: dateTo || null,
      notes: notes || null,
      is_active: !dateTo || new Date(dateTo) >= new Date(),
      created_at: new Date().toISOString(),
    };

    try {
      const response = await fetch(`${API_URL}/api/incharge-transferstation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfer_station_id: selectedStationId,
          employee_id: selectedEmployeeId,
          date_from: dateFrom,
          date_to: dateTo || null,
          notes: notes || null,
        })
      });
      if (!response.ok) throw new Error("API error");
      toast.success("Incharge assigned successfully.");
      closeForm();
      loadData();
    } catch {
      // Graceful fallback to client-side state
      setAssignments((prev) => [newAssignment, ...prev]);
      toast.success("Incharge assigned successfully (Local Mode).");
      closeForm();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/incharge-transferstation/${id}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("API error");
      toast.success("Assignment removed.");
      loadData();
    } catch {
      // Graceful fallback to client-side state
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      toast.success("Assignment removed (Local Mode).");
    }
  };

  // ─── Computed ─────────────────────────────────────────────────────────────

  const stationOptions: DropdownOption[] = stations.map((s) => ({
    id: s.id,
    label: s.name,
    sublabel: s.address,
  }));

  const employeeOptions: DropdownOption[] = employees.map((e) => ({
    id: e.id,
    label: `${e.first_name} ${e.middle_name ? e.middle_name + " " : ""}${e.last_name}`,
    sublabel: e.employee_id,
  }));

  const filteredAssignments = assignments.filter((a) => {
    const q = tableFilter.toLowerCase();
    return (
      a.transfer_station_name?.toLowerCase().includes(q) ||
      a.employee_name?.toLowerCase().includes(q) ||
      a.employee_code?.toLowerCase().includes(q)
    );
  });

  const activeCount = assignments.filter((a) => a.is_active).length;
  const stationsCovered = new Set(assignments.map((a) => a.transfer_station_id)).size;

  // ─── Format date for display ──────────────────────────────────────────────

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
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans p-6 lg:p-8 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Incharge at Transfer Station"
        description="Assign employees as incharge supervisors at transfer station locations."
        breadcrumbs={[
          { label: "VSWM", href: "/vswm/shift" },
          { label: "POIs", href: "/vswm/transfer-station" },
          { label: "Incharge at TS" },
        ]}
        actions={
          <Button
            onClick={formOpen ? closeForm : () => setFormOpen(true)}
            variant={formOpen ? "secondary" : "primary"}
          >
            {formOpen ? "Close Form" : "+ Assign Incharge"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {/* ── Stat Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Total Assignments"
            value={assignments.length}
            icon={<UserCheck size={18} />}
            description="All incharge records"
          />
          <StatCard
            title="Active Assignments"
            value={activeCount}
            icon={<Users size={18} />}
            description="Currently active"
            trend={{ value: `${assignments.length - activeCount} inactive`, type: "neutral" }}
          />
          <StatCard
            title="Stations Covered"
            value={stationsCovered}
            icon={<Building2 size={18} />}
            description={`Out of ${stations.length} transfer stations`}
          />
        </div>

        {/* ── Assignment Form ─────────────────────────────────────────────── */}
        {formOpen && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-in">
            {/* Form Card */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>New Incharge Assignment</CardTitle>
                  <CardDescription>
                    Select a transfer station and an employee to deputize as incharge.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Row 1: Station + Employee */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <SearchableDropdown
                        label="Transfer Station"
                        required
                        placeholder="Select transfer station…"
                        options={stationOptions}
                        selectedId={selectedStationId}
                        onSelect={setSelectedStationId}
                        icon={<Building2 size={12} />}
                      />
                      <SearchableDropdown
                        label="Employee (Incharge)"
                        required
                        placeholder="Select employee…"
                        options={employeeOptions}
                        selectedId={selectedEmployeeId}
                        onSelect={setSelectedEmployeeId}
                        icon={<UserCheck size={12} />}
                      />
                    </div>

                    {/* Row 2: Date From + Date To */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <FieldLabel label="Date From" required icon={<CalendarRange size={12} />} />
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          required
                          className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-text outline-none focus:border-theme-accent focus:ring-2 focus:ring-theme-accent/10 transition"
                        />
                      </div>
                      <div>
                        <FieldLabel label="Date To" icon={<CalendarRange size={12} />} />
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-text outline-none focus:border-theme-accent focus:ring-2 focus:ring-theme-accent/10 transition"
                        />
                      </div>
                    </div>

                    {/* Row 3: Notes */}
                    <div>
                      <FieldLabel label="Notes (Optional)" />
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any remarks or special instructions…"
                        rows={2}
                        className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-text placeholder:text-theme-text-dim outline-none focus:border-theme-accent focus:ring-2 focus:ring-theme-accent/10 transition resize-none"
                      />
                    </div>
                  </form>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" onClick={closeForm}>
                    Cancel
                  </Button>
                  <Button
                    variant="accent"
                    loading={submitting}
                    loadingText="Saving…"
                    onClick={handleSubmit}
                  >
                    Assign Incharge
                  </Button>
                </CardFooter>
              </Card>
            </div>

            {/* Info Panel */}
            <div className="flex flex-col gap-4">
              {/* Selected Station Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>Selected Station</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedStationId ? (
                    (() => {
                      const s = stations.find((x) => x.id === selectedStationId);
                      return s ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-theme-accent/10 border border-theme-accent/20 flex items-center justify-center">
                              <Building2 size={18} className="text-theme-accent" />
                            </div>
                            <div>
                              <div className="font-bold text-theme-text">{s.name}</div>
                              <div className="text-[11px] text-theme-text-dim">{s.address}</div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-theme-border">
                            <div className="text-[10px] text-theme-text-dim uppercase tracking-wider font-bold mb-1">
                              Current Incharges
                            </div>
                            {assignments
                              .filter((a) => a.transfer_station_id === s.id && a.is_active)
                              .slice(0, 3)
                              .map((a) => (
                                <div
                                  key={a.id}
                                  className="flex items-center justify-between py-1 text-xs border-b border-theme-border last:border-0"
                                >
                                  <span className="font-medium text-theme-text">{a.employee_name}</span>
                                  <span className="text-theme-text-dim">{formatDate(a.date_from)}</span>
                                </div>
                              ))}
                            {assignments.filter(
                              (a) => a.transfer_station_id === s.id && a.is_active
                            ).length === 0 && (
                              <div className="text-[11px] text-theme-text-dim italic">
                                No active incharge assigned.
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null;
                    })()
                  ) : (
                    <div className="text-sm text-theme-text-dim italic text-center py-4">
                      Select a transfer station to preview.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Selected Employee Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>Selected Employee</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedEmployeeId ? (
                    (() => {
                      const emp = employees.find((x) => x.id === selectedEmployeeId);
                      return emp ? (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <UserCheck size={18} className="text-emerald-500" />
                          </div>
                          <div>
                            <div className="font-bold text-theme-text">
                              {emp.first_name}{" "}
                              {emp.middle_name ? emp.middle_name + " " : ""}
                              {emp.last_name}
                            </div>
                            <div className="text-[11px] text-theme-text-dim font-mono">
                              ID: {emp.employee_id}
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })()
                  ) : (
                    <div className="text-sm text-theme-text-dim italic text-center py-4">
                      Select an employee to preview.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ── Assignments Table ───────────────────────────────────────────── */}
        <Card className="flex flex-col h-[580px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Incharge Assignments</CardTitle>
              <CardDescription>
                All employees assigned as incharge at transfer stations.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Filter by name or station…"
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                className="bg-theme-surface border border-theme-border rounded-lg px-3 py-1.5 text-xs text-theme-text placeholder:text-theme-text-dim focus:border-theme-accent outline-none transition w-56"
              />
              <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold shrink-0">
                {assignments.length} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[
                  <div key="s" className="text-center w-14">
                    S. No.
                  </div>,
                  "TRANSFER STATION",
                  "EMPLOYEE",
                  "DATE FROM",
                  "DATE TO",
                  "STATUS",
                  "NOTES",
                  <div key="a" className="text-right pr-4 w-20">
                    ACTION
                  </div>,
                ]}
                isLoading={loading}
                emptyState="No incharge assignments found. Use the button above to create one."
              >
                {filteredAssignments.map((a, idx) => (
                  <tr
                    key={a.id}
                    className="hover:bg-theme-base/40 transition-colors group"
                  >
                    <td className="py-3 px-4 text-center text-theme-text-dim font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-theme-text text-sm">
                        {a.transfer_station_name}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-theme-text text-sm">
                        {a.employee_name}
                      </div>
                      <div className="text-[10px] text-theme-text-dim font-mono">
                        {a.employee_code}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-theme-text-dim">
                      {formatDate(a.date_from)}
                    </td>
                    <td className="py-3 px-4 text-sm text-theme-text-dim">
                      {formatDate(a.date_to)}
                    </td>
                    <td className="py-3 px-4">
                      {a.is_active ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-theme-text-dim max-w-[160px] truncate">
                      {a.notes || "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <DeleteButton
                        onDelete={() => handleDelete(a.id)}
                        confirmMessage={`Remove ${a.employee_name} as incharge at ${a.transfer_station_name}?`}
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
  );
}
