# Requirements Document

## Introduction

The Master Consolidated Reporting module is a unified, in-product reporting engine that replaces today's manual workflow of stitching together approximately 25 shift-based operational reports into a daily Excel workbook (`ULTIMATE REPORTING.xlsx`). It provides operations staff with a single page in the web admin where they can pick a report definition from a catalog, apply a per-report filter set, preview the result rendered to match the original Excel template's layout, and export the same content to Excel or PDF.

The module reuses existing report data sources in `internal/api/report_handlers.go` (D2D coverage, geofence events, GTS trips, alerts, attendance, RFID, weighbridge, vehicle deployment, active vehicle summaries, etc.) rather than duplicating them, and aggregates new data only where no existing source covers a worksheet. The existing single-report `internal/ultimatereport` registry is generalized into a full 25-report catalog backed by `ReportDefinition` metadata (filter schema, permission key, data source, template).

Behavior follows the Smart Load model described in `docs/reporting-architecture-redesign.md`: the default Generate action serves cached/precomputed data when valid and recomputes only when missing, stale, or invalidated; a Force Recalculate control regenerates from raw GPS, attendance, RFID, and weighbridge data and is gated by an admin permission. Every report becomes RBAC-gated at the report-definition level. Excel and PDF exports are produced server-side to preserve the original workbook's merged headers, color shading, totals rows, and remarks columns. The entire legacy Reports sidebar tree is removed in v1; mobile and scheduled delivery are explicitly out of scope for v1.

## Glossary

- **Master_Reporting_Module**: The new in-product feature comprising the single Master Consolidated Reports web page, its backend handlers, the report catalog, the Smart Load / Force Recalculate engine, the server-side export pipeline, and the report-level RBAC integration.
- **Report_Catalog**: The persisted, ordered set of Report_Definition entries available to the Master_Reporting_Module, presented to users as the report selector on the Master Consolidated Reports page.
- **Report_Definition**: A single registered report descriptor containing a stable identifier, display name, category, Filter_Schema, Permission_Key, data source binding (existing handler or new aggregation query), Excel template reference, and Preview_Layout descriptor.
- **Filter_Schema**: The declarative list of filter controls (e.g., date, date range, zone, ward, shift, vehicle, route, department, employee) that apply to a single Report_Definition; the page's filter bar is rendered from this schema for the currently selected report.
- **Shared_Filter_Bar**: The dynamic filter region on the Master Consolidated Reports page that shows or hides individual filter controls based on the selected Report_Definition's Filter_Schema.
- **In_Page_Preview**: The HTML rendering of a generated report inside the Master Consolidated Reports page, laid out to match the corresponding worksheet in `ULTIMATE REPORTING.xlsx` (merged title cells, column headers, color shading, totals rows, remarks columns).
- **Excel_Exporter**: The server-side component that produces an `.xlsx` file from a generated report, preserving the source worksheet's formatting (cell merges, header styling, color shading, totals rows, remarks columns). Implementation expected to use a Go Excel library (e.g., `excelize`).
- **PDF_Exporter**: The server-side component that produces a `.pdf` file from a generated report with the same visual structure as the In_Page_Preview and the Excel_Exporter output.
- **Smart_Load**: The default Generate action; serves an existing Output_Cache entry when it is present and not invalidated, otherwise recomputes the report from its data source and writes the result to the Output_Cache, following the validity model in `docs/reporting-architecture-redesign.md`.
- **Force_Recalculate**: An explicit user action that bypasses the Output_Cache, recomputes the report from raw GPS, attendance, RFID, and weighbridge data, overwrites the Output_Cache, and is gated by the `reports.force_recalculate` permission.
- **Output_Cache**: The persisted cache of generated report payloads keyed by `(report_key, filter_hash, operational_date)`, with a validity status field (`valid` | `stale` | `computing` | `error`) consistent with the freshness model in `docs/reporting-architecture-redesign.md`.
- **Filter_Hash**: A deterministic, order-independent hash of the normalized filter values used to key Output_Cache entries.
- **Permission_Key**: A string of the form `reports.<report_id>.view` (and optionally `.export` / `.generate` in later phases) assigned to each Report_Definition and registered in the existing `permissions` table; the v1 baseline grants export rights to any principal holding `.view`.
- **Base_Permission**: The permission `reports.view`, required to load the Master Consolidated Reports page itself and to see the sidebar entry.
- **Sidebar**: The web admin navigation defined in `web/src/components/Sidebar.tsx`.
- **Audit_Logger**: The existing `internal/audit` package used to persist who-did-what-when records for every Generate, Force_Recalculate, and Export action against the Master_Reporting_Module.
- **Operational_Date**: The shift-aware reporting day anchor defined in `docs/reporting-architecture-redesign.md` (e.g., a night shift 18:00 → next-day 06:00 is attributed to its start day).
- **Bounded_Worker_Pool**: The capped concurrency pattern already used in `GetD2DRouteCoverageReport` (`maxConcurrentVehicles = 12`) that the Master_Reporting_Module reuses for per-vehicle, per-zone, and per-ward subqueries.

## Requirements

### Requirement 1: Report Catalog Coverage

**User Story:** As an operations manager, I want every worksheet in the legacy `ULTIMATE REPORTING.xlsx` workbook to be available as a selectable report in the new module, so that I no longer have to assemble the workbook manually.

#### Acceptance Criteria

1. THE Report_Catalog SHALL contain exactly one Report_Definition for every non-hidden worksheet present in the v1 `ULTIMATE REPORTING.xlsx` template, with a minimum of 25 Report_Definitions registered at module initialization.
2. THE Report_Catalog SHALL include Report_Definitions for the following named reports: 07:00 AM Road Sweeping, 07:30 AM Open Depot GVP Coverage, 08:00 AM Helper Attendance, Zone-wise Coverage (one Report_Definition per zone present in the template), RFID Collection, Weighbridge / GTS Trip, Daily Vehicle Deployment, Active Vehicle Summary, Driver Attendance Summary, Supervisor Attendance Summary, and Zone Manager Attendance Summary.
3. WHERE an existing handler in `internal/api/report_handlers.go` already produces data for a worksheet, THE Report_Definition SHALL bind its data source to that handler rather than to a duplicate query.
4. WHERE no existing handler covers a worksheet, THE Report_Definition SHALL bind its data source to a new aggregation query implemented inside the Master_Reporting_Module.
5. THE Report_Catalog SHALL expose each Report_Definition with a non-empty stable `report_id` (immutable across releases, maximum 64 characters, matching `^[a-z0-9_]+$`), a human-readable `name` (1 to 120 characters), a `category` grouping drawn from a fixed enumeration defined in the Master_Reporting_Module, and a non-empty `permission_key` (maximum 64 characters) that matches an entry in the RBAC permissions table.
6. WHEN the Master Consolidated Reports page is opened by an authenticated principal, THE Master_Reporting_Module SHALL return the Report_Catalog filtered to the Report_Definitions whose `permission_key` the requesting principal holds, within 2 seconds for catalogs of up to 100 Report_Definitions.
7. IF the requesting principal is unauthenticated or holds no matching `permission_key`, THEN THE Master_Reporting_Module SHALL return an empty Report_Catalog and an authorization error indicating that no reports are accessible, without exposing Report_Definition metadata.
8. IF Report_Catalog initialization detects a worksheet in the v1 template with no bound data source, a duplicate `report_id`, or a `permission_key` not present in the RBAC permissions table, THEN THE Master_Reporting_Module SHALL fail startup and surface an error identifying each offending worksheet or Report_Definition.

### Requirement 2: Per-Report Filter Schema

**User Story:** As an operations user, I want the filter bar on the Master Consolidated Reports page to show only the filters that apply to the selected report, so that I am not distracted by irrelevant controls.

#### Acceptance Criteria

1. THE Report_Definition SHALL declare a Filter_Schema listing each applicable filter control by key and type, where the key is drawn from the closed set: `date`, `date_range`, `zone`, `ward`, `shift`, `vehicle`, `route`, `route_type`, `department`, `designation`, `employee`.
2. THE Filter_Schema SHALL mark each declared filter control as exactly one of `required` or `optional`, with no control left unmarked.
3. WHEN a user selects a Report_Definition in the report selector, THE Shared_Filter_Bar SHALL render exactly the controls declared in that Report_Definition's Filter_Schema within 500 milliseconds and SHALL hide every control whose key is not in the Filter_Schema.
4. IF one or more required filters in the current Filter_Schema are unset (value is null, an empty string, or an empty collection) when the user clicks Generate, THEN THE Master_Reporting_Module SHALL block the request and SHALL return a validation error listing every missing required filter key.
5. IF a filter value is supplied for a filter key not present in the current Filter_Schema, THEN THE Master_Reporting_Module SHALL reject the request with a validation error identifying every unsupported filter key supplied.
6. THE Master_Reporting_Module SHALL compute the Filter_Hash for an accepted filter set such that two filter sets containing identical key-value pairs produce the same Filter_Hash regardless of the order in which the filters were supplied, before using the value as an Output_Cache key.
7. WHEN the user switches the selected Report_Definition, THE Shared_Filter_Bar SHALL discard any filter values bound to keys not present in the new Filter_Schema before rendering the new control set.

### Requirement 3: In-Page Preview Rendering

**User Story:** As an operations user, I want a generated report to render inside the page in the same visual layout as the Excel workbook, so that I can verify the result before exporting.

#### Acceptance Criteria

1. WHEN Generate completes successfully, THE Master_Reporting_Module SHALL render the report inside the page using an In_Page_Preview within 2 seconds of payload arrival, matching the corresponding worksheet's column count, column ordering, merged header titles (identical merge ranges), row groupings, totals row labels and computed values, and remarks column positions.
2. THE In_Page_Preview SHALL display the same cell values that the Excel_Exporter will write for the same `(report_id, filter set)` invocation in the same session, where "same" means character-for-character equality after applying identical numeric precision (two decimal places for percentages, integer for counts) and identical date format (`YYYY-MM-DD`), with no whitespace trimming or case changes.
3. THE In_Page_Preview SHALL display, above the rendered table, the report's `name`, the resolved Operational_Date or date range in `YYYY-MM-DD` form, and the applied filter summary rendered as label-value pairs ordered by the Filter_Schema key order.
4. WHILE a Generate or Force_Recalculate request is in flight for the selected Report_Definition, THE In_Page_Preview SHALL display a progress indicator within 200 milliseconds of request dispatch.
5. WHILE a Generate or Force_Recalculate request is in flight for the selected Report_Definition, THE Master Consolidated Reports page SHALL render the Generate, Force Recalculate, Export to Excel, and Export to PDF controls in a disabled state and SHALL reject any activation attempt on those controls without dispatching a new request.
6. IF the data source for the selected Report_Definition returns zero rows for the applied filter set, THEN THE In_Page_Preview SHALL render the report's header, merged title cells, and totals scaffolding with zero values, SHALL display a "No data for the selected filters" message inside the body region, AND THE Export to Excel and Export to PDF controls SHALL remain enabled to allow export of the empty result.
7. IF a Generate or Force_Recalculate request fails or exceeds 60 seconds without returning a payload, THEN THE In_Page_Preview SHALL replace the progress indicator with an error indication describing the failure category, SHALL preserve any previously rendered preview content from the prior successful generation, and SHALL re-enable the Generate and Force Recalculate controls.

### Requirement 4: Excel Export

**User Story:** As an operations user, I want to export the previewed report to Excel with the same formatting as the legacy workbook, so that downstream stakeholders receive a familiar file.

#### Acceptance Criteria

1. WHEN the user clicks Export to Excel for a generated report, THE Master_Reporting_Module SHALL produce a server-generated `.xlsx` file in which every visible cell value, at the same row and column position, is exactly equal (character-for-character, after trimming no whitespace and applying no case change) to the corresponding cell rendered in the In_Page_Preview for the same `(report_id, filter set)` invocation, and SHALL begin streaming the file to the client within 10 seconds of the click for reports containing up to 50,000 data rows.
2. THE Excel_Exporter SHALL reproduce, in the produced `.xlsx` file, the source worksheet's merged title cells (identical merge ranges), column header cells (identical text and identical background fill color), color shading (identical fill color on the identical set of cells), totals rows (identical row position, identical label text, and identical computed value), and remarks columns (identical column position and identical text content), such that a cell-by-cell comparison against the source workbook layout reports zero differences in those attributes.
3. THE Excel_Exporter SHALL execute on the Go backend process and SHALL NOT require the client to perform any part of `.xlsx` file assembly.
4. WHEN the Excel_Exporter has produced the `.xlsx` file, THE Master_Reporting_Module SHALL stream the file to the client with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and a `Content-Disposition: attachment` header whose filename is of the form `{report_id}_{Operational_Date formatted as YYYY-MM-DD}.xlsx`.
5. IF Excel export is requested for a `(report_id, filter set)` that has no current generated result in the user's session and no valid Output_Cache entry, THEN THE Master_Reporting_Module SHALL invoke Smart_Load to generate the report before producing the file, and SHALL begin streaming the file to the client within 30 seconds of the request for reports containing up to 50,000 data rows.
6. IF Excel generation fails after the report data is available, THEN THE Master_Reporting_Module SHALL return an error response that names the export stage at which the failure occurred, SHALL leave the validity of the existing Output_Cache entry unchanged, and SHALL NOT deliver any partial `.xlsx` content to the client.
7. IF the generated report for the requested `(report_id, filter set)` contains zero data rows, THEN THE Excel_Exporter SHALL still produce a `.xlsx` file containing the merged title cells, column header cells, and an empty data area with no totals row computed value, and THE Master_Reporting_Module SHALL stream that file using the same `Content-Type` and `Content-Disposition` headers specified in criterion 4.

### Requirement 5: PDF Export

**User Story:** As an operations user, I want to export the previewed report to PDF with the same visual structure as the Excel and the in-page preview, so that I can share a read-only copy.

#### Acceptance Criteria

1. WHEN the user clicks Export to PDF for a generated report, THE Master_Reporting_Module SHALL produce a server-generated `.pdf` file within 30 seconds whose visual layout matches the In_Page_Preview for the same `(report_id, filter set)` invocation, where match means identical row count, identical column count and ordering, identical column header text, identical cell values, identical merged title cells, identical color shading per the Report_Definition's Preview_Layout descriptor, identical totals rows, and identical remarks columns.
2. THE PDF_Exporter SHALL run on the Go backend.
3. WHEN the PDF_Exporter completes file generation, THE Master_Reporting_Module SHALL stream the produced `.pdf` file to the client with `Content-Type: application/pdf` and a `Content-Disposition: attachment` header whose filename includes the `report_id` and the Operational_Date formatted as `YYYY-MM-DD` and ends with the `.pdf` extension.
4. THE PDF_Exporter SHALL fit each report's content to A4 landscape when the total declared column width in the Report_Definition's Preview_Layout descriptor is at most 297 millimeters, and to A3 landscape when the total declared column width is greater than 297 millimeters and at most 420 millimeters.
5. IF PDF export is requested for a `(report_id, filter set)` that has no current generated result in the user's session and no valid Output_Cache entry, THEN THE Master_Reporting_Module SHALL generate the report using Smart_Load before producing the file.
6. IF PDF generation fails, or if PDF generation exceeds 30 seconds, THEN THE Master_Reporting_Module SHALL abort the export, return an error response to the client indicating PDF generation failure, and preserve the user's existing session report data without modification.
7. IF the total declared column width in the Report_Definition's Preview_Layout descriptor exceeds 420 millimeters, THEN THE PDF_Exporter SHALL reject the export request and return an error response indicating that the report exceeds the supported PDF page size.

### Requirement 6: Smart Load Default Behavior

**User Story:** As an operations user, I want the default Generate action to return instantly when valid cached results exist, and to recompute only when needed, so that day-to-day report views are fast.

#### Acceptance Criteria

1. WHEN the user clicks Generate, THE Master_Reporting_Module SHALL execute Smart_Load for the `(report_id, filter_hash, operational_date)` key within 200 milliseconds of receiving the request.
2. WHILE an Output_Cache entry for the current `(report_id, filter_hash, operational_date)` key exists with status `valid` and its `computed_at` timestamp is within the applicable TTL window (60 seconds for live-day entries, 24 hours for historical entries), THE Master_Reporting_Module SHALL return the cached payload without invoking the report's data source and SHALL complete the response within 500 milliseconds.
3. IF the Output_Cache entry for the current key is absent, has status `stale`, has `computed_at` older than the applicable TTL window, or has status `computing` with `computing_since` older than 5 minutes, THEN THE Master_Reporting_Module SHALL recompute the report from its data source, overwrite the Output_Cache entry with status `valid` and an updated `computed_at` timestamp, and return the recomputed payload.
4. WHILE the requested Operational_Date is the current operational day or covers an active shift, THE Master_Reporting_Module SHALL apply a TTL of 60 seconds to the Output_Cache entry per the live-day rules in `docs/reporting-architecture-redesign.md` and SHALL recompute when `computed_at` is older than 60 seconds.
5. WHEN Smart_Load completes, THE Master_Reporting_Module SHALL return a response field with a value of either `cache_hit` or `recomputed` indicating whether the payload was served from the Output_Cache or recomputed.
6. WHILE an Output_Cache entry for the current key has status `computing` with `computing_since` within the last 5 minutes, THE Master_Reporting_Module SHALL wait for that in-progress recompute to complete for up to 30 seconds and return the resulting payload, rather than initiating a parallel recompute.
7. IF the recompute operation fails or exceeds 30 seconds, THEN THE Master_Reporting_Module SHALL preserve the prior Output_Cache entry state without overwriting it with an invalid payload, and SHALL return an error response indicating that recompute failed along with the failure category.

### Requirement 7: Force Recalculate

**User Story:** As an admin, I want a Force Recalculate control that regenerates a report from raw data and overwrites the cache, so that I can correct suspected staleness or engine bugs.

#### Acceptance Criteria

1. WHILE the requesting principal holds the `reports.force_recalculate` permission, THE Master Consolidated Reports page SHALL render an enabled Force Recalculate control positioned next to the Generate control.
2. WHEN the user clicks Force Recalculate, THE Master Consolidated Reports page SHALL display a confirmation prompt naming the current `report_id` and the resolved Operational_Date and SHALL NOT dispatch the request until the user confirms the action.
3. WHEN the user confirms a Force Recalculate request, THE Master_Reporting_Module SHALL recompute the report from raw GPS, attendance, RFID, and weighbridge data, SHALL bypass any existing Output_Cache entry, SHALL set the Output_Cache entry status to `computing` for the duration of the recompute, and SHALL overwrite the Output_Cache entry with the recomputed payload and status `valid` for the current `(report_id, filter_hash, operational_date)` key upon successful completion.
4. IF the requesting principal does not hold the `reports.force_recalculate` permission, THEN THE Master_Reporting_Module SHALL reject the request with a permission-denied error indication and SHALL NOT recompute the report or alter any Output_Cache entry.
5. WHILE the principal lacks the `reports.force_recalculate` permission, THE Master Consolidated Reports page SHALL omit the Force Recalculate control from the rendered DOM such that it is neither visible nor activatable via keyboard navigation.
6. IF a Force_Recalculate request fails due to a raw data fetch error, a downstream service error, or a processing timeout exceeding 30 seconds, THEN THE Master_Reporting_Module SHALL preserve the prior Output_Cache entry value and status unchanged, return an error response describing the failure category, and emit an audit record indicating the failure (per Requirement 10).
7. WHEN a Force_Recalculate completes successfully, THE Master_Reporting_Module SHALL return a response field with value `force_recomputed` indicating that the payload was force-recomputed and SHALL include the new `computed_at` timestamp.
8. IF a Force_Recalculate is requested for a `(report_id, filter_hash, operational_date)` key whose Output_Cache entry is already in `computing` status from a concurrent Force_Recalculate or Smart_Load recompute, THEN THE Master_Reporting_Module SHALL coalesce the new request onto the in-flight recompute and return its result, rather than starting a parallel raw-data recompute.

### Requirement 8: Report-Level RBAC

**User Story:** As a system administrator, I want to grant or revoke access to each report independently per role, so that operations staff only see the reports they are authorized to view.

#### Acceptance Criteria

1. WHEN a Report_Definition is registered in the Report_Catalog, THE Master_Reporting_Module SHALL ensure a row exists in the existing `permissions` table with key `reports.<report_id>.view` and category `Reports`, creating the row if absent and leaving it unchanged if already present.
2. WHEN the Master_Reporting_Module starts, THE Master_Reporting_Module SHALL register the `reports.view` Base_Permission and the `reports.force_recalculate` admin permission in the `permissions` table under the `Reports` category, creating each row if absent and leaving existing rows unchanged.
3. WHEN a Generate, Export to Excel, or Export to PDF request is received for a `report_id`, THE Master_Reporting_Module SHALL require the requesting principal to hold `reports.<report_id>.view` and SHALL reject the request with a permission-denied response indicating insufficient privileges when the principal does not hold it.
4. WHEN a Force_Recalculate request is received for a `report_id`, THE Master_Reporting_Module SHALL require the requesting principal to hold both `reports.<report_id>.view` and `reports.force_recalculate` and SHALL reject the request with a permission-denied response indicating insufficient privileges when either permission is missing.
5. THE Master Consolidated Reports page SHALL omit any Report_Definition whose `reports.<report_id>.view` permission the requesting principal does not hold from the report selector list.
6. THE Roles & Permissions page at `web/src/app/vswm/employee-management/roles/page.tsx` SHALL render every `reports.<report_id>.view` permission under a "Reports" category group and SHALL allow administrators to toggle each permission on or off per role.
7. IF a principal holds `reports.<report_id>.view`, THEN THE Master_Reporting_Module SHALL accept Export to Excel and Export to PDF requests for that `report_id` without requiring a separate export permission.
8. THE Master_Reporting_Module SHALL register `reports.<report_id>.view`, `reports.<report_id>.export`, and `reports.<report_id>.generate` as separate rows in the `permissions` table so that future phases can grant or revoke each right independently without a schema change.

### Requirement 9: Sidebar Consolidation

**User Story:** As an operations user, I want a single "Master Consolidated Reports" entry in the sidebar that replaces the previous Reports tree, so that I have one obvious place to go for reports.

#### Acceptance Criteria

1. THE Sidebar SHALL render exactly one root-level navigation item with the visible label "Master Consolidated Reports" that, when activated, links to the Master Consolidated Reports page at a single fixed route.
2. THE Sidebar SHALL NOT render the legacy "Reports" root-level item nor any of its sub-categories ("Primary Reports", "Vehicle & Movement", "Waste Collection & D2D", "Weighbridge & TS", "Alerts & Events", "Operations"), and SHALL NOT render the legacy "Master Consolidated Report" root-level item nor its sub-item "Daily Master Consolidated Report", regardless of user role or permissions.
3. IF the requesting principal does not hold the `reports.view` Base_Permission, THEN THE Sidebar SHALL omit the "Master Consolidated Reports" navigation item from the rendered DOM such that it is neither visible nor focusable via keyboard navigation.
4. WHILE the requesting principal holds the `reports.view` Base_Permission, THE Sidebar SHALL render the "Master Consolidated Reports" navigation item in an enabled, clickable state.
5. WHEN a user activates the "Master Consolidated Reports" sidebar item via mouse click, keyboard Enter, or touch tap, THE web admin SHALL navigate to the single Master Consolidated Reports page within 2 seconds under nominal network conditions, and SHALL NOT render or route to any per-Report_Definition page.
6. IF navigation to the Master Consolidated Reports page fails due to a network error, authorization rejection, or server error, THEN THE web admin SHALL keep the user on the current page, display an error indication describing the failure cause, and preserve any unsaved state on the originating page.

### Requirement 10: Audit Logging

**User Story:** As a compliance officer, I want every report Generate, Force Recalculate, and Export action recorded with the actor, timestamp, report, and filters, so that we can reconstruct who accessed what data.

#### Acceptance Criteria

1. WHEN a Generate, Force_Recalculate, Export to Excel, or Export to PDF request completes (success or failure), THE Master_Reporting_Module SHALL emit exactly one record to the Audit_Logger containing the `user_id`, `user_email`, `action` (one of `report.generate`, `report.force_recalculate`, `report.export.excel`, `report.export.pdf`), `report_id`, the applied filter set as JSON (maximum 16,384 bytes, truncated with a `filters_truncated: true` flag if longer), the Filter_Hash, the request timestamp in UTC with millisecond precision, the request outcome (`success` | `error`), and the resulting HTTP status code in the range 100–599.
2. THE Master_Reporting_Module SHALL emit the audit record to the Audit_Logger within 500 milliseconds before returning the HTTP response to the client.
3. IF the request is received without a resolvable authenticated principal, THEN THE Master_Reporting_Module SHALL still emit an audit record with `user_id` set to the literal string `anonymous`, `user_email` set to the literal string `anonymous`, and the request outcome reflecting the rejection.
4. IF the Audit_Logger write fails or exceeds the 500 millisecond emit deadline, THEN THE Master_Reporting_Module SHALL log the failure to the application logger at error level including the attempted `user_id`, `action`, `report_id`, and Filter_Hash, SHALL NOT retry inline, SHALL NOT alter the report response payload or status returned to the client, and SHALL still return the report response.
5. THE Master_Reporting_Module SHALL persist audit records through the existing `internal/audit` package and SHALL NOT introduce a separate audit table or alternative storage path.

### Requirement 11: Performance and Bounded Concurrency

**User Story:** As a backend operator, I want report generation to not exhaust the request pool, so that the reports module stays responsive under load.

#### Acceptance Criteria

1. WHEN a Report_Definition's data source fans out per-vehicle, per-zone, or per-ward, THE Master_Reporting_Module SHALL execute the fan-out through a Bounded_Worker_Pool sized no larger than `maxConcurrentVehicles = 12`, queuing additional units of work in FIFO order with a maximum backlog of 1000 items until a worker becomes available, matching the pattern already used in `GetD2DRouteCoverageReport`.
2. IF a Generate or Force_Recalculate request exceeds 30 seconds of synchronous processing, THEN THE Master_Reporting_Module SHALL return HTTP 202 with a job identifier (16 to 64 alphanumeric characters) within 1 second of crossing the 30-second threshold and SHALL continue computation in the background for up to a hard ceiling of 15 minutes, writing the result to the Output_Cache when complete.
3. WHILE a background job for a `(report_id, filter_hash, operational_date)` key is running, THE Master_Reporting_Module SHALL set the corresponding Output_Cache entry status to `computing` and SHALL return the existing job's identifier within 200 milliseconds for any concurrent request matching the same key without spawning a duplicate job or reserving an additional Bounded_Worker_Pool slot.
4. WHEN the user polls the job identifier returned in criterion 2 within 24 hours of issuance, THE Master_Reporting_Module SHALL respond within 500 milliseconds with the job's status (`pending` | `running` | `done` | `error`) and, on `done`, SHALL include the generated payload or a payload-fetch URL valid for at least 1 hour from the time of the poll response; on `error`, SHALL include an error reason indicator.
5. IF a background job exceeds its 15-minute computation ceiling or encounters an unrecoverable processing failure, THEN THE Master_Reporting_Module SHALL set the Output_Cache entry status to `error` with an error indication describing the failure cause, SHALL release the Bounded_Worker_Pool slot, and SHALL return that `error` status on subsequent polls of the affected job identifier, retaining the failed-job record for at least 1 hour.
6. IF the Bounded_Worker_Pool backlog reaches 1000 items, THEN THE Master_Reporting_Module SHALL reject new fan-out work with an overload error response and SHALL preserve all enqueued work unaffected.
7. IF a poll request references a job identifier that is unknown, never issued, or older than 24 hours since issuance, THEN THE Master_Reporting_Module SHALL respond with a not-found error indication, SHALL NOT alter any Output_Cache entry, and SHALL NOT enqueue work on the Bounded_Worker_Pool.

### Requirement 12: Output Caching

**User Story:** As an operations user, I want repeated views of the same report and filters to be instant, so that re-opening a report does not re-run heavy queries.

#### Acceptance Criteria

1. WHEN a Generate or Force_Recalculate completes successfully, THE Master_Reporting_Module SHALL upsert an Output_Cache entry within 2 seconds keyed by `(report_id, filter_hash, operational_date)` containing the generated payload, `route_version` or equivalent input version when the underlying data source exposes a version identifier, `computed_at` timestamp in UTC, and status `valid`.
2. WHEN the underlying data source for a Report_Definition signals invalidation (for example, a route edit invalidating coverage rows per `docs/reporting-architecture-redesign.md`), THE Master_Reporting_Module SHALL mark all Output_Cache entries whose `report_id` is registered as a consumer of that data source as `stale` within 5 seconds of receiving the invalidation signal.
3. THE Output_Cache SHALL store payloads keyed by Operational_Date, where Operational_Date is defined as the reporting day boundary configured per Report_Definition (defaulting to 04:00:00 local time of day D through 03:59:59 local time of day D+1), so that night shifts crossing midnight resolve to the correct reporting day.
4. WHILE an Output_Cache entry has status `stale`, THE Master_Reporting_Module SHALL recompute on the next Smart_Load for its key before serving the payload, AND SHALL deduplicate concurrent Smart_Load requests for the same key such that only one recompute executes at a time while other concurrent requests wait up to 30 seconds for the in-flight result before returning a timeout error indication.
5. IF the Output_Cache write fails after a successful recompute, THEN THE Master_Reporting_Module SHALL still return the recomputed payload to the client within the same response and SHALL log the cache write failure at warn level including the cache key and a failure reason indication.
6. WHEN an Output_Cache entry's `computed_at` is older than 30 days, THE Master_Reporting_Module SHALL evict the entry from the Output_Cache.
7. IF a recompute triggered by a stale Output_Cache entry fails, THEN THE Master_Reporting_Module SHALL retain the existing stale payload unchanged, SHALL return an error response to the client indicating recompute failure, and SHALL keep the entry's status as `stale` so that the next Smart_Load retries the recompute.

### Requirement 13: Desktop-Only Scope for v1

**User Story:** As a product owner, I want the Master Consolidated Reports page to be desktop-first in v1 with mobile and scheduling out of scope, so that we ship the core engine before extending surfaces.

#### Acceptance Criteria

1. WHEN the Master Consolidated Reports page is opened at a viewport width between 1280 pixels and 2560 pixels in the latest two stable releases of Chrome, Edge, Firefox, or Safari, THE Master Consolidated Reports page SHALL render with no horizontal scroll, no overlapping or clipped controls, and all controls (report selector, Shared_Filter_Bar, Generate, Force Recalculate, In_Page_Preview, Export to Excel, Export to PDF) visible and operable.
2. IF the Master Consolidated Reports page is opened at a viewport width below 1280 pixels, THEN THE Master Consolidated Reports page SHALL display a notice indicating that the page is desktop-only in v1 and SHALL permit horizontal scrolling to access controls, without rearranging the four primary regions.
3. IF a Generate, Force_Recalculate, Export to Excel, or Export to PDF request is received under the mobile API surface in `internal/api/mobile_handlers.go`, THEN THE Master_Reporting_Module SHALL reject the request with a not-found or method-not-allowed error response and SHALL preserve all server state without modification.
4. THE Master_Reporting_Module SHALL NOT implement scheduled delivery, email delivery, recurring background generation, or scheduled exports in v1, including any cron, queue consumer, timer, or worker that invokes Generate, Force_Recalculate, Export to Excel, or Export to PDF on a schedule.
5. THE Master_Reporting_Module's backend SHALL expose callable functions for Generate, Export to Excel, and Export to PDF that accept the Report_Definition identifier and execution parameters as inputs and produce outputs identical to those returned by the page-driven invocations, without requiring any change to the Report_Definition schema, so that a future scheduler can invoke the same code paths.

### Requirement 14: Single-Page Architecture

**User Story:** As an operations user, I want one Master Consolidated Reports page that lets me pick any report and run it, so that I do not have to navigate between separate per-report pages.

#### Acceptance Criteria

1. THE Master Consolidated Reports page SHALL render four primary regions, identified by stable DOM identifiers, in this top-to-bottom order: a report selector listing the Report_Catalog, the Shared_Filter_Bar, an action region containing the Generate and Force Recalculate controls, and the In_Page_Preview region containing the Export to Excel and Export to PDF controls.
2. WHILE the user types in the report selector search field, THE report selector SHALL filter the Report_Catalog to entries whose `name` or `category` field contains the search string as a case-insensitive substring match and SHALL update the displayed list within 300 milliseconds of the last keystroke.
3. IF the report selector search yields zero matching Report_Definitions, THEN THE report selector SHALL display a "No reports match your search" message and SHALL keep any previously selected Report_Definition's state unchanged.
4. WHEN the user changes the selected Report_Definition, THE Master Consolidated Reports page SHALL update the Shared_Filter_Bar to the new Filter_Schema, reset all filter controls to their default values, clear any previously rendered In_Page_Preview, and disable the Export to Excel and Export to PDF controls until a new preview is generated, completing the transition within 500 milliseconds without a full page reload.
5. IF loading the Report_Catalog or a Report_Definition's Filter_Schema fails, THEN THE Master Consolidated Reports page SHALL display an error indication identifying the failure, render a Retry control that re-attempts the load, and preserve any prior selection and filter values until the retry succeeds.
6. THE Master_Reporting_Module SHALL expose exactly one route under `web/src/app/` for the Master Consolidated Reports page and SHALL NOT add a separate page or route per Report_Definition.

## Correctness Properties

The following properties are candidates for property-based tests during implementation (Go `rapid` for backend, fast-check for frontend). They are listed here in the requirements document so that the design phase can pick them up directly.

### Property 1: Filter_Hash Order Independence

For all valid filter sets `F` over a single Report_Definition, and for every permutation `F'` of the same key/value pairs, `FilterHash(F) == FilterHash(F')`. This guarantees that Output_Cache lookups are stable regardless of how the client serializes filter parameters. *Validates: Requirement 2.6, 12.1.*

### Property 2: Filter_Schema Visibility Invariant

For every Report_Definition and every randomly generated subset of the closed filter-key set, the Shared_Filter_Bar SHALL render exactly the keys declared in that Report_Definition's Filter_Schema and no others. *Validates: Requirement 2.3.*

### Property 3: Filter Validation Rejection

For every Report_Definition and every randomly generated filter payload that either omits a `required` filter or supplies a key not in the Filter_Schema, the Master_Reporting_Module SHALL respond with a validation error identifying the offending key(s), and SHALL NOT execute the data source. *Validates: Requirement 2.4, 2.5.*

### Property 4: Preview/Excel Value Equivalence

For every `(report_id, filter_set)` pair generated within the same session, the set of `(row_index, column_key, value)` triples rendered in the In_Page_Preview SHALL be equal to the set of `(row_index, column_key, value)` triples in the Excel_Exporter output for the same pair, ignoring purely visual styling. *Validates: Requirement 3.2, 4.1.*

### Property 5: Export Round-Trip on Cache Hit

For every Smart_Load that returns a cache hit followed immediately by Export to Excel and Export to PDF, the exporter outputs SHALL contain the same data values as the Output_Cache payload. This protects against the cache and the exporter drifting apart. *Validates: Requirement 4.5, 5.5, 6.2.*

### Property 6: RBAC Enforcement Completeness

For every Report_Definition `R` and every principal `P` that does not hold `reports.<R.report_id>.view`, every Generate, Force_Recalculate, Export to Excel, and Export to PDF request for `R` SHALL respond with a permission-denied error. Additionally, `R` SHALL NOT appear in the Report_Catalog returned to `P`. *Validates: Requirement 8.3, 8.5.*

### Property 7: Force Recalculate Permission Gate

For every principal `P` that does not hold `reports.force_recalculate`, every Force_Recalculate request from `P` SHALL respond with a permission-denied error regardless of whether `P` holds `reports.<report_id>.view`. *Validates: Requirement 7.4, 8.4.*

### Property 8: Audit Logging Completeness

For every Generate, Force_Recalculate, Export to Excel, and Export to PDF request that returns a response (success or error), exactly one audit record SHALL exist for that request with matching `user_id`, `action`, `report_id`, and Filter_Hash. *Validates: Requirement 10.1.*

### Property 9: Smart_Load Idempotence

For every `(report_id, filter_set, operational_date)` whose Output_Cache entry is `valid`, two consecutive Smart_Load calls SHALL each return the same payload byte-for-byte, and the second call SHALL NOT invoke the underlying data source. *Validates: Requirement 6.2.*

### Property 10: Force_Recalculate Overwrites Cache

For every `(report_id, filter_set, operational_date)`, a successful Force_Recalculate followed by a Smart_Load for the same key SHALL return the Force_Recalculate's recomputed payload, and the Output_Cache entry's `computed_at` SHALL equal the Force_Recalculate's completion time. *Validates: Requirement 7.3, 12.1.*

### Property 11: Cache Invalidation on Data-Source Signal

For every Report_Definition `R` whose data source signals invalidation for a key `K`, the next Smart_Load for `K` SHALL recompute and SHALL NOT serve the previously cached payload. *Validates: Requirement 12.2, 12.4.*

### Property 12: Operational_Date Anchoring

For every shift whose end time is earlier in the day than its start time, the Output_Cache key Operational_Date SHALL equal the shift's start day, and a Smart_Load issued at any point during the shift SHALL resolve to the same key. *Validates: Requirement 12.3.*

### Property 13: Bounded Concurrency Invariant

For every Generate or Force_Recalculate request whose data source fans out per-vehicle, per-zone, or per-ward, the number of concurrently executing worker goroutines SHALL never exceed `maxConcurrentVehicles = 12`. *Validates: Requirement 11.1.*

### Property 14: Catalog Permission Coherence

For every Report_Definition registered in the Report_Catalog, a row with key `reports.<report_id>.view` SHALL exist in the `permissions` table. Conversely, for every permission row with key matching `reports.*.view`, a Report_Definition with the matching `report_id` SHALL exist in the Report_Catalog or have been explicitly retired. *Validates: Requirement 8.1.*

### Property 15: Sidebar Visibility Gate

For every principal `P`, the "Master Consolidated Reports" sidebar item SHALL be visible iff `P` holds `reports.view`. *Validates: Requirement 9.3, 9.4.*
