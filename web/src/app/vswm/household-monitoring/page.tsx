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

// ─── Demo Data ── 12 realistic Jaipur households ──────────────────────────────
const DEMO_HOUSEHOLDS: Household[] = [
  {
    id: 1,
    rfid: "RFID-TN-001",
    name: "Ramesh Kumar",
    mobile: "9876543210",
    address: "H-12, Transport Nagar, Jaipur",
    zone: "Zone A",
    ward: "Ward 12",
    area: "Transport Nagar",
    latitude: 26.9355,
    longitude: 75.7618,
    coverage_type: "Auto",
    last_coverage_time: "2026-06-24T06:30:00Z",
    survey_date: "2026-05-10",
  },
  {
    id: 2,
    rfid: "RFID-TN-002",
    name: "Sunita Sharma",
    mobile: "9812345678",
    address: "B-4, Transport Nagar, Jaipur",
    zone: "Zone A",
    ward: "Ward 12",
    area: "Transport Nagar",
    latitude: 26.9367,
    longitude: 75.7632,
    coverage_type: "Auto",
    last_coverage_time: "2026-06-24T06:45:00Z",
    survey_date: "2026-05-10",
  },
  {
    id: 3,
    rfid: "RFID-TN-003",
    name: "Mohan Lal",
    mobile: "9887654321",
    address: "C-9, Transport Nagar, Jaipur",
    zone: "Zone A",
    ward: "Ward 12",
    area: "Transport Nagar",
    latitude: 26.9342,
    longitude: 75.7645,
    coverage_type: "Not Covered",
    last_coverage_time: null,
    survey_date: "2026-05-11",
  },
  {
    id: 4,
    rfid: "RFID-JN-004",
    name: "Priya Gupta",
    mobile: "9865432109",
    address: "Plot 17, Jawahar Nagar, Jaipur",
    zone: "Zone B",
    ward: "Ward 22",
    area: "Jawahar Nagar",
    latitude: 26.9288,
    longitude: 75.8001,
    coverage_type: "Manual",
    last_coverage_time: "2026-06-24T07:00:00Z",
    survey_date: "2026-05-12",
  },
  {
    id: 5,
    rfid: "RFID-JN-005",
    name: "Vijay Singh",
    mobile: "9754321098",
    address: "A-22, Jawahar Nagar, Jaipur",
    zone: "Zone B",
    ward: "Ward 22",
    area: "Jawahar Nagar",
    latitude: 26.9302,
    longitude: 75.8015,
    coverage_type: "Manual",
    last_coverage_time: "2026-06-24T07:15:00Z",
    survey_date: "2026-05-12",
  },
  {
    id: 6,
    rfid: "RFID-JN-006",
    name: "Kavita Meena",
    mobile: "9643210987",
    address: "D-5, Jawahar Nagar, Jaipur",
    zone: "Zone B",
    ward: "Ward 22",
    area: "Jawahar Nagar",
    latitude: 26.9275,
    longitude: 75.7988,
    coverage_type: "Not Covered",
    last_coverage_time: null,
    survey_date: "2026-05-13",
  },
  {
    id: 7,
    rfid: "RFID-MN-007",
    name: "Anil Verma",
    mobile: "9532109876",
    address: "F-8, Malviya Nagar, Jaipur",
    zone: "Zone C",
    ward: "Ward 34",
    area: "Malviya Nagar",
    latitude: 26.8553,
    longitude: 75.8066,
    coverage_type: "Auto",
    last_coverage_time: "2026-06-24T07:30:00Z",
    survey_date: "2026-05-14",
  },
  {
    id: 8,
    rfid: "RFID-MN-008",
    name: "Rekha Bhatia",
    mobile: "9421098765",
    address: "G-15, Malviya Nagar, Jaipur",
    zone: "Zone C",
    ward: "Ward 34",
    area: "Malviya Nagar",
    latitude: 26.8569,
    longitude: 75.8081,
    coverage_type: "Auto",
    last_coverage_time: "2026-06-24T07:45:00Z",
    survey_date: "2026-05-14",
  },
  {
    id: 9,
    rfid: "RFID-JP-009",
    name: "Deepak Yadav",
    mobile: "9310987654",
    address: "H-3, Jagatpura, Jaipur",
    zone: "Zone D",
    ward: "Ward 45",
    area: "Jagatpura",
    latitude: 26.8266,
    longitude: 75.8341,
    coverage_type: "Not Covered",
    last_coverage_time: null,
    survey_date: "2026-05-15",
  },
  {
    id: 10,
    rfid: "RFID-JP-010",
    name: "Suman Joshi",
    mobile: "9209876543",
    address: "K-7, Jagatpura, Jaipur",
    zone: "Zone D",
    ward: "Ward 45",
    area: "Jagatpura",
    latitude: 26.8251,
    longitude: 75.8358,
    coverage_type: "Manual",
    last_coverage_time: "2026-06-24T08:00:00Z",
    survey_date: "2026-05-15",
  },
  {
    id: 11,
    rfid: "RFID-SG-011",
    name: "Ashok Rawat",
    mobile: "9198765432",
    address: "L-20, Sanganer, Jaipur",
    zone: "Zone E",
    ward: "Ward 55",
    area: "Sanganer",
    latitude: 26.7974,
    longitude: 75.7986,
    coverage_type: "Auto",
    last_coverage_time: "2026-06-24T08:15:00Z",
    survey_date: "2026-05-16",
  },
  {
    id: 12,
    rfid: "RFID-AR-012",
    name: "Geeta Kumari",
    mobile: "9087654321",
    address: "P-11, Agra Road, Jaipur",
    zone: "Zone A",
    ward: "Ward 12",
    area: "Agra Road",
    latitude: 26.9189,
    longitude: 75.8523,
    coverage_type: "Manual",
    last_coverage_time: "2026-06-24T08:30:00Z",
    survey_date: "2026-05-17",
  },
];

// ─── Build unique filter options ───────────────────────────────────────────────
const ALL_ZONES = Array.from(new Set(DEMO_HOUSEHOLDS.map((h) => h.zone))).map((z) => ({
  value: z,
  label: z,
}));
const ALL_WARDS = Array.from(new Set(DEMO_HOUSEHOLDS.map((h) => h.ward))).map((w) => ({
  value: w,
  label: w,
}));
const ALL_AREAS = Array.from(new Set(DEMO_HOUSEHOLDS.map((h) => h.area))).map((a) => ({
  value: a,
  label: a,
}));

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
            options={[{ value: "", label: "All Zones" }, ...ALL_ZONES]}
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
      <div className="flex-1 relative min-h-0">
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
