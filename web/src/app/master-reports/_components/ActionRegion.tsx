"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Play, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { ReportDefinition, ReportPayload } from "./MasterReportsPage";

// ─── Server response shapes ─────────────────────────────────────────────────
// Mirrors internal/api/master_report_handlers.go (task 15.1):
//   • 200 sync   → { report_id, filter_hash, operational_date, path, payload, computed_at }
//   • 202 async  → { job_id, status, report_id, filter_hash }
//   • error      → { error: { code, message, stage? } }
// The shared `api` helper throws on non-2xx, so both 200 and 202 arrive in the
// success path. The presence of `job_id` vs `payload` discriminates the two.

interface GenerateSyncResponse {
  report_id?: string;
  filter_hash?: string;
  operational_date?: string;
  path?: string;
  payload?: ReportPayload;
  computed_at?: string;
  job_id?: string;
  error?: { code?: string; message?: string };
}

interface GenerateAsyncResponse {
  job_id?: string;
  status?: string;
  report_id?: string;
  filter_hash?: string;
  payload?: ReportPayload;
  error?: { code?: string; message?: string };
}

type GenerateResponse = GenerateSyncResponse & GenerateAsyncResponse;

interface JobPollResponse {
  id?: string;
  status?: "pending" | "running" | "done" | "error";
  submitted_at?: string;
  started_at?: string;
  completed_at?: string;
  payload?: ReportPayload;
  error_reason?: string;
  error?: { code?: string; message?: string };
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ActionRegionProps {
  report: ReportDefinition | null;
  filters: Record<string, unknown>;
  onPayload: (payload: ReportPayload) => void;
  canForceRecalculate: boolean;
}

type DispatchKind = "generate" | "recalculate";

// ─── Component ──────────────────────────────────────────────────────────────
//
// Task 19.5 — Generate + Force Recalculate dispatcher with async job polling.
//
// Flow:
//   1. User clicks Generate → POST /generate with {filters}.
//   2. If response has `payload` (HTTP 200), surface to parent immediately.
//   3. If response has `job_id` (HTTP 202), start polling every 2s until
//      status is `done` (payload available) or `error` (surface error_reason).
//   4. Force Recalculate follows the same flow against /recalculate, behind
//      a confirm() dialog that names the report and the resolved date.
//
// During any in-flight Generate or Recalculate, both buttons are disabled to
// prevent double-fire. The polling interval is cleared on unmount, on report
// change, and when a terminal status is observed.
export default function ActionRegion({
  report,
  filters,
  onPayload,
  canForceRecalculate,
}: ActionRegionProps) {
  const [inFlight, setInFlight] = useState<DispatchKind | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // The polling timer ref. We track it imperatively rather than via state so
  // we can clear it from the cleanup function of the effect that owns it
  // without forcing an extra render.
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mounted guard — keeps stray late responses from updating state after
  // unmount or after the user has navigated to a different report.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Stop polling helper.
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Reset all in-flight state when the selected report changes so a stale
  // job from a previous report cannot complete into the new context.
  useEffect(() => {
    stopPolling();
    setInFlight(null);
    setStatusText("");
    setError(null);
    setJobId(null);
  }, [report?.report_id, stopPolling]);

  // Clean up the timer on unmount.
  useEffect(() => stopPolling, [stopPolling]);

  // ─── Error extraction ────────────────────────────────────────────────────
  // The `api` helper throws an Error whose message is either the server's
  // `error` string field (legacy envelope) or "API Error: <status> <text>".
  // For the master-reports endpoints the server returns
  // `{ "error": { "code": "...", "message": "..." } }`, but `api` only reads
  // the top-level `error` string, so we surface the message text and a best-
  // effort code parsed from any structured suffix the caller injected.
  const formatError = useCallback((e: unknown, fallback: string): { code?: string; message: string } => {
    if (e instanceof Error) {
      return { message: e.message || fallback };
    }
    if (typeof e === "string") return { message: e };
    return { message: fallback };
  }, []);

  // ─── Polling driver ──────────────────────────────────────────────────────
  //
  // Starts a 2s interval that polls GET /api/master-reports/jobs/{job_id}.
  // Resolves to terminal state by:
  //   • status === "done"  → onPayload(payload), clear in-flight
  //   • status === "error" → set error from error_reason, clear in-flight
  //   • 404 / network      → set error, clear in-flight
  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      setJobId(id);
      setStatusText("Polling job…");

      const tick = async () => {
        try {
          const res = await api<JobPollResponse>(
            `/api/master-reports/jobs/${encodeURIComponent(id)}`,
            { skipToast: true },
          );
          if (!mountedRef.current) return;
          if (res.status === "done") {
            stopPolling();
            if (res.payload) {
              onPayload(res.payload);
            }
            setInFlight(null);
            setStatusText("");
            setJobId(null);
            setError(null);
            return;
          }
          if (res.status === "error") {
            stopPolling();
            setInFlight(null);
            setStatusText("");
            setJobId(null);
            setError({
              code: "job_error",
              message: res.error_reason || res.error?.message || "Job failed.",
            });
            return;
          }
          // Still pending/running — refresh the status hint and keep polling.
          setStatusText(
            res.status === "running" ? "Job running…" : "Job queued…",
          );
        } catch (e) {
          if (!mountedRef.current) return;
          stopPolling();
          setInFlight(null);
          setStatusText("");
          setJobId(null);
          setError(formatError(e, "Failed to poll job status."));
        }
      };

      // Kick off the first poll immediately so the user sees the running state
      // without waiting a full 2s for the first tick. Subsequent polls run on
      // the interval.
      void tick();
      pollTimerRef.current = setInterval(tick, 2000);
    },
    [formatError, onPayload, stopPolling],
  );

  // ─── Dispatch ────────────────────────────────────────────────────────────

  const dispatch = useCallback(
    async (kind: DispatchKind) => {
      if (!report) return;
      if (inFlight !== null) return;

      setInFlight(kind);
      setError(null);
      setJobId(null);
      setStatusText(kind === "generate" ? "Generating…" : "Recalculating…");

      const path =
        kind === "generate"
          ? `/api/master-reports/${encodeURIComponent(report.report_id)}/generate`
          : `/api/master-reports/${encodeURIComponent(report.report_id)}/recalculate`;

      try {
        const res = await api<GenerateResponse>(path, {
          method: "POST",
          body: JSON.stringify({ filters }),
          skipToast: true,
        });

        if (!mountedRef.current) return;

        // 202 path: server handed off to async — start polling.
        if (res.job_id && !res.payload) {
          startPolling(res.job_id);
          return;
        }

        // 200 sync path: payload is in-band.
        if (res.payload) {
          onPayload(res.payload);
          setInFlight(null);
          setStatusText("");
          return;
        }

        // Defensive: server returned a structured error body inside a 2xx
        // envelope (shouldn't happen given handlers.go, but guard anyway).
        if (res.error) {
          setError({
            code: res.error.code,
            message: res.error.message || "Server returned an error.",
          });
          setInFlight(null);
          setStatusText("");
          return;
        }

        // No payload, no job_id, no error — treat as unexpected.
        setError({ message: "Empty response from server." });
        setInFlight(null);
        setStatusText("");
      } catch (e) {
        if (!mountedRef.current) return;
        setError(
          formatError(
            e,
            kind === "generate"
              ? "Failed to generate the report."
              : "Failed to force recalculate the report.",
          ),
        );
        setInFlight(null);
        setStatusText("");
      }
    },
    [filters, formatError, inFlight, onPayload, report, startPolling],
  );

  // ─── Force Recalculate confirmation ──────────────────────────────────────
  // Per the brief, browser confirm() is acceptable for v1. The dialog names
  // the report and the resolved date so the operator sees what they are
  // about to refetch from raw GPS / attendance / RFID / weighbridge tables.
  const handleForceRecalculate = useCallback(() => {
    if (!report) return;
    if (inFlight !== null) return;

    const dateLabel = describeOperationalDate(filters);
    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            `Force recalculate "${report.name}"${dateLabel ? ` for ${dateLabel}` : ""}?\n\n` +
              "This bypasses the cache and refetches the source data. " +
              "It can take several seconds to a few minutes.",
          )
        : true;
    if (!ok) return;
    void dispatch("recalculate");
  }, [dispatch, filters, inFlight, report]);

  const handleGenerate = useCallback(() => {
    if (!report) return;
    void dispatch("generate");
  }, [dispatch, report]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!report) {
    return (
      <div
        id="master-reports-action-region-content"
        className="text-xs text-slate-400"
      >
        Select a report to enable Generate and Force Recalculate.
      </div>
    );
  }

  const busy = inFlight !== null;

  return (
    <div id="master-reports-action-region-content" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          aria-busy={busy}
          className={[
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors",
            busy
              ? "bg-emerald-300 text-white cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-700 text-white",
          ].join(" ")}
        >
          {busy && inFlight === "generate" ? (
            <span
              aria-hidden
              className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin"
            />
          ) : (
            <Play size={14} />
          )}
          Generate
        </button>

        {canForceRecalculate ? (
          <button
            type="button"
            onClick={handleForceRecalculate}
            disabled={busy}
            aria-busy={busy}
            className={[
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors border",
              busy
                ? "border-amber-200 bg-amber-50 text-amber-400 cursor-not-allowed"
                : "border-amber-300 bg-white hover:bg-amber-50 text-amber-700",
            ].join(" ")}
          >
            {busy && inFlight === "recalculate" ? (
              <span
                aria-hidden
                className="w-3 h-3 rounded-full border-2 border-amber-200 border-t-amber-600 animate-spin"
              />
            ) : (
              <RefreshCw size={14} />
            )}
            Force Recalculate
          </button>
        ) : null}

        {busy ? (
          <span
            role="status"
            aria-live="polite"
            className="text-xs font-medium text-slate-500"
          >
            {statusText}
            {jobId ? (
              <span className="ml-2 font-mono text-[10px] text-slate-400">
                job {jobId.slice(0, 8)}…
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div>
            {error.code ? (
              <span className="font-mono font-semibold mr-1">
                {error.code}:
              </span>
            ) : null}
            <span>{error.message}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// describeOperationalDate produces a short, human-readable label for the
// confirm() dialog. It inspects the filters object for a `date` (string) or
// `date_range` (array/string) entry, falling back to an empty string when
// neither is present so the dialog still reads naturally.
function describeOperationalDate(filters: Record<string, unknown>): string {
  const d = filters.date;
  if (typeof d === "string" && d.length > 0) return d;

  const r = filters.date_range;
  if (Array.isArray(r) && r.length === 2) {
    const start = typeof r[0] === "string" ? r[0] : "";
    const end = typeof r[1] === "string" ? r[1] : "";
    if (start && end) return `${start} → ${end}`;
    if (start) return start;
  }
  if (typeof r === "string" && r.length > 0) {
    return r;
  }
  return "";
}
