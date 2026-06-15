"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";
import { z } from "zod";

import CrudDirectory from "@/components/shared/CrudDirectory";
import Input from "@/components/ui/Input";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";

interface Department {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

const departmentSchema = z.object({
  name: z.string().trim().min(1, "Department name is required").max(100, "Department name cannot exceed 100 characters")
});

export default function DepartmentPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null as number | null, name: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchDepartments = async () => {
    try {
      const res = await api<{ success: boolean; data: Department[] }>("/api/departments");
      if (res.success) setDepartments(res.data || []);
    } catch (err) {
      toast.error("Failed to load departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDepartments(); }, []);

  const handleOpenForm = (dept?: Department) => {
    if (dept) {
      setFormData({ id: dept.id, name: dept.name });
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
    const result = departmentSchema.safeParse(formData);
    if (!result.success) { toast.warn(result.error.issues[0].message); return; }

    setSubmitting(true);
    try {
      if (isEditing && formData.id) {
        const res = await put<{ success: boolean }>(`/api/departments/${formData.id}`, { name: formData.name.trim() });
        if (res.success) { toast.success("Department updated successfully!"); fetchDepartments(); handleCloseForm(); }
        else toast.error("Failed to update department");
      } else {
        const res = await post<{ success: boolean; id: number }>("/api/departments", { name: formData.name.trim() });
        if (res.success) { toast.success("Department created successfully!"); fetchDepartments(); handleCloseForm(); }
        else toast.error("Failed to create department");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (dept: Department) => {
    try {
      const res = await del<{ success: boolean }>(`/api/departments/${dept.id}`);
      if (res.success) { toast.success("Department deleted successfully!"); fetchDepartments(); }
      else toast.error("Failed to delete department");
    } catch (err) {
      toast.error("An error occurred during deletion");
    }
  };

  const filteredDepartments = departments.filter(dept =>
    dept.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <CrudDirectory
      title="Department Management"
      description="Manage organizational departments for employee and vehicle assignment."
      breadcrumbs={[{ label: "VSWM", href: "/vswm/shift" }, { label: "Departments" }]}
      addBtnLabel="Add Department"
      loading={loading}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search by department name..."
      formOpen={isFormOpen}
      onFormOpenChange={setIsFormOpen}
      isEditing={isEditing}
      submitting={submitting}
      onSubmit={handleSubmit}
      formFields={
        <Input
          label="Name"
          placeholder="Eg. Health"
          required
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
        />
      }
      tableHeaders={[<div key="s" className="w-24">S. No.</div>, "Department Name", <div key="a" className="text-right pr-4 w-36">Action</div>]}
      totalCount={filteredDepartments.length}
    >
      {filteredDepartments.map((dept, index) => (
        <tr key={dept.id} className="hover:bg-theme-base/40 transition-colors">
          <td className="py-4 px-6 font-mono text-theme-text-dim">{index + 1}</td>
          <td className="py-4 px-6 font-medium text-theme-text">{dept.name}</td>
          <td className="py-4 px-6 text-right">
            <div className="flex items-center justify-end gap-2">
              <EditButton onClick={() => handleOpenForm(dept)} />
              <DeleteButton onDelete={() => handleDelete(dept)} confirmMessage={`Delete department "${dept.name}"?`} />
            </div>
          </td>
        </tr>
      ))}
    </CrudDirectory>
  );
}
