"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Household } from "@/components/HouseholdMap";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  Home,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Percent,
  Users,
} from "lucide-react";

const HouseholdMap = dynamic(() => import("@/components/HouseholdMap"), {
  ssr: false,
});

const DEMO_HOUSEHOLDS: Household[] = [
  { id: 1, rfid: "RFID-10001", name: "Rajesh Sharma", mobile: "9829012345", address: "12, Brahampuri, Zorawar Singh Gate", zone: "HMZ", ward: "Ward 10", area: "Zorawar Singh Gate", latitude: 26.9124, longitude: 75.7873, coverage_type: "Auto", last_coverage_time: "2026-06-10T08:30:00Z", survey_date: "2026-06-01" },
  { id: 2, rfid: "RFID-10002", name: "Sunita Verma", mobile: "9829012346", address: "92, Ghat Gate Road", zone: "Mansarovar", ward: "Ward 20", area: "Ghat Gate", latitude: 26.9234, longitude: 75.7981, coverage_type: "Auto", last_coverage_time: "2026-06-10T09:15:00Z", survey_date: "2026-06-02" },
  { id: 3, rfid: "RFID-10003", name: "Amit Gupta", mobile: "9829012347", address: "102, Sector 11 Market", zone: "Sanganer", ward: "Ward 30", area: "Sector 11", latitude: 26.9087, longitude: 75.7765, coverage_type: "Manual", last_coverage_time: "2026-06-09T14:00:00Z", survey_date: "2026-06-03" },
  { id: 4, rfid: "RFID-10004", name: "Priya Chauhan", mobile: "9829012348", address: "157, Sector 2 Extension", zone: "Civil Lines", ward: "Ward 40", area: "Sector 2", latitude: 26.9345, longitude: 75.8099, coverage_type: "Auto", last_coverage_time: "2026-06-10T07:45:00Z", survey_date: "2026-06-04" },
  { id: 5, rfid: "RFID-10005", name: "Vijay Meena", mobile: "9829012349", address: "248, Sanganer Industrial Area", zone: "Vidhyadhar Nagar", ward: "Ward 50", area: "Sanganer Ind Area", latitude: 26.8765, longitude: 75.7654, coverage_type: "Not Covered", last_coverage_time: null, survey_date: "2026-06-05" },
  { id: 6, rfid: "RFID-10006", name: "Kavita Jain", mobile: "9829012350", address: "Shop 12, Brahampuri", zone: "HMZ", ward: "Ward 10", area: "Zorawar Singh Gate", latitude: 26.9155, longitude: 75.7890, coverage_type: "Auto", last_coverage_time: "2026-06-10T10:00:00Z", survey_date: "2026-06-06" },
  { id: 7, rfid: "RFID-10007", name: "Deepak Yadav", mobile: "9829012351", address: "Showroom 2, Ghat Gate Road", zone: "Mansarovar", ward: "Ward 20", area: "Ghat Gate", latitude: 26.9276, longitude: 75.8012, coverage_type: "Manual", last_coverage_time: "2026-06-09T16:30:00Z", survey_date: "2026-06-07" },
  { id: 8, rfid: "RFID-10008", name: "Neha Sharma", mobile: "9829012352", address: "101, Sector 11 Market", zone: "Sanganer", ward: "Ward 30", area: "Sector 11", latitude: 26.9055, longitude: 75.7732, coverage_type: "Not Covered", last_coverage_time: null, survey_date: "2026-06-08" },
  { id: 9, rfid: "RFID-10009", name: "Ravi Kumar", mobile: "9829012353", address: "202, Sector 2 Extension", zone: "Civil Lines", ward: "Ward 40", area: "Sector 2", latitude: 26.9387, longitude: 75.8133, coverage_type: "Auto", last_coverage_time: "2026-06-10T11:20:00Z", survey_date: "2026-06-09" },
  { id: 10, rfid: "RFID-10010", name: "Pooja Verma", mobile: "9829012354", address: "55, Sanganer Industrial Area", zone: "Vidhyadhar Nagar", ward: "Ward 50", area: "Sanganer Ind Area", latitude: 26.8732, longitude: 75.7621, coverage_type: "Manual", last_coverage_time: "2026-06-10T12:00:00Z", survey_date: "2026-06-10" },
];

const COVERAGE_OPTIONS = [
  { value: "All", label: "All Statuses" },
  { value: "Auto", label: "Automatic" },
  { value: "Manual", label: "Manual" },
  { value: "Not Covered", label: "Not Covered" },
];

// ─── Stat Card Component ───────────────────────────────────────────────────────
function StatPill({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-theme-surface border border-theme-border rounded-xl p-2.5 flex items-center gap-3 shadow-sm hover:scale-[1.02] transition duration-200">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}18` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-bold text-theme-text-dim uppercase tracking-wider truncate">
          {label}
        </div>
        <div className="text-sm font-bold mt-0.5" style={{ color }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HouseholdMonitoringPage() {
  const [zone, setZone] = useState("");
  const [ward, setWard] = useState("");
  const [area, setArea] = useState("");
  const [coverage, setCoverage] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return DEMO_HOUSEHOLDS.filter((h) => {
      if (zone && h.zone !== zone) return false;
      if (ward && h.ward !== ward) return false;
      if (area && h.area !== area) return false;
      if (coverage !== "All" && h.coverage_type !== coverage) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !h.rfid.toLowerCase().includes(q) &&
          !h.name.toLowerCase().includes(q) &&
          !h.mobile.includes(q)
        )
          return false;
      }
      return true;
    });
  }, [zone, ward, area, coverage, search]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const auto = filtered.filter((h) => h.coverage_type === "Auto").length;
    const manual = filtered.filter((h) => h.coverage_type === "Manual").length;
    const uncovered = filtered.filter((h) => h.coverage_type === "Not Covered").length;
    const covered = auto + manual;
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    return { total, covered, uncovered, auto, manual, pct };
  }, [filtered]);

  const zoneOptions = useMemo(() => {
    const zones = Array.from(new Set(DEMO_HOUSEHOLDS.map((h) => h.zone)));
    return zones.map((z) => ({ value: z, label: z }));
  }, []);

  const wardOptions = useMemo(() => {
    const base = zone
      ? DEMO_HOUSEHOLDS.filter((h) => h.zone === zone).map((h) => h.ward)
      : DEMO_HOUSEHOLDS.map((h) => h.ward);
    return Array.from(new Set(base)).map((w) => ({ value: w, label: w }));
  }, [zone]);

  const areaOptions = useMemo(() => {
    const base = DEMO_HOUSEHOLDS.filter((h) => {
      if (zone && h.zone !== zone) return false;
      if (ward && h.ward !== ward) return false;
      return true;
    }).map((h) => h.area);
    return Array.from(new Set(base)).map((a) => ({ value: a, label: a }));
  }, [zone, ward]);

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base text-theme-text overflow-hidden font-sans select-none">
      {/* Page Header */}
      <div className="bg-theme-surface border-b border-theme-border px-6 py-4 flex items-center justify-between gap-4 shrink-0 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-theme-text tracking-tight flex items-center gap-2">
            <span className="text-emerald-500">🏘️</span> Household Monitoring
          </h1>
          <div className="h-[3px] w-8 bg-emerald-500 rounded-full mt-1" />
          <p className="text-[11px] text-theme-text-dim mt-1 font-medium">
            Real-time RFID household coverage monitoring — Jaipur
          </p>
        </div>

        {/* Legend */}
        <div className="hidden md:flex items-center gap-4 bg-theme-base border border-theme-border rounded-xl px-4 py-2 shadow-sm">
          {[
            { label: "Automatic", color: "#8B5CF6" },
            { label: "Manual", color: "#14B8A6" },
            { label: "Not Covered", color: "#EF4444" },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full border-2 border-white shadow"
                style={{ background: color, boxShadow: `0 0 0 2px ${color}44` }}
              />
              <span className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wide">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-theme-surface border-b border-theme-border px-6 py-3 flex flex-wrap items-end gap-3 shrink-0">
        {/* Zone */}
        <div className="flex flex-col w-36">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Zone
          </label>
          <SearchableSelect
            value={zone}
            onChange={(v) => { setZone(v); setWard(""); setArea(""); }}
            options={[{ value: "", label: "All Zones" }, ...zoneOptions]}
            placeholder="All Zones"
          />
        </div>

        {/* Ward */}
        <div className="flex flex-col w-36">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Ward
          </label>
          <SearchableSelect
            value={ward}
            onChange={(v) => { setWard(v); setArea(""); }}
            options={[{ value: "", label: "All Wards" }, ...wardOptions]}
            placeholder="All Wards"
            disabled={!zone}
          />
        </div>

        {/* Area */}
        <div className="flex flex-col w-40">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Area
          </label>
          <SearchableSelect
            value={area}
            onChange={setArea}
            options={[{ value: "", label: "All Areas" }, ...areaOptions]}
            placeholder="All Areas"
          />
        </div>

        {/* Coverage Status */}
        <div className="flex flex-col w-40">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Coverage Status
          </label>
          <SearchableSelect
            value={coverage}
            onChange={setCoverage}
            options={COVERAGE_OPTIONS}
            placeholder="All Statuses"
          />
        </div>

        {/* Search */}
        <div className="flex flex-col">
          <label className="text-[10px] font-bold text-theme-text-dim uppercase tracking-wider mb-1.5">
            Search
          </label>
          <input
            type="text"
            placeholder="RFID / Name / Mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-52 px-3 text-xs bg-theme-base border border-theme-border rounded-lg text-theme-text placeholder:text-theme-text-dim/50 outline-none focus:ring-2 focus:ring-emerald-500/30 transition"
          />
        </div>

        {/* Reset */}
        <button
          onClick={() => { setZone(""); setWard(""); setArea(""); setCoverage("All"); setSearch(""); }}
          className="self-end h-9 px-4 text-xs font-bold border border-theme-border bg-theme-base hover:bg-theme-surface-hover text-theme-text-dim rounded-lg transition cursor-pointer"
        >
          ↺ Reset
        </button>
      </div>

      {/* Stats Banner */}
      <div className="bg-theme-surface/50 border-b border-theme-border px-6 py-2.5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
        <StatPill label="Total Households" value={stats.total} color="#6366f1" icon={Users} />
        <StatPill label="Automatic" value={stats.auto} color="#8B5CF6" icon={CheckCircle2} />
        <StatPill label="Manual" value={stats.manual} color="#14B8A6" icon={CheckCircle2} />
        <StatPill label="Not Covered" value={stats.uncovered} color="#EF4444" icon={XCircle} />
        <StatPill label="Coverage %" value={`${stats.pct}%`} color="#06b6d4" icon={Percent} />
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-[300px]">
        {filtered.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-theme-base/80 backdrop-blur-sm">
            <span className="text-4xl">🏚️</span>
            <p className="text-sm font-bold text-theme-text-dim uppercase tracking-wider">
              No households match filters
            </p>
            <button
              onClick={() => { setZone(""); setWard(""); setArea(""); setCoverage("All"); setSearch(""); }}
              className="text-xs font-bold text-emerald-500 underline cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
        <HouseholdMap households={filtered} />
      </div>
    </div>
  );
}
