"use client";

import { useEffect, useState, useRef } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";

interface TemporaryVehicle {
  id: number;
  ward_id: number;
  ward_name: string;
  shift_id: number;
  shift_name: string;
  route_id: number;
  route_name: string;
  vehicle_id: number;
  vehicle_reg_no: string;
  assignment_date: string;
  assigned_at: string;
}

interface Region {
  id: number;
  region_name: string;
  region_type_id: number;
}

interface Shift {
  id: number;
  shift_name: string;
}

interface Route {
  id: number;
  route_name: string;
  shift_id?: number;
}

interface Vehicle {
  id: number;
  registration_no: string;
}

interface RouteWard {
  id: number;
  route_id: number;
  ward_id: number;
}

export default function TemporaryVehiclePage() {
  const [assignments, setAssignments] = useState<TemporaryVehicle[]>([]);
  const [wards, setWards] = useState<Region[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routeWards, setRouteWards] = useState<RouteWard[]>([]);

  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<TemporaryVehicle | null>(null);

  // Form states
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [assignmentDate, setAssignmentDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [regularVehicle, setRegularVehicle] = useState("");

  // Search/Dropdown states
  const [wardSearch, setWardSearch] = useState("");
  const [shiftSearch, setShiftSearch] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");

  const [wardDropdownOpen, setWardDropdownOpen] = useState(false);
  const [shiftDropdownOpen, setShiftDropdownOpen] = useState(false);
  const [routeDropdownOpen, setRouteDropdownOpen] = useState(false);
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);

  // Table Filter states
  const [filterShiftId, setFilterShiftId] = useState<string>("null");
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [searchFilter, setSearchFilter] = useState("");

  const wardRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const vehicleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wardRef.current && !wardRef.current.contains(e.target as Node)) setWardDropdownOpen(false);
      if (shiftRef.current && !shiftRef.current.contains(e.target as Node)) setShiftDropdownOpen(false);
      if (routeRef.current && !routeRef.current.contains(e.target as Node)) setRouteDropdownOpen(false);
      if (vehicleRef.current && !vehicleRef.current.contains(e.target as Node)) setVehicleDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadDropdowns = async () => {
    try {
      const [regRes, shiftRes, routeRes, vehRes, rwRes] = await Promise.all([
        api<{ data: Region[] }>("/api/regions"),
        api<{ data: Shift[] }>("/api/shifts"),
        api<{ data: Route[] }>("/api/routes"),
        api<{ data: Vehicle[] }>("/api/vehicles"),
        api<{ data: RouteWard[] }>("/api/route-wards")
      ]);
      setWards((regRes.data || []).filter(r => r.region_type_id === 3));
      setShifts(shiftRes.data || []);
      setRoutes(routeRes.data || []);
      setVehicles((vehRes.data || []).filter(v => v.registration_no));
      setRouteWards(rwRes.data || []);
    } catch {
      toast.error("Failed to load selectors data.");
    }
  };

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const shiftParam = filterShiftId !== "null" ? filterShiftId : "";
      const res = await api<{ data: TemporaryVehicle[] }>(
        `/api/temporary-vehicles?shift_id=${shiftParam}&date=${filterDate}`
      );
      setAssignments(res.data || []);
    } catch {
      toast.error("Failed to load temporary assignments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDropdowns();
    loadAssignments();
  }, []);

  // Fetch regular vehicle when Route or Date changes in the Form
  useEffect(() => {
    if (selectedRouteId && assignmentDate) {
      api<{ success: boolean; vehicle: string }>(
        `/api/routes/${selectedRouteId}/regular-vehicle?date=${assignmentDate}`
      ).then(res => {
        if (res.success) {
          setRegularVehicle(res.vehicle);
        } else {
          setRegularVehicle("");
        }
      });
    } else {
      setRegularVehicle("");
    }
  }, [selectedRouteId, assignmentDate]);

  const openFormForCreate = () => {
    setEditingAssignment(null);
    setSelectedWardId(null);
    setSelectedShiftId(null);
    setSelectedRouteId(null);
    setSelectedVehicleId(null);
    setAssignmentDate(new Date().toISOString().split("T")[0]);
    setRegularVehicle("");
    setFormOpen(true);
  };

  const openFormForEdit = (assign: TemporaryVehicle) => {
    setEditingAssignment(assign);
    setSelectedWardId(assign.ward_id);
    setSelectedShiftId(assign.shift_id);
    setSelectedRouteId(assign.route_id);
    setSelectedVehicleId(assign.vehicle_id);
    setAssignmentDate(assign.assignment_date);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingAssignment(null);
    setSelectedWardId(null);
    setSelectedShiftId(null);
    setSelectedRouteId(null);
    setSelectedVehicleId(null);
    setAssignmentDate(new Date().toISOString().split("T")[0]);
    setRegularVehicle("");
    setWardSearch("");
    setShiftSearch("");
    setRouteSearch("");
    setVehicleSearch("");
  };

  const handleSubmit = async () => {
    if (!selectedWardId || !selectedShiftId || !selectedRouteId || !selectedVehicleId || !assignmentDate) {
      toast.warning("Please fill all required fields.");
      return;
    }
    setSubmitting(true);
    const payload = {
      ward_id: selectedWardId,
      shift_id: selectedShiftId,
      route_id: selectedRouteId,
      vehicle_id: selectedVehicleId,
      assignment_date: assignmentDate
    };

    try {
      if (editingAssignment) {
        await put(`/api/temporary-vehicles/${editingAssignment.id}`, payload);
        toast.success("Assignment updated successfully!");
      } else {
        await post("/api/temporary-vehicles", payload);
        toast.success("Temporary vehicle assigned successfully!");
      }
      closeForm();
      loadAssignments();
    } catch {
      toast.error("Failed to save assignment.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await del(`/api/temporary-vehicles/${id}`);
      toast.success("Assignment deleted.");
      loadAssignments();
    } catch {
      toast.error("Failed to delete assignment.");
    }
  };

  // CSV Export
  const exportToCSV = () => {
    if (assignments.length === 0) {
      toast.info("No data available to export.");
      return;
    }
    const headers = ["S. No.", "Route", "Shift", "Vehicle", "Date", "Assigned At"];
    const rows = assignments.map((a, idx) => [
      idx + 1,
      a.route_name,
      a.shift_name,
      a.vehicle_reg_no,
      a.assignment_date,
      a.assigned_at
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `temporary_vehicles_${filterDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Export (uses native browser print helper formatted for clean tables)
  const exportToPDF = () => {
    window.print();
  };

  // Filters routes depending on the selected Ward and Shift
  const applicableRoutes = routes.filter(r => {
    if (selectedShiftId && r.shift_id !== selectedShiftId) return false;
    if (!selectedWardId) return true;
    return routeWards.some(rw => rw.ward_id === selectedWardId && rw.route_id === r.id);
  });

  // Client-side text filter on the loaded rows
  const filteredAssignments = assignments.filter(a => {
    const search = searchFilter.toLowerCase();
    return (
      a.route_name.toLowerCase().includes(search) ||
      a.shift_name.toLowerCase().includes(search) ||
      a.vehicle_reg_no.toLowerCase().includes(search) ||
      a.ward_name.toLowerCase().includes(search)
    );
  });

  const selectedWardName = wards.find(w => w.id === selectedWardId)?.region_name || "Select Ward";
  const selectedShiftName = shifts.find(s => s.id === selectedShiftId)?.shift_name || "Select Shift";
  const selectedRouteName = routes.find(r => r.id === selectedRouteId)?.route_name || "Select Route";
  const selectedVehicleName = vehicles.find(v => v.id === selectedVehicleId)?.registration_no || "Select Vehicle";

  // Shared reusable searchable select dropdown component
  const SearchableDropdown = ({ label, required, selectedName, isSelected, isOpen, setOpen, search, setSearch, items, onSelect, containerRef }: any) => (
    <div className="flex flex-col relative" ref={containerRef}>
      <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      <div
        className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition"
        onClick={() => setOpen(!isOpen)}
      >
        <span className={isSelected ? "text-theme-text font-medium" : "text-theme-text-dim"}>{selectedName}</span>
        <span className="text-theme-text-dim text-xs">▼</span>
      </div>
      {isOpen && (
        <div className="absolute top-[64px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
          <div className="p-2 border-b border-theme-border">
            <input
              type="text"
              placeholder={`🔍 Search ${label}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-theme-text outline-none placeholder:text-theme-text-dim"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {items.map((item: any) => (
              <div
                key={item.id}
                className="px-4 py-2 text-sm text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer transition"
                onClick={() => onSelect(item.id)}
              >
                {item.route_name || item.region_name || item.shift_name || item.registration_no}
              </div>
            ))}
            {items.length === 0 && (
              <div className="px-4 py-3 text-xs text-theme-text-dim text-center italic">No items found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8 print:p-0 print:bg-white print:text-black">
      
      {/* Page Header (hidden during print) */}
      <div className="print:hidden">
        <PageHeader
          title="Temporary Vehicle"
          description="Manage daily temporary vehicle assignments and overrides."
          breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Temporary Vehicle" }]}
          actions={
            <div className="flex gap-2">
              <Button onClick={formOpen ? closeForm : openFormForCreate} variant={formOpen ? "secondary" : "primary"}>
                {formOpen ? "✕ Close" : "Assign Temporary Vehicle"}
              </Button>
              <Button onClick={exportToPDF} variant="outline">PDF</Button>
              <Button onClick={exportToCSV} variant="outline">CSV</Button>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8 print:overflow-visible print:pb-0">
        
        {/* Assignment Form (hidden during print) */}
        {formOpen && (
          <Card className="animate-fade-in relative z-20 print:hidden !overflow-visible">
            <CardHeader>
              <CardTitle>{editingAssignment ? "Edit Temporary Assignment" : "Assign Temporary Vehicle"}</CardTitle>
              <CardDescription>Select ward, shift, route, date, and vehicle to assign override.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                
                {/* Region/Ward Selector */}
                <SearchableDropdown
                  label="Region"
                  required
                  selectedName={selectedWardName}
                  isSelected={!!selectedWardId}
                  isOpen={wardDropdownOpen}
                  setOpen={setWardDropdownOpen}
                  search={wardSearch}
                  setSearch={setWardSearch}
                  items={wards.filter(w => w.region_name.toLowerCase().includes(wardSearch.toLowerCase()))}
                  onSelect={(id: number) => {
                    if (selectedWardId === id) {
                      setSelectedWardId(null);
                    } else {
                      setSelectedWardId(id);
                    }
                    setWardDropdownOpen(false);
                    setWardSearch("");
                    // Reset route selection if changing ward
                    setSelectedRouteId(null);
                  }}
                  containerRef={wardRef}
                />

                {/* Shift Selector */}
                <SearchableDropdown
                  label="Shift"
                  required
                  selectedName={selectedShiftName}
                  isSelected={!!selectedShiftId}
                  isOpen={shiftDropdownOpen}
                  setOpen={setShiftDropdownOpen}
                  search={shiftSearch}
                  setSearch={setShiftSearch}
                  items={shifts.filter(s => s.shift_name.toLowerCase().includes(shiftSearch.toLowerCase()))}
                  onSelect={(id: number) => {
                    if (selectedShiftId === id) {
                      setSelectedShiftId(null);
                    } else {
                      setSelectedShiftId(id);
                    }
                    setShiftDropdownOpen(false);
                    setShiftSearch("");
                  }}
                  containerRef={shiftRef}
                />

                {/* Route Selector (filtered by Ward if selected) */}
                <SearchableDropdown
                  label="Route"
                  required
                  selectedName={selectedRouteName}
                  isSelected={!!selectedRouteId}
                  isOpen={routeDropdownOpen}
                  setOpen={setRouteDropdownOpen}
                  search={routeSearch}
                  setSearch={setRouteSearch}
                  items={applicableRoutes.filter(r => r.route_name.toLowerCase().includes(routeSearch.toLowerCase()))}
                  onSelect={(id: number) => {
                    if (selectedRouteId === id) {
                      setSelectedRouteId(null);
                    } else {
                      setSelectedRouteId(id);
                    }
                    setRouteDropdownOpen(false);
                    setRouteSearch("");
                  }}
                  containerRef={routeRef}
                />

                {/* Date Input */}
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
                    Date <span className="text-red-400">*</span>
                  </span>
                  <input
                    type="date"
                    required
                    value={assignmentDate}
                    onChange={e => setAssignmentDate(e.target.value)}
                    className="w-full bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2 text-sm text-theme-text outline-none focus:border-emerald-500 transition h-[42px]"
                  />
                </div>

                {/* Vehicle Selector */}
                <div className="flex flex-col">
                  <SearchableDropdown
                    label="Vehicle"
                    required
                    selectedName={selectedVehicleName}
                    isSelected={!!selectedVehicleId}
                    isOpen={vehicleDropdownOpen}
                    setOpen={setVehicleDropdownOpen}
                    search={vehicleSearch}
                    setSearch={setVehicleSearch}
                    items={vehicles.filter(v => v.registration_no.toLowerCase().includes(vehicleSearch.toLowerCase()))}
                    onSelect={(id: number) => {
                      if (selectedVehicleId === id) {
                        setSelectedVehicleId(null);
                      } else {
                        setSelectedVehicleId(id);
                      }
                      setVehicleDropdownOpen(false);
                      setVehicleSearch("");
                    }}
                    containerRef={vehicleRef}
                  />
                  {regularVehicle && (
                    <span className="text-[10px] text-theme-accent font-semibold mt-1">
                      Current assign vehicle - {regularVehicle}
                    </span>
                  )}
                </div>

              </div>

              <div className="flex gap-3 pt-4 border-t border-theme-border">
                <Button onClick={handleSubmit} variant="accent" loading={submitting} loadingText="Submitting...">
                  Submit
                </Button>
                <Button onClick={closeForm} variant="outline">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter controls row (hidden during print) */}
        <Card className="p-4 print:hidden">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
              
              {/* Shift Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-theme-text-dim uppercase">Shift:</span>
                <select
                  value={filterShiftId}
                  onChange={e => setFilterShiftId(e.target.value)}
                  className="bg-theme-surface border border-theme-border rounded-lg px-3 py-1.5 text-xs text-theme-text outline-none cursor-pointer font-semibold"
                >
                  <option value="null">All Shifts</option>
                  {shifts.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.shift_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-theme-text-dim uppercase">Date:</span>
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="bg-theme-surface border border-theme-border rounded-lg px-3 py-1 text-xs text-theme-text outline-none font-semibold h-[30px]"
                />
              </div>

              {/* Load Button */}
              <Button onClick={loadAssignments} variant="accent" className="px-3.5 py-1.5 text-xs">
                Load
              </Button>

            </div>

            {/* Client-side search field */}
            <input
              type="text"
              placeholder="Filter..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="w-full md:w-64 bg-theme-surface border border-theme-border rounded-lg px-3.5 py-1.5 text-xs text-theme-text placeholder:text-theme-text-dim outline-none focus:border-emerald-500 font-semibold"
            />
          </div>
        </Card>

        {/* Main List Table */}
        <Card className="flex flex-col min-h-[400px] print:border-none print:shadow-none">
          <CardHeader className="flex flex-row items-center justify-between py-4 print:hidden">
            <div>
              <CardTitle>Temporary Vehicle Overrides</CardTitle>
              <CardDescription>Daily shifts using temporary substitute vehicles.</CardDescription>
            </div>
            <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">
              {filteredAssignments.length} total
            </span>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden print:overflow-visible">
            <div className="h-full overflow-y-auto custom-scrollbar print:overflow-visible">
              <Table
                headers={[
                  <div key="s" className="text-center w-16">S. NO.</div>,
                  "ROUTE",
                  "SHIFT",
                  "VEHICLE",
                  "DATE",
                  "ASSIGNED-AT",
                  <div key="a" className="text-right pr-4 w-24 print:hidden">ACTION</div>
                ]}
                isLoading={loading}
                emptyState="No data to display"
              >
                {filteredAssignments.map((a, idx) => (
                  <tr key={a.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-5 font-semibold text-theme-text">
                      {a.route_name}
                    </td>
                    <td className="py-3 px-5 text-theme-text font-medium">
                      {a.shift_name}
                    </td>
                    <td className="py-3 px-5 text-theme-accent font-semibold">
                      {a.vehicle_reg_no}
                    </td>
                    <td className="py-3 px-5 text-theme-text-dim font-medium">
                      {a.assignment_date}
                    </td>
                    <td className="py-3 px-5 text-theme-text-dim font-mono text-[11px]">
                      {a.assigned_at}
                    </td>
                    <td className="py-3 px-5 text-right print:hidden">
                      <div className="inline-flex gap-2.5">
                        <button
                          onClick={() => openFormForEdit(a)}
                          className="p-1 border border-theme-border rounded hover:bg-theme-surface hover:text-theme-accent transition"
                          title="Edit Temporary Assignment"
                        >
                          ✏️
                        </button>
                        <DeleteButton
                          onDelete={() => handleDelete(a.id)}
                          confirmMessage={`Delete temporary override for ${a.route_name}?`}
                        />
                      </div>
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
