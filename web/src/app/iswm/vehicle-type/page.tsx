"use client";
import { useEffect, useState } from "react";
import { post, del } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function VehicleTypePage() {
  const { types, loaded, loadAll, addType: storeAddType } = useStore();
  const [newType, setNewType] = useState("");

  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

  const addType = async () => {
    if (!newType) return;
    const res = await post<{ data: any }>("/api/vehicle-types", { name: newType });
    if (res.data) storeAddType(res.data);
    setNewType("");
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-dark)]">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold tracking-tight">🚚 Vehicle Types</h1>
      </div>

      {/* Add Type Form */}
      <section className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3 text-slate-300">Add New Vehicle Type</h2>
        <div className="flex gap-3 max-w-md">
          <input 
            placeholder="e.g. Compactor, Tipper, JCB" 
            value={newType} 
            onChange={(e) => setNewType(e.target.value)}
            className="px-3 py-2 bg-black/20 border border-white/[.06] rounded-lg text-sm text-white outline-none flex-1 focus:border-indigo-500/40 transition-colors" 
          />
          <button 
            onClick={addType} 
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-medium transition-colors whitespace-nowrap"
          >
            + Add Type
          </button>
        </div>
      </section>

      {/* Types List */}
      <section className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-3 text-slate-300">Existing Types</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {types.map((t) => (
            <div 
              key={t.id} 
              className="bg-[var(--bg-surface)] border border-white/[.03] rounded-lg p-3 flex items-center justify-between group hover:border-indigo-500/20 transition-colors"
            >
              <span className="text-sm font-medium text-white">{t.name}</span>
              <span className="text-xs text-slate-600 font-mono">ID: {t.id}</span>
            </div>
          ))}
          {types.length === 0 && (
            <div className="col-span-full text-center py-6 text-slate-600 text-sm">
              No vehicle types registered yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
