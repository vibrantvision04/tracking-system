"use client";

import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useConfirm } from "@/context/ConfirmContext";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Table from "@/components/shared/Table";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function DevicesPage() {
  const confirm = useConfirm();
  const { devices, vehicles, loaded, loadAll, updateDevice, removeDevice } = useStore();
  const [imei, setImei] = useState("");
  const [serial, setSerial] = useState("");
  const [sim, setSim] = useState("");
  const [mapDev, setMapDev] = useState("");
  const [mapVeh, setMapVeh] = useState("");
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [registerExpanded, setRegisterExpanded] = useState(true);
  const [assignExpanded, setAssignExpanded] = useState(true);

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
    const isConfirmed = await confirm({
      title: currentBlocked ? "Unblock Device" : "Block Device",
      message: `Are you sure you want to ${actionText} GPS device "${imei}"?`,
      variant: currentBlocked ? "primary" : "danger"
    });
    if (!isConfirmed) return;
    await put("/api/devices/block", { id, blocked: !currentBlocked });
    const dev = devices.find(d => d.id === id);
    if (dev) updateDevice({ ...dev, is_blocked: !currentBlocked });
  };

  const unmapDevice = async (id: number, devImei: string) => {
    const isConfirmed = await confirm({
      title: "Unmap GPS Device",
      message: `Are you sure you want to unassign device ${devImei} from the vehicle?`,
      variant: "danger"
    });
    if (!isConfirmed) return;
    await post(`/api/unmap-device/${id}`, {});
    loadAll(true);
  };

  const deleteDevice = async (id: number) => {
    await del(`/api/devices/${id}`);
    removeDevice(id);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden select-none font-sans">
      
      <PageHeader
        title="GPS Devices Management"
        description="Monitor, register, and link hardware GPS devices with active municipal fleet vehicles."
        breadcrumbs={[
          { label: "Fleet", href: "/vehicles" },
          { label: "GPS Devices" }
        ]}
      />

      {/* Main content body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Left Column: Register & Assign Forms */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            
            {/* Register Card */}
            <Card className="border border-theme-border shadow-sm bg-theme-surface overflow-hidden">
              <CardHeader 
                className="pb-3 border-b border-theme-border/50 flex flex-row items-center justify-between cursor-pointer select-none hover:bg-theme-elevated/20 transition-colors"
                onClick={() => setRegisterExpanded(!registerExpanded)}
              >
                <div className="flex-1 pr-4">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    Register Device
                  </CardTitle>
                  {registerExpanded && (
                    <CardDescription className="text-[11px] mt-1 leading-normal">
                      Configure a new tracking unit. Devices also auto-register when reporting telemetry.
                    </CardDescription>
                  )}
                </div>
                <div className="text-theme-text-dim/80 hover:text-theme-text transition shrink-0">
                  {registerExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </CardHeader>
              {registerExpanded && (
                <CardContent className="pt-4 animate-fadeIn">
                  <form onSubmit={addDevice} className="space-y-4">
                    <div className="flex flex-col gap-4">
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
                        className="w-full"
                      >
                        + Add Device
                      </Button>
                    </div>
                  </form>
                </CardContent>
              )}
            </Card>

            {/* Assign Card */}
            <Card className="border border-theme-border shadow-sm bg-theme-surface overflow-hidden">
              <CardHeader 
                className="pb-3 border-b border-theme-border/50 flex flex-row items-center justify-between cursor-pointer select-none hover:bg-theme-elevated/20 transition-colors"
                onClick={() => setAssignExpanded(!assignExpanded)}
              >
                <div className="flex-1 pr-4">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    Assign Device → Vehicle
                  </CardTitle>
                  {assignExpanded && (
                    <CardDescription className="text-[11px] mt-1 leading-normal">
                      Create a hardware mapping. This links live coordinates directly to the vehicle dashboard.
                    </CardDescription>
                  )}
                </div>
                <div className="text-theme-text-dim/80 hover:text-theme-text transition shrink-0">
                  {assignExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </CardHeader>
              {assignExpanded && (
                <CardContent className="pt-4 animate-fadeIn">
                  <form onSubmit={assign} className="space-y-4">
                    <div className="flex flex-col gap-4">
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
                        className="w-full"
                      >
                        Link Device
                      </Button>
                    </div>
                  </form>
                </CardContent>
              )}
            </Card>

          </div>

          {/* Right Column: Hardware Registry Table */}
          <div className="lg:col-span-2">
            <Card className="border border-theme-border shadow-sm bg-theme-surface overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-theme-border/50">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    Hardware Registry
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Live tracking devices connected to the TCP telemetry parser server.
                  </CardDescription>
                </div>
                <span className="text-[10px] px-2.5 py-1 bg-theme-base text-theme-accent rounded-full border border-theme-border font-extrabold uppercase tracking-wider">
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
                  nested={true}
                  emptyState={
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12">
                      <span className="text-[11px] font-bold uppercase tracking-wider">No GPS devices registered</span>
                      <span className="text-[10px] text-theme-text-dim/80 text-center max-w-sm">
                        They automatically register when connecting to the TCP server, or can be added manually.
                      </span>
                    </div>
                  }
                >
                  {devices.map((d, idx) => (
                    <tr key={`${d.id}-${idx}`} className="hover:bg-theme-base/40 border-b border-theme-border transition-colors">
                      <td className="py-3.5 px-4 font-mono text-indigo-500 font-bold text-[11px] tracking-tight">{d.imei}</td>
                      <td className="py-3.5 px-4 text-theme-text-dim text-[11px] font-semibold">{d.serial_no || "—"}</td>
                      <td className="py-3.5 px-4 text-theme-text-dim text-[11px] font-semibold">{d.sim_no || "—"}</td>
                      <td className="py-3.5 px-4 text-theme-text font-bold text-[11px]">{d.device_type || "Teltonika"}</td>
                      <td className="py-3.5 px-4">
                        {d.vehicle ? (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-widest">
                            {d.vehicle.registration_no}
                          </span>
                        ) : (
                          <span className="text-slate-450 text-[10.5px] font-medium italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => toggleStatus(d.id, d.is_active)}
                          className={`text-[9px] px-2.5 py-1 rounded font-black uppercase tracking-widest transition hover:scale-105 active:scale-95 cursor-pointer ${
                            d.is_active 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                              : "bg-rose-50 text-rose-700 border border-rose-100"
                          }`}
                          title="Click to toggle active status"
                        >
                          {d.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => toggleBlock(d.id, d.imei, !!d.is_blocked)}
                          className={`text-[9px] px-2.5 py-1 rounded font-black uppercase tracking-widest transition hover:scale-105 active:scale-95 cursor-pointer ${
                            d.is_blocked 
                              ? "bg-rose-600 text-white shadow-sm shadow-rose-500/20" 
                              : "bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200/60"
                          }`}
                          title="Click to toggle blacklist / block status"
                        >
                          {d.is_blocked ? "Blocked" : "Allow"}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          {d.vehicle && (
                            <Button
                              onClick={() => unmapDevice(d.id, d.imei)}
                              variant="outline"
                              className="px-2.5 py-1 text-[9.5px] font-bold h-[26px]"
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

      </div>
    </div>
  );
}
