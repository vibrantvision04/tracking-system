"use client";

import { useEffect, useState } from "react";
import { post, put, del } from "@/lib/api";
import { useStore } from "@/lib/store";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import EditButton from "@/components/ui/EditButton";
import Table from "@/components/shared/Table";

interface VehicleMeta {
  makeId?: number;
  capacityId?: number;
}

const DEFAULT_MAKES = [
  { id: 1, name: "TATA", model: "Ace Gold", mileage: "18", tareWeight: "1600", fuelType: "Diesel" },
  { id: 2, name: "Ashok Leyland", model: "Dost+", mileage: "15", tareWeight: "2200", fuelType: "CNG" },
  { id: 3, name: "Mahindra", model: "Supro", mileage: "16", tareWeight: "1900", fuelType: "Diesel" }
];

const DEFAULT_CAPACITIES = [
  { id: 1, totalCapacity: "3.5", wet: "50", dry: "50", active: true },
  { id: 2, totalCapacity: "1.8", wet: "50", dry: "50", active: true },
  { id: 3, totalCapacity: "2.2", wet: "50", dry: "50", active: true }
];

export default function VehiclesPage() {
  const { vehicles, types, loaded, loadAll, addOrUpdateVehicle, removeVehicle } = useStore();
  
  // Local makes and capacities caches
  const [makes, setMakes] = useState<any[]>([]);
  const [capacities, setCapacities] = useState<any[]>([]);
  const [metaMap, setMetaMap] = useState<Record<string, VehicleMeta>>({});

  // Form states
  const [formOpen, setFormOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reg, setReg] = useState("");
  const [chassis, setChassis] = useState("");
  const [typeId, setTypeId] = useState("");
  const [makeId, setMakeId] = useState("");
  const [capacityId, setCapacityId] = useState("");

  useEffect(() => {
    if (!loaded) loadAll();

    // Load makes from local storage
    const cachedMakes = localStorage.getItem("iswm:vehicle-makes");
    if (cachedMakes) {
      try { setMakes(JSON.parse(cachedMakes)); } catch (e) { setMakes(DEFAULT_MAKES); }
    } else {
      setMakes(DEFAULT_MAKES);
    }

    // Load capacities from local storage
    const cachedCapacities = localStorage.getItem("iswm:vehicle-capacities");
    if (cachedCapacities) {
      try { setCapacities(JSON.parse(cachedCapacities)); } catch (e) { setCapacities(DEFAULT_CAPACITIES); }
    } else {
      setCapacities(DEFAULT_CAPACITIES);
    }

    // Load vehicle metadata map from local storage
    const cachedMeta = localStorage.getItem("iswm:vehicles-meta");
    if (cachedMeta) {
      try { setMetaMap(JSON.parse(cachedMeta)); } catch (e) { console.error("Failed to parse vehicles metadata map", e); }
    }
  }, [loaded, loadAll]);

  const openAdd = () => {
    setEditingVehicle(null);
    setReg("");
    setChassis("");
    setTypeId("");
    setMakeId("");
    setCapacityId("");
    setFormOpen(true);
  };

  const openEdit = (v: any) => {
    setEditingVehicle(v);
    setReg(v.registration_no);
    setChassis(v.chassis_no || "");
    setTypeId(v.vehicle_type_id ? String(v.vehicle_type_id) : "");
    
    const meta = metaMap[v.id] || {};
    setMakeId(meta.makeId ? String(meta.makeId) : "");
    setCapacityId(meta.capacityId ? String(meta.capacityId) : "");
    
    setFormOpen(true);
  };

  const closeForm = () => {
    setReg("");
    setChassis("");
    setTypeId("");
    setMakeId("");
    setCapacityId("");
    setEditingVehicle(null);
    setFormOpen(false);
  };

  const saveVehicle = async () => {
    if (!reg.trim()) {
      toast.warning("Please enter a registration number");
      return;
    }

    setSubmitting(true);
    try {
      let res;
      if (editingVehicle) {
        res = await put<{ data: any }>(`/api/vehicles/${editingVehicle.id}`, {
          registration_no: reg,
          chassis_no: chassis || null,
          vehicle_type_id: typeId ? Number(typeId) : null
        });
      } else {
        res = await post<{ data: any }>("/api/vehicles", { 
          registration_no: reg, 
          chassis_no: chassis || null, 
          vehicle_type_id: typeId ? Number(typeId) : null
        });
      }

      if (res.data) {
        addOrUpdateVehicle(res.data);

        // Save metadata
        const newMeta: VehicleMeta = {
          makeId: makeId ? Number(makeId) : undefined,
          capacityId: capacityId ? Number(capacityId) : undefined
        };

        const updatedMeta = {
          ...metaMap,
          [res.data.id]: newMeta
        };
        setMetaMap(updatedMeta);
        localStorage.setItem("iswm:vehicles-meta", JSON.stringify(updatedMeta));

        toast.success(editingVehicle ? "Vehicle updated successfully!" : "Vehicle registered successfully!");
        closeForm();
      }
    } catch (err) {
      toast.error(editingVehicle ? "Failed to update vehicle" : "Failed to register vehicle");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteVehicle = async (id: number) => {
    try {
      await del(`/api/vehicles/${id}`);
      removeVehicle(id);

      // Clean up metadata
      const updatedMeta = { ...metaMap };
      delete updatedMeta[id];
      setMetaMap(updatedMeta);
      localStorage.setItem("iswm:vehicles-meta", JSON.stringify(updatedMeta));
      
      toast.success("Vehicle deleted successfully!");
    } catch (err) {
      toast.error("Failed to delete vehicle");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">
      
      <PageHeader
        title="Vehicle Management"
        description="Configure municipal vehicle assets, type mapping, and GPS tracking link parameters."
        breadcrumbs={[
          { label: "Fleet", href: "/vehicles" },
          { label: "Vehicles Management" }
        ]}
        actions={
          <Button
            onClick={formOpen ? closeForm : openAdd}
            variant={formOpen ? "secondary" : "primary"}
          >
            {formOpen ? "Close Form" : "Add Vehicle"}
          </Button>
        }
      />

      {/* Main content body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        
        {/* Form panel */}
        {formOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>{editingVehicle ? "✏️ Edit Municipal Vehicle" : "Register New Municipal Vehicle"}</CardTitle>
              <CardDescription>
                {editingVehicle 
                  ? "Update vehicle configuration, chassis, type mappings, and make parameters." 
                  : "Setup registration number, chassis details, make configurations, and wet/dry capacities."}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Registration Number"
                  placeholder="e.g. RJ-14-GB-1234"
                  required
                  value={reg}
                  onChange={(e) => setReg(e.target.value)}
                />

                <Input
                  label="Chassis Number"
                  placeholder="e.g. MBH1234567890XYZ"
                  value={chassis}
                  onChange={(e) => setChassis(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Select
                  label="Vehicle Type"
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                  options={[
                    { value: "", label: "Select type…" },
                    ...types.map((t) => ({ value: t.id, label: t.name }))
                  ]}
                />

                <Select
                  label="Vehicle Make / Model"
                  value={makeId}
                  onChange={(e) => setMakeId(e.target.value)}
                  options={[
                    { value: "", label: "Select make…" },
                    ...makes.map((m) => ({ value: m.id, label: `${m.name} - ${m.model}` }))
                  ]}
                />

                <Select
                  label="Capacity Type"
                  value={capacityId}
                  onChange={(e) => setCapacityId(e.target.value)}
                  options={[
                    { value: "", label: "Select capacity…" },
                    ...capacities.map((c) => ({
                      value: c.id,
                      label: `${c.totalCapacity} Tons (${c.wet}/${c.dry} Wet/Dry)`
                    }))
                  ]}
                />
              </div>

              {/* Submission triggers */}
              <div className="flex gap-3 justify-end pt-4 border-t border-theme-border/60">
                <Button
                  onClick={closeForm}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveVehicle}
                  variant="accent"
                  loading={submitting}
                  loadingText="Saving..."
                >
                  {editingVehicle ? "Update Vehicle" : "Register Vehicle"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table View */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Registered Fleet</CardTitle>
              <CardDescription>Comprehensive catalog of all municipal vehicle assets linked with current tracking telemetry.</CardDescription>
            </div>
            <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">
              {vehicles.length} Total Vehicles
            </span>
          </CardHeader>
          
          <CardContent className="p-0">
            <Table
              headers={[
                <div key="sno" className="text-center w-12">S. No.</div>,
                "Reg No",
                "Chassis No",
                "Type",
                "Make / Model",
                "Capacity",
                "GPS Device",
                <div key="act" className="text-right pr-4">Actions</div>
              ]}
            >
              {vehicles.map((v, idx) => {
                const meta = metaMap[v.id] || {};
                
                // Find make name
                const matchedMake = makes.find(m => m.id === meta.makeId);
                const makeStr = matchedMake ? `${matchedMake.name} ${matchedMake.model}` : "—";

                // Find capacity string
                const matchedCap = capacities.find(c => c.id === meta.capacityId);
                const capStr = matchedCap ? `${matchedCap.totalCapacity} T` : "—";

                return (
                  <tr key={`${v.id}-${idx}`} className="hover:bg-theme-base/40 border-b border-theme-border transition-colors">
                    <td className="py-3.5 px-5 text-center text-theme-text-dim font-mono font-medium">{idx + 1}</td>
                    <td className="py-3.5 px-5 font-extrabold text-theme-text text-[13px] tracking-tight">{v.registration_no}</td>
                    <td className="py-3.5 px-5 text-theme-text-dim font-mono text-[11px]">{v.chassis_no || "—"}</td>
                    <td className="py-3.5 px-5">
                      {v.vehicle_type?.name ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                          {v.vehicle_type.name}
                        </span>
                      ) : (
                        <span className="text-theme-text-dim">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-theme-text font-medium">{makeStr}</td>
                    <td className="py-3.5 px-5 text-theme-text font-medium">{capStr}</td>
                    <td className="py-3.5 px-5 font-mono text-[11px]">
                      {v.gps_device ? (
                        <span className="text-theme-accent font-semibold">{v.gps_device.imei}</span>
                      ) : (
                        <span className="text-theme-text-dim">None</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton
                          onClick={() => openEdit(v)}
                        />
                        <DeleteButton
                          onDelete={() => deleteVehicle(v.id)}
                          confirmMessage={`Are you sure you want to delete vehicle "${v.registration_no}"? This will also unassign any GPS device.`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
