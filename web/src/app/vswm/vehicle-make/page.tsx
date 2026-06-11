"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface VehicleMake {
  id: number;
  name: string;
  model: string;
  mileage: string;
  tareWeight: string;
  fuelType: string;
}

const DEFAULT_MAKES: VehicleMake[] = [
  { id: 1, name: "TATA", model: "Ace Gold", mileage: "18", tareWeight: "1600", fuelType: "Diesel" },
  { id: 2, name: "Ashok Leyland", model: "Dost+", mileage: "15", tareWeight: "2200", fuelType: "CNG" },
  { id: 3, name: "Mahindra", model: "Supro", mileage: "16", tareWeight: "1900", fuelType: "Diesel" }
];

export default function VehicleMakePage() {
  const [makes, setMakes] = useState<VehicleMake[]>([]);
  const [editingItem, setEditingItem] = useState<VehicleMake | null>(null);

  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [mileage, setMileage] = useState("");
  const [tareWeight, setTareWeight] = useState("");
  const [fuelType, setFuelType] = useState("Diesel");
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem("vswm:vehicle-makes");
    if (cached) {
      try { setMakes(JSON.parse(cached)); } catch { setMakes(DEFAULT_MAKES); }
    } else {
      setMakes(DEFAULT_MAKES);
      localStorage.setItem("vswm:vehicle-makes", JSON.stringify(DEFAULT_MAKES));
    }
  }, []);

  const saveMakes = (updated: VehicleMake[]) => {
    setMakes(updated);
    localStorage.setItem("vswm:vehicle-makes", JSON.stringify(updated));
  };

  const openAdd = () => {
    setEditingItem(null);
    setName(""); setModel(""); setMileage(""); setTareWeight(""); setFuelType("Diesel");
    setFormOpen(true);
  };

  const openEdit = (m: VehicleMake) => {
    setEditingItem(m);
    setName(m.name); setModel(m.model); setMileage(m.mileage); setTareWeight(m.tareWeight); setFuelType(m.fuelType);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false); setEditingItem(null);
    setName(""); setModel(""); setMileage(""); setTareWeight(""); setFuelType("Diesel");
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || !model.trim() || !mileage.trim() || !tareWeight.trim()) {
      toast.warning("Please fill all required make fields!");
      return;
    }

    if (editingItem) {
      const updated = makes.map(m => m.id === editingItem.id ? { ...m, name, model, mileage, tareWeight, fuelType } : m);
      saveMakes(updated);
      toast.success("Vehicle Make updated successfully!");
    } else {
      const newMake: VehicleMake = { id: Date.now(), name, model, mileage, tareWeight, fuelType };
      saveMakes([newMake, ...makes]);
      toast.success("Vehicle Make created successfully!");
    }
    closeForm();
  };

  const handleDelete = async (m: VehicleMake) => {
    const updated = makes.filter(mk => mk.id !== m.id);
    saveMakes(updated);
    toast.success("Vehicle Make deleted successfully!");
  };

  const fuelBadgeColor = (fuel: string) => {
    switch (fuel) {
      case "Diesel": return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "CNG": return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "Electric": return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
      default: return "bg-theme-base text-theme-accent border border-theme-border";
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Vehicle Make Management"
        description="Manage manufacturer brands, models, mileage specs, tare weights, and fuel types."
        breadcrumbs={[{ label: "VSWM", href: "/vswm/shift" }, { label: "Vehicle Makes" }]}
        actions={
          <Button onClick={formOpen ? closeForm : openAdd} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "Close" : "+ Add Make"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">

        {formOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{editingItem ? "✏️ Edit Vehicle Make" : "Create New Vehicle Make"}</CardTitle>
              <CardDescription>Specify manufacturer, model, mileage, weight, and fuel information.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                  <Input label="Make / Brand Name" placeholder="e.g. TATA" required value={name} onChange={e => setName(e.target.value)} />
                  <Input label="Model" placeholder="e.g. Ace Gold" required value={model} onChange={e => setModel(e.target.value)} />
                  <Input label="Company Mileage (kmpl)" type="number" placeholder="e.g. 15" required value={mileage} onChange={e => setMileage(e.target.value)} />
                  <Input label="Tare Weight (kgs)" type="number" placeholder="e.g. 1600" required value={tareWeight} onChange={e => setTareWeight(e.target.value)} />
                  <Select label="Fuel Type" value={fuelType} onChange={e => setFuelType(e.target.value)}
                    options={[
                      { value: "Diesel", label: "Diesel" },
                      { value: "CNG", label: "CNG" },
                      { value: "Petrol", label: "Petrol" },
                      { value: "Electric", label: "Electric" }
                    ]}
                  />
                </div>
                <div className="flex gap-3 justify-end pt-3 border-t border-theme-border">
                  <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                  <Button type="submit" variant="accent">{editingItem ? "Update Make" : "Submit Make"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Existing Vehicle Makes</CardTitle><CardDescription>All registered manufacturers and model specifications.</CardDescription></div>
            <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">{makes.length} total</span>
          </CardHeader>
          <CardContent className="p-0">
            <Table headers={[<div key="s" className="text-center w-16">S. No.</div>, "Make / Brand", "Model", "Mileage", "Tare Weight", "Fuel Type", <div key="a" className="text-right pr-4">Action</div>]}>
              {makes.map((m, idx) => (
                <tr key={m.id} className="hover:bg-theme-base/40 transition-colors">
                  <td className="py-3.5 px-5 text-center text-theme-text-dim font-mono">{idx + 1}</td>
                  <td className="py-3.5 px-5 font-bold text-theme-text text-[13px]">{m.name}</td>
                  <td className="py-3.5 px-5 text-theme-text font-medium">{m.model}</td>
                  <td className="py-3.5 px-5 text-theme-text-dim font-medium">{m.mileage} kmpl</td>
                  <td className="py-3.5 px-5 text-theme-text-dim font-medium">{parseInt(m.tareWeight).toLocaleString()} kgs</td>
                  <td className="py-3.5 px-5">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${fuelBadgeColor(m.fuelType)}`}>{m.fuelType.toUpperCase()}</span>
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EditButton onClick={() => openEdit(m)} />
                      <DeleteButton onDelete={() => handleDelete(m)} confirmMessage={`Delete make "${m.name} ${m.model}"?`} />
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
