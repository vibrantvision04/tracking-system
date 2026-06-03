"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import StatCard from "@/components/shared/StatCard";
import Table from "@/components/shared/Table";

interface RouteType {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

export default function RouteTypePage() {
  const [routeTypes, setRouteTypes] = useState<RouteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<RouteType | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadRouteTypes = async () => {
    setLoading(true);
    try {
      const res = await api<{ success: boolean; data: RouteType[] }>("/api/route-types");
      if (res.success) setRouteTypes(res.data || []);
    } catch (err) {
      toast.error("Failed to load route types.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRouteTypes(); }, []);

  const openAddForm = () => { setEditingType(null); setName(""); setFormOpen(true); };
  const openEditForm = (rt: RouteType) => { setEditingType(rt); setName(rt.name); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditingType(null); setName(""); };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { toast.warning("Route type name cannot be empty."); return; }
    setSubmitting(true);
    try {
      if (editingType) {
        await put(`/api/route-types/${editingType.id}`, { name: trimmed });
        toast.success(`Route type "${trimmed}" updated!`);
      } else {
        await post("/api/route-types", { name: trimmed });
        toast.success(`Route type "${trimmed}" created!`);
      }
      closeForm();
      loadRouteTypes();
    } catch (err) {
      toast.error(editingType ? "Failed to update route type." : "Failed to create route type.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rt: RouteType) => {
    try {
      await del(`/api/route-types/${rt.id}`);
      toast.success(`"${rt.name}" deleted.`);
      loadRouteTypes();
    } catch (err) {
      toast.error("Failed to delete route type.");
    }
  };

  const ROUTE_TYPE_COLORS: Record<string, string> = {
    D2D: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    SWEEPING: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
    DUSTBIN: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    COMMERCIAL: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  };
  const getTypeColor = (name: string) => ROUTE_TYPE_COLORS[name.toUpperCase()] || "bg-slate-700/40 text-theme-text border-theme-border/40";

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Route Type Management"
        description="Categorize routes by type (D2D, Sweeping, Dustbin, Commercial, etc.) for classification and filtering."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Route Types" }]}
        actions={
          <Button onClick={formOpen ? closeForm : openAddForm} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "✕ Close" : "+ Add Route Type"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">

        {formOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{editingType ? "✏️ Edit Route Type" : "Create New Route Type"}</CardTitle>
              <CardDescription>This name will appear in route creation dropdowns and map filters.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                <Input label="Route Type Name" placeholder="e.g. D2D, SWEEPING, COMMERCIAL …" required value={name} onChange={e => setName(e.target.value)} />
                <div className="flex gap-3 pt-2 border-t border-theme-border">
                  <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                  <Button type="submit" variant="accent" loading={submitting} loadingText="Saving…">
                    {editingType ? "Update Type" : "Create Type"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard title="Total Types" value={routeTypes.length} icon={<span className="text-xl">🗂️</span>} />
          <StatCard title="Active" value={routeTypes.filter(t => t.is_active).length} icon={<span className="text-xl">✅</span>} />
          <StatCard title="Inactive" value={routeTypes.filter(t => !t.is_active).length} icon={<span className="text-xl">🔒</span>} />
          <StatCard title="Default Types" value={Math.min(routeTypes.length, 4)} icon={<span className="text-xl">⭐</span>} />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Existing Route Types</CardTitle><CardDescription>All registered route type categories for ISWM operations.</CardDescription></div>
            <span className="text-[10px] px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 font-bold">{routeTypes.length} types</span>
          </CardHeader>
          <CardContent className="p-0">
            <Table headers={[<div key="s" className="text-center w-16">S.No.</div>, "Route Type Name", "Status", "Created At", <div key="a" className="text-right pr-4">Actions</div>]}
              isLoading={loading}
              emptyState="No route types registered yet. Click '+ Add Route Type' to get started."
            >
              {routeTypes.map((rt, idx) => (
                <tr key={rt.id} className="hover:bg-theme-base/40 transition-colors group">
                  <td className="py-3.5 px-5 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
                  <td className="py-3.5 px-5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${getTypeColor(rt.name)}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                      {rt.name}
                    </span>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${rt.is_active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-theme-base text-theme-text-dim border border-theme-border"}`}>
                      {rt.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-theme-text-dim font-mono text-[11px]">{rt.created_at || "—"}</td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EditButton onClick={() => openEditForm(rt)} />
                      <DeleteButton onDelete={() => handleDelete(rt)} confirmMessage={`Delete "${rt.name}"? Routes using this type will have their type cleared.`} />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </CardContent>
        </Card>

        {/* Usage Info */}
        <Card>
          <CardHeader>
            <CardTitle>📋 How Route Types are Used</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-[11px] text-theme-text-dim">
              <li className="flex items-start gap-2"><span className="text-emerald-400 shrink-0 mt-0.5">→</span><span>When creating a <strong className="text-theme-text">Route</strong>, you can select a Route Type to categorize the route (e.g. D2D, Sweeping).</span></li>
              <li className="flex items-start gap-2"><span className="text-emerald-400 shrink-0 mt-0.5">→</span><span>The <strong className="text-theme-text">D2D Coverage Report</strong> can be filtered by Route Type.</span></li>
              <li className="flex items-start gap-2"><span className="text-emerald-400 shrink-0 mt-0.5">→</span><span>The <strong className="text-theme-text">Fleet Live Map</strong> uses Route Type for vehicle classification.</span></li>
              <li className="flex items-start gap-2"><span className="text-amber-400 shrink-0 mt-0.5">⚠️</span><span>Deleting a Route Type will <strong className="text-amber-300">clear</strong> the type from any routes using it. Default types (D2D, SWEEPING, DUSTBIN, COMMERCIAL) are recommended to keep.</span></li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
