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
  const inputRef = useRef<HTMLInputElement>(null);

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
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setFormData({ id: null, name: "" });
    setIsEditing(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFormOpen) handleCloseForm();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFormOpen]);

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
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Department Management"
        description="Manage organizational departments for employee and vehicle assignment."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Departments" }]}
        actions={
          <Button onClick={isFormOpen ? handleCloseForm : () => handleOpenForm()} variant={isFormOpen ? "secondary" : "primary"}>
            {isFormOpen ? "✕ Close" : "+ Add Department"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">

        {isFormOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{isEditing ? "✏️ Edit Department" : "🏢 Add Department"}</CardTitle>
              <CardDescription>Enter the department name. Press Escape to close.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                <Input
                  label="Name"
                  placeholder="Eg. Health"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
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
            <div><CardTitle>Departments Directory</CardTitle><CardDescription>All registered departments in the system.</CardDescription></div>
            <Input placeholder="Search by department name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full sm:w-72" />
          </CardHeader>
          <CardContent className="p-0">
            <Table
              headers={[<div key="s" className="w-24">S. No.</div>, "Department Name", <div key="a" className="text-right pr-4 w-36">Action</div>]}
              isLoading={loading}
              emptyState={searchQuery ? "No matching departments found" : "No departments registered in the system"}
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
            </Table>
            <div className="p-4 border-t border-theme-border bg-theme-surface text-xs font-semibold text-theme-text-dim flex items-center justify-between">
              <span>{filteredDepartments.length} total</span>
              <span className="text-[10px] text-theme-text-dim uppercase tracking-widest">ISWM JAIPUR HERITAGE</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
