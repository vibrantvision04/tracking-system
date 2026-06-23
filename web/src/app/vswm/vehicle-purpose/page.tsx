"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";
import { Pencil, Truck, FolderArchive, CheckCircle, Lock } from "lucide-react";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface VehiclePurpose {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

export default function VehiclePurposePage() {
  const [purposes, setPurposes] = useState<VehiclePurpose[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VehiclePurpose | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ─── Data Loading ───────────────────────────────────────────────────────────
  const loadPurposes = async () => {
    setLoading(true);
    try {
      const res = await api<{ success: boolean; data: VehiclePurpose[] }>("/api/vehicle-purposes");
      if (res.success) setPurposes(res.data || []);
    } catch {
      toast.error("Failed to load collection types.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPurposes(); }, []);

  // ─── Form Helpers ────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingItem(null);
    setName("");
    setFormOpen(true);
  };

  const openEdit = (vp: VehiclePurpose) => {
    setEditingItem(vp);
    setName(vp.name);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingItem(null);
    setName("");
  };

  // ─── CRUD Handlers ───────────────────────────────────────────────────────────
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.warning("Collection type name cannot be empty.");
      return;
    }
    setSubmitting(true);
    try {
      if (editingItem) {
        await put(`/api/vehicle-purposes/${editingItem.id}`, { name: trimmed });
        toast.success(`"${trimmed}" updated successfully!`);
      } else {
        await post("/api/vehicle-purposes", { name: trimmed });
        toast.success(`"${trimmed}" created successfully!`);
      }
      closeForm();
      loadPurposes();
    } catch {
      toast.error(editingItem ? "Failed to update collection type." : "Failed to create collection type.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (vp: VehiclePurpose) => {
    try {
      await del(`/api/vehicle-purposes/${vp.id}`);
      toast.success(`"${vp.name}" deleted.`);
      loadPurposes();
    } catch {
      toast.error("Failed to delete collection type.");
    }
  };

  // ─── Color badge per type keyword ──────────────────────────────────────────
  const getDotColor = (n: string) => {
    const u = n.toLowerCase();
    if (u.includes("d2d") || u.includes("door"))    return "bg-[#10B981]";
    if (u.includes("bulk") || u.includes("dry"))    return "bg-[#F59E0B]";
    if (u.includes("wet"))                           return "bg-[#06B6D4]";
    if (u.includes("electric"))                      return "bg-[#8B5CF6]";
    if (u.includes("garden") || u.includes("irrig")) return "bg-[#22C55E]";
    if (u.includes("inert") || u.includes("landfill")) return "bg-[#F97316]";
    if (u.includes("commercial") || u.includes("transfer")) return "bg-[#6366F1]";
    return "bg-[#64748B]";
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">

      {/* Header */}
      <PageHeader
        title="Vehicle Collection Types"
        description="Configure dynamic collection categorizations, wet/dry waste splits, and custom vehicle roles."
        breadcrumbs={[
          { label: "VSWM", href: "/vswm/shift" },
          { label: "Vehicle Collection Types" }
        ]}
        actions={
          <Button
            onClick={formOpen ? closeForm : openAdd}
            variant={formOpen ? "secondary" : "primary"}
          >
            {formOpen ? "Close" : "+ Add Collection Type"}
          </Button>
        }
      />

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">

        {/* Form Panel */}
        {formOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{editingItem ? "Edit Collection Type" : "Create New Collection Type"}</CardTitle>
              <CardDescription>Setup operational keyword groupings used in geofence assignment policies.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="max-w-md space-y-4">
                <Input
                  label="Collection Type Name"
                  placeholder="Eg. D2D Collection"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />

                <div className="flex gap-3 pt-3 border-t border-theme-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeForm}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="accent"
                    loading={submitting}
                    loadingText="Saving..."
                  >
                    {editingItem ? "Update Type" : "Register Type"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Categories", value: purposes.length },
            { label: "Active Nodes", value: purposes.filter((p) => p.is_active).length },
            { label: "Inactive Nodes", value: purposes.filter((p) => !p.is_active).length },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-theme-surface border border-theme-border rounded-xl px-5 py-4 shadow-sm hover:shadow transition"
            >
              <div className="text-xl font-extrabold text-theme-text leading-none">{stat.value}</div>
              <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider mt-1.5">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Existing Categories</CardTitle>
              <CardDescription>Full listing of municipal solid waste classifications used by Nagar Nigam Jaipur.</CardDescription>
            </div>
            <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">
              {purposes.length} Total Types
            </span>
          </CardHeader>
          
          <CardContent className="p-0">
            <Table
              headers={[
                <div key="sno" className="text-center w-16">S. No.</div>,
                "Name",
                "Status",
                "Created At",
                <div key="act" className="text-right pr-4">Action</div>
              ]}
              isLoading={loading}
              emptyState={
                <div className="flex flex-col items-center justify-center gap-1.5 py-6">
                  <span className="text-xl">🚚</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider">No collection types registered</span>
                  <span className="text-[10px] text-theme-text-dim/80">Click "+ Add Collection Type" to configure.</span>
                </div>
              }
            >
              {purposes.map((vp, idx) => (
                <tr
                  key={vp.id}
                  className="hover:bg-theme-base/40 border-b border-theme-border transition-colors group"
                >
                  <td className="py-3.5 px-5 text-center text-theme-text-dim font-mono text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getDotColor(vp.name)}`} />
                      <span className="font-bold text-theme-text text-xs">{vp.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                      vp.is_active 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/50" 
                        : "bg-slate-50 text-slate-500 border-slate-200/50"
                    }`}>
                      {vp.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-theme-text-dim font-mono text-[11px]">
                    {vp.created_at || "—"}
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <EditButton
                        onClick={() => openEdit(vp)}
                      />
                      <DeleteButton
                        onDelete={() => handleDelete(vp)}
                        confirmMessage={`Delete "${vp.name}"? This cannot be undone.`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
