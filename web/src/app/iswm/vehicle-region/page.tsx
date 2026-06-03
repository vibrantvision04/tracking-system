"use client";

import { useEffect, useState, useRef } from "react";
import { api, post, del } from "@/lib/api";
import { toast } from "react-toastify";
import { z } from "zod";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface Vehicle { id: number; registration_no: string; }
interface Zone { id: number; region_name: string; }
interface VehicleRegionMapping { id: number; vehicle_id: number; vehicle_name: string; region_id: number; region_name: string; created_at: string; }

const mappingSchema = z.object({
  vehicle_id: z.coerce.number().min(1, "Please select a vehicle"),
  region_id: z.coerce.number().min(1, "Please select a zone")
});

export default function VehicleRegionPage() {
  const [mappings, setMappings] = useState<VehicleRegionMapping[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null as number | null, vehicle_id: "" as string | number, region_id: "" as string | number });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const vehicleSelectRef = useRef<HTMLSelectElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vehiclesRes, zonesRes, mappingsRes] = await Promise.all([
        api<{ success: boolean; data: Vehicle[] }>("/api/vehicles"),
        api<{ success: boolean; data: Zone[] }>("/api/zones"),
        api<{ success: boolean; data: VehicleRegionMapping[] }>("/api/vehicle-regions")
      ]);
      if (vehiclesRes.success) setVehicles(vehiclesRes.data || []);
      if (zonesRes.success) setZones(zonesRes.data || []);
      if (mappingsRes.success) setMappings(mappingsRes.data || []);
    } catch (err) {
      toast.error("Failed to load data. Is your backend running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleOpenForm = (mapRow?: VehicleRegionMapping) => {
    setFormErrors({});
    if (mapRow) {
      setFormData({ id: mapRow.id, vehicle_id: mapRow.vehicle_id, region_id: mapRow.region_id });
      setIsEditing(true);
    } else {
      setFormData({ id: null, vehicle_id: "", region_id: "" });
      setIsEditing(false);
    }
    setIsFormOpen(true);
    setTimeout(() => vehicleSelectRef.current?.focus(), 100);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setIsEditing(false);
    setFormErrors({});
    setFormData({ id: null, vehicle_id: "", region_id: "" });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape" && isFormOpen) handleCloseForm(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFormOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = mappingSchema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach(issue => { if (issue.path[0]) errors[issue.path[0].toString()] = issue.message; });
      setFormErrors(errors);
      toast.warn(result.error.issues[0].message);
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    try {
      const payload = { vehicle_id: result.data.vehicle_id, region_id: result.data.region_id };
      // Rely on POST (backend has ON CONFLICT update if configured)
      const res = await post<{ success: boolean; id?: number }>("/api/vehicle-regions", payload);
      if (res.success) {
        toast.success(isEditing ? "Vehicle mapped to zone updated successfully!" : "Vehicle mapped to zone created successfully!");
        fetchData(); handleCloseForm();
      } else toast.error("Failed to map vehicle to zone");
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number, vehicleName: string, zoneName: string) => {
    if (!confirm(`Are you sure you want to remove the association for "${vehicleName}" mapped to "${zoneName}"?`)) return;
    try {
      const res = await del<{ success: boolean }>(`/api/vehicle-regions/${id}`);
      if (res.success) { toast.success("Mapping deleted successfully!"); fetchData(); } else toast.error("Failed to delete mapping");
    } catch { toast.error("An error occurred during deletion"); }
  };

  const filteredMappings = mappings.filter(m => {
    const q = searchQuery.toLowerCase();
    return (m.vehicle_name && m.vehicle_name.toLowerCase().includes(q)) || (m.region_name && m.region_name.toLowerCase().includes(q));
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Vehicle To Zone Mapping"
        description="Assign vehicles to operational zones for regional tracking."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Vehicle-Zone" }]}
        actions={
          <Button onClick={isFormOpen ? handleCloseForm : () => handleOpenForm()} variant={isFormOpen ? "secondary" : "primary"}>
            {isFormOpen ? "✕ Close" : "+ Assign Vehicle To Zone"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {isFormOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{isEditing ? "✏️ Edit Vehicle Assignment" : "🚚 Assign Vehicle to Zone"}</CardTitle>
              <CardDescription>Select a vehicle and a zone.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select
                    ref={vehicleSelectRef}
                    value={formData.vehicle_id}
                    onChange={e => setFormData({ ...formData, vehicle_id: e.target.value })}
                    className="w-full px-4 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition"
                  >
                    <option value="" className="bg-theme-surface">Select Vehicle</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id} className="bg-theme-surface">{v.registration_no}</option>
                    ))}
                  </select>
                  {formErrors.vehicle_id && <span className="text-[10px] font-semibold text-rose-500 mt-1 block">{formErrors.vehicle_id}</span>}
                  
                  <select
                    value={formData.region_id}
                    onChange={e => setFormData({ ...formData, region_id: e.target.value })}
                    className="w-full px-4 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition"
                  >
                    <option value="" className="bg-theme-surface">Select Zone</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id} className="bg-theme-surface">{z.region_name}</option>
                    ))}
                  </select>
                  {formErrors.region_id && <span className="text-[10px] font-semibold text-rose-500 mt-1 block">{formErrors.region_id}</span>}
                </div>
                <div className="flex gap-3 pt-2 border-t border-theme-border">
                  <Button type="submit" variant="accent" loading={submitting} loadingText="Submitting...">Submit</Button>
                  <Button type="button" variant="outline" onClick={handleCloseForm}>Close</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Vehicle-Zone Assignments</CardTitle><CardDescription>All existing vehicle to zone mappings.</CardDescription></div>
            <Input placeholder="Filter..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-64" />
          </CardHeader>
          <CardContent className="p-0">
            <Table
              headers={[<div key="s" className="w-24">S. No.</div>, "Vehicle", "Zone", <div key="a" className="text-right w-36">Action</div>]}
              isLoading={loading}
              emptyState={searchQuery ? "No matching mappings found" : "No vehicles mapped to zones"}
            >
              {filteredMappings.map((m, idx) => (
                <tr key={m.id} className="hover:bg-theme-base/40 transition-colors text-theme-text-dim">
                  <td className="py-4 px-6 font-mono text-theme-text-dim">{idx + 1}</td>
                  <td className="py-4 px-6 font-semibold text-theme-text">{m.vehicle_name}</td>
                  <td className="py-4 px-6 font-medium text-theme-text-dim">{m.region_name}</td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <EditButton onClick={() => handleOpenForm(m)} />
                      <DeleteButton onDelete={() => handleDelete(m.id, m.vehicle_name, m.region_name)} confirmMessage={`Remove mapping for "${m.vehicle_name}"?`} />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="p-4 border-t border-theme-border bg-theme-surface text-xs font-semibold text-theme-text-dim flex items-center justify-between">
              <span>{filteredMappings.length} total</span>
              <span className="text-[10px] text-theme-text-dim uppercase tracking-widest font-mono">ISWM VEHICLE-ZONE</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
