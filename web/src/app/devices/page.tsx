"use client";
import { useEffect, useState } from "react";
import { api, post, put, del } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function DevicesPage() {
  const { devices, vehicles, loaded, loadAll, updateDevice, removeDevice, addOrUpdateVehicle } = useStore();
  const [imei, setImei] = useState("");
  const [serial, setSerial] = useState("");
  const [sim, setSim] = useState("");
  const [mapDev, setMapDev] = useState("");
  const [mapVeh, setMapVeh] = useState("");

  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

  const addDevice = async () => {
    if (!imei) return;
    const res = await post<{ data: any }>("/api/devices", { imei, serial_no: serial, sim_no: sim });
    if (res.data) updateDevice(res.data);
    setImei(""); setSerial(""); setSim("");
  };

  const assign = async () => {
    if (!mapDev || !mapVeh) return;
    try {
      await post("/api/map-device", { gps_device_id: Number(mapDev), vehicle_id: Number(mapVeh) });
      setMapDev(""); setMapVeh("");
      // Assignment is complex, so we re-fetch to ensure mapping is correct
      loadAll(true);
    } catch (e: any) {
      alert("Error: " + e.message + "\nMake sure the device or vehicle is not already assigned.");
    }
  };

  const toggleStatus = async (id: number, currentStatus: boolean) => {
    await put("/api/devices/status", { id, is_active: !currentStatus });
    const dev = devices.find(d => d.id === id);
    if (dev) updateDevice({ ...dev, is_active: !currentStatus });
  };

  const unmapDevice = async (id: number) => {
    if (!confirm("Are you sure you want to unassign this device from the vehicle?")) return;
    await post(`/api/unmap-device/${id}`, {});
    loadAll(true);
  };

  const deleteDevice = async (id: number) => {
    if (!confirm("Are you sure you want to completely delete this GPS device? This will also unassign it if it's assigned to a vehicle.")) return;
    await del(`/api/devices/${id}`);
    removeDevice(id);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-dark)]">
      <h1 className="text-lg font-bold mb-6 tracking-tight">📡 GPS Devices</h1>

      {/* Register */}
      <section className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold mb-3 text-slate-300">Register Device</h2>
        <div className="flex gap-3 flex-wrap">
          <input placeholder="IMEI (15 digits)" value={imei} onChange={(e) => setImei(e.target.value)}
            className="px-3 py-2 bg-black/20 border border-white/5 rounded-lg text-[13px] text-white focus:outline-none focus:border-indigo-500/40 w-52" />
          <input placeholder="Serial No" value={serial} onChange={(e) => setSerial(e.target.value)}
            className="px-3 py-2 bg-black/20 border border-white/5 rounded-lg text-[13px] text-white focus:outline-none focus:border-indigo-500/40 w-44" />
          <input placeholder="SIM No" value={sim} onChange={(e) => setSim(e.target.value)}
            className="px-3 py-2 bg-black/20 border border-white/5 rounded-lg text-[13px] text-white focus:outline-none focus:border-indigo-500/40 w-44" />
          <button onClick={addDevice} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-[13px] font-medium transition-colors">+ Add</button>
        </div>
      </section>

      {/* Assign */}
      <section className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold mb-3 text-slate-300">Assign Device → Vehicle</h2>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Device</label>
            <select value={mapDev} onChange={(e) => setMapDev(e.target.value)} className="px-3 py-2 bg-[#1e293b] border border-white/5 rounded-lg text-[13px] text-white focus:outline-none w-64">
              <option value="">Select…</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.imei}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Vehicle</label>
            <select value={mapVeh} onChange={(e) => setMapVeh(e.target.value)} className="px-3 py-2 bg-[#1e293b] border border-white/5 rounded-lg text-[13px] text-white focus:outline-none w-64">
              <option value="">Select…</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_no}</option>)}
            </select>
          </div>
          <button onClick={assign} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[13px] font-medium transition-colors">Assign</button>
        </div>
      </section>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[.06] text-slate-500 text-[11px] uppercase tracking-wider">
              <th className="text-left px-4 py-3">IMEI</th>
              <th className="text-left px-4 py-3">Serial</th>
              <th className="text-left px-4 py-3">SIM</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Assigned Vehicle</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-b border-white/[.04] hover:bg-white/[.015] transition">
                <td className="px-4 py-3 font-mono text-indigo-300 text-xs">{d.imei}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{d.serial_no || "—"}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{d.sim_no || "—"}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{d.device_type || "Teltonika"}</td>
                <td className="px-4 py-3">{d.vehicle ? <span className="text-green-400 font-semibold text-xs">{d.vehicle.registration_no}</span> : <span className="text-slate-600 text-xs">Unassigned</span>}</td>
                <td className="px-4 py-3 cursor-pointer" onClick={() => toggleStatus(d.id, d.is_active)}>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition hover:opacity-80 ${d.is_active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                    {d.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {d.vehicle && <button onClick={() => unmapDevice(d.id)} className="text-[11px] text-orange-400 hover:text-orange-300 transition px-2 py-1 bg-orange-500/10 hover:bg-orange-500/20 rounded">Unassign</button>}
                    <button onClick={() => deleteDevice(d.id)} className="text-[11px] text-red-400 hover:text-red-300 transition px-2 py-1 bg-red-500/10 hover:bg-red-500/20 rounded">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {devices.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-slate-600 text-sm">No GPS devices registered. They auto-register when connecting to the TCP server.</td></tr>}
          </tbody>
        </table>
      </div>


    </div>
  );
}
