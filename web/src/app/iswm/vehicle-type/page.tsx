"use client";

import { useEffect, useState } from "react";
import { post, del } from "@/lib/api";
import { useStore } from "@/lib/store";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";

interface VehicleTypeMeta {
  collectionType: string;
  partitioned: boolean;
  imageUrl?: string;
}

export default function VehicleTypePage() {
  const { types, loaded, loadAll, addType: storeAddType, removeType } = useStore();
  
  const [name, setName] = useState("");
  const [collectionType, setCollectionType] = useState("Bulk Collection Dry Waste");
  const [partitioned, setPartitioned] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [imageFile, setImageFile] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [metaMap, setMetaMap] = useState<Record<string, VehicleTypeMeta>>({});

  useEffect(() => {
    if (!loaded) loadAll();
    const cached = localStorage.getItem("iswm:vehicle-types-meta");
    if (cached) {
      try { setMetaMap(JSON.parse(cached)); } catch (e) { console.error(e); }
    }
  }, [loaded, loadAll]);

  const saveMeta = (updated: Record<string, VehicleTypeMeta>) => {
    setMetaMap(updated);
    localStorage.setItem("iswm:vehicle-types-meta", JSON.stringify(updated));
  };

  const closeForm = () => {
    setFormOpen(false); setName(""); setCollectionType("Bulk Collection Dry Waste");
    setPartitioned(true); setImageFile(null);
  };

  const handleAddType = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) { toast.warning("Please enter a vehicle type name"); return; }

    setSubmitting(true);
    try {
      const res = await post<{ data: any }>("/api/vehicle-types", { name });
      if (res.data) {
        storeAddType(res.data);
        saveMeta({ ...metaMap, [res.data.id]: { collectionType, partitioned, imageUrl: imageFile || undefined } });
        toast.success("Vehicle Type created successfully!");
        closeForm();
      }
    } catch (err) {
      toast.error("Failed to create vehicle type");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteType = async (id: number) => {
    try {
      await del(`/api/vehicle-types/${id}`);
      removeType(id);
      const updatedMeta = { ...metaMap }; delete updatedMeta[id]; saveMeta(updatedMeta);
      toast.success("Vehicle Type deleted successfully!");
    } catch (err) {
      toast.error("Failed to delete vehicle type");
    }
  };

  const simulateUpload = () => {
    const randomId = Math.floor(Math.random() * 1000);
    setImageFile(`https://picsum.photos/seed/${randomId}/120/120`);
    toast.info("Image uploaded successfully!");
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">

      <PageHeader
        title="Vehicle Type Management"
        description="Configure solid waste management categories, collection methods, and fleet type assignments."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Vehicle Types" }]}
        actions={
          <Button onClick={formOpen ? closeForm : () => setFormOpen(true)} variant={formOpen ? "secondary" : "primary"}>
            {formOpen ? "Close Form" : "Add Vehicle Type"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">

        {formOpen && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>Create New Vehicle Type</CardTitle>
              <CardDescription>Define new fleet category with collection type, partition config, and optional image.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddType} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input label="Vehicle Type" placeholder="e.g. Tipper, Compactor, JCB" required value={name} onChange={e => setName(e.target.value)} />
                      <Select label="Vehicle Collection Type" value={collectionType} onChange={e => setCollectionType(e.target.value)}
                        options={[
                          { value: "Bulk Collection Dry Waste", label: "Bulk Collection Dry Waste" },
                          { value: "Door to Door Collection", label: "Door to Door Collection" },
                          { value: "Commercial Collection", label: "Commercial Collection" },
                          { value: "Transfer Station to Landfill", label: "Transfer Station to Landfill" },
                          { value: "Other", label: "Other" }
                        ]}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-theme-text-dim uppercase tracking-wider block">Partitioned</span>
                      <div className="flex items-center gap-6 pl-1">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-theme-text">
                          <input type="radio" checked={partitioned === true} onChange={() => setPartitioned(true)} className="w-4 h-4 accent-indigo-500" /><span>Yes</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-theme-text">
                          <input type="radio" checked={partitioned === false} onChange={() => setPartitioned(false)} className="w-4 h-4 accent-indigo-500" /><span>No</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center border border-dashed border-theme-border rounded-xl p-4 bg-theme-base/30 text-center">
                    {imageFile ? (
                      <div className="space-y-2">
                        <img src={imageFile} alt="Uploaded Type preview" className="w-24 h-24 rounded-lg object-cover border border-theme-border mx-auto" />
                        <button type="button" onClick={() => setImageFile(null)} className="text-[10px] text-red-400 hover:text-red-300 font-bold block mx-auto underline">Remove Image</button>
                      </div>
                    ) : (
                      <div className="space-y-3 cursor-pointer" onClick={simulateUpload}>
                        <div className="text-3xl text-theme-text-dim">🖼️</div>
                        <div className="text-[10px] text-theme-text-dim font-bold uppercase tracking-wider">Click to upload image</div>
                        <div className="text-[8px] text-theme-text-dim">SVG, PNG, JPG up to 2MB</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 justify-end pt-3 border-t border-theme-border">
                  <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                  <Button type="submit" variant="accent" loading={submitting} loadingText="Saving...">Submit Type</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div><CardTitle>Existing Vehicle Types</CardTitle><CardDescription>Full listing of fleet categories configured for Nagar Nigam Jaipur Heritage.</CardDescription></div>
            <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">{types.length} total</span>
          </CardHeader>
          <CardContent className="p-0">
            <Table headers={[<div key="s" className="text-center w-16">S. No.</div>, "Image", "Vehicle Type", "Collection Type", "Partitioned", <div key="a" className="text-right pr-4">Action</div>]}>
              {types.map((t, idx) => {
                const meta = metaMap[t.id] || { collectionType: "Bulk Collection Dry Waste", partitioned: true };
                return (
                  <tr key={t.id} className="hover:bg-theme-base/40 transition-colors">
                    <td className="py-3.5 px-5 text-center text-theme-text-dim font-mono">{idx + 1}</td>
                    <td className="py-3.5 px-5">
                      {meta.imageUrl ? (
                        <img src={meta.imageUrl} alt={t.name} className="w-10 h-10 rounded border border-theme-border object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded border border-theme-border bg-theme-base/40 flex items-center justify-center text-theme-text-dim text-xs">🖼️</div>
                      )}
                    </td>
                    <td className="py-3.5 px-5 font-bold text-theme-text text-[13px]">{t.name}</td>
                    <td className="py-3.5 px-5 text-theme-text-dim font-medium">{meta.collectionType}</td>
                    <td className="py-3.5 px-5">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${meta.partitioned ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-theme-base text-theme-text-dim border border-theme-border"}`}>
                        {meta.partitioned ? "YES" : "NO"}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <DeleteButton onDelete={() => handleDeleteType(t.id)} confirmMessage={`Delete vehicle type "${t.name}"?`} />
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
