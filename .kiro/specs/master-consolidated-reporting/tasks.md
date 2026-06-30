# Implementation Plan: Master Consolidated Reporting

## Overview

This plan builds the Master Consolidated Reporting (MCR) module foundation-first: shift helper extraction → database migration → core catalog scaffolding → filter validation and hashing → output cache → bounded worker pool → data-source adapter scaffolding → registration of the 25 ReportDefinitions → async job registry → SmartLoader → ForceRecalculator → audit emit wrapper → RBAC seeding → HTTP handlers and routes → Excel exporter → PDF exporter → frontend Master Reports page → sidebar consolidation → property and integration tests. The module is additive over existing report handlers via `existingHandlerAdapter`; only three reports (`rfid_collection`, `daily_vehicle_deployment`, `gts_weighbridge_summary`) introduce new aggregation SQL.

## Tasks

- [x] 1. Shift helper extraction
  - [x] 1.1 Create `internal/shift/` package with `OperationalDate`, `ShiftWindow`, `IsShiftActive`
    - Create files `internal/shift/shift.go` and `internal/shift/doc.go`
    - Define `Shift` struct with `StartTime time.Duration` and `EndTime time.Duration` (time-of-day offsets)
    - Implement `OperationalDate(now time.Time, cutoff time.Duration) time.Time` returning the shift-anchored reporting day (default cutoff 4h; shifts that cross midnight resolve to their start day)
    - Implement `ShiftWindow(date time.Time, shift Shift) (start, end time.Time)` returning the absolute time window for a given operational date
    - Implement `IsShiftActive(now, date time.Time, shift Shift) bool`
    - Extract duplicated operational-date logic out of the four existing handlers identified in `docs/reporting-architecture-redesign.md` §6 behind this helper (signature only; callers migrate when adapters are wired in tasks 7.2 and 8.x)
    - _Requirements: 12.3_

  - [x] 1.2 Write property test for Operational_Date anchoring
    - **Property 13: Operational_Date Anchoring**
    - File: `internal/shift/operational_date_property_test.go`
    - Use `pgregory.net/rapid` to generate a `Shift` whose `EndTime < StartTime` (crosses midnight) and a `now` within `[start_day, start_day+1)`
    - Assert `OperationalDate(now, cutoff) == start_day` and that every `now` within the shift window resolves to the same cache key
    - **Validates: Requirements 12.3**

- [x] 2. Database migration for `report_output_cache`
  - [x] 2.1 Create `migrations/063_master_reporting_module.sql`
    - Create `report_output_cache` table with columns `report_id TEXT`, `filter_hash CHAR(64)`, `operational_date DATE`, `payload JSONB` (nullable while status='computing'), `input_version BIGINT NOT NULL DEFAULT 0`, `status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','stale','computing','error'))`, `computed_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `computing_since TIMESTAMPTZ`, `error_reason TEXT`
    - Primary key `(report_id, filter_hash, operational_date)`
    - Index `idx_roc_eviction (computed_at)` for the 30-day eviction cron
    - Index `idx_roc_report_status (report_id, status)` for invalidation lookups
    - Partial index `idx_roc_computing (status, computing_since) WHERE status = 'computing'` for in-flight job discovery
    - Wrap in `BEGIN; ... COMMIT;` with `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for idempotent re-runs
    - Add SQL comment noting that `reports.<id>.{view,export,generate}`, `reports.view`, and `reports.force_recalculate` permission rows are seeded at boot from `masterreport.PermissionsForCatalog` (see task 14.2); no permission INSERTs in this migration
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 12.1, 12.6_

- [x] 3. Core types and catalog scaffold
  - [x] 3.1 Create `internal/masterreport/types.go` with the core type system
    - Define `ReportID` (string, validated against `^[a-z0-9_]+$`, ≤64 chars)
    - Define `Category` constants: `road_sweeping`, `open_depot`, `attendance`, `zone_coverage`, `rfid`, `weighbridge`, `deployment`, `active_vehicle`, `alerts`, `consolidated`
    - Define `FilterKey` constants (closed set): `date`, `date_range`, `zone`, `ward`, `shift`, `vehicle`, `route`, `route_type`, `department`, `designation`, `employee`
    - Define `FilterControl`, `ColumnSpec`, `MergeRange`, `ColorRule`, `TotalsRow`, `ColumnRef`, `PreviewLayout` structs (per design §3.1)
    - Define `ReportDefinition` struct with `ID`, `Name`, `Category`, `Filters []FilterControl`, `PermissionKey`, `DataSource DataSource`, `TemplateXLSX`, `Preview PreviewLayout`, `OperationalCutoff time.Duration`
    - Define `FilterPayload map[FilterKey]any` and `Payload` (Rows, Totals, Header, GeneratedAt, InputVersion)
    - _Requirements: 1.5, 2.1, 2.2_

  - [x] 3.2 Create `internal/masterreport/registry.go` with the `Catalog` type
    - Define `Catalog` struct with `sync.RWMutex`, `defs map[ReportID]*ReportDefinition`, `order []ReportID`
    - Implement `NewCatalog() *Catalog`
    - Implement `MustRegister(def *ReportDefinition)` that panics on duplicate ID, empty `DataSource`, or `report_id` failing the regex/length check (fail-fast at boot)
    - Implement `Get(id ReportID) (*ReportDefinition, bool)` and `List() []*ReportDefinition` (ordered)
    - Implement `FilterByPrincipal(perms []string) []*ReportDefinition` returning only reports whose `PermissionKey` is in `perms`
    - _Requirements: 1.1, 1.5, 1.6, 1.7_

  - [x] 3.3 Create `internal/masterreport/catalog.go` with boot-time `Validate`
    - Implement `Catalog.Validate(ctx context.Context, templateDir string, rbac *repository.RBACRepository) error`
    - Verify every `TemplateXLSX` (when non-empty) exists under `storage/report-templates/master/`
    - Verify every `DataSource` field is non-nil
    - Verify every `PermissionKey` matches the `reports.<id>.view` form for the report's `ID`
    - Return a multi-error listing every offending report on failure so startup fails per Req 1.8
    - _Requirements: 1.5, 1.8_

- [x] 4. FilterValidator and Filter_Hash
  - [x] 4.1 Implement `FilterValidator` in `internal/masterreport/filter_validator.go`
    - Implement `Validator.Validate(def *ReportDefinition, p FilterPayload) error` returning a `*ValidationError` whose `Missing` and `Unsupported` slices together name every offending key
    - Treat `nil`, empty string, empty slice, and the zero `time.Time` as "missing" for required keys
    - Reject any key in `p` not declared in `def.Filters` as "unsupported"
    - Export `ValidationError` with `Error() string` method producing a stable, deterministic message
    - _Requirements: 2.4, 2.5, 2.7_

  - [x] 4.2 Implement `FilterHash` in `internal/masterreport/filter_hash.go`
    - Canonicalize values: `time.Time` → `RFC3339Nano` in UTC; `[]int` → sort ascending + dedupe + comma-join; `string` → raw UTF-8 (no trim, no case change); `int`/`float64` → `strconv` with `%g`
    - Sort filter keys lexicographically; emit `key=value;key=value;...` with `;` separator, no trailing
    - SHA-256 → lowercase hex (64 chars); return `string`
    - Reject inputs that have not passed `Validate` (return error)
    - _Requirements: 2.6, 12.1_

  - [x] 4.3 Write property test for Filter_Hash order independence
    - **Property 1: Filter_Hash Order Independence**
    - File: `internal/masterreport/filter_hash_property_test.go`
    - Use rapid to generate a 1–11-element `FilterPayload` over the closed `FilterKey` enum
    - Permute the payload key order and assert `FilterHash(p) == FilterHash(permuted)`
    - **Validates: Requirements 2.6, 12.1**

  - [x] 4.4 Write property test for FilterValidator rejection completeness
    - **Property 2: FilterValidator Rejection Completeness**
    - File: `internal/masterreport/filter_validator_property_test.go`
    - Use rapid to generate a `ReportDefinition` with random `Filters` and a payload that randomly drops required keys and/or adds non-schema keys
    - Assert returned `ValidationError.Missing` ∪ `Unsupported` names every offending key; an instrumented DataSource is never invoked
    - **Validates: Requirements 2.4, 2.5**

- [x] 5. OutputCacheRepo
  - [x] 5.1 Implement `OutputCacheRepo` in `internal/masterreport/output_cache_repo.go`
    - `Get(ctx, reportID ReportID, hash string, opDate time.Time) (*CacheRow, error)` reading the full row including `status`, `computed_at`, `computing_since`, `payload`, `error_reason`
    - `UpsertComputing(ctx, key, computingSince)` setting `status='computing'` and stamping `computing_since`
    - `UpsertValid(ctx, key, payload, inputVersion, computedAt)` overwriting prior payload and clearing `error_reason`
    - `RestorePriorStatus(ctx, key, priorStatus)` to roll back to the pre-recompute status on failure without overwriting payload
    - `MarkStale(ctx, reportID ReportID)` for data-source invalidation signals (Req 12.2)
    - `EvictOlderThan(ctx, cutoff time.Time) (int, error)` returning rows removed; called by a daily cron (placeholder hook only — cron registration is out of scope here)
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 12.1, 12.2, 12.5, 12.6_

- [x] 6. BoundedWorkerPool
  - [x] 6.1 Implement `BoundedWorkerPool` in `internal/masterreport/pool.go`
    - Semaphore channel `sem chan struct{}` with capacity `MaxConcurrentVehicles = 12`
    - FIFO `backlog chan func()` with capacity `MaxBacklog = 1000`
    - `Submit(work func()) error` returns `ErrPoolFull` when backlog is at capacity; otherwise enqueues
    - Internal worker goroutine drains backlog into sem-gated execution slots; tracks outstanding work via `sync.WaitGroup`
    - `Wait()` blocks until all submitted work completes
    - Reuse the semaphore pattern already used in `GetD2DRouteCoverageReport` (`maxConcurrentVehicles = 12`)
    - _Requirements: 11.1, 11.6_

  - [x] 6.2 Write property test for bounded concurrency invariant
    - **Property 11: Bounded Concurrency Invariant**
    - File: `internal/masterreport/pool_property_test.go`
    - Use rapid to submit batches of `N ∈ [1, 2000]` no-op tasks; instrument the pool with an atomic counter capturing peak concurrency
    - Assert peak concurrency never exceeds `MaxConcurrentVehicles = 12` and `Submit` returns `ErrPoolFull` once the backlog reaches 1000 unstarted items
    - **Validates: Requirements 11.1, 11.6**

- [x] 7. DataSource interface and adapter scaffolding
  - [x] 7.1 Define `DataSource` interface in `internal/masterreport/datasource.go`
    - Interface methods: `Compute(ctx context.Context, f FilterPayload, pool *BoundedWorkerPool) (Payload, error)` and `InputVersion(ctx context.Context, f FilterPayload) (int64, error)`
    - Implementations honor `ctx` cancellation and route per-vehicle/zone/ward fan-out through the injected pool
    - _Requirements: 1.3, 1.4, 12.2_

  - [x] 7.2 Implement `existingHandlerAdapter` in `internal/masterreport/adapter_existing.go`
    - Struct fields: `handler *api.Handler`, `fn func(ctx, *api.Handler, FilterPayload, *BoundedWorkerPool) (Payload, error)`, `inputVer func(ctx, *api.Handler, FilterPayload) (int64, error)`
    - `Compute` calls `a.fn(ctx, a.handler, f, pool)`; `InputVersion` calls `a.inputVer(ctx, a.handler, f)` with a fallback to `time.Now().UnixMilli()` when no version is available
    - Bridge that satisfies Req 1.3: wraps existing handlers' underlying repository methods (NOT their HTTP shell); permission and audit happen once at the masterreport layer
    - _Requirements: 1.3, 12.2_

  - [x] 7.3 Implement `newAggregationAdapter` in `internal/masterreport/adapter_new.go`
    - Struct fields: `pool *pgxpool.Pool`, `sql string`, `args func(FilterPayload) []any`, `versionSQL string`
    - `Compute` runs `pool.Query(ctx, sql, args(f)...)`, scans rows into `[]map[string]any`, and returns a `Payload` with totals computed from the row set
    - `InputVersion` runs `versionSQL` and returns the resulting `BIGINT` (typically `EXTRACT(EPOCH FROM MAX(updated_at))::bigint`)
    - Used by the 3 new aggregation reports (`rfid_collection`, `daily_vehicle_deployment`, `gts_weighbridge_summary`)
    - _Requirements: 1.4, 12.2_

- [x] 8. Register all 25 ReportDefinitions in the catalog
  - [x] 8.1 Register `road_sweeping_0700` in `internal/masterreport/reports_road_sweeping.go`
    - Category `road_sweeping`; Filters: `date` (required), `zone` (optional)
    - Wraps `GetShiftBasedOpsReport` with `shift=morning_sweep` via `existingHandlerAdapter`
    - PermissionKey `reports.road_sweeping_0700.view`; TemplateXLSX `road_sweeping_0700.xlsx`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 8.2 Register `open_depot_gvp_0730` in `internal/masterreport/reports_open_depot.go`
    - Category `open_depot`; Filters: `date` (required), `zone` (optional)
    - Wraps `open_depot_handlers.GetOpenDepotDashboard` joined with the cleaning submission repo via `existingHandlerAdapter`
    - PermissionKey `reports.open_depot_gvp_0730.view`; TemplateXLSX `open_depot_gvp_0730.xlsx`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 8.3 Register 4 attendance reports in `internal/masterreport/reports_attendance.go`
    - `helper_attendance_0800` (designation=helper), `driver_attendance_summary` (designation=driver), `supervisor_attendance_summary` (designation=supervisor), `zone_manager_attendance_summary` (designation=zone_manager)
    - Category `attendance`; Filters: `date` (required), `department`, `designation`, `zone` (varies per report; pinned designation set via adapter closure)
    - Each wraps `GetAttendance` via `existingHandlerAdapter`
    - PermissionKeys `reports.<id>.view`; each gets its own TemplateXLSX
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 8.4 Register 5 zone-wise coverage reports in `internal/masterreport/reports_zone_coverage_d2d.go`
    - `zone_coverage_hmz`, `zone_coverage_clz`, `zone_coverage_kpz`, `zone_coverage_anz`, `zone_coverage_sw`
    - Category `zone_coverage`; Filters: `date` (required), `shift` (optional)
    - Each wraps `GetD2DRouteCoverageReport` with its zone code pinned via the adapter closure
    - PermissionKeys `reports.<id>.view`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 8.5 Register 2 zone-coverage support reports in `internal/masterreport/reports_zone_coverage_geofence_lane.go`
    - `ward_geofence` (Filters: `date` required, `zone`, `ward`) wraps `GetWardGeofenceReport`
    - `lane_monitoring` (Filters: `date` required, `zone`, `ward`, `route`) wraps `GetLaneMonitoringReport`
    - Category `zone_coverage`; PermissionKeys `reports.<id>.view`
    - _Requirements: 1.1, 1.3, 1.5_

  - [x] 8.6 Register `rfid_collection` (new aggregation) in `internal/masterreport/reports_rfid.go`
    - Category `rfid`; Filters: `date` (required), `zone`, `ward`
    - Build `newAggregationAdapter` with SQL skeleton from design §3.2:
      `SELECT z.code AS zone, w.code AS ward, r.vehicle_id, COUNT(*) AS scans
       FROM rfid_scan_log r
       JOIN wards w ON r.ward_id = w.id
       JOIN zones z ON w.zone_id = z.id
       WHERE r.scanned_at::date = $1
         AND ($2 = '' OR z.code = $2)
         AND ($3 = '' OR w.code = $3)
       GROUP BY z.code, w.code, r.vehicle_id;`
    - `versionSQL`: `SELECT COALESCE(EXTRACT(EPOCH FROM MAX(scanned_at)), 0)::bigint FROM rfid_scan_log WHERE scanned_at::date = $1`
    - PermissionKey `reports.rfid_collection.view`
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [x] 8.7 Register `weighbridge_gts_trip` (wrap) in `internal/masterreport/reports_weighbridge_gts_trip.go`
    - Category `weighbridge`; Filters: `date` (required), `shift` (optional)
    - Wraps `GetGTSTripReport` with a join to `weighbridge_data` via `existingHandlerAdapter`
    - PermissionKey `reports.weighbridge_gts_trip.view`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 8.8 Register `gts_weighbridge_summary` (new aggregation) in `internal/masterreport/reports_gts_weighbridge_summary.go`
    - Category `weighbridge`; Filters: `date_range` (required)
    - Build `newAggregationAdapter` with SQL skeleton from design §3.2:
      `SELECT date_trunc('day', recorded_at)::date AS day, gts_id, SUM(weight_kg) AS total_kg, COUNT(*) AS trips
       FROM weighbridge_data
       WHERE recorded_at BETWEEN $1 AND $2
       GROUP BY day, gts_id
       ORDER BY day, gts_id;`
    - `versionSQL`: `SELECT COALESCE(EXTRACT(EPOCH FROM MAX(recorded_at)), 0)::bigint FROM weighbridge_data WHERE recorded_at BETWEEN $1 AND $2`
    - PermissionKey `reports.gts_weighbridge_summary.view`
    - _Requirements: 1.1, 1.4, 1.5_

  - [x] 8.9 Register `daily_vehicle_deployment` (new aggregation) in `internal/masterreport/reports_deployment.go`
    - Category `deployment`; Filters: `date` (required), `zone`, `ward`
    - Build `newAggregationAdapter` with SQL skeleton from design §3.2: query `vehicle_route_assignments` left-joined to the first GPS ping per vehicle per day from `gps_data`, classify each vehicle as `deployed` (has ping within shift window) or `idle` (no ping)
    - `versionSQL`: `SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0)::bigint FROM vehicle_route_assignments WHERE assignment_date = $1`
    - PermissionKey `reports.daily_vehicle_deployment.view`
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [x] 8.10 Register 5 active-vehicle reports in `internal/masterreport/reports_active_vehicle.go`
    - `active_vehicle_summary` wraps `GetActiveVehicleSummaryReport`
    - `active_vehicle_by_ward` wraps `GetActiveVehicleSummaryByWardReport`
    - `unauthorized_movement` wraps `GetUnauthorizedMovementReport`
    - `early_departure` wraps `GetEarlyDepartureReport`
    - `vehicle_summary` wraps `GetVehicleSummaryReport`
    - Category `active_vehicle`; PermissionKeys `reports.<id>.view`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 8.11 Register 2 alerts reports in `internal/masterreport/reports_alerts.go`
    - `geofence_events` (Filters: `date_range` required, `zone`, `vehicle`) wraps `GetGeofenceEventReport`
    - `alert_detail` (Filters: `date_range` required, `vehicle`) wraps `GetAlertDetailReport`
    - Category `alerts`; PermissionKeys `reports.geofence_events.view`, `reports.alert_detail.view`
    - _Requirements: 1.1, 1.3, 1.5_

  - [x] 8.12 Register `daily_consolidated` (legacy wrap) in `internal/masterreport/reports_consolidated.go`
    - Category `consolidated`; Filters: `date` (required)
    - Wraps `ultimatereport.UltimateReportService.BuildReportData` via `existingHandlerAdapter` so the legacy Daily Master Consolidated Report continues to function through the new catalog
    - PermissionKey `reports.daily_consolidated.view`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] 9. JobRegistry
  - [x] 9.1 Implement `JobRegistry` in `internal/masterreport/job_registry.go`
    - Define `Job` struct with `ID` (32-char base32 of 20 random bytes), `Key` (report_id|filter_hash|operational_date), `Status` (`pending`/`running`/`done`/`error`), `SubmittedAt`, `StartedAt`, `CompletedAt`, `Payload json.RawMessage`, `ErrorReason`
    - `SubmitOrGet(ctx, key, run func(context.Context) (Payload, error)) (*Job, error)` with in-memory `jobsByKey` + `jobs[id]` maps under `sync.Mutex`; returns the existing job within 200ms when status is `pending`/`running` (singleflight by key)
    - `Poll(ctx, id) (*Job, error)` returns within 500ms; 24-hour retention then 404
    - LRU cap of 10,000 jobs; cleanup goroutine evicts completed jobs at +24h
    - Run wrapper enforces 15-minute hard ceiling — on overrun, set `status=error`, set `error_reason="async_ceiling_exceeded"`, release the pool slot
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.7_

  - [x] 9.2 Write property test for async job state machine
    - **Property 12: Async Job State Machine**
    - File: `internal/masterreport/job_registry_property_test.go`
    - Use rapid to drive a slow DataSource with controllable delay; poll the JobRegistry at every transition
    - Assert status sequence `{pending → running → done | error}`, 202-with-job_id emitted within 1s of crossing the 30s threshold, concurrent same-key requests share the job within 200ms, 15-minute ceiling transitions to `error` and releases the slot
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.5**

- [x] 10. SmartLoader
  - [x] 10.1 Implement `SmartLoader` in `internal/masterreport/smart_loader.go`
    - `Load(ctx, reportID, hash, opDate) (Payload, path string, err error)` where `path ∈ {cache_hit, recomputed}`
    - Cache-hit when `status=valid` AND `computed_at` is within TTL: 60s for live-day (`operational_date == today` under per-report cutoff), 24h for historical
    - Absent / stale / expired / error → `UpsertComputing`, call `DataSource.Compute`, on success `UpsertValid` and return `recomputed`
    - On compute failure → `RestorePriorStatus` (do not overwrite payload), return `recompute_failed` error
    - When existing `status=computing` AND `computing_since` < 5min → poll the row every 250ms up to 30s, return the eventual payload or `recompute_timeout`
    - In-process `golang.org/x/sync/singleflight.Group` keyed by `(report_id, filter_hash, operational_date)` so concurrent same-key requests share one Compute (Property 7)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 12.4_

  - [x] 10.2 Write property test for SmartLoad trigger and idempotence
    - **Property 6: Smart_Load Recompute Trigger and Idempotence**
    - File: `internal/masterreport/smart_loader_property_test.go`
    - Use rapid to seed cache state ∈ {absent, valid-fresh, valid-expired, stale, computing-fresh, computing-stale, error}; mock DataSource counts Compute invocations
    - Assert Compute invoked iff state ∈ {absent, valid-expired, stale, computing-stale, error}; two consecutive calls on valid-fresh return byte-equal payloads and Compute called zero times the second time; `path` field equals `cache_hit` iff Compute not invoked; live-day TTL is 60s, historical TTL is 24h
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**

  - [x] 10.3 Write property test for concurrent recompute coalescence
    - **Property 7: Concurrent Recompute Coalescence**
    - File: `internal/masterreport/coalesce_property_test.go`
    - Use rapid to launch `N ∈ [2, 32]` concurrent `SmartLoad`/`ForceRecalculate` calls on the same key against an instrumented DataSource
    - Assert `DataSource.Compute` invoked exactly once across all `N` requests and every caller observes the same final payload (or same coalesced error)
    - **Validates: Requirements 6.6, 7.8, 12.4**

- [x] 11. ForceRecalculator
  - [x] 11.1 Implement `ForceRecalculator` in `internal/masterreport/force_recalculate.go`
    - `Recalculate(ctx, reportID, hash, opDate) (Payload, path string, err error)` with `path = force_recomputed`
    - Set `status=computing` in `report_output_cache` regardless of prior state; bypass the cache entirely on the read side
    - Call `DataSource.Compute` (raw refetch from GPS/attendance/RFID/weighbridge tables)
    - On success: `UpsertValid` overwriting prior payload, `computed_at=now`; return `path=force_recomputed`
    - On failure: `RestorePriorStatus`, leave payload unchanged, return `recompute_failed`
    - Coalesce with any in-flight SmartLoad / ForceRecalc for the same key via the SmartLoader's shared singleflight group (Req 7.8)
    - _Requirements: 7.3, 7.6, 7.7, 7.8, 12.1_

  - [x] 11.2 Write property test for Force_Recalculate state transition
    - **Property 8: Force_Recalculate State Transition**
    - File: `internal/masterreport/force_recalculate_property_test.go`
    - Use rapid to generate `(reportID, filter_set, priorCacheState)`; run `ForceRecalculate`
    - Assert status sequence `* → computing → valid`, response field equals `force_recomputed`, `computed_at` equals the completion timestamp, an immediate SmartLoad for the same key returns the Force_Recalc's recomputed payload as a cache hit
    - **Validates: Requirements 7.3, 7.7, 12.1**

- [x] 12. Audit emit wrapper
  - [x] 12.1 Add 4 new EventType constants to `internal/audit/audit.go`
    - `EventReportGenerate         EventType = "report.generate"`
    - `EventReportForceRecalculate EventType = "report.force_recalculate"`
    - `EventReportExportExcel      EventType = "report.export.excel"`
    - `EventReportExportPDF        EventType = "report.export.pdf"`
    - _Requirements: 10.1, 10.5_

  - [x] 12.2 Implement audit emit wrapper in `internal/masterreport/audit.go`
    - `EmitWithBudget(ctx, action audit.EventType, userID int, email, ip string, metadata map[string]any)` launches `audit.Log` in a goroutine writing to a buffered `done` channel
    - Wrap in `select { case <-done: case <-time.After(500*time.Millisecond): }` so emit waiting never exceeds 500ms before the response is returned; the inner goroutine may complete later (Req 10.2)
    - Populate metadata: `report_id`, `filter_hash`, `filters` (JSON, truncated to 16384 bytes with `filters_truncated: true` flag when longer), `operational_date` (YYYY-MM-DD), `outcome` (`success`/`error`), `http_status`, `request_ts_ms`
    - On unauthenticated requests, set `user_id = "anonymous"` and `email = "anonymous"` (Req 10.3)
    - Log emit failures at `error` level with `user_id`, `action`, `report_id`, `filter_hash`; never block or alter the response (Req 10.4)
    - Persist exclusively through `internal/audit` — no separate table or store (Req 10.5)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 12.3 Write property test for audit completeness
    - **Property 10: Audit Completeness**
    - File: `internal/masterreport/audit_property_test.go`
    - Use rapid to generate request sequences (success and error mix) across all 4 actions; an in-memory audit recorder collects rows
    - Assert exactly one record per request with matching `user_id`, `action`, `report_id`, `filter_hash`, `http_status`; assert emit failure still returns the response
    - **Validates: Requirements 10.1, 10.4**

- [x] 13. Checkpoint - Backend foundation complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. RBAC seeding
  - [x] 14.1 Implement `PermissionsForCatalog` in `internal/masterreport/permissions.go`
    - Return one `reports.<id>.view`, one `reports.<id>.export`, one `reports.<id>.generate` row per registered ReportDefinition (75 rows for 25 reports) under `CategoryID = 5` ("Reports") (Req 8.1, 8.8)
    - Plus `reports.view` (Base_Permission) and `reports.force_recalculate` (admin permission) rows under the same category
    - Return `[]repository.Permission`
    - _Requirements: 8.1, 8.2, 8.8_

  - [x] 14.2 Wire `PermissionsForCatalog` into `cmd/server/main.go`
    - After the existing `api.RegisterAllPermissions(ctx, rbacRepo)` call at line 208
    - Construct the catalog: `catalog := masterreport.NewCatalog(); masterreport.RegisterAll(catalog, handler, dbpool)`
    - Call `catalog.Validate(ctx, "storage/report-templates/master", rbacRepo)` and fail boot (`log.Fatal`) on error per Req 1.8
    - Call `rbacRepo.RegisterPermissions(ctx, masterreport.PermissionsForCatalog(catalog))` (existing `ON CONFLICT DO NOTHING` makes re-runs idempotent)
    - Log a warning (not fatal) on partial seeding failure and proceed
    - _Requirements: 1.8, 8.1, 8.2, 8.8_

  - [x] 14.3 Write property test for catalog ↔ permissions coherence
    - **Property 14: Catalog ↔ Permissions Coherence**
    - File: `internal/masterreport/catalog_validate_property_test.go`
    - Use rapid to perturb the Catalog (drop entry, duplicate id, miss permission row) and assert `Validate` returns a specific error category naming the offender
    - Cross-check: for every registered ReportDefinition a `reports.<id>.{view,export,generate}` row exists; conversely for every `permissions` row matching `reports.*.view`, a ReportDefinition exists or it is explicitly marked retired in the registry
    - **Validates: Requirements 1.1, 1.5, 1.8, 8.1, 8.8**

- [x] 15. HTTP handlers and routes
  - [x] 15.1 Create the 6 master-report HTTP handlers in `internal/api/master_report_handlers.go`
    - `GetCatalog` — `GET /api/master-reports/catalog`; returns reports filtered by the principal's `reports.<id>.view` set; on empty result, return HTTP 200 with `{"reports": [], "error":{"code":"no_accessible_reports"}}` per Req 1.7
    - `GenerateReport` — `POST /api/master-reports/{report_id}/generate`; runs `FilterValidator.Validate` → `FilterHash` → `SmartLoader.Load`; emits HTTP 202 with `job_id` when sync execution crosses 30s and continues async via `JobRegistry.SubmitOrGet`
    - `ForceRecalculate` — `POST /api/master-reports/{report_id}/recalculate`; runs `ForceRecalculator.Recalculate`
    - `ExportExcel` — `GET /api/master-reports/{report_id}/export.xlsx`; calls `SmartLoad` then `ExcelExporter.Export`; commits `Content-Type` and `Content-Disposition` only after fill succeeds (no partial content per Req 4.6)
    - `ExportPDF` — `GET /api/master-reports/{report_id}/export.pdf`; calls `SmartLoad` then `PDFExporter.Export`
    - `GetJob` — `GET /api/master-reports/jobs/{job_id}`; calls `JobRegistry.Poll`; 404 with `{"error":{"code":"job_not_found"}}` for unknown or >24h-old IDs
    - Each handler calls the audit emit wrapper from task 12.2 with the matching `EventType`, capturing the response status code via a `responseRecorder` wrapper
    - _Requirements: 1.6, 1.7, 6.1, 7.1, 7.3, 11.4, 13.3_

  - [x] 15.2 Implement `requireReportPermission(suffix)` helper in `internal/api/master_report_handlers.go`
    - Read `chi.URLParam(r, "report_id")`, validate against `^[a-z0-9_]+$` (≤64 chars), reject with 400 on invalid IDs
    - Compose permission key `reports.<id>.<suffix>` and delegate to the existing `RequirePermission` middleware
    - Used by every per-report endpoint so each report keys on its own permission row
    - _Requirements: 8.3, 8.4, 8.5_

  - [x] 15.3 Register routes in `internal/api/router.go`
    - All 6 endpoints mounted under the existing authenticated router group (NOT the mobile router — Req 13.3 keeps mobile out of scope)
    - `/generate`, `/recalculate`, `/export.xlsx`, `/export.pdf` use `requireReportPermission("view")`
    - `/recalculate` additionally chains `RequirePermission("reports.force_recalculate")` per Req 7.4, 8.4
    - `/catalog` and `/jobs/{job_id}` use `Auth` only (no per-report permission; catalog filters server-side, job ownership checked against `claims.UserID`)
    - _Requirements: 7.4, 8.3, 8.4, 13.3_

  - [x] 15.4 Write property test for RBAC enforcement completeness
    - **Property 9: RBAC Enforcement Completeness**
    - File: `internal/masterreport/rbac_property_test.go`
    - Use rapid to generate a principal with a random permission subset over the 25 reports + `reports.force_recalculate`; invoke each endpoint via `httptest`
    - Assert: catalog filtered to held permissions; per-endpoint 403 iff missing required permission; Force_Recalculate gated by both `reports.<id>.view` AND `reports.force_recalculate`; Export accepted with only `.view`
    - **Validates: Requirements 1.6, 7.4, 8.3, 8.4, 8.5, 8.7**

- [x] 16. ExcelExporter
  - [x] 16.1 Implement `ExcelExporter` in `internal/masterreport/excel_exporter.go`
    - Boot-time `templateStore` caches raw `.xlsx` bytes (one entry per ReportDefinition with non-empty `TemplateXLSX`); loaded once from `storage/report-templates/master/<report_id>.xlsx`
    - `Export(ctx, def *ReportDefinition, payload Payload, w http.ResponseWriter) error`: clone via `excelize.OpenReader(bytes.NewReader(rawBytes))`, fill data cells using `SetCellValue` only (never `SetCellStyle` — preserves template merges and fills), then `file.Write(w)` streams directly
    - Write `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="{report_id}_{op_date YYYY-MM-DD}.xlsx"` headers AFTER `fill` succeeds and before streaming begins (Req 4.4, 4.6)
    - Programmatic fallback path (when no template is bound) renders headers + data rows from `PreviewLayout.Columns` so all reports remain exportable
    - Empty result still produces template headers + merged title cells + empty data area (Req 4.7)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 17. PDFExporter
  - [x] 17.1 Add `github.com/johnfercher/maroto/v2` to `go.mod` and implement `PDFExporter` in `internal/masterreport/pdf_exporter.go`
    - `Export(ctx, def *ReportDefinition, payload Payload, w http.ResponseWriter) error` wrapped in `context.WithTimeout(ctx, 30*time.Second)`; on timeout return `recompute_timeout`
    - Page-size selector: A4 landscape iff `PreviewLayout.TotalWidthMM ≤ 297`, A3 landscape iff `≤ 420`, reject with HTTP 400 `error.code = export_too_wide_for_pdf` if greater than 420 (Req 5.4, 5.7)
    - Build the maroto grid from `PreviewLayout.Columns` and `MergeRanges`; render header fills from `Columns[i].FillHex`; render totals rows from `TotalsRows`; render remarks column from `RemarksColumn`
    - Stream to `w` with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="{report_id}_{op_date YYYY-MM-DD}.pdf"`; commit headers only after layout succeeds
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 17.2 Write property test for output equivalence (Preview ≡ Excel ≡ PDF)
    - **Property 4: Output Equivalence (Preview ≡ Excel ≡ PDF)**
    - File: `internal/masterreport/output_equivalence_property_test.go`
    - Use rapid to generate a `Payload` of up to 200 rows × 20 columns; run the preview view-model (Go-side mirror exported for tests), `ExcelExporter`, and `PDFExporter`
    - Parse the produced `.xlsx` (via `excelize`) and `.pdf` (via a maroto-compatible parser) back into row/column triples; compare `(row_index, column_key, value)` multisets after applying `ColumnSpec.Type` formatting (2-dp decimals, integer counts, YYYY-MM-DD dates)
    - **Validates: Requirements 3.2, 4.1, 5.1**

  - [x] 17.3 Write property test for Excel/PDF structural fidelity
    - **Property 5: Excel/PDF Structural Fidelity**
    - File: `internal/masterreport/excel_pdf_structure_property_test.go`
    - Use rapid to generate a `PreviewLayout`; produce xlsx and pdf, re-parse both
    - Assert merge ranges, header fill colors, totals row positions, remarks column position; assert A4 selection iff `TotalWidthMM ≤ 297`, A3 iff `≤ 420`, rejection iff `> 420`
    - **Validates: Requirements 4.2, 5.4, 5.7**

- [x] 18. Checkpoint - HTTP and exporters complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Frontend Master Reports page
  - [x] 19.1 Create the Next.js route shell at `web/src/app/master-reports/page.tsx`
    - Server component returning the client root `<MasterReportsPage>` from `./_components/MasterReportsPage`
    - Single route — no per-report sub-routes (Req 14.6)
    - _Requirements: 14.6_

  - [x] 19.2 Implement `<MasterReportsPage>` shell with the four DOM-id'd regions in `web/src/app/master-reports/_components/MasterReportsPage.tsx`
    - Top-to-bottom: `<ReportSelector>` (id `mcr-selector`), `<FilterBar>` (id `mcr-filter-bar`), `<ActionRegion>` (id `mcr-actions`), `<PreviewTable>` (id `mcr-preview`) with `<ExportButtons>` (id `mcr-exports`) nested inside
    - State model: `catalog | "loading" | {error}`, `selectedReportId`, `filterValues`, `generation: idle|inflight|{ok,payload}|{error}`, `jobId`, `searchQuery`
    - Fetch catalog via `@/lib/api` from `GET /api/master-reports/catalog` on mount
    - On report change: reset `filterValues` to schema defaults, clear `generation` to `idle`, disable Export buttons until next successful Generate (≤500ms, no full page reload)
    - On catalog load failure: render an `<ErrorBanner>` with a `<RetryButton>`; preserve `selectedReportId` and `filterValues` across retry (Req 14.5)
    - _Requirements: 3.1, 3.4, 3.5, 14.1, 14.4, 14.5_

  - [x] 19.3 Implement `<ReportSelector>` with case-insensitive substring search at `web/src/app/master-reports/_components/ReportSelector.tsx`
    - Search field filters `Report_Catalog` by case-insensitive substring match on `name` or `category`; update displayed list within 300ms of last keystroke
    - "No reports match your search" message on zero matches; previously selected report state is preserved (Req 14.3)
    - _Requirements: 14.2, 14.3_

  - [x] 19.4 Implement `<FilterBar>` driven by the selected ReportDefinition's `filters` field at `web/src/app/master-reports/_components/FilterBar.tsx`
    - Render exactly the controls declared in `def.filters` (no superset, no subset) within 500ms of selection change
    - On report switch, discard any values bound to keys not present in the new schema before rendering
    - _Requirements: 2.3, 2.7_

  - [x] 19.5 Implement `<ActionRegion>` with Generate + Force Recalculate + async-job polling at `web/src/app/master-reports/_components/ActionRegion.tsx`
    - `<GenerateButton>` posts to `/api/master-reports/{id}/generate` via `@/lib/api`
    - `<ForceRecalculateButton>` rendered iff principal holds BOTH `reports.<id>.view` and `reports.force_recalculate` per `usePermissions()`; omitted from DOM (not just hidden) when missing per Req 7.5; opens a confirmation dialog naming the report and Operational_Date before dispatch (Req 7.2)
    - On HTTP 202: store `jobId`, poll `GET /api/master-reports/jobs/{id}` every 2000ms via `useEffect`, stop on terminal status (`done`/`error`)
    - While a Generate / Force Recalculate is in flight: render Generate, Force Recalculate, Export to Excel, and Export to PDF in a disabled state; reject activations on those controls without dispatching (Req 3.5)
    - Progress indicator appears within 200ms of dispatch (Req 3.4)
    - _Requirements: 3.4, 3.5, 7.1, 7.2, 7.5, 11.2, 11.4, 14.4_

  - [x] 19.6 Implement `<PreviewTable>` driven by `PreviewLayout` at `web/src/app/master-reports/_components/PreviewTable.tsx`
    - `<PreviewHeader>` shows report name, resolved `operational_date` (YYYY-MM-DD), and applied filter summary rendered as label-value pairs ordered by `FilterSchema` key order (Req 3.3)
    - `<PreviewBody>` renders rows respecting `ColumnSpec.Type` formatting (2-dp decimals for percentages, integer for counts, YYYY-MM-DD for dates), `MergeRanges`, `FillHex`, `TotalsRows`, and `RemarksColumn`
    - Zero rows → render headers + merged titles + totals scaffolding with zero values + "No data for the selected filters" message; Export controls remain enabled (Req 3.6)
    - Generate or Force Recalculate failure → replace progress indicator with an error indication, preserve any previously rendered preview content, re-enable Generate and Force Recalculate controls (Req 3.7, 14.5)
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 14.5_

  - [x] 19.7 Implement `<ExportButtons>` (Excel + PDF) at `web/src/app/master-reports/_components/ExportButtons.tsx`
    - `<ExcelButton>` triggers `GET /api/master-reports/{id}/export.xlsx` with filters serialized as query params (browser-initiated download via anchor)
    - `<PdfButton>` triggers `GET /api/master-reports/{id}/export.pdf` with the same shape
    - Both disabled while any Generate / Force Recalculate request is in flight; re-enabled after completion or failure
    - _Requirements: 4.1, 4.4, 5.1, 5.3, 14.4_

  - [x] 19.8 Implement viewport notice and horizontal-scroll wrapper at `web/src/app/master-reports/_components/NoticeBar.tsx`
    - Render `<NoticeBar>` above the four primary regions when viewport width < 1280px (Req 13.2) with a desktop-only v1 message
    - Wrap the four regions in `<div style={{ overflowX: "auto" }}>` so all controls remain operable via horizontal scrolling without rearranging
    - Above 1280px no horizontal scroll, no overlapping or clipped controls (Req 13.1)
    - _Requirements: 13.1, 13.2_

  - [x] 19.9 Write property test for FilterBar visibility invariant (frontend)
    - **Property 3: FilterSchema Visibility Invariant**
    - File: `web/__tests__/master-reports/filter-bar.property.test.tsx`
    - Use `fast-check` to generate `(reportDef, priorSessionState)`; render `<FilterBar>` with React Testing Library
    - Assert rendered control keys equal `def.filters` keys exactly (no superset, no subset); values bound to non-schema keys are discarded on report switch
    - **Validates: Requirements 2.3, 2.7**

- [x] 20. Sidebar consolidation
  - [x] 20.1 Update `web/src/components/Sidebar.tsx` to remove the legacy Reports tree and add the Master Consolidated Reports item
    - Remove the entire `Reports` root item (`label: "Reports"`, `icon: BarChart3`) at line ~163 along with all six sub-groups: `Primary Reports`, `Vehicle & Movement`, `Waste Collection & D2D`, `Weighbridge & TS`, `Alerts & Events`, `Operations`
    - Remove the entire `Master Consolidated Report` root item (`label: "Master Consolidated Report"`, `icon: TrendingUp`) at line ~222 and its `Daily Master Consolidated Report → /ultimate-reports/daily` sub-item
    - Remove the now-dead mega-menu width/grid branches that match on `activeCategory === "Reports"` (`width: "600px"`, `grid-cols-3`) around lines 597–619
    - Add exactly one new root item: `{ label: "Master Consolidated Reports", icon: BarChart3, href: "/master-reports", permission: "reports.view" }`
    - Verify the existing `filterByPermissions` helper omits the item from rendered DOM when the principal lacks `reports.view` (it already does — no helper change)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 20.2 Write property test for sidebar visibility gate (frontend)
    - **Property 15: Sidebar Visibility Gate**
    - File: `web/__tests__/master-reports/sidebar.property.test.tsx`
    - Use `fast-check` to generate principals with random permission subsets; render `<Sidebar>` with React Testing Library
    - Assert the `Master Consolidated Reports` item is in the rendered DOM iff principal holds `reports.view`; when absent, the item is neither visible nor focusable via keyboard navigation
    - Snapshot assertion: no DOM node with legacy labels (`Primary Reports`, `Master Consolidated Report`, `/ultimate-reports/daily`) exists regardless of role (Req 9.2)
    - **Validates: Requirements 9.3, 9.4**

- [x] 21. Checkpoint - Frontend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 22. Integration and smoke tests
  - [x] 22.1 Integration test for the full Generate → Cache → Force_Recalculate → Export cycle
    - File: `internal/masterreport/integration_test.go`
    - Boot the API against a Postgres test container; `POST /generate` and assert `path=recomputed`; repeat and assert `path=cache_hit`; `POST /recalculate` and assert `path=force_recomputed`; `GET /export.xlsx` and `/export.pdf` and assert headers + content
    - _Requirements: 4.5, 5.5, 6.2, 7.3, 12.1_

  - [x] 22.2 Smoke test for RBAC seeding completeness
    - File: `internal/masterreport/seed_smoke_test.go`
    - Boot the app; assert every `reports.<id>.{view,export,generate}` row exists in `permissions` for every registered ReportDefinition; assert `reports.view` and `reports.force_recalculate` rows exist under `CategoryID = 5`
    - _Requirements: 8.1, 8.2, 8.8_

  - [x] 22.3 Snapshot tests for Master Reports page at desktop viewports
    - File: `web/__tests__/master-reports/page.snapshot.test.tsx`
    - Render `<MasterReportsPage>` at 1024, 1280, 1920, 2560; assert no horizontal scroll above 1280, all four DOM-id'd regions present, notice bar appears below 1280 without rearranging regions
    - _Requirements: 13.1, 13.2_

- [x] 23. Final checkpoint - Production readiness
  - Run `docker compose up -d --build --force-recreate app` and verify the backend boots cleanly with `report_output_cache` migration applied and all permission rows seeded
  - Run `cd web && npm run build` and verify the frontend builds cleanly
  - Run the full test suite: every property test (15 total, 200 iterations in CI) passes; every integration and smoke test passes
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP, but every property test carries a universal correctness contract from design §5; skipping defers verification of the corresponding requirements.
- Foundation-first ordering is strict: `internal/shift/` lands before adapters; the migration lands before `OutputCacheRepo`; the `Catalog` and `DataSource` interfaces land before the 25 report registrations; engines (SmartLoader, ForceRecalculator) land before HTTP handlers.
- Existing report handlers are reused via `existingHandlerAdapter` — no SQL is duplicated. Only `rfid_collection`, `daily_vehicle_deployment`, and `gts_weighbridge_summary` introduce new aggregation SQL (per design §3.2).
- The shared `BoundedWorkerPool` instance is constructed once in `masterreport.New` and injected into every `DataSource.Compute`. Existing handlers that already use internal pools (e.g., `GetD2DRouteCoverageReport`) are refactored to use the injected pool when the adapter is wired so the cap stays global.
- RBAC seeding is idempotent (`ON CONFLICT DO NOTHING`); re-runs are safe. First boot after deploy creates up to 78 new permission rows. Non-admin users see no reports until an admin grants per-role `reports.<id>.view` on the Roles page — communicate this in release notes.
- Property tests live at `internal/masterreport/*_property_test.go` (`pgregory.net/rapid`) and `web/__tests__/master-reports/*.property.test.tsx` (`fast-check`); 100 iterations per property locally, 200 in CI (`RAPID_CHECKS=200`).
- The frontend uses the existing `@/lib/api` auth helper, `usePermissions()`, and (where applicable) the `DeleteButton` pattern instead of `window.confirm`. No new client-side patterns are introduced.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "6.1", "12.1"] },
    { "id": 1, "tasks": ["1.2", "3.2", "3.3", "4.1", "4.2", "5.1", "6.2", "7.1", "9.1", "12.2"] },
    { "id": 2, "tasks": ["4.3", "4.4", "7.2", "7.3", "9.2", "10.1", "11.1", "12.3", "14.1", "16.1", "17.1"] },
    { "id": 3, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10", "8.11", "8.12", "10.2", "10.3", "11.2", "17.2", "17.3"] },
    { "id": 4, "tasks": ["14.2", "15.1"] },
    { "id": 5, "tasks": ["14.3", "15.2", "15.3", "19.1", "20.1"] },
    { "id": 6, "tasks": ["15.4", "19.2", "20.2"] },
    { "id": 7, "tasks": ["19.3", "19.4", "19.5", "19.6", "19.7", "19.8"] },
    { "id": 8, "tasks": ["19.9", "22.1", "22.2", "22.3"] }
  ]
}
```
