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

interface Designation {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

const designationSchema = z.object({
  name: z.string().trim().min(1, "Designation name is required").max(100, "Designation name cannot exceed 100 characters")
});

export default function DesignationPage() {
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null as number | null, name: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchDesignations = async () => {
    try {
      const res = await api<{ success: boolean; data: Designation[] }>("/api/designations");
      if (res.success) setDesignations(res.data || []);
    } catch (err) {
      toast.error("Failed to load designations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDesignations(); }, []);

  const handleOpenForm = (des?: Designation) => {
    if (des) { setFormData({ id: des.id, name: des.name }); setIsEditing(true); }
    else { setFormData({ id: null, name: "" }); setIsEditing(false); }
    setIsFormOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false); setFormData({ id: null, name: "" }); setIsEditing(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape" && isFormOpen) handleCloseForm(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFormOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = designationSchema.safeParse(formData);
    if (!result.success) { toast.warn(result.error.issues[0].message); return; }
    setSubmitting(true);
    try {
      if (isEditing && formData.id) {
        const res = await put<{ success: boolean }>(`/api/designations/${formData.id}`, { name: formData.name.trim() });
        if (res.success) { toast.success("Designation updated successfully!"); fetchDesignations(); handleCloseForm(); }
        else toast.error("Failed to update designation");
      } else {
        const res = await post<{ success: boolean; id: number }>("/api/designations", { name: formData.name.trim() });
        if (res.success) { toast.success("Designation created successfully!"); fetchDesignations(); handleCloseForm(); }
        else toast.error("Failed to create designation");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (des: Designation) => {
    try {
      const res = await del<{ success: boolean }>(`/api/designations/${des.id}`);
      if (res.success) { toast.success("Designation deleted successfully!"); fetchDesignations(); }
      else toast.error("Failed to delete designation");
    } catch (err) {
      toast.error("An error occurred during deletion");
    }
  };

  const filteredDesignations = designations.filter(des =>
    des.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Designation Management"
        description="Configure employee designations and role titles for organizational structure."
        breadcrumbs={[{ label: "VSWM", href: "/vswm/shift" }, { label: "Designations" }]}
        actions={
          <Button onClick={isFormOpen ? handleCloseForm : () => handleOpenForm()} variant={isFormOpen ? "secondary" : "primary"}>
            {isFormOpen ? "✕ Close" : "+ Add Designation"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">

        {isFormOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{isEditing ? "✏️ Edit Designation" : "💳 Add Designation"}</CardTitle>
              <CardDescription>Enter the designation name. Press Escape to close.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                <Input label="Name" placeholder="Eg. Operator" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                <div className="flex items-center gap-3 pt-2 border-t border-theme-border">
                  <Button type="submit" variant="accent" loading={submitting} loadingText="Submitting...">Submit</Button>
                  <Button type="button" variant="outline" onClick={handleCloseForm}>Close</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Designations Directory</CardTitle><CardDescription>All registered designations in the system.</CardDescription></div>
            <Input placeholder="Search by designation name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full sm:w-72" />
          </CardHeader>
          <CardContent className="p-0">
            <Table
              headers={[<div key="s" className="w-24">S. No.</div>, "Designation Name", <div key="a" className="text-right pr-4 w-36">Action</div>]}
              isLoading={loading}
              emptyState={searchQuery ? "No matching designations found" : "No designations registered in the system"}
            >
              {filteredDesignations.map((des, index) => (
                <tr key={des.id} className="hover:bg-theme-base/40 transition-colors">
                  <td className="py-4 px-6 font-mono text-theme-text-dim">{index + 1}</td>
                  <td className="py-4 px-6 font-medium text-theme-text">{des.name}</td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EditButton onClick={() => handleOpenForm(des)} />
                      <DeleteButton onDelete={() => handleDelete(des)} confirmMessage={`Delete designation "${des.name}"?`} />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="p-4 border-t border-theme-border bg-theme-surface text-xs font-semibold text-theme-text-dim flex items-center justify-between">
              <span>{filteredDesignations.length} total</span>
              <span className="text-[10px] text-theme-text-dim uppercase tracking-widest">VSWM DESIGNATIONS</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
