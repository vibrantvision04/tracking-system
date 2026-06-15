"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { useStore } from "@/lib/store";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";

export default function DevicesPage() {
  const { devices, vehicles, loaded, loadAll, updateDevice, removeDevice } = useStore();
  const [imei, setImei] = useState("");
  const [serial, setSerial] = useState("");
  const [sim, setSim] = useState("");
  const [mapDev, setMapDev] = useState("");
  const [mapVeh, setMapVeh] = useState("");
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

  const addDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imei.trim()) return;
    setAdding(true);
    try {
      const res = await post<{ data: any }>("/api/devices", { imei, serial_no: serial, sim_no: sim });
      if (res.data) updateDevice(res.data);
      setImei(""); 
      setSerial(""); 
      setSim("");
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapDev || !mapVeh) return;
    setAssigning(true);
    try {
      await post("/api/map-device", { gps_device_id: Number(mapDev), vehicle_id: Number(mapVeh) });
      setMapDev(""); 
      setMapVeh("");
      // Assignment is complex, so we re-fetch to ensure mapping is correct
      loadAll(true);
    } catch (e: any) {
      alert("Error: " + e.message + "\nMake sure the device or vehicle is not already assigned.");
    } finally {
      setAssigning(false);
    }
  };

  const toggleStatus = async (id: number, currentStatus: boolean) => {
    await put("/api/devices/status", { id, is_active: !currentStatus });
    const dev = devices.find(d => d.id === id);
    if (dev) updateDevice({ ...dev, is_active: !currentStatus });
  };

  const toggleBlock = async (id: number, imei: string, currentBlocked: boolean) => {
    const actionText = currentBlocked ? "unblock / allow" : "block / blacklist";
    if (!confirm(`Are you sure you want to ${actionText} GPS device "${imei}"?`)) return;
    await put("/api/devices/block", { id, blocked: !currentBlocked });
    const dev = devices.find(d => d.id === id);
    if (dev) updateDevice({ ...dev, is_blocked: !currentBlocked });
  };

  const unmapDevice = async (id: number, devImei: string) => {
    if (!confirm(`Are you sure you want to unassign device ${devImei} from the vehicle?`)) return;
    await post(`/api/unmap-device/${id}`, {});
    loadAll(true);
  };

  const deleteDevice = async (id: number) => {
    await del(`/api/devices/${id}`);
    removeDevice(id);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans space-y-6 p-6 lg:p-8">
      
      <PageHeader
        title="GPS Devices Management"
        description="Monitor, register, and link hardware GPS devices with active municipal fleet vehicles."
        breadcrumbs={[
          { label: "Fleet", href: "/vehicles" },
          { label: "GPS Devices" }
        ]}
      />

      {/* Main content body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Register Card */}
          <Card>
            <CardHeader>
              <CardTitle>Register Device</CardTitle>
              <CardDescription>Configure a new tracking unit. Devices also auto-register when reporting telemetry.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={addDevice} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="IMEI Number"
                    placeholder="15 digits"
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    required
                  />
                  <Input
                    label="Serial Number"
                    placeholder="Serial No"
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                  />
                  <Input
                    label="SIM Number"
                    placeholder="SIM No"
                    value={sim}
                    onChange={(e) => setSim(e.target.value)}
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    variant="accent"
                    loading={adding}
                    loadingText="Adding..."
                  >
                    + Add Device
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Assign Card */}
          <Card>
            <CardHeader>
              <CardTitle>Assign Device → Vehicle</CardTitle>
              <CardDescription>Create a hardware mapping. This links live coordinates directly to the vehicle dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={assign} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Select Device"
                    value={mapDev}
                    onChange={(e) => setMapDev(e.target.value)}
                    options={[
                      { value: "", label: "Select device…" },
                      ...devices.map((d) => ({
                        value: d.id,
                        label: `${d.imei} ${d.vehicle ? `(Assigned: ${d.vehicle.registration_no})` : '(Available)'}`
                      }))
                    ]}
                  />
                  <Select
                    label="Select Vehicle"
                    value={mapVeh}
                    onChange={(e) => setMapVeh(e.target.value)}
                    options={[
                      { value: "", label: "Select vehicle…" },
                      ...vehicles.map((v) => ({
                        value: v.id,
                        label: `${v.registration_no} ${v.gps_device ? `(Assigned)` : '(Available)'}`
                      }))
                    ]}
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={assigning}
                    loadingText="Assigning..."
                  >
                    🔗 Link Device
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

        </div>

        {/* Devices Table Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle>Hardware Registry</CardTitle>
              <CardDescription>Live tracking devices connected to the TCP telemetry parser server.</CardDescription>
            </div>
            <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-bold">
              {devices.length} Total Units
            </span>
          </CardHeader>
          
          <CardContent className="p-0">
            <Table
              headers={[
                "IMEI",
                "Serial",
                "SIM",
                "Type",
                "Assigned Vehicle",
                "Status",
                "Blacklist",
                <div key="act" className="text-right pr-4">Actions</div>
              ]}
              emptyState={
                <div className="flex flex-col items-center justify-center gap-1.5 py-6">
                  <span className="text-xl">📡</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider">No GPS devices registered</span>
                  <span className="text-[10px] text-theme-text-dim/80">They automatically register when connecting to the TCP server, or can be added manually.</span>
                </div>
              }
            >
              {devices.map((d, idx) => (
                <tr key={`${d.id}-${idx}`} className="hover:bg-theme-base/40 border-b border-theme-border transition-colors">
                  <td className="py-3.5 px-5 font-mono text-indigo-500 font-semibold text-xs tracking-tight">{d.imei}</td>
                  <td className="py-3.5 px-5 text-theme-text-dim text-xs font-medium">{d.serial_no || "—"}</td>
                  <td className="py-3.5 px-5 text-theme-text-dim text-xs font-medium">{d.sim_no || "—"}</td>
                  <td className="py-3.5 px-5 text-theme-text font-medium text-xs">{d.device_type || "Teltonika"}</td>
                  <td className="py-3.5 px-5">
                    {d.vehicle ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                        {d.vehicle.registration_no}
                      </span>
                    ) : (
                      <span className="text-theme-text-dim text-xs italic">Unassigned</span>
                    )}
                  </td>
                  <td className="py-3.5 px-5">
                    <button
                      onClick={() => toggleStatus(d.id, d.is_active)}
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold transition hover:scale-105 active:scale-95 ${
                        d.is_active 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                      title="Click to toggle active status"
                    >
                      {d.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="py-3.5 px-5">
                    <button
                      onClick={() => toggleBlock(d.id, d.imei, !!d.is_blocked)}
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold transition hover:scale-105 active:scale-95 ${
                        d.is_blocked 
                          ? "bg-rose-600 text-white shadow-md shadow-rose-500/25" 
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                      }`}
                      title="Click to toggle blacklist / block status"
                    >
                      {d.is_blocked ? "Blocked" : "Allow"}
                    </button>
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex justify-end gap-2">
                      {d.vehicle && (
                        <Button
                          onClick={() => unmapDevice(d.id, d.imei)}
                          variant="outline"
                          className="px-2.5 py-1 text-[10px] font-semibold h-[28px]"
                        >
                          Unassign
                        </Button>
                      )}
                      <DeleteButton
                        onDelete={() => deleteDevice(d.id)}
                        confirmMessage={`Are you sure you want to completely delete GPS device "${d.imei}"? This will also unassign it if it's assigned to a vehicle.`}
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
