"use client";

import { useMemo } from "react";
import type { ReportPayload } from "./MasterReportsPage";

// ─── PreviewTable ───────────────────────────────────────────────────────────
//
// Task 19.6 (v1): renders an in-page preview of the most recent report
// `Payload` returned by Generate / Force_Recalculate. The full PreviewLayout-
// driven version (ColumnSpec types, MergeRanges, FillHex, TotalsRows,
// RemarksColumn) is a v2 enhancement; for v1 we derive structure from the
// payload itself:
//
//   - Column headers  = keys of the first row in `payload.rows`
//   - Row cells       = `String(row[key])` with light heuristics on key names
//                       (`_pct`, `_kg`, `_km`, date-like) for human-readable
//                       formatting
//   - Totals          = if `payload.totals` is present it is appended as a
//                       final row labelled "Total"
//
// Empty / null states match Req 3.6:
//   - `payload === null`         → "Run a report to see its preview here."
//   - `payload.rows` is empty    → "No data for the selected filters."
//                                  (Export controls in <ExportButtons> remain
//                                   enabled per Req 3.6 — that is the sibling
//                                   region's concern, not this component's.)
//
// Styling matches MasterReportsPage.tsx: small slate text, emerald accents,
// rounded borders. Zebra-striped body, sticky header, and a 480px scroll
// viewport keep large result sets navigable without bloating the page.

interface PreviewTableProps {
  payload: ReportPayload | null;
}

// Heuristic value formatter applied per (key, value) pair.
function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  const lowerKey = key.toLowerCase();

  // Percentages: keys ending in `_pct` or exactly `coverage_pct` → 2dp + %
  if (lowerKey.endsWith("_pct") || lowerKey === "coverage_pct") {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n)) return `${n.toFixed(2)}%`;
    return String(value);
  }

  // Weights / distances: keys ending in `_kg` or `_km` → 2dp
  if (lowerKey.endsWith("_kg") || lowerKey.endsWith("_km")) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n)) return n.toFixed(2);
    return String(value);
  }

  // Date-like keys: `date`, `day`, or any `*_at` → render ISO timestamps as
  // YYYY-MM-DD (date-only) or HH:mm (time-only). Anything we can't parse
  // falls through to `String(value)`.
  if (
    lowerKey === "date" ||
    lowerKey === "day" ||
    lowerKey.endsWith("_at") ||
    lowerKey.endsWith("_date") ||
    lowerKey.endsWith("_day")
  ) {
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        const yyyy = parsed.getUTCFullYear();
        const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(parsed.getUTCDate()).padStart(2, "0");
        const hh = String(parsed.getUTCHours()).padStart(2, "0");
        const mi = String(parsed.getUTCMinutes()).padStart(2, "0");
        // If the input looks like a pure date (YYYY-MM-DD) keep date form;
        // otherwise emit YYYY-MM-DD HH:mm.
        const isPureDate =
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
        if (isPureDate) return `${yyyy}-${mm}-${dd}`;
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
      }
    }
    return String(value);
  }

  return String(value);
}

export default function PreviewTable({ payload }: PreviewTableProps) {
  // Compute columns from the first row (v1 layout-from-data approach).
  // useMemo keeps the column derivation stable across re-renders that don't
  // change the row identity.
  const columns = useMemo<string[]>(() => {
    if (!payload || !payload.rows || payload.rows.length === 0) return [];
    const first = payload.rows[0];
    if (first && typeof first === "object") {
      return Object.keys(first as Record<string, unknown>);
    }
    return [];
  }, [payload]);

  // ─── Null payload — nothing has been run yet ─────────────────────────────
  if (payload === null) {
    return (
      <div
        id="master-reports-preview-content"
        className="text-xs text-slate-400"
      >
        Run a report to see its preview here.
      </div>
    );
  }

  const rows = payload.rows ?? [];

  // ─── Empty result set (Req 3.6) ──────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div
        id="master-reports-preview-content"
        role="status"
        className="text-xs text-slate-500 py-6 text-center"
      >
        No data for the selected filters.
      </div>
    );
  }

  // ─── Loaded preview ──────────────────────────────────────────────────────
  return (
    <div
      id="master-reports-preview-content"
      className="rounded-xl border border-theme-border bg-white max-h-[480px] overflow-auto"
    >
      <table className="w-full border-collapse text-xs text-slate-700">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            {columns.map((key) => (
              <th
                key={key}
                scope="col"
                className="text-left font-semibold text-slate-700 uppercase tracking-wider text-[10px] px-3 py-2 border-b border-slate-200 whitespace-nowrap"
              >
                {key.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const record =
              row && typeof row === "object"
                ? (row as Record<string, unknown>)
                : {};
            return (
              <tr
                key={idx}
                className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
              >
                {columns.map((key) => (
                  <td
                    key={key}
                    className="px-3 py-2 border-b border-slate-100 whitespace-nowrap font-medium"
                  >
                    {formatCell(key, record[key])}
                  </td>
                ))}
              </tr>
            );
          })}

          {/* Totals row — appended when payload.totals is present */}
          {payload.totals ? (
            <tr className="bg-emerald-50 font-semibold">
              {columns.map((key, idx) => {
                const totalsValue = (payload.totals as Record<string, unknown>)[
                  key
                ];
                // First column gets the "Total" label if it has no totals
                // value of its own — keeps the row readable without
                // depending on a fragile RemarksColumn convention in v1.
                if (idx === 0 && (totalsValue === undefined || totalsValue === null)) {
                  return (
                    <td
                      key={key}
                      className="px-3 py-2 border-t-2 border-emerald-300 text-emerald-800 whitespace-nowrap"
                    >
                      Total
                    </td>
                  );
                }
                return (
                  <td
                    key={key}
                    className="px-3 py-2 border-t-2 border-emerald-300 text-emerald-800 whitespace-nowrap"
                  >
                    {totalsValue === undefined || totalsValue === null
                      ? ""
                      : formatCell(key, totalsValue)}
                  </td>
                );
              })}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
