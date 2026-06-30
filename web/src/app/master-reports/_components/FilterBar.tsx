"use client";

import { useEffect } from "react";
import { Calendar } from "lucide-react";
import type {
  FilterControlDef,
  ReportDefinition,
} from "./MasterReportsPage";

// ─── Task 19.4: <FilterBar> ─────────────────────────────────────────────────
//
// Renders exactly the filter controls declared in the selected
// ReportDefinition's `filters` field. No superset, no subset — this is the
// frontend half of Property 3 (FilterSchema Visibility Invariant). When the
// selected report changes, any value bound to a key not present in the new
// schema is discarded via `onChange` (Req 2.7).
//
// Control mapping per design §3.1:
//   date              → single HTML date input (YYYY-MM-DD)
//   date_range        → two date inputs labeled Start / End ([start,end] tuple)
//   zone, ward, shift, route, route_type, department,
//   designation, employee, vehicle  → free-text input (v1; dropdowns wired later)
//
// Required filters are marked with a red asterisk.

export interface FilterBarProps {
  report: ReportDefinition | null;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

// Keys that render as a plain text input in v1. Dropdowns backed by the
// zones/wards/routes/departments/designations/employees APIs land in a
// follow-up; the component shape stays the same.
const TEXT_KEYS: ReadonlySet<string> = new Set([
  "zone",
  "ward",
  "shift",
  "route",
  "route_type",
  "department",
  "designation",
  "employee",
  "vehicle",
]);

const INPUT_CLASS =
  "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition";

function humanizeKey(key: string): string {
  // "route_type" → "Route Type", "date_range" → "Date Range"
  return key
    .split("_")
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

function FieldLabel({
  label,
  required,
  icon,
}: {
  label: string;
  required: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
      {icon}
      {label}
      {required && (
        <>
          <span aria-hidden="true" className="text-red-500">
            *
          </span>
          <span className="sr-only">(required)</span>
        </>
      )}
    </span>
  );
}

function FilterField({
  field,
  value,
  onChange,
}: {
  field: FilterControlDef;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const label = humanizeKey(field.key);

  // ── date ────────────────────────────────────────────────────────────────
  if (field.key === "date") {
    const current = typeof value === "string" ? value : "";
    return (
      <label className="flex flex-col" data-filter-key={field.key}>
        <FieldLabel
          label={label}
          required={field.required}
          icon={<Calendar size={11} className="text-emerald-600" />}
        />
        <input
          type="date"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={INPUT_CLASS}
        />
      </label>
    );
  }

  // ── date_range ──────────────────────────────────────────────────────────
  if (field.key === "date_range") {
    const tuple = Array.isArray(value) ? (value as unknown[]) : [];
    const start = typeof tuple[0] === "string" ? (tuple[0] as string) : "";
    const end = typeof tuple[1] === "string" ? (tuple[1] as string) : "";
    return (
      <div className="flex flex-col" data-filter-key={field.key}>
        <FieldLabel
          label={label}
          required={field.required}
          icon={<Calendar size={11} className="text-emerald-600" />}
        />
        <div className="flex gap-2">
          <label className="flex-1 flex flex-col">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Start
            </span>
            <input
              type="date"
              aria-label={`${label} start`}
              value={start}
              onChange={(e) => onChange([e.target.value, end])}
              required={field.required}
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex-1 flex flex-col">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              End
            </span>
            <input
              type="date"
              aria-label={`${label} end`}
              value={end}
              onChange={(e) => onChange([start, e.target.value])}
              required={field.required}
              className={INPUT_CLASS}
            />
          </label>
        </div>
      </div>
    );
  }

  // ── text-input keys ─────────────────────────────────────────────────────
  if (TEXT_KEYS.has(field.key)) {
    const current = typeof value === "string" ? value : "";
    const placeholder =
      field.key === "vehicle"
        ? "Vehicle ID"
        : field.key === "employee"
          ? "Employee ID"
          : `Enter ${label.toLowerCase()}`;
    return (
      <label className="flex flex-col" data-filter-key={field.key}>
        <FieldLabel label={label} required={field.required} />
        <input
          type="text"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={placeholder}
          className={INPUT_CLASS}
        />
      </label>
    );
  }

  // Unknown / unsupported FilterKey — render nothing so the visibility
  // invariant (only schema-declared keys appear) still holds.
  return null;
}

export default function FilterBar({ report, values, onChange }: FilterBarProps) {
  // Prune values when the report changes so keys not declared in the new
  // schema are discarded (Req 2.7, Property 3). Also clear stale values when
  // the selection is cleared. The effect re-runs on every render but only
  // calls `onChange` when pruning is actually required, so it does not loop.
  useEffect(() => {
    if (!report) {
      if (Object.keys(values).length > 0) {
        onChange({});
      }
      return;
    }
    const allowed = new Set(report.filters.map((fc) => fc.key));
    const valueKeys = Object.keys(values);
    const hasStale = valueKeys.some((k) => !allowed.has(k));
    if (!hasStale) return;
    const pruned: Record<string, unknown> = {};
    for (const k of valueKeys) {
      if (allowed.has(k)) pruned[k] = values[k];
    }
    onChange(pruned);
  }, [report, values, onChange]);

  if (!report) {
    return (
      <div
        id="master-reports-filter-bar-content"
        className="text-xs font-medium text-slate-400"
      >
        Select a report to see its filters.
      </div>
    );
  }

  if (report.filters.length === 0) {
    return (
      <div
        id="master-reports-filter-bar-content"
        className="text-xs font-medium text-slate-400"
      >
        This report has no filters.
      </div>
    );
  }

  const setValue = (key: string, next: unknown) => {
    onChange({ ...values, [key]: next });
  };

  return (
    <div
      id="master-reports-filter-bar-content"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {report.filters.map((fc) => (
        <FilterField
          key={fc.key}
          field={fc}
          value={values[fc.key]}
          onChange={(next) => setValue(fc.key, next)}
        />
      ))}
    </div>
  );
}
