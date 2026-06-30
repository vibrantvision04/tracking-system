"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ReportDefinition } from "./MasterReportsPage";

// ─── Task 19.3 — <ReportSelector> ──────────────────────────────────────────
//
// Renders the catalog grouped by category, with a case-insensitive substring
// search box that filters on `report.name`. The currently selected report is
// preserved across keystrokes (Req 14.3) — filtering only narrows what's
// *visible*, never what's *selected*. When the filter excludes every report,
// the component shows the empty-state message required by task 19.3.
//
// Categories render in a fixed order defined by design.md §3.1 so the UI is
// stable regardless of catalog iteration order. Categories with zero matching
// reports are skipped entirely; the empty-state message fires only when the
// total match count across all categories is zero.

// Fixed category order (design.md §3.1). Reports tagged with a category not
// in this list still render, under their raw key, at the bottom — this is a
// safety net for forward-compatible catalog additions.
const CATEGORY_ORDER: readonly string[] = [
  "road_sweeping",
  "open_depot",
  "attendance",
  "zone_coverage",
  "rfid",
  "weighbridge",
  "deployment",
  "active_vehicle",
  "alerts",
  "consolidated",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  road_sweeping: "Road Sweeping",
  open_depot: "Open Depot",
  attendance: "Attendance",
  zone_coverage: "Zone Coverage",
  rfid: "RFID",
  weighbridge: "Weighbridge",
  deployment: "Deployment",
  active_vehicle: "Active Vehicle",
  alerts: "Alerts",
  consolidated: "Consolidated",
};

function humanizeCategory(key: string): string {
  return (
    CATEGORY_LABELS[key] ??
    key
      .split("_")
      .map((s) => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)))
      .join(" ")
  );
}

export interface ReportSelectorProps {
  reports: ReportDefinition[];
  selectedReportId: string | null;
  onSelect: (id: string) => void;
}

export default function ReportSelector({
  reports,
  selectedReportId,
  onSelect,
}: ReportSelectorProps) {
  const [query, setQuery] = useState<string>("");

  // Case-insensitive substring match on `report.name`. The trimmed query is
  // used so a search box full of whitespace doesn't hide the entire catalog.
  const filtered = useMemo<ReportDefinition[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return reports;
    return reports.filter((r) => r.name.toLowerCase().includes(q));
  }, [reports, query]);

  // Bucket filtered reports by category, preserving design.md §3.1 ordering.
  // Categories outside the known list land in a trailing "other" bucket so
  // unknown categories from a future catalog still render.
  const groups = useMemo<Array<{ category: string; reports: ReportDefinition[] }>>(() => {
    const buckets = new Map<string, ReportDefinition[]>();
    for (const r of filtered) {
      const list = buckets.get(r.category) ?? [];
      list.push(r);
      buckets.set(r.category, list);
    }
    const ordered: Array<{ category: string; reports: ReportDefinition[] }> = [];
    for (const cat of CATEGORY_ORDER) {
      const list = buckets.get(cat);
      if (list && list.length > 0) {
        ordered.push({ category: cat, reports: list });
        buckets.delete(cat);
      }
    }
    // Append any leftover categories (defensive — design.md fixes the list,
    // but a future catalog row with a new category shouldn't disappear).
    for (const [cat, list] of buckets) {
      if (list.length > 0) ordered.push({ category: cat, reports: list });
    }
    return ordered;
  }, [filtered]);

  const hasMatches = filtered.length > 0;

  return (
    <div id="master-reports-selector-content">
      {/* ── Search box ──────────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reports by name..."
          aria-label="Search reports"
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
        />
      </div>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {hasMatches ? (
        <div className="space-y-4">
          {groups.map(({ category, reports: catReports }) => (
            <section key={category} aria-labelledby={`mcr-cat-${category}`}>
              <h3
                id={`mcr-cat-${category}`}
                className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2"
              >
                {humanizeCategory(category)}
              </h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {catReports.map((r) => {
                  const isSelected = r.report_id === selectedReportId;
                  return (
                    <li key={r.report_id}>
                      <button
                        type="button"
                        onClick={() => onSelect(r.report_id)}
                        aria-pressed={isSelected}
                        className={[
                          "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                          isSelected
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40",
                        ].join(" ")}
                      >
                        <div className="text-xs font-semibold text-slate-800 truncate">
                          {r.name}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p
          role="status"
          className="text-xs font-medium text-slate-500 py-6 text-center"
        >
          No reports match your search.
        </p>
      )}
    </div>
  );
}
