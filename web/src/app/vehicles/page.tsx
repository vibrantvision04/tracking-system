"use client";
import { useEffect, useState } from "react";
import { api, post, del } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function VehiclesPage() {
  const { vehicles, types, loaded, loadAll, addOrUpdateVehicle, removeVehicle, addType: storeAddType } = useStore();
  const [reg, setReg] = useState("");
  const [chassis, setChassis] = useState("");
  const [typeId, setTypeId] = useState("");
  const [newType, setNewType] = useState("");

  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

  const addVehicle = async () => {
    if (!reg) return;
    const res = await post<{ data: any }>("/api/vehicles", { 
      registration_no: reg, 
      chassis_no: chassis || null, 
      vehicle_type_id: typeId ? Number(typeId) : null 
    });
    if (res.data) addOrUpdateVehicle(res.data);
    setReg(""); setChassis(""); setTypeId("");
  };

  const addType = async () => {
    if (!newType) return;
    const res = await post<{ data: any }>("/api/vehicle-types", { name: newType });
    if (res.data) storeAddType(res.data);
    setNewType("");
  };

  const deleteVehicle = async (id: number) => {
    if (!confirm("Are you sure you want to delete this vehicle? This will also unassign any GPS device.")) return;
    await del(`/api/vehicles/${id}`);
    removeVehicle(id);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-dark)]">
      <h1 className="text-lg font-bold mb-6 tracking-tight">🚛 Vehicle Management</h1>

      {/* Types */}
      <section className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold mb-3 text-slate-300">Vehicle Types</h2>
        <div className="flex gap-3 mb-3">
          <input placeholder="e.g. Compactor, Tipper, JCB" value={newType} onChange={(e) => setNewType(e.target.value)}
            className="px-3 py-2 bg-black/20 border border-white/[.06] rounded-lg text-sm text-white outline-none flex-1 max-w-xs focus:border-indigo-500/40" />
          <button onClick={addType} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-medium transition">+ Add Type</button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {types.map((t) => (
            <span key={t.id} className="text-xs bg-indigo-500/10 text-indigo-300 px-3 py-1.5 rounded-full font-medium">{t.name}</span>
          ))}
          {types.length === 0 && <span className="text-xs text-slate-600">No types yet</span>}
        </div>
      </section>

      {/* Add Vehicle */}
      <section className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold mb-3 text-slate-300">Register Vehicle</h2>
        <div className="flex gap-3 flex-wrap">
          <input placeholder="Registration No" value={reg} onChange={(e) => setReg(e.target.value)}
            className="px-3 py-2 bg-black/20 border border-white/[.06] rounded-lg text-sm text-white outline-none w-52 focus:border-indigo-500/40" />
          <input placeholder="Chassis No" value={chassis} onChange={(e) => setChassis(e.target.value)}
            className="px-3 py-2 bg-black/20 border border-white/[.06] rounded-lg text-sm text-white outline-none w-52 focus:border-indigo-500/40" />
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}
            className="px-3 py-2 bg-[var(--bg-surface)] border border-white/[.06] rounded-lg text-sm text-white outline-none w-52">
            <option value="">Select type…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={addVehicle} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition">+ Add Vehicle</button>
        </div>
      </section>

      {/* Vehicle Table */}
      <div className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[.06] text-slate-500 text-[11px] uppercase tracking-wider">
              <th className="text-left px-4 py-3">Reg No</th>
              <th className="text-left px-4 py-3">Chassis</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">GPS Device</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="border-b border-white/[.04] hover:bg-white/[.015] transition">
                <td className="px-4 py-3 font-semibold text-white text-[13px]">{v.registration_no}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{v.chassis_no || "—"}</td>
                <td className="px-4 py-3 text-slate-300 text-xs">{v.vehicle_type?.name || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {v.gps_device ? <span className="text-indigo-300">{v.gps_device.imei}</span> : <span className="text-slate-600">None</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold
                    ${v.status === "running" ? "bg-green-500/10 text-green-400" :
                      v.status === "idle" ? "bg-amber-500/10 text-amber-400" :
                      v.status === "stopped" ? "bg-red-500/10 text-red-400" :
                      "bg-slate-500/10 text-slate-400"}`}>{v.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteVehicle(v.id)} className="text-xs text-red-400 hover:text-red-300 transition px-2 py-1 bg-red-500/10 hover:bg-red-500/20 rounded">Delete</button>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-600 text-sm">No vehicles registered yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-3">
        {vehicles.map((v) => (
          <div key={v.id} className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-white text-[14px]">{v.registration_no}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold
                ${v.status === "running" ? "bg-green-500/10 text-green-400" :
                  v.status === "idle" ? "bg-amber-500/10 text-amber-400" :
                  v.status === "stopped" ? "bg-red-500/10 text-red-400" :
                  "bg-slate-500/10 text-slate-400"}`}>{v.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Chassis:</span>
                <span className="text-slate-400 ml-1">{v.chassis_no || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500">Type:</span>
                <span className="text-slate-300 ml-1">{v.vehicle_type?.name || "—"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">GPS:</span>
                <span className="text-indigo-300 ml-1 font-mono">{v.gps_device ? v.gps_device.imei : "None"}</span>
              </div>
            </div>
            <div className="text-right pt-2 border-t border-white/[.03]">
              <button onClick={() => deleteVehicle(v.id)} className="text-xs text-red-400 hover:text-red-300 transition px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg">Delete</button>
            </div>
          </div>
        ))}
        {vehicles.length === 0 && <div className="text-center py-10 text-slate-600 text-sm">No vehicles registered yet.</div>}
      </div>
    </div>
  );
}
