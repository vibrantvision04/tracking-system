"use client";

import { useCallback, useState } from "react";
import { Download, FileText } from "lucide-react";
import { API_URL, getStoredAccessToken } from "@/lib/api";
import type { ReportDefinition } from "./MasterReportsPage";

// ─── Public props ──────────────────────────────────────────────────────────
//
// Task 19.7: `<ExportButtons>` is the export region inside the preview card.
// Both controls are disabled until a report is selected AND a successful
// Generate has produced a payload (`payloadReady === true`). The host page
// (MasterReportsPage) owns those flags — this component is purely a leaf
// view + a fetch helper.

export interface ExportButtonsProps {
  report: ReportDefinition | null;
  filters: Record<string, unknown>;
  payloadReady: boolean;
}

// ─── Filter-value → query-string encoder ───────────────────────────────────
//
// The backend's `queryToRawFilters` (internal/api/master_report_handlers.go)
// reads each declared FilterKey from `r.URL.Query()` and accepts:
//
//   - single-value strings/numbers as-is
//   - date_range as either two repeated `?date_range=...&date_range=...`
//     params OR a single comma-separated string
//   - dates parsed as YYYY-MM-DD, RFC3339, or RFC3339Nano
//
// We emit YYYY-MM-DD for any Date object or ISO-looking string so the
// backend's preferred shortest format is used, and we serialise date_range
// as two repeated keys (matching the `if len(vals) >= 2` branch).

function toYMD(value: Date | string): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Strings — keep YYYY-MM-DD as-is, slice ISO strings down to the date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return toYMD(parsed);
  }
  return value;
}

function looksLikeDateString(v: string): boolean {
  // YYYY-MM-DD or ISO8601 with a 'T' separator (RFC3339 family).
  return /^\d{4}-\d{2}-\d{2}(T|$)/.test(v);
}

function appendFilterParam(
  params: URLSearchParams,
  key: string,
  value: unknown,
): void {
  if (value === null || value === undefined) return;

  // date_range: array of two dates → two repeated keys.
  if (Array.isArray(value)) {
    if (key === "date_range" && value.length === 2) {
      const [start, end] = value as Array<Date | string>;
      if (start !== null && start !== undefined && start !== "") {
        params.append(key, toYMD(start));
      }
      if (end !== null && end !== undefined && end !== "") {
        params.append(key, toYMD(end));
      }
      return;
    }
    // Non-date_range arrays: comma-join (covers []int/[]string lists).
    const joined = value
      .filter((v) => v !== null && v !== undefined && v !== "")
      .map((v) => String(v))
      .join(",");
    if (joined.length > 0) params.append(key, joined);
    return;
  }

  if (value instanceof Date) {
    params.append(key, toYMD(value));
    return;
  }

  if (typeof value === "string") {
    if (value === "") return;
    if (looksLikeDateString(value)) {
      params.append(key, toYMD(value));
    } else {
      params.append(key, value);
    }
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    params.append(key, String(value));
    return;
  }

  if (typeof value === "boolean") {
    params.append(key, value ? "true" : "false");
    return;
  }

  // Fall back to JSON for anything else so the backend at least sees
  // something parseable; in practice all current FilterKey shapes are
  // covered by the branches above.
  params.append(key, JSON.stringify(value));
}

function buildExportUrl(
  reportId: string,
  ext: "xlsx" | "pdf",
  filters: Record<string, unknown>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    appendFilterParam(params, key, value);
  }
  const qs = params.toString();
  const base = `${API_URL}/api/master-reports/${encodeURIComponent(
    reportId,
  )}/export.${ext}`;
  return qs.length > 0 ? `${base}?${qs}` : base;
}

// ─── Blob download helper ──────────────────────────────────────────────────
//
// The export endpoints sit behind the bearer-token auth middleware, so a
// naive `window.location.href = url` won't work — the browser won't attach
// the Authorization header. We mirror the pattern already used by
// web/src/app/ultimate-reports/daily/page.tsx (fetch + blob + anchor), but
// read the token from the canonical key via `getStoredAccessToken()` rather
// than the legacy `"token"` localStorage key.

async function downloadAsBlob(url: string, filename: string): Promise<void> {
  const token = getStoredAccessToken() || "";
  const res = await fetch(url, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error?.message) detail = body.error.message;
      else if (body?.error) detail = String(body.error);
    } catch {
      /* non-JSON body — keep status text */
    }
    throw new Error(detail);
  }
  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(objectUrl);
  a.remove();
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function ExportButtons({
  report,
  filters,
  payloadReady,
}: ExportButtonsProps) {
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = report === null || payloadReady === false;

  const handleExport = useCallback(
    async (ext: "xlsx" | "pdf") => {
      if (!report) return;
      const url = buildExportUrl(report.report_id, ext, filters);
      const today = new Date();
      const ymd = `${today.getFullYear()}-${String(
        today.getMonth() + 1,
      ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const filename = `${report.report_id}_${ymd}.${ext}`;
      setBusy(ext === "xlsx" ? "excel" : "pdf");
      setError(null);
      try {
        await downloadAsBlob(url, filename);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Export failed.";
        setError(msg);
      } finally {
        setBusy(null);
      }
    },
    [report, filters],
  );

  return (
    <div id="master-reports-export-content" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleExport("xlsx")}
          disabled={disabled || busy !== null}
          aria-label="Export to Excel"
          className={[
            "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
            disabled || busy !== null
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-700 text-white",
          ].join(" ")}
        >
          <Download size={14} />
          {busy === "excel" ? "Exporting…" : "Export to Excel"}
        </button>

        <button
          type="button"
          onClick={() => handleExport("pdf")}
          disabled={disabled || busy !== null}
          aria-label="Export to PDF"
          className={[
            "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
            disabled || busy !== null
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-slate-800 hover:bg-slate-900 text-white",
          ].join(" ")}
        >
          <FileText size={14} />
          {busy === "pdf" ? "Exporting…" : "Export to PDF"}
        </button>

        {disabled ? (
          <span className="text-[11px] font-medium text-slate-400">
            {report === null
              ? "Select a report to enable exports."
              : "Generate the report first to enable exports."}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-[11px] font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
