# Implementation Plan: Mobile Backend Integration

## Overview

This plan migrates the React Native (Expo) mobile client from dummy/mocked data to secure, role-scoped integrations against the existing Go (chi) backend, with no UI redesign (Req 13). Work proceeds foundation-first: (1) mobile foundation (secure storage, API client error taxonomy/retry, typed models, auth lifecycle, role-based navigation gating), (2) backend (centralized `resolveScope`, replacement of dummy handlers, new endpoints, complaints persistence), (3) mobile per-module integration reusing existing screens, (4) cross-cutting concerns (offline, loading/empty/error states, caching/debounce/pagination).

Languages are fixed by the design: **TypeScript** for the mobile client (property tests via **fast-check** on the Jest runner) and **Go** for the backend (property tests via **gopter** / `testing/quick`). Every property-based test runs a minimum of 100 generated cases and is tagged `Feature: mobile-backend-integration, Property {n}: {text}`.

Tasks marked with `*` are optional (tests). Core implementation sub-tasks are never optional.

## Tasks

- [x] 1. Foundation: secure storage migration
  - [x] 1.1 Implement `mobile/src/services/secureStorage.ts`
    - Create a thin wrapper over `expo-secure-store` exposing get/set/delete/clear for `KEYS.{ACCESS_TOKEN,REFRESH_TOKEN,USER_PROFILE}`
    - Implement one-time `migrate()` that copies any existing `AsyncStorage` values into SecureStore then deletes them from `AsyncStorage`
    - Fall back to `AsyncStorage` on web where secure-store is unavailable
    - _Requirements: 11.1, 1.3_ — Design: Auth & Token Lifecycle Design (secure-store migration)

  - [ ]* 1.2 Write property test for token persistence round-trip
    - **Property 1: Token persistence round-trip** — persist any access/refresh pair then read it back returns the identical pair
    - **Validates: Requirements 1.3**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 1.3 Write property test for tokens residing only in Secure_Storage
    - **Property 2: Tokens reside only in Secure_Storage** — after persistence/migration token keys exist in SecureStore and are absent from AsyncStorage
    - **Validates: Requirements 11.1**
    - fast-check, ≥100 iterations, tagged

- [x] 2. Foundation: typed models
  - [x] 2.1 Extend `mobile/src/types/index.ts` with backend response models
    - Add `AuthTokens`, `LoginResponse`, `DashboardStats`, `VehicleTelemetry`/`VehicleStatus`, `CoverageSummary`/`WardCoverage`/`ZoneCoverage`, `AttendanceReportRecord`/`AttendanceStatus`/`Paginated<T>`, `Complaint`/`ComplaintPriority`/`ComplaintStatus`, `VehicleAlert`/`AlertType`/`AlertSeverity`/`AlertFeed`/`ManualAlertRequest`, `DriverRouteResponse`, `ApiError`/`ApiErrorKind`
    - Retain existing `User`, `AttendanceRecord`, `LanePoint`, `RouteDetails`; extend `Alert`/`LiveVehicle` shapes
    - _Requirements: 10.2_ — Design: Data Models

  - [ ]* 2.2 Write property test for typed model mapping round-trip
    - **Property 26: Typed model mapping round-trip** — mapping any valid payload to its typed model preserves all required fields
    - **Validates: Requirements 10.2**
    - fast-check, ≥100 iterations, tagged

- [x] 3. Foundation: API client error taxonomy and retry
  - [x] 3.1 Add error taxonomy mapping to `mobile/src/services/api.ts`
    - Implement `toApiError(error)` mapping 401→`unauthorized`, 403→`forbidden`, 404→`not_found`, 500→`server`, timeout→`timeout`, no connectivity→`offline`, else `unknown`
    - Ensure every rejected request surfaces a typed `ApiError`
    - _Requirements: 10.3, 10.4_ — Design: Error handling taxonomy

  - [x] 3.2 Add bounded retry for idempotent GETs to the API client
    - Retry GET on transient network error or HTTP 500 with exponential backoff, bounded to 3 total attempts; never auto-retry POST/PUT/PATCH/DELETE
    - _Requirements: 10.6_ — Design: Retry policy

  - [x] 3.3 Add log/error redaction utility
    - Implement a redaction helper used by the client so token and credential values never appear in logs or error messages
    - _Requirements: 11.5_ — Design: Auth & Token Lifecycle (log hygiene)

  - [ ]* 3.4 Write property test for bearer token attachment
    - **Property 25: Bearer token attached to authenticated requests** — every authenticated request carries the current access token as a bearer token
    - **Validates: Requirements 10.1**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 3.5 Write property test for error taxonomy mapping
    - **Property 27: Error taxonomy mapping is total and correct** — each failure (401/403/404/500/timeout/offline) maps to exactly the corresponding error kind
    - **Validates: Requirements 10.3, 10.4**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 3.6 Write property test for bounded retry
    - **Property 28: Bounded retry for idempotent GETs only** — failing transient GET attempted at most 3 times, stops early on success; non-idempotent requests attempted exactly once
    - **Validates: Requirements 10.6**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 3.7 Write property test for secret redaction
    - **Property 11: Secrets are excluded from logs and errors** — logging/error output never contains any token or credential value
    - **Validates: Requirements 11.5**
    - fast-check, ≥100 iterations, tagged

- [x] 4. Foundation: auth lifecycle and navigation gating
  - [x] 4.1 Migrate auth token persistence to secure storage in `AuthContext` and `api.ts`
    - Replace `AsyncStorage` token reads/writes with `secureStorage`; invoke `migrate()` on launch
    - Keep the existing single-flight `isRefreshing` + `refreshQueue` 401 mechanism; ensure each request retries once via `originalRequest._retry`
    - _Requirements: 1.3, 1.5, 1.8, 11.1_ — Design: Auth & Token Lifecycle (single-flight refresh)

  - [x] 4.2 Implement auto-login on launch and login/invalid-credential handling
    - On launch read refresh token; if valid/unexpired request a fresh access token, load `/me`, route to role home without prompting; otherwise route to Login
    - On invalid credentials show auth error and store no token
    - _Requirements: 1.1, 1.2, 1.4_ — Design: Auth & Token Lifecycle (auto-login)

  - [x] 4.3 Implement logout and auto-logout (session-end clearing)
    - Logout calls `POST /logout` then clears all tokens and cached profile from secure storage
    - On refresh rejection clear all tokens/profile and route to Login
    - _Requirements: 1.6, 1.7, 11.6_ — Design: Auth & Token Lifecycle (auto-logout)

  - [x] 4.4 Implement role-based navigation gating in `RootNavigator`
    - Select the navigation stack from the backend-provided `user.role`; do not render controls/screens for disallowed roles; derive visibility from backend role only
    - _Requirements: 2.1, 2.7, 11.2_ — Design: Role-based navigation gating

  - [ ]* 4.5 Write property test for invalid credentials storing no token
    - **Property 3: Invalid credentials store no token** — failed login leaves no access/refresh token in secure storage
    - **Validates: Requirements 1.2**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 4.6 Write property test for single-flight refresh with one retry
    - **Property 4: Single-flight refresh with one retry** — N concurrent 401s trigger exactly one refresh; each request retried exactly once with the refreshed token
    - **Validates: Requirements 1.5, 1.8**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 4.7 Write property test for session-end clearing all tokens
    - **Property 5: Session-end clears all tokens** — logout or refresh rejection leaves no tokens/profile and routes to Login
    - **Validates: Requirements 1.6, 1.7, 11.6**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 4.8 Write property test for navigation matching backend role
    - **Property 6: Navigation matches backend role** — for any role in {zone_manager, supervisor, driver} the correct stack is selected
    - **Validates: Requirements 2.1**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 4.9 Write example tests for auth flows
    - Valid login (1.1), auto-login on launch (1.4), logout endpoint invocation (1.7) over the AuthContext state machine with a mocked client
    - _Requirements: 1.1, 1.4, 1.7_

- [x] 5. Checkpoint - Foundation complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Backend: centralized role scope resolver
  - [x] 6.1 Implement `resolveScope(ctx, claims)` helper in the mobile handlers package
    - Define `RoleScope{Role,UserID,EmployeeID,ZoneID,WardID,VehicleID}`; derive zone/ward/vehicle from JWT claims only, never from query params
    - Provide a helper to return HTTP 403 when a requested resource id falls outside scope
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_ — Design: Backend handlers (scope resolution)

  - [ ]* 6.2 Write property test for scope confinement
    - **Property 7: Responses are confined to the token-derived scope** — returned data is a subset of the caller's JWT-derived scope regardless of client-supplied ward_id/zone_id
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 4.1, 4.5, 5.1, 6.1, 7.1, 7.4, 7.5, 8.2**
    - gopter, ≥100 iterations with random ownership graphs, tagged

  - [ ]* 6.3 Write property test for out-of-scope rejection
    - **Property 8: Out-of-scope access is rejected** — any resource id outside the caller's scope returns HTTP 403
    - **Validates: Requirements 2.6**
    - gopter, ≥100 iterations, tagged

  - [ ]* 6.4 Write property test for JWT validation
    - **Property 10: JWT validation rejects invalid tokens** — missing/malformed/tampered/expired JWT returns HTTP 401
    - **Validates: Requirements 11.3, 11.4**
    - gopter, ≥100 iterations, tagged

- [x] 7. Backend: replace dummy coverage handlers
  - [x] 7.1 Implement real coverage in `MobileMyCoverage`, `MobileWardsCoverage`, `MobileZoneCoverage`
    - Compute daily lane-point completion, coverage %, covered/pending distance from `route_lane_points` + coverage data; build WHERE clause from `resolveScope`
    - Return `CoverageSummary` (driver), per-ward `WardCoverage` (supervisor), and `ZoneCoverage` with per-ward breakdown (zone manager)
    - Remove all hardcoded coverage values
    - _Requirements: 2.3, 5.1, 5.2, 5.3, 5.4, 5.6_ — Design: Handlers to replace (coverage)

  - [ ]* 7.2 Write property test for coverage arithmetic invariant
    - **Property 14: Coverage arithmetic invariant** — remaining = total − completed, coverage % in [0,100], all fields present
    - **Validates: Requirements 5.2**
    - gopter, ≥100 iterations, tagged

  - [ ]* 7.3 Write integration test for coverage parity with web dashboard
    - **Property 15: Coverage parity with the web dashboard** — mobile coverage equals web computation for the same date/scope (model-based integration over shared seed data)
    - **Validates: Requirements 5.4**
    - tagged; seeded fixtures

- [ ] 8. Backend: replace live tracking handlers and add tracking/my
  - [x] 8.1 Rework `MobileLiveTrackingWard` and `MobileLiveTrackingZone` to JWT-derived scope
    - Derive ward/zone from `resolveScope` (ignore query params); read latest telemetry from Redis for in-scope vehicles; set `status` via shared `vehicleStatus(lastTime, speed)`; include `ignition`
    - Remove hardcoded `status:"moving"`
    - _Requirements: 2.2, 4.1, 4.2, 4.6, 4.7_ — Design: Handlers to replace (tracking)

  - [ ] 8.2 Add `GET /api/mobile/tracking/my` for the driver's own vehicle
    - Return telemetry only for the driver's assigned vehicle; register route
    - _Requirements: 4.5_ — Design: New endpoints (tracking/my)

  - [ ]* 8.3 Write property test for vehicle status derivation
    - **Property 12: Vehicle status is derived from telemetry** — status follows the shared rule (offline when missing/stale, else running/idle/stopped by speed), never a fixed default
    - **Validates: Requirements 4.6, 4.7**
    - gopter, ≥100 iterations with varied last-update ages, tagged

  - [ ]* 8.4 Write integration test for live tracking wiring
    - 1–2 end-to-end cases hitting `/tracking/*` with seeded Redis telemetry to confirm status derivation in situ
    - _Requirements: 4.1, 4.2, 4.6_

- [x] 9. Backend: replace driver route handler
  - [x] 9.1 Implement real ward and lane-point status in `MobileMyRoutes`
    - Join route→`route_wards`→ward for the real ward; compute each lane point's status from coverage; return completed/remaining counts, path geometry, and current position
    - Return HTTP 404 when no route is assigned; remove "Mock Ward" and `upcoming` defaults
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6_ — Design: Handlers to replace (MobileMyRoutes)

  - [ ]* 9.2 Write property test for driver route arithmetic and real ward
    - **Property 24: Driver route arithmetic and real ward** — completed + remaining = total, progress % = completed/total, ward equals route's associated ward (never "Mock Ward")
    - **Validates: Requirements 9.2, 9.3, 9.4**
    - gopter, ≥100 iterations, tagged

- [x] 10. Backend: dashboard aggregate endpoint
  - [x] 10.1 Implement `GET /api/mobile/dashboard`
    - Return `DashboardStats` (coverage %, total/running vehicles, completed/pending routes, active drivers, attendance summary, alert count, complaint count) scoped by role via `resolveScope`; register route
    - _Requirements: 3.1, 3.2_ — Design: New endpoints (dashboard)

- [x] 11. Backend: attendance report list
  - [x] 11.1 Add scope, filters, search, and pagination to `MobileAttendanceList`
    - Apply JWT scope (ward/zone); support `search`, `status`, `date` filters; return `Paginated<AttendanceReportRecord>`
    - Keep the existing punch-in/out/mark/status flow untouched
    - _Requirements: 6.1, 6.3, 6.4, 6.5_ — Design: Handlers to replace (MobileAttendanceList)

  - [ ]* 11.2 Write property test for attendance filtering correctness
    - **Property 18: Attendance filtering correctness** — every returned record satisfies the applied filter(s) and lies within scope
    - **Validates: Requirements 6.3, 6.4**
    - gopter, ≥100 iterations, tagged

  - [ ]* 11.3 Write property test for pagination partitioning
    - **Property 19: Pagination partitions the result set** — concatenation of all pages equals the full ordered set with no duplicates/gaps; no page exceeds page size
    - **Validates: Requirements 6.5, 12.1**
    - gopter, ≥100 iterations, tagged

- [x] 12. Backend: complaints persistence and read-only endpoints
  - [x] 12.1 Create `complaints` table and migration
    - Columns: `id, title, description, priority, status, ward_id, assigned_vehicle_id, assigned_driver_id, location, images jsonb, created_at, updated_at` aligned to the `Complaint` model; include ward/vehicle/driver association for scoping
    - _Requirements: 7.2_ — Design: New persistence (complaints)

  - [x] 12.2 Implement `GET /api/mobile/complaints` and `GET /api/mobile/complaints/{id}`
    - Read-only, role-scoped via `resolveScope` (supervisor→ward, driver→own vehicle/routes, zone manager→zone); no create/update/delete; register routes
    - _Requirements: 7.1, 7.3, 7.4, 7.5_ — Design: New endpoints (complaints)

- [x] 13. Backend: unified vehicle alerts, read state, and manual send
  - [x] 13.1 Add alert read-state persistence
    - Create `alert_reads` (per-user read state) and the `vehicle_alerts` source (or reuse existing alerts source) backing the unified feed
    - _Requirements: 8.9, 8.10_ — Design: New persistence (alerts)

  - [x] 13.2 Return unified `VehicleAlert` feed from `MobileMyAlerts`/`MobileWardAlerts`/`MobileZoneAlerts`
    - Combine automatic (overspeed/geofence/idle/ignition/offline/battery/harsh braking) and manual alerts scoped by JWT; include `unread_count` and per-user `read` state
    - _Requirements: 8.2, 8.3, 8.4, 8.9_ — Design: Handlers to replace (alerts)

  - [x] 13.3 Implement `POST /api/mobile/alerts/{id}/read` (replacing acknowledge stub)
    - Persist per-user read state, return updated unread count; keep `acknowledge` as deprecated alias
    - _Requirements: 8.10_ — Design: Handlers to replace (MobileMarkAlertRead)

  - [x] 13.4 Implement `POST /api/mobile/alerts/manual` with recipient-role validation
    - Validate sender→recipient matrix (zone_manager→{supervisor,driver}, supervisor→{driver}, driver→none) and scope; persist manual alert; return HTTP 403 on disallowed/out-of-scope recipient
    - _Requirements: 8.5, 8.6, 8.7_ — Design: Handlers to replace (MobileSendManualAlert)

  - [ ]* 13.5 Write property test for manual-alert recipient permission matrix
    - **Property 22: Manual-alert recipient permission matrix** — accept iff pair is permitted, else HTTP 403 (incl. supervisor→zone_manager and any driver send)
    - **Validates: Requirements 8.5, 8.6, 8.7, 8.8**
    - gopter, ≥100 iterations over (sender,recipient) pairs, tagged

- [x] 14. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Mobile: service modules and react-query hooks foundation
  - [x] 15.1 Create typed service modules under `mobile/src/services`
    - Add `auth`, `dashboard`, `tracking`, `coverage`, `attendance`, `complaints`, `alerts`, `route` modules returning typed models via the API client
    - _Requirements: 10.2, 10.8_ — Design: Mobile components (services)

  - [x] 15.2 Set up react-query hook scaffolding under `mobile/src/hooks`
    - Configure per-resource `staleTime` (stale-while-revalidate), request dedup, and pagination helpers; extend existing `useAlerts`/`usePunchStatus`
    - _Requirements: 12.3, 12.5_ — Design: Caching, debounce, deduplication

  - [ ]* 15.3 Write property test for concurrent query deduplication
    - **Property 30: Concurrent identical queries are deduplicated** — N concurrent queries on the same key keep exactly one request in flight
    - **Validates: Requirements 12.5**
    - fast-check, ≥100 iterations, tagged

- [x] 16. Mobile: dashboard integration
  - [x] 16.1 Wire dashboard screens to `useDashboard`
    - Replace hardcoded card values with backend `DashboardStats` for all three roles; reuse existing card layout/`StatCard`
    - _Requirements: 3.1, 3.2, 3.6_ — Design: Screen → API Mapping (dashboard)

  - [ ]* 16.2 Write property test for dashboard metric presence
    - **Property 16: Dashboard metric presence** — every listed metric renders the backend-provided value
    - **Validates: Requirements 3.2**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 16.3 Write snapshot test for dashboard UI preservation
    - Confirm layout/components unchanged across loading/empty/error states (3.3, 3.4, 3.5) while data source switches
    - _Requirements: 13.1, 13.2, 3.3, 3.4, 3.5_

- [ ] 17. Mobile: live tracking integration
  - [ ] 17.1 Wire live tracking to `useLiveTracking` with focus-bound polling
    - Poll `/tracking/(my|ward|zone)` at fixed ≤15s `refetchInterval`; bind interval to navigation focus and `AppState` so requests stop on blur/background
    - _Requirements: 4.1, 4.3, 4.4_ — Design: Live tracking strategy

  - [ ] 17.2 Implement marker reuse/diffing in `MapView`
    - Key markers by `vehicle_id`; update coordinates of existing markers; skip unchanged vehicles via shallow comparison; render location/status/speed/ignition/last-updated
    - _Requirements: 4.2, 4.6, 12.4, 12.6_ — Design: Live tracking strategy (marker diffing)

  - [ ]* 17.3 Write property test for telemetry rendering presence
    - **Property 13: Telemetry rendering presence** — exactly one marker per vehicle exposing location, status, speed, ignition, last-updated
    - **Validates: Requirements 4.2**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 17.4 Write example tests for polling timing and marker reuse
    - 15s refresh while focused (4.3) and stop on blur/background (4.4) via Jest fake timers; marker reuse (12.4) and unchanged-item non-re-render (12.6) via render-count assertions
    - _Requirements: 4.3, 4.4, 12.4, 12.6_

- [x] 18. Mobile: coverage integration
  - [x] 18.1 Wire coverage screens to `useCoverage`
    - Replace hardcoded values with backend coverage for driver/supervisor/zone manager; reuse existing layout; render Empty_State when no records
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_ — Design: Screen → API Mapping (coverage)

  - [ ]* 18.2 Write snapshot test for coverage UI preservation
    - Confirm layout unchanged including Empty_State (5.5) while data source switches
    - _Requirements: 13.1, 13.2, 5.5_

- [x] 19. Mobile: attendance report integration
  - [x] 19.1 Wire Attendance_Report screen to `useAttendanceReport`
    - Render records (status/check-in/check-out/date) with debounced search, status/date filters, and page navigation; reuse existing layout; keep existing marking flow; render Empty_State when no records
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_ — Design: Screen → API Mapping (attendance)

  - [ ]* 19.2 Write property test for attendance record presence and status domain
    - **Property 17: Attendance record presence and status domain** — status ∈ {Present, Absent, Late, Leave}; record renders status, check-in, check-out, date
    - **Validates: Requirements 6.2**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 19.3 Write property test for search debounce
    - **Property 29: Search debounce bounds request rate** — search requests ≤ number of 300ms inactivity gaps (a burst yields ≤1 request)
    - **Validates: Requirements 12.2**
    - fast-check, ≥100 iterations over keystroke sequences, tagged

  - [ ]* 19.4 Write snapshot test for attendance UI preservation
    - Confirm layout unchanged including Empty_State (6.7)
    - _Requirements: 13.1, 13.2, 6.7_

- [x] 20. Mobile: complaints read-only screen
  - [x] 20.1 Add read-only Complaints screen reusing existing layout patterns
    - Wire to `useComplaints`; render id/title/description/priority/status/assigned vehicle/assigned driver/created/updated/location/images; no create/edit/delete controls; render Empty_State when no records
    - _Requirements: 7.1, 7.2, 7.3, 7.6_ — Design: Screen → API Mapping (complaints)

  - [ ]* 20.2 Write property test for complaint field presence
    - **Property 21: Complaint field presence** — screen renders all listed complaint fields
    - **Validates: Requirements 7.2**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 20.3 Write property test for no mutation control
    - **Property 20: Complaints module exposes no mutation control** — for any role the screen renders no create/edit/delete control
    - **Validates: Requirements 7.3**
    - fast-check, ≥100 iterations, tagged

- [ ] 21. Mobile: Vehicle Alerts module (replace Zone Alerts)
  - [ ] 21.1 Replace Zone Alerts with Vehicle_Alerts module reusing `AlertsScreen`/`AlertBanner`/`StatusBadge`
    - Wire to `useVehicleAlerts`; render unified feed with `unread_count` and per-alert read state; mark read on open (decrement unread); render manual-send controls gated by backend role (hidden for driver)
    - _Requirements: 8.1, 8.2, 8.8, 8.9, 8.10, 8.11_ — Design: Screen → API Mapping (alerts), Role/Permission Matrix

  - [ ]* 21.2 Write property test for unread count and read-state decrement
    - **Property 23: Unread count reflects read state and decrements correctly** — unread = count(read=false); opening unread decrements by one; opening already-read is idempotent
    - **Validates: Requirements 8.9, 8.10**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 21.3 Write property test for control visibility per role matrix
    - **Property 9: Control visibility follows the role permission matrix** — restricted control rendered iff matrix grants it (manual-alert hidden for driver), derived from backend role
    - **Validates: Requirements 2.7, 8.8, 11.2**
    - fast-check, ≥100 iterations, tagged

  - [ ]* 21.4 Write snapshot test for Zone→Vehicle Alerts swap and UI preservation
    - Confirm Zone Alerts removed and Vehicle Alerts presented in the same layout (8.1)
    - _Requirements: 13.1, 8.1_

- [x] 22. Mobile: driver route integration
  - [x] 22.1 Wire Driver Route screen to `useDriverRoute`
    - Render real ward, route geometry, lane-point completion, completed/remaining counts, and current position from backend; render Empty_State on 404; no hardcoded route/lane data
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_ — Design: Screen → API Mapping (driver route)

  - [ ]* 22.2 Write snapshot test for driver route UI preservation
    - Confirm layout unchanged including Empty_State for no route (9.5)
    - _Requirements: 13.1, 13.2, 9.5_

- [ ] 23. Checkpoint - Mobile integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 24. Cross-cutting: offline handling
  - [ ] 24.1 Wire `OfflineContext`/`OfflineBanner` to gate dependent queries
    - Subscribe to NetInfo; show offline indicator; disable/defer dependent queries while offline and resume on reconnect
    - _Requirements: 10.5_ — Design: Offline handling

- [ ] 25. Cross-cutting: loading, empty, and error states
  - [ ] 25.1 Apply consistent loading/empty/error rendering across migrated screens
    - Render existing loading placeholders for in-flight regions, Empty_State for no records, and error+retry for failures; render no restricted data on 403 (forbidden)
    - _Requirements: 3.3, 3.4, 3.5, 2.8, 10.7_ — Design: Loading and empty states

  - [ ]* 25.2 Write smoke/static checks for no-dummy guarantees
    - Static assertions that dashboard/coverage/route/tracking handlers read from the database and screens contain no literal metric/coverage/route constants; lint/grep guard that the API layer imports no mock/dummy module
    - _Requirements: 3.6, 5.6, 9.6, 10.8_

- [ ] 26. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (property, example, snapshot, and smoke tests) and can be skipped for a faster MVP, though property tests are strongly recommended for the auth, scoping, and recipient-matrix logic.
- Each task references specific granular requirement clauses and the relevant design section for traceability.
- Property-based tests use fast-check (TypeScript) or gopter/`testing/quick` (Go), run ≥100 iterations, and are tagged `Feature: mobile-backend-integration, Property {n}: ...`.
- All 30 Correctness Properties are covered: P1–P2 (1.2/1.3), P3–P6 (4.x auth/nav), P7–P8/P10 (6.x scope), P9 (21.3), P11 (3.7), P12 (8.3), P13 (17.3), P14–P15 (7.x coverage), P16 (16.2), P17–P19 (attendance/pagination), P20–P21 (complaints), P22 (13.5), P23 (21.2), P24 (9.2), P25/P27/P28 (api client), P26 (2.2), P29 (19.3), P30 (15.3).
- UI preservation (Req 13) is verified by snapshot/regression tests paired with each migrated screen.
- Checkpoints occur after foundation (task 5), after backend (task 14), and after mobile integration (task 23).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "6.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "3.1", "3.3", "6.2", "6.3", "6.4", "7.1", "8.1", "9.1", "10.1", "11.1", "12.1", "13.1"] },
    { "id": 2, "tasks": ["3.2", "3.4", "3.5", "3.6", "3.7", "4.1", "7.2", "7.3", "8.2", "8.3", "9.2", "11.2", "11.3", "12.2", "13.2"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "8.4", "13.3", "13.4"] },
    { "id": 4, "tasks": ["4.5", "4.6", "4.7", "4.8", "4.9", "13.5", "15.1"] },
    { "id": 5, "tasks": ["15.2", "16.1", "17.1", "18.1", "19.1", "20.1", "21.1", "22.1"] },
    { "id": 6, "tasks": ["15.3", "16.2", "17.2", "18.2", "19.2", "20.2", "20.3", "21.2", "22.2", "24.1"] },
    { "id": 7, "tasks": ["16.3", "17.3", "17.4", "19.3", "19.4", "21.3", "21.4", "25.1"] },
    { "id": 8, "tasks": ["25.2"] }
  ]
}
```
