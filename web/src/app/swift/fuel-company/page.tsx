"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";
import { z } from "zod";

import CrudDirectory from "@/components/shared/CrudDirectory";
import Input from "@/components/ui/Input";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";

interface FuelCompany {
  id: number;
  name: string;
  short_name: string;
  is_active: boolean;
  created_at: string;
}

const fuelCompanySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
  short_name: z.string().trim().min(1, "Short Name is required").max(50, "Short Name cannot exceed 50 characters")
});

export default function FuelCompanyPage() {
  const [companies, setCompanies] = useState<FuelCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null as number | null, name: "", short_name: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchCompanies = async () => {
    try {
      const res = await api<{ success: boolean; data: FuelCompany[] }>("/api/fuel-companies");
      if (res.success) setCompanies(res.data || []);
    } catch (err) {
      toast.error("Failed to load fuel companies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCompanies(); }, []);

  const handleOpenForm = (company?: FuelCompany) => {
    if (company) {
      setFormData({ id: company.id, name: company.name, short_name: company.short_name || "" });
      setIsEditing(true);
    } else {
      setFormData({ id: null, name: "", short_name: "" });
      setIsEditing(false);
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setFormData({ id: null, name: "", short_name: "" });
    setIsEditing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = fuelCompanySchema.safeParse(formData);
    if (!result.success) { toast.warn(result.error.issues[0].message); return; }

    setSubmitting(true);
    try {
      const payload = { name: formData.name.trim(), short_name: formData.short_name.trim() };
      
      if (isEditing && formData.id) {
        const res = await put<{ success: boolean }>(`/api/fuel-companies/${formData.id}`, payload);
        if (res.success) { toast.success("Fuel company updated successfully!"); fetchCompanies(); handleCloseForm(); }
        else toast.error("Failed to update fuel company");
      } else {
        const res = await post<{ success: boolean; id: number }>("/api/fuel-companies", payload);
        if (res.success) { toast.success("Fuel company created successfully!"); fetchCompanies(); handleCloseForm(); }
        else toast.error("Failed to create fuel company");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (company: FuelCompany) => {
    try {
      const res = await del<{ success: boolean }>(`/api/fuel-companies/${company.id}`);
      if (res.success) { toast.success("Fuel company deleted successfully!"); fetchCompanies(); }
      else toast.error("Failed to delete fuel company");
    } catch (err) {
      toast.error("An error occurred during deletion");
    }
  };

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.short_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <CrudDirectory
      title="Fuel Company"
      description="Manage the list of available fuel companies for assigning to fuel stations."
      breadcrumbs={[{ label: "SWIFT", href: "/swift/shift" }, { label: "Fuel Company" }]}
      addBtnLabel="Add Fuel Company"
      loading={loading}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search companies..."
      formOpen={isFormOpen}
      onFormOpenChange={setIsFormOpen}
      isEditing={isEditing}
      submitting={submitting}
      onSubmit={handleSubmit}
      formFields={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Name *"
            placeholder="Eg. H.P."
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
          <Input
            label="Short Name *"
            placeholder="Eg. HPBO"
            required
            value={formData.short_name}
            onChange={e => setFormData({ ...formData, short_name: e.target.value })}
          />
        </div>
      }
      tableHeaders={[
        <div key="s" className="text-center w-16">S. No.</div>,
        "Name",
        "Short Name",
        <div key="a" className="text-right pr-4 w-24">Action</div>
      ]}
      totalCount={filteredCompanies.length}
    >
      {filteredCompanies.map((company, idx) => (
        <tr key={company.id} className="hover:bg-theme-base/40 transition-colors group">
          <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
          <td className="py-3 px-5 font-medium">{company.name}</td>
          <td className="py-3 px-5 text-theme-text-dim text-xs">{company.short_name || "-"}</td>
          <td className="py-3 px-5 text-right">
            <div className="flex items-center justify-end gap-2">
              <EditButton onClick={() => handleOpenForm(company)} />
              <DeleteButton onDelete={() => handleDelete(company)} confirmMessage={`Delete ${company.name}?`} />
            </div>
          </td>
        </tr>
      ))}
    </CrudDirectory>
  );
}
