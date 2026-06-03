"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface VehicleCapacity {
  id: number;
  totalCapacity: string;
  wet: string;
  dry: string;
  active: boolean;
}

const DEFAULT_CAPACITIES: VehicleCapacity[] = [
  { id: 1, totalCapacity: "3.5", wet: "50", dry: "50", active: true },
  { id: 2, totalCapacity: "1.8", wet: "50", dry: "50", active: true },
  { id: 3, totalCapacity: "2.2", wet: "50", dry: "50", active: true }
];

export default function VehicleCapacityPage() {
  const [capacities, setCapacities] = useState<VehicleCapacity[]>([]);
  const [editingItem, setEditingItem] = useState<VehicleCapacity | null>(null);
  
  // Form fields
  const [totalCapacity, setTotalCapacity] = useState("");
  const [wet, setWet] = useState("");
  const [dry, setDry] = useState("");
  const [active, setActive] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem("iswm:vehicle-capacities");
    if (cached) {
      try { setCapacities(JSON.parse(cached)); } catch (e) { setCapacities(DEFAULT_CAPACITIES); }
    } else {
      setCapacities(DEFAULT_CAPACITIES);
      localStorage.setItem("iswm:vehicle-capacities", JSON.stringify(DEFAULT_CAPACITIES));
    }
  }, []);

  const saveCapacities = (updated: VehicleCapacity[]) => {
    setCapacities(updated);
    localStorage.setItem("iswm:vehicle-capacities", JSON.stringify(updated));
  };

  const openAdd = () => {
    setEditingItem(null);
    setTotalCapacity(""); setWet(""); setDry(""); setActive(true);
    setFormOpen(true);
  };

  const openEdit = (c: VehicleCapacity) => {
    setEditingItem(c);
    setTotalCapacity(c.totalCapacity); setWet(c.wet); setDry(c.dry); setActive(c.active);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false); setEditingItem(null);
    setTotalCapacity(""); setWet(""); setDry(""); setActive(true);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!totalCapacity.trim() || !wet.trim() || !dry.trim()) {
      toast.warning("Please fill all required capacity fields!");
      return;
    }

    if (editingItem) {
      const updated = capacities.map(c => c.id === editingItem.id ? { ...c, totalCapacity, wet, dry, active } : c);
      saveCapacities(updated);
      toast.success("Capacity updated successfully!");
    } else {
      const newCap: VehicleCapacity = { id: Date.now(), totalCapacity, wet, dry, active };
      saveCapacities([newCap, ...capacities]);
      toast.success("Vehicle Capacity created successfully!");
    }
    closeForm();
  };

  const handleDelete = async (c: VehicleCapacity) => {
    const updated = capacities.filter(cap => cap.id !== c.id);
    saveCapacities(updated);
    toast.success("Capacity deleted successfully!");
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Vehicle Capacity Management"
        description="Configure fleet tonnage specifications, wet/dry waste ratios, and capacity status."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Capacity Types" }]}
        actions={
          <Button onClick={formOpen ? closeForm : openAdd} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "Close" : "+ Add Capacity"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">

        {formOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{editingItem ? "✏️ Edit Vehicle Capacity" : "Create New Vehicle Capacity"}</CardTitle>
              <CardDescription>Specify total tonnage, wet/dry percentages, and operational status.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                  <Input label="Total Capacity (Tons)" placeholder="e.g. 3.5" required value={totalCapacity} onChange={e => setTotalCapacity(e.target.value)} />
                  <Input label="Wet (%)" type="number" placeholder="e.g. 50" required value={wet} onChange={e => setWet(e.target.value)} />
                  <Input label="Dry (%)" type="number" placeholder="e.g. 50" required value={dry} onChange={e => setDry(e.target.value)} />
                  <div className="space-y-1.5 w-full">
                    <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider block">Status</span>
                    <div className="flex items-center h-[38px] pl-1">
                      <button type="button" onClick={() => setActive(!active)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${active ? "bg-emerald-500" : "bg-slate-300"}`}>
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${active ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                      <span className="text-xs font-semibold text-theme-text-dim ml-3 uppercase tracking-wider select-none">{active ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 justify-end pt-3 border-t border-theme-border">
                  <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                  <Button type="submit" variant="accent">{editingItem ? "Update Capacity" : "Submit Capacity"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Existing Capacities</CardTitle><CardDescription>Registered fleet tonnage configurations.</CardDescription></div>
            <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">{capacities.length} total</span>
          </CardHeader>
          <CardContent className="p-0">
            <Table headers={[<div key="s" className="text-center w-16">S. No.</div>, "Total Capacity (Tons)", "Wet %", "Dry %", "Status", <div key="a" className="text-right pr-4">Action</div>]}>
              {capacities.map((c, idx) => (
                <tr key={c.id} className="hover:bg-theme-base/40 transition-colors">
                  <td className="py-3.5 px-5 text-center text-theme-text-dim font-mono">{idx + 1}</td>
                  <td className="py-3.5 px-5 font-bold text-theme-text text-[13px]">{c.totalCapacity}</td>
                  <td className="py-3.5 px-5 text-theme-text-dim font-medium">{c.wet}%</td>
                  <td className="py-3.5 px-5 text-theme-text-dim font-medium">{c.dry}%</td>
                  <td className="py-3.5 px-5">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${c.active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-theme-base text-theme-text-dim border border-theme-border"}`}>
                      {c.active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EditButton onClick={() => openEdit(c)} />
                      <DeleteButton onDelete={() => handleDelete(c)} confirmMessage={`Delete capacity "${c.totalCapacity} Tons"?`} />
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
