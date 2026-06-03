"use client";

import { useEffect, useState, useRef } from "react";
import { api, post, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";

interface RouteType {
  id: number;
  name: string;
  is_active: boolean;
}

interface VehicleType {
  id: number;
  name: string; // From /api/vehicle-types
}

interface RouteTypeVehicleType {
  id: number;
  route_type_id: number;
  route_type_name: string;
  vehicle_type_id: number;
  vehicle_type_name: string;
}

export default function RouteTypeVehicleTypePage() {
  const [mappings, setMappings] = useState<RouteTypeVehicleType[]>([]);
  const [routeTypes, setRouteTypes] = useState<RouteType[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedRouteTypeId, setSelectedRouteTypeId] = useState<number | null>(null);
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState<number | null>(null);

  const [routeTypeSearch, setRouteTypeSearch] = useState("");
  const [vehicleTypeSearch, setVehicleTypeSearch] = useState("");

  const [routeTypeDropdownOpen, setRouteTypeDropdownOpen] = useState(false);
  const [vehicleTypeDropdownOpen, setVehicleTypeDropdownOpen] = useState(false);

  const [tableFilter, setTableFilter] = useState("");

  const routeTypeRef = useRef<HTMLDivElement>(null);
  const vehicleTypeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (routeTypeRef.current && !routeTypeRef.current.contains(e.target as Node)) {
        setRouteTypeDropdownOpen(false);
      }
      if (vehicleTypeRef.current && !vehicleTypeRef.current.contains(e.target as Node)) {
        setVehicleTypeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rtvtRes, rtRes, vtRes] = await Promise.all([
        api<{ data: RouteTypeVehicleType[] }>("/api/route-type-vehicle-types"),
        api<{ success: boolean; data: RouteType[] }>("/api/route-types"),
        api<{ data: VehicleType[] }>("/api/vehicle-types")
      ]);
      setMappings(rtvtRes.data || []);
      setRouteTypes(rtRes.data || []);
      setVehicleTypes(vtRes.data || []);
    } catch {
      toast.error("Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const closeForm = () => {
    setFormOpen(false);
    setSelectedRouteTypeId(null);
    setSelectedVehicleTypeId(null);
    setRouteTypeSearch("");
    setVehicleTypeSearch("");
  };

  const handleSubmit = async () => {
    if (!selectedRouteTypeId || !selectedVehicleTypeId) {
      toast.warning("Both Route Type and Vehicle Type must be selected.");
      return;
    }
    setSubmitting(true);
    try {
      await post("/api/route-type-vehicle-types", {
        route_type_id: selectedRouteTypeId,
        vehicle_type_id: selectedVehicleTypeId
      });
      toast.success("Assigned successfully!");
      closeForm();
      loadData();
    } catch {
      toast.error("Failed to assign route type to vehicle type.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (mapping: RouteTypeVehicleType) => {
    try {
      await del(`/api/route-type-vehicle-types/${mapping.id}`);
      toast.success("Removed assignment.");
      loadData();
    } catch {
      toast.error("Failed to remove assignment.");
    }
  };

  const filteredMappings = mappings.filter(m => {
    const search = tableFilter.toLowerCase();
    return (
      m.route_type_name?.toLowerCase().includes(search) ||
      m.vehicle_type_name?.toLowerCase().includes(search)
    );
  });

  const filteredRouteTypes = routeTypes.filter(rt =>
    rt.name.toLowerCase().includes(routeTypeSearch.toLowerCase())
  );

  const filteredVehicleTypes = vehicleTypes.filter(vt =>
    vt.name.toLowerCase().includes(vehicleTypeSearch.toLowerCase())
  );

  const selectedRouteTypeName = routeTypes.find(rt => rt.id === selectedRouteTypeId)?.name || "Select Vehicle Type";
  const selectedVehicleTypeName = vehicleTypes.find(vt => vt.id === selectedVehicleTypeId)?.name || "S. No.";

  const SearchableDropdown = ({ label, required, selectedName, isSelected, isOpen, setOpen, search, setSearch, items, onSelect, dropdownRef, searchPlaceholder }: any) => {
    return (
      <div className="flex flex-col relative" ref={dropdownRef}>
        <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider mb-1.5">
          {label} {required && <span className="text-red-400">*</span>}
        </span>
        <div
          className="bg-theme-surface border border-theme-border rounded-xl px-3.5 py-2.5 text-sm cursor-pointer flex justify-between items-center hover:border-theme-accent/40 transition"
          onClick={() => setOpen(!isOpen)}
        >
          <span className={isSelected ? "text-theme-text font-medium" : "text-theme-text-dim"}>{selectedName}</span>
          <span className="text-theme-text-dim text-xs">{isOpen ? "▲" : "▼"}</span>
        </div>
        {isOpen && (
          <div className="absolute top-[64px] left-0 w-full bg-theme-surface border border-theme-border rounded-lg shadow-xl overflow-hidden z-50">
            <div className="p-2 border-b border-theme-border">
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-theme-text outline-none placeholder:text-theme-text-dim"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {items.length === 0 ? (
                <div className="px-4 py-2.5 text-xs text-theme-text-dim italic">No options found</div>
              ) : (
                items.map((item: any) => (
                  <div
                    key={item.id}
                    className={`px-4 py-2 text-sm text-theme-text hover:bg-theme-accent/20 hover:text-emerald-400 cursor-pointer transition ${item.id === (label === "Route Type" ? selectedRouteTypeId : selectedVehicleTypeId) ? "bg-theme-accent/10 text-emerald-400" : ""}`}
                    onClick={() => onSelect(item.id)}
                  >
                    {item.name}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Route Type To Vehicle Type"
        description="Map route types to their corresponding vehicle types."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Route Type-Vehicle Type" }]}
        actions={
          <Button onClick={formOpen ? closeForm : () => setFormOpen(true)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "+ Assign Route Type To Vehicle Type"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {formOpen && (
          <Card className="animate-fade-in relative z-20 !overflow-visible">
            <CardHeader>
              <CardTitle>Assign Route Type To Vehicle Type</CardTitle>
              <CardDescription>Select a route type and vehicle type to create a mapping.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <SearchableDropdown
                  label="Route Type"
                  required
                  selectedName={selectedRouteTypeName}
                  isSelected={!!selectedRouteTypeId}
                  isOpen={routeTypeDropdownOpen}
                  setOpen={setRouteTypeDropdownOpen}
                  search={routeTypeSearch}
                  setSearch={setRouteTypeSearch}
                  items={filteredRouteTypes}
                  dropdownRef={routeTypeRef}
                  searchPlaceholder="Search Vehicle Type"
                  onSelect={(id: number) => {
                    if (selectedRouteTypeId === id) {
                      setSelectedRouteTypeId(null);
                    } else {
                      setSelectedRouteTypeId(id);
                    }
                    setRouteTypeDropdownOpen(false);
                    setRouteTypeSearch("");
                  }}
                />
                <SearchableDropdown
                  label="Vehicle Type"
                  required
                  selectedName={selectedVehicleTypeName}
                  isSelected={!!selectedVehicleTypeId}
                  isOpen={vehicleTypeDropdownOpen}
                  setOpen={setVehicleTypeDropdownOpen}
                  search={vehicleTypeSearch}
                  setSearch={setVehicleTypeSearch}
                  items={filteredVehicleTypes}
                  dropdownRef={vehicleTypeRef}
                  searchPlaceholder="Search Vehicle Type"
                  onSelect={(id: number) => {
                    if (selectedVehicleTypeId === id) {
                      setSelectedVehicleTypeId(null);
                    } else {
                      setSelectedVehicleTypeId(id);
                    }
                    setVehicleTypeDropdownOpen(false);
                    setVehicleTypeSearch("");
                  }}
                />
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

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Route Type-Vehicle Type Assignments</CardTitle>
              <CardDescription>All mappings between route types and vehicle types.</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Filter..."
                value={tableFilter}
                onChange={e => setTableFilter(e.target.value)}
                className="bg-theme-surface border border-theme-border rounded-lg px-3 py-1.5 text-xs text-theme-text placeholder:text-theme-text-dim focus:border-emerald-500 outline-none transition font-semibold"
              />
              <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">
                {mappings.length} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[
                  <div key="s" className="text-center w-16">S. NO.</div>,
                  "ROUTE TYPE",
                  "VEHICLE TYPE",
                  <div key="a" className="text-right pr-4 w-24">ACTION</div>
                ]}
                isLoading={loading}
                emptyState="No data to display"
              >
                {filteredMappings.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-5 font-semibold text-theme-text">
                      {m.route_type_name}
                    </td>
                    <td className="py-3 px-5 text-theme-text-dim">
                      {m.vehicle_type_name}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <DeleteButton
                        onDelete={() => handleDelete(m)}
                        confirmMessage={`Remove assignment for ${m.route_type_name}?`}
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
