"use client";
import { useEffect, useState } from "react";
import { api, post, del } from "@/lib/api";
import { toast } from "react-toastify";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";

interface FuelStation {
  id: number;
  name: string;
}

interface Zone {
  id: number;
  region_name: string;
}

interface FuelStationZone {
  id: number;
  fuel_station_id: number;
  fuel_station_name: string;
  zone_id: number;
  zone_name: string;
}

export default function FuelStationZonePage() {
  const [mappings, setMappings] = useState<FuelStationZone[]>([]);
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({ fuel_station_id: "", zone_id: "" });

  const fetchData = async () => {
    try {
      const [mapRes, stationRes, zoneRes] = await Promise.all([
        api<{ data: FuelStationZone[] }>("/api/fuel-station-zones"),
        api<{ data: FuelStation[] }>("/api/fuel-stations"),
        api<{ data: Zone[] }>("/api/zones")
      ]);
      setMappings(mapRes.data || []);
      setStations(stationRes.data || []);
      setZones(zoneRes.data || []);
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setFormData({ fuel_station_id: "", zone_id: "" });
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
    if (!formData.fuel_station_id || !formData.zone_id) {
      toast.warning("Both Fuel Station and Zone must be selected.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await post<{ success: boolean; id: number }>("/api/fuel-station-zones", {
        fuel_station_id: parseInt(formData.fuel_station_id),
        zone_id: parseInt(formData.zone_id)
      });
      if (res.success) {
        toast.success("Mapping created successfully!");
        fetchData();
        handleCloseForm();
      } else {
        toast.error("Failed to create mapping");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (mapping: FuelStationZone) => {
    try {
      const res = await del<{ success: boolean }>(`/api/fuel-station-zones/${mapping.id}`);
      if (res.success) {
        toast.success("Mapping deleted successfully!");
        fetchData();
      } else toast.error("Failed to delete mapping");
    } catch (err) {
      toast.error("An error occurred during deletion");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Fuel Station To Zone"
        description="Assign fuel stations to specific operational zones."
        breadcrumbs={[{ label: "ISWM", href: "/iswm/shift" }, { label: "Fuel Station To Zone" }]}
        actions={
          <Button onClick={isFormOpen ? handleCloseForm : () => setIsFormOpen(true)} variant={isFormOpen ? "secondary" : "primary"}>
            {isFormOpen ? "✕ Close" : "+ Assign Fuel Station To Zone"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {isFormOpen && (
          <Card className="animate-fade-in relative z-20">
            <CardHeader>
              <CardTitle>⛽ Add Fuel Station Mapping</CardTitle>
              <CardDescription>Select a fuel station and the zone it belongs to.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
                <div className="grid grid-cols-2 gap-6">
                  <Select
                    label="Fuel Station *"
                    value={formData.fuel_station_id}
                    onChange={(e) => setFormData({ ...formData, fuel_station_id: e.target.value })}
                    options={[
                      { value: "", label: "Select Fuel Station" },
                      ...stations.map((s) => ({ value: s.id.toString(), label: s.name }))
                    ]}
                  />
                  <Select
                    label="Zone *"
                    value={formData.zone_id}
                    onChange={(e) => setFormData({ ...formData, zone_id: e.target.value })}
                    options={[
                      { value: "", label: "Select Zone" },
                      ...zones.map((z) => ({ value: z.id.toString(), label: z.region_name }))
                    ]}
                  />
                </div>
                <div className="flex items-center gap-3 pt-4 border-t border-theme-border">
                  <Button type="submit" variant="accent" loading={submitting} loadingText="Submitting...">Submit</Button>
                  <Button type="button" variant="outline" onClick={handleCloseForm}>Close</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="py-4">
            <CardTitle>Fuel Station Zone Mappings</CardTitle>
            <CardDescription>All assigned zones for fuel stations.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Table
                headers={[
                  <div key="s" className="text-center w-16">S. No.</div>,
                  "FUEL STATION(S)",
                  "ZONE",
                  <div key="a" className="text-right pr-4 w-24">Action</div>
                ]}
                isLoading={loading}
                emptyState="No mappings found."
              >
                {mappings.map((mapping, idx) => (
                  <tr key={mapping.id} className="hover:bg-theme-base/40 transition-colors group">
                    <td className="py-3 px-5 text-center text-theme-text-dim font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-3 px-5 font-medium">{mapping.fuel_station_name}</td>
                    <td className="py-3 px-5 text-theme-text-dim text-xs">{mapping.zone_name}</td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <DeleteButton onDelete={() => handleDelete(mapping)} confirmMessage="Remove this zone assignment?" />
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
