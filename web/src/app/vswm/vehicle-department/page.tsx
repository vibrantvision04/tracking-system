"use client";

import { useEffect, useState, useRef } from "react";
import { api, post, put, del } from "@/lib/api";
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
interface Department { id: number; name: string; }
interface VehicleDepartmentMapping { id: number; vehicle_id: number; vehicle_registration_no: string; department_id: number; department_name: string; created_at: string; }

const mappingSchema = z.object({
  vehicle_id: z.coerce.number().min(1, "Please select a vehicle"),
  department_id: z.coerce.number().min(1, "Please select a department")
});

export default function VehicleDepartmentPage() {
  const [mappings, setMappings] = useState<VehicleDepartmentMapping[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null as number | null, vehicle_id: "" as string | number, department_id: "" as string | number });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const vehicleSelectRef = useRef<HTMLSelectElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vehiclesRes, departmentsRes, mappingsRes] = await Promise.all([
        api<{ success: boolean; data: Vehicle[] }>("/api/vehicles"),
        api<{ success: boolean; data: Department[] }>("/api/departments"),
        api<{ success: boolean; data: VehicleDepartmentMapping[] }>("/api/vehicle-departments")
      ]);
      if (vehiclesRes.success) setVehicles(vehiclesRes.data || []);
      if (departmentsRes.success) setDepartments(departmentsRes.data || []);
      if (mappingsRes.success) setMappings(mappingsRes.data || []);
    } catch (err) {
      console.error("Failed to load mapping dependencies:", err);
      toast.error("Failed to load mapping dependencies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleOpenForm = (mapRow?: VehicleDepartmentMapping) => {
    setFormErrors({});
    if (mapRow) {
      setFormData({ id: mapRow.id, vehicle_id: mapRow.vehicle_id, department_id: mapRow.department_id });
      setIsEditing(true);
    } else {
      setFormData({ id: null, vehicle_id: "", department_id: "" });
      setIsEditing(false);
    }
    setIsFormOpen(true);
    setTimeout(() => vehicleSelectRef.current?.focus(), 100);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setIsEditing(false);
    setFormErrors({});
    setFormData({ id: null, vehicle_id: "", department_id: "" });
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
      const payload = { vehicle_id: result.data.vehicle_id, department_id: result.data.department_id };
      if (isEditing && formData.id) {
        const res = await put<{ success: boolean }>(`/api/vehicle-departments/${formData.id}`, payload);
        if (res.success) { toast.success("Vehicle mapping updated successfully!"); fetchData(); handleCloseForm(); }
        else toast.error("Failed to update mapping");
      } else {
        const res = await post<{ success: boolean; id: number }>("/api/vehicle-departments", payload);
        if (res.success) { toast.success("Vehicle mapping created successfully!"); fetchData(); handleCloseForm(); }
        else toast.error("Failed to create mapping");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number, vehicleReg: string, deptName: string) => {
    if (!confirm(`Are you sure you want to remove the association for "${vehicleReg}" mapped to "${deptName}"?`)) return;
    try {
      const res = await del<{ success: boolean }>(`/api/vehicle-departments/${id}`);
      if (res.success) { toast.success("Mapping deleted successfully!"); fetchData(); } else toast.error("Failed to delete mapping");
    } catch { toast.error("An error occurred during deletion"); }
  };

  const filteredMappings = mappings.filter(m => {
    const q = searchQuery.toLowerCase();
    return m.vehicle_registration_no.toLowerCase().includes(q) || m.department_name.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Vehicle to Department Mapping"
        description="Assign vehicles to operational departments for fleet management."
        breadcrumbs={[{ label: "VSWM", href: "/vswm/shift" }, { label: "Vehicle-Department" }]}
        actions={
          <Button onClick={isFormOpen ? handleCloseForm : () => handleOpenForm()} variant={isFormOpen ? "secondary" : "primary"}>
            {isFormOpen ? "✕ Close" : "+ Assign Vehicle"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {isFormOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{isEditing ? "✏️ Edit Vehicle Mapping" : "🚚 Assign Vehicle to Department"}</CardTitle>
              <CardDescription>Select a vehicle and department to create a mapping.</CardDescription>
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
                    value={formData.department_id}
                    onChange={e => setFormData({ ...formData, department_id: e.target.value })}
                    className="w-full px-4 py-2.5 bg-theme-surface border border-theme-border rounded-xl text-sm text-theme-text outline-none focus:border-emerald-500 transition"
                  >
                    <option value="" className="bg-theme-surface">Select Department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id} className="bg-theme-surface">{d.name}</option>
                    ))}
                  </select>
                  {formErrors.department_id && <span className="text-[10px] font-semibold text-rose-500 mt-1 block">{formErrors.department_id}</span>}
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
            <div><CardTitle>Vehicle-Department Assignments</CardTitle><CardDescription>All existing vehicle to department mappings.</CardDescription></div>
            <Input placeholder="Filter..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-64" />
          </CardHeader>
          <CardContent className="p-0">
            <Table
              headers={[<div key="s" className="w-24">S. No.</div>, "Vehicle", "Department", <div key="a" className="text-right w-36">Action</div>]}
              isLoading={loading}
              emptyState={searchQuery ? "No matching mappings found" : "No vehicles mapped to departments"}
            >
              {filteredMappings.map((m, idx) => (
                <tr key={m.id} className="hover:bg-theme-base/40 transition-colors text-theme-text-dim">
                  <td className="py-4 px-6 font-mono text-theme-text-dim">{idx + 1}</td>
                  <td className="py-4 px-6 font-semibold text-theme-text">{m.vehicle_registration_no}</td>
                  <td className="py-4 px-6 font-medium text-theme-text-dim">{m.department_name}</td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <EditButton onClick={() => handleOpenForm(m)} />
                      <DeleteButton onDelete={() => handleDelete(m.id, m.vehicle_registration_no, m.department_name)} confirmMessage={`Remove mapping for "${m.vehicle_registration_no}"?`} />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="p-4 border-t border-theme-border bg-theme-surface text-xs font-semibold text-theme-text-dim flex items-center justify-between">
              <span>{filteredMappings.length} total</span>
              <span className="text-[10px] text-theme-text-dim uppercase tracking-widest font-mono">VSWM VEHICLE-DEPT</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
