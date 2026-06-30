"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  AlertCircle,
  FileText,
  Filter,
  Play,
  Table as TableIcon,
  Download,
  RefreshCw,
} from "lucide-react";
import ReportSelector from "./ReportSelector";
import FilterBar from "./FilterBar";
import ActionRegion from "./ActionRegion";
import PreviewTable from "./PreviewTable";
import ExportButtons from "./ExportButtons";
import NoticeBar from "./NoticeBar";

// ─── Catalog types ──────────────────────────────────────────────────────────
// Mirrors the shape emitted by GET /api/master-reports/catalog
// (internal/api/master_report_handlers.go → GetCatalog).
// Subsequent tasks (19.3–19.7) will move these types into a shared module;
// for the shell they live alongside the component.

export interface FilterControlDef {
  key: string;
  required: boolean;
  default?: unknown;
}

export interface ReportDefinition {
  report_id: string;
  name: string;
  category: string;
  filters: FilterControlDef[];
  permission_key: string;
  scheduled_time?: string;
  display_order?: number;
  description?: string;
}

interface CatalogResponse {
  reports: ReportDefinition[];
  error?: { code: string; message?: string };
}

export interface ReportPayload {
  rows?: unknown[];
  totals?: Record<string, unknown>;
  header?: Record<string, unknown>;
  generated_at?: string;
  input_version?: number;
}

// ─── Component ──────────────────────────────────────────────────────────────
//
// Task 19.2: shell renders the four DOM-id'd regions from design §17 in a
// top-to-bottom vertical stack inside `#master-reports-page-shell-loaded`.
// Each region is a placeholder that subsequent tasks (19.3–19.8) fill with
// real controls. The selector region renders the catalog as basic cards so
// the page works end-to-end while task 19.3 builds out search + grouping.
//
// State model (per task brief):
//   - selectedReportId: which report the user has picked
//   - filters: current per-report filter values (placeholder for task 19.4)
//   - payload: most recent Generate result (filled by task 19.5)
//   - loading: catalog fetch in flight
//   - error: catalog fetch failed
//
// No mock data — if the catalog fetch fails we surface the error inline with a
// retry button. Selected state lives in React only; URL-param sync is task 19.5's
// concern.

export default function MasterReportsPage() {
  const [catalog, setCatalog] = useState<ReportDefinition[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [payload, setPayload] = useState<ReportPayload | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<CatalogResponse>("/api/master-reports/catalog", {
        skipToast: true,
      });
      if (res.error?.code === "no_accessible_reports") {
        setCatalog([]);
      } else {
        setCatalog(res.reports || []);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load report catalog.";
      setError(msg);
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Reset filters and any prior payload when the user picks a different report.
  // Filters bound to keys not declared on the new definition should not survive
  // (Property 3 — FilterSchema Visibility Invariant). The full pruning logic
  // lives in task 19.4's <FilterBar>; here we simply reset.
  const handleSelectReport = useCallback((id: string) => {
    setSelectedReportId(id);
    setFilters({});
    setPayload(null);
  }, []);

  const selectedReport: ReportDefinition | null = useMemo(() => {
    if (!selectedReportId || !catalog) return null;
    return catalog.find((r) => r.report_id === selectedReportId) ?? null;
  }, [selectedReportId, catalog]);

  // ─── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        id="master-reports-page-shell-loading"
        className="flex-1 flex items-center justify-center bg-theme-base"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
          <p className="text-xs font-semibold text-slate-400 animate-pulse">
            Loading Master Reports...
          </p>
        </div>
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        id="master-reports-page-shell-error"
        role="alert"
        className="flex-1 flex items-center justify-center bg-theme-base px-6"
      >
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-black text-slate-800 mb-1">
            Could not load reports
          </h2>
          <p className="text-xs font-medium text-slate-500 mb-4">{error}</p>
          <button
            type="button"
            onClick={loadCatalog}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─── Empty-catalog state ──────────────────────────────────────────────────
  // The backend uses HTTP 200 with `{reports: [], error: {code: "no_accessible_reports"}}`
  // (Req 1.7); we treat that as a permission-denial signal.
  if (catalog && catalog.length === 0) {
    return (
      <div
        id="master-reports-page-shell-empty"
        role="alert"
        className="flex-1 flex items-center justify-center bg-theme-base px-6"
      >
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
            <FileText size={28} className="text-amber-500" />
          </div>
          <h2 className="text-lg font-black text-slate-800 mb-1">
            No accessible reports
          </h2>
          <p className="text-xs font-medium text-slate-500">
            No reports are accessible. Contact your administrator to request
            access to the reports you need.
          </p>
        </div>
      </div>
    );
  }

  // ─── Loaded shell ─────────────────────────────────────────────────────────
  return (
    <div
      id="master-reports-page-shell-loaded"
      className="flex-1 flex flex-col bg-theme-base text-theme-text font-sans overflow-y-auto"
    >
      <div className="px-6 pt-6 pb-3">
        <h1 className="text-xl font-black text-slate-800">
          Master Consolidated Reports
        </h1>
        <p className="text-xs font-medium text-slate-500 mt-1">
          Pick a report, apply filters, preview the result, then export.
        </p>
      </div>

      <div className="flex-1 px-6 pb-6 space-y-4">
        {/* ── Region 0: Viewport notice (only renders on narrow viewports) ── */}
        <NoticeBar />

        {/* ── Region 1: Report selector ── */}
        <section
          id="master-reports-selector"
          aria-labelledby="master-reports-selector-heading"
          className="rounded-2xl border border-theme-border bg-white shadow-sm p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} className="text-emerald-600" />
            <h2
              id="master-reports-selector-heading"
              className="text-sm font-black text-slate-800"
            >
              Report selector
            </h2>
          </div>

          <ReportSelector
            reports={catalog ?? []}
            selectedReportId={selectedReportId}
            onSelect={handleSelectReport}
          />
        </section>

        {/* ── Region 2: Shared filter bar ── */}
        <section
          id="master-reports-filter-bar"
          aria-labelledby="master-reports-filter-bar-heading"
          className="rounded-2xl border border-theme-border bg-white shadow-sm p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Filter size={16} className="text-emerald-600" />
            <h2
              id="master-reports-filter-bar-heading"
              className="text-sm font-black text-slate-800"
            >
              Filters
            </h2>
          </div>
          <FilterBar
            report={selectedReport}
            values={filters}
            onChange={setFilters}
          />
        </section>

        {/* ── Region 3: Action region — Generate / Force Recalculate ── */}
        <section
          id="master-reports-action-region"
          aria-labelledby="master-reports-action-region-heading"
          className="rounded-2xl border border-theme-border bg-white shadow-sm p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Play size={16} className="text-emerald-600" />
            <h2
              id="master-reports-action-region-heading"
              className="text-sm font-black text-slate-800"
            >
              Actions
            </h2>
          </div>
          <ActionRegion
            report={selectedReport}
            filters={filters}
            onPayload={setPayload}
            // canForceRecalculate is hardcoded to false for v1.
            // Permission-based gating (Req 7.5 / task 7.5) is a follow-up
            // that will resolve this from the user's role permissions.
            canForceRecalculate={false}
          />
        </section>

        {/* ── Region 4: In-page preview table ── */}
        <section
          id="master-reports-preview"
          aria-labelledby="master-reports-preview-heading"
          className="rounded-2xl border border-theme-border bg-white shadow-sm p-4 min-h-[200px]"
        >
          <div className="flex items-center gap-2 mb-3">
            <TableIcon size={16} className="text-emerald-600" />
            <h2
              id="master-reports-preview-heading"
              className="text-sm font-black text-slate-800"
            >
              Preview
            </h2>
          </div>
          <PreviewTable payload={payload} />
        </section>

        {/* ── Region 5: Export buttons ── */}
        <section
          id="master-reports-export"
          aria-labelledby="master-reports-export-heading"
          className="rounded-2xl border border-theme-border bg-white shadow-sm p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Download size={16} className="text-emerald-600" />
            <h2
              id="master-reports-export-heading"
              className="text-sm font-black text-slate-800"
            >
              Export
            </h2>
          </div>
          <ExportButtons
            report={selectedReport}
            filters={filters}
            payloadReady={payload !== null}
          />
        </section>

        {/* ── Region 6: Viewport notice handled at the top by <NoticeBar /> ── */}
      </div>
    </div>
  );
}
