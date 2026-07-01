"use client";

import React, { useState, useEffect } from "react";
import { api, post, put, del } from "@/lib/api";
import { z } from "zod";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface RegionType {
  id: number;
  title: string;
  parent_id: number | null;
  parent_title: string;
  is_active: boolean;
}

const regionTypeSchema = z.object({
  title: z.string().trim().min(1, "Region Type Title is required").max(100, "Region Type Title cannot exceed 100 characters")
});

export default function RegionTypeManager() {
  const [types, setTypes] = useState<RegionType[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<RegionType | null>(null);
  const [form, setForm] = useState({ title: "", parent_id: "" as string | number });
  const [submitting, setSubmitting] = useState(false);

  const loadRegionTypes = async () => {
    try {
      const res: any = await api("/api/region-types");
      if (res.success && res.data) setTypes(res.data);
    } catch (err) {
      console.error("Failed to load region types", err);
    }
  };

  useEffect(() => { loadRegionTypes(); }, []);

  const handleAddClick = () => { setEditingType(null); setForm({ title: "", parent_id: "" }); setFormOpen(true); };
  const handleEditClick = (rt: RegionType) => { setEditingType(rt); setForm({ title: rt.title, parent_id: rt.parent_id !== null ? rt.parent_id : "" }); setFormOpen(true); };
  const handleCloseForm = () => { setFormOpen(false); setEditingType(null); setForm({ title: "", parent_id: "" }); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = regionTypeSchema.safeParse(form);
    if (!result.success) { toast.warn(result.error.issues[0].message); return; }

    setSubmitting(true);
    const parentVal = form.parent_id === "" ? null : Number(form.parent_id);
    try {
      if (editingType) {
        const res: any = await put(`/api/region-types/${editingType.id}`, { title: form.title, parent_id: parentVal });
        if (res.success) { toast.success("Region type updated successfully!"); handleCloseForm(); loadRegionTypes(); }
        else toast.error(res.error || "Failed to update region type");
      } else {
        const res: any = await post("/api/region-types", { title: form.title, parent_id: parentVal });
        if (res.success) { toast.success("Region type created successfully!"); handleCloseForm(); loadRegionTypes(); }
        else toast.error(res.error || "Failed to create region type");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rt: RegionType) => {
    try {
      const res: any = await del(`/api/region-types/${rt.id}`);
      if (res.success) { toast.success("Region type deleted!"); loadRegionTypes(); }
      else toast.error(res.error || "Failed to delete region type");
    } catch (err: any) {
      toast.error("Error: " + err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Region Type Management"
        description="Configure regional hierarchy types (City, Zone, Ward, etc.) for geographic classification."
        breadcrumbs={[{ label: "SWIFT", href: "/swift/shift" }, { label: "Region Types" }]}
        actions={
          <Button onClick={formOpen ? handleCloseForm : handleAddClick} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "+ Add Region Type"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        <div className="max-w-5xl mx-auto space-y-6 w-full">

          {formOpen && (
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle>{editingType ? "✏️ Edit Region Type" : "Create New Region Type"}</CardTitle>
                <CardDescription>Define a region type and optionally set its parent in the geographic hierarchy.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Region Type" placeholder="Eg. City" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                    <Select label="Parent Type (Optional)" value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })}>
                      <option value="">Select Parent Type</option>
                      {types.filter(t => !editingType || t.id !== editingType.id).map(t => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </Select>
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
              <div><CardTitle>Region Types</CardTitle><CardDescription>Configured geographic hierarchy classifications.</CardDescription></div>
              <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">{types.length} total</span>
            </CardHeader>
            <CardContent className="p-0">
              <Table headers={[<div key="s" className="w-20">S. No.</div>, "Region Type", "Parent Type", <div key="a" className="text-center w-32">Action</div>]}>
                {types.map((rt, index) => (
                  <tr key={rt.id} className="hover:bg-theme-base/40 transition-colors">
                    <td className="py-3.5 px-6 font-mono text-theme-text-dim">{index + 1}</td>
                    <td className="py-3.5 px-6 text-theme-text font-bold">{rt.title}</td>
                    <td className="py-3.5 px-6 text-theme-text-dim">{rt.parent_title || <span className="text-theme-text font-medium">—</span>}</td>
                    <td className="py-3.5 px-6 text-center">
                      <div className="inline-flex gap-2">
                        <EditButton onClick={() => handleEditClick(rt)} />
                        <DeleteButton onDelete={() => handleDelete(rt)} confirmMessage={`Delete region type "${rt.title}"?`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
