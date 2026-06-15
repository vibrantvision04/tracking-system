"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";
import { z } from "zod";

import CrudDirectory from "@/components/shared/CrudDirectory";
import Input from "@/components/ui/Input";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";

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
    if (des) {
      setFormData({ id: des.id, name: des.name });
      setIsEditing(true);
    } else {
      setFormData({ id: null, name: "" });
      setIsEditing(false);
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setFormData({ id: null, name: "" });
    setIsEditing(false);
  };

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
    <CrudDirectory
      title="Designation Management"
      description="Configure employee designations and role titles for organizational structure."
      breadcrumbs={[{ label: "VSWM", href: "/vswm/shift" }, { label: "Designations" }]}
      addBtnLabel="Add Designation"
      loading={loading}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search by designation name..."
      formOpen={isFormOpen}
      onFormOpenChange={setIsFormOpen}
      isEditing={isEditing}
      submitting={submitting}
      onSubmit={handleSubmit}
      formFields={
        <Input
          label="Name"
          placeholder="Eg. Operator"
          required
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
        />
      }
      tableHeaders={[<div key="s" className="w-24">S. No.</div>, "Designation Name", <div key="a" className="text-right pr-4 w-36">Action</div>]}
      totalCount={filteredDesignations.length}
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
    </CrudDirectory>
  );
}
