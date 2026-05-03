"use client";
import { useState } from "react";

export default function ZonesPage() {
  const zones = [
    { id: 177, name: "Hawa Mahal-Aamer Zone", code: "1", vehicles: 248, wards: 28 },
    { id: 178, name: "Civil Lines Zone", code: "2", vehicles: 215, wards: 25 },
    { id: 179, name: "Kishanpole Zone", code: "3", vehicles: 198, wards: 24 },
    { id: 180, name: "Adarsh Nagar Zone", code: "4", vehicles: 230, wards: 26 },
    { id: 441, name: "Garage Vehicles", code: "G", vehicles: 12, wards: 0 },
  ];

  const wards: Record<number, { name: string; vehicles: number }[]> = {
    177: [
      { name: "Ward 1 - Hawa Mahal", vehicles: 12 }, { name: "Ward 2 - Amber Fort", vehicles: 9 },
      { name: "Ward 3 - Nahargarh", vehicles: 11 }, { name: "Ward 4 - Jal Mahal", vehicles: 8 },
      { name: "Ward 5 - Amer Road", vehicles: 10 }, { name: "Ward 6 - Brahampuri", vehicles: 7 },
      { name: "Ward 7 - Purani Basti", vehicles: 13 }, { name: "Ward 8 - Moti Doongri", vehicles: 9 },
    ],
    178: [
      { name: "Ward 1 - MI Road", vehicles: 14 }, { name: "Ward 2 - C-Scheme", vehicles: 11 },
      { name: "Ward 3 - Ashok Nagar", vehicles: 8 }, { name: "Ward 4 - Tilak Nagar", vehicles: 10 },
      { name: "Ward 5 - Bani Park", vehicles: 9 }, { name: "Ward 6 - Raja Park", vehicles: 12 },
    ],
    179: [
      { name: "Ward 1 - Kishanpole Bazar", vehicles: 10 }, { name: "Ward 2 - Chandpole", vehicles: 8 },
      { name: "Ward 3 - Gangapole", vehicles: 9 }, { name: "Ward 4 - Topkhana", vehicles: 7 },
      { name: "Ward 5 - Johari Bazar", vehicles: 11 }, { name: "Ward 6 - Bapu Bazar", vehicles: 6 },
    ],
    180: [
      { name: "Ward 1 - Adarsh Nagar", vehicles: 11 }, { name: "Ward 2 - Shastri Nagar", vehicles: 9 },
      { name: "Ward 3 - Jhotwara", vehicles: 10 }, { name: "Ward 4 - Vidyadhar Nagar", vehicles: 8 },
      { name: "Ward 5 - Murlipura", vehicles: 12 },
    ],
  };

  const [activeZone, setActiveZone] = useState<number | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-dark)]">
      <h1 className="text-lg font-bold mb-6 tracking-tight">🏛️ Jaipur Heritage — Region Hierarchy</h1>

      {/* City Card */}
      <div className="bg-gradient-to-r from-indigo-500/[.08] to-violet-500/[.06] border border-indigo-500/20 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-indigo-500/20">🏛️</div>
          <div>
            <h2 className="text-lg font-bold">Jaipur Heritage (NNJ-H)</h2>
            <p className="text-sm text-slate-400">City ID: 176 • Level 1</p>
          </div>
        </div>
        <div className="flex gap-8">
          <div className="text-center"><div className="text-2xl font-bold text-indigo-400">5</div><div className="text-[10px] text-slate-500 uppercase tracking-wider">Zones</div></div>
          <div className="text-center"><div className="text-2xl font-bold text-indigo-400">100+</div><div className="text-[10px] text-slate-500 uppercase tracking-wider">Wards</div></div>
          <div className="text-center"><div className="text-2xl font-bold text-indigo-400">900+</div><div className="text-[10px] text-slate-500 uppercase tracking-wider">Vehicles</div></div>
        </div>
      </div>

      {/* Zone Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {zones.map((z) => (
          <div
            key={z.id}
            onClick={() => setActiveZone(activeZone === z.id ? null : z.id)}
            className={`bg-[var(--bg-card)] border rounded-xl p-5 cursor-pointer transition-all duration-200
              ${activeZone === z.id ? "border-indigo-500/40 bg-indigo-500/[.06] -translate-y-0.5 shadow-lg shadow-indigo-500/10" : "border-white/[.05] hover:border-white/10 hover:-translate-y-0.5"}`}
          >
            <h3 className="text-sm font-semibold mb-3">{z.name}</h3>
            <div className="flex gap-4 text-xs text-slate-500">
              <span>🚛 <b className="text-white">{z.vehicles}</b> Vehicles</span>
              <span>🗺️ <b className="text-white">{z.wards}</b> Wards</span>
              <span>Code <b className="text-white">{z.code}</b></span>
            </div>
          </div>
        ))}
      </div>

      {/* Ward Grid */}
      {activeZone && wards[activeZone] && (
        <div className="animate-in fade-in duration-200">
          <h3 className="text-sm font-semibold mb-3 text-slate-300">
            {zones.find((z) => z.id === activeZone)?.name} — {wards[activeZone].length} Wards
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {wards[activeZone].map((w, i) => (
              <div key={i} className="bg-[var(--bg-card)] border border-white/[.05] rounded-xl px-4 py-3 flex justify-between items-center hover:border-cyan-500/20 transition">
                <span className="text-sm">{w.name}</span>
                <span className="text-[11px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full font-semibold">{w.vehicles}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
