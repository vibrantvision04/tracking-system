# Master Consolidated Reports — Catalog

> **Status:** Source of truth.
> Reverse-engineered once from `ULTIMATE REPORTING.xlsx` (project root).
> After this document is approved, the workbook is **not** a runtime
> dependency. Adding a new report = registering a new `ReportDefinition`
> against this catalog.

## Naming convention

- IDs are **business-named**, lowercase ASCII + underscore, ≤ 64 chars (Req 1.5).
- Schedule (`ScheduledTime`) is metadata only — it drives display order and
  operational-day cutoffs, never the ID.
- `DisplayOrder` is monotonic across the catalog; gaps allow future insertion
  without renumbering.

## Report inventory (26 reports)

| # | ID | Display name | Scheduled | Source sheet |
|---|----|----|----|----|
| 1 | `road_sweeping` | Road Sweeping Machines | 07:00 AM | "07 am" |
| 2 | `open_depot_gvp_shift_3` | Open Depot GVP — 3rd Shift | 07:30 AM | "07.30 AM" |
| 3 | `ts_point_reached_0730` | D2D Reached at 07:30 Check | 07:45 AM | "07.45 AM" |
| 4 | `helper_attendance` | Helper Attendance (per-vehicle) | 08:00 AM | "08.00 AM" |
| 5 | `helper_attendance_summary` | Helper Attendance Summary | 08:01 AM | "08.01" |
| 6 | `ts_point_reached` | TS Point Reached Check | 09:00 AM | " 09 AM" |
| 7 | `govt_street_sweeper_attendance` | Govt. Employee Street Sweeper Attendance | 10:15 AM | "10.15 GOV EM" |
| 8 | `street_sweeper_summary` | Street Sweeper Attendance Summary | 10:16 AM | "10.16" |
| 9 | `open_depot_gvp_shift_1` | Open Depot GVP — 1st Shift | 11:30 AM | "11.30 AM" |
| 10 | `active_hoppers_summary` | Active Hoppers Summary (1st Shift) | 12:00 PM | "12.00 AM" |
| 11 | `early_departure_d2d` | Early Departed D2D Hoppers Summary | 03:00 PM | "3.00 PM" |
| 12 | `open_depot_gvp_shift_2` | Open Depot GVP — 2nd Shift | 04:00 PM | "04.00 PM" |
| 13 | `d2d_vehicle_coverage` | D2D Vehicle Coverage by Ward (detail) | 04:10 PM | "04.10 PM" |
| 14 | `d2d_zone_summary` | All Zones D2D Hoppers Summary | 04:11 PM | "04.11" |
| 15 | `street_sweeping_detail` | Street Sweeping Hopper Detail | 04:15 PM | "04.15 PM" |
| 16 | `street_sweeping_summary` | All Zones Street Sweeping Summary | 04:16 PM | "04.16" |
| 17 | `d2d_working_check` | D2D Hopper Working Check | 04:30 PM | "04.30 PM" |
| 18 | `commercial_hopper_summary` | All Zones D2D Commercial Hoppers Summary | 04:31 PM | "04.31" |
| 19 | `safai_karamchari_worked` | Safai Karamchari Worked Report | 06:00 PM | "06.00 PM" |
| 20 | `beet_sweeping_summary` | Beet Sweeping Summary | 06:10 PM | "06.1" |
| 21 | `gts_trip` | GTS Trip Detail | 06:30 PM | "06.30" |
| 22 | `weight_bridge_report` | Weight Bridge Final Report | 07:00 PM | "07.00 PM" |
| 23 | `rfid_collection` | RFID Collection | 07:30 PM | "07.30" |
| 24 | `evening_d2d_check` | Evening D2D Working Check | 08:15 PM | "08.15 PM" |
| 25 | `evening_commercial_detail` | Evening Commercial Hoppers Detail | 11:10 PM | "11.10" |
| 26 | `evening_commercial_summary` | All Zones Evening Commercial Hoppers Summary | 11:15 PM | "11.15 PM" |
| 27 | `daily_master_consolidated` | Daily Master Consolidated Report | — | (legacy) |

> The 27th entry (`daily_master_consolidated`) is not from the workbook; it
> preserves the legacy `/ultimate-reports/daily` payload so the existing
> page continues to work through the new module (backward compatibility
> requirement #1 in the user's correction).

---

## Filter key conventions

The closed `FilterKey` set defined in `internal/masterreport/types.go`:

`date`, `date_range`, `zone`, `ward`, `shift`, `vehicle`, `route`,
`route_type`, `department`, `designation`, `employee`.

A 12th key may be added if reports require it: `firm` (operating contractor
— Dulevo, Ensol, Tractor Mounted, etc.). The workbook frequently filters
by firm; we'll add it as a typed string filter when the first report needs
it. Pending decision.

---

## Per-report definitions

Each section below is the canonical `ReportDefinition` spec. Fields:

- **Description** — one sentence on what the report tells you.
- **Filters** — declared filter keys, with required/optional flag.
- **Columns** — the exact column order, key, header text, type, alignment.
  `type` is one of `int`, `decimal2`, `time_hm`, `date_ymd`, `text`.
- **Totals** — what the grand-total row contains (or "none").
- **Remarks logic** — how the `remark` column is derived per row (or "manual").
- **Data source** — which existing handler / repository / service is wrapped,
  or "**new aggregation**" if none exists.

---

### 1. `road_sweeping` — Road Sweeping Machines (07:00 AM)

**Description**
Night-shift road-sweeping vehicle audit grouped by operating firm (Dulevo /
Ensol / Tractor Mounted). Each row is one vehicle's overnight movement
summary; the body is partitioned by firm with a sub-header banner before
each firm's vehicles.

**Filters** — `date` (required), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `vehicle_rto_no` | VEHICLE RTO NO. | text | left |
| 3 | `vehicle_type` | VEHICLE TYPE | text | left |
| 4 | `shift_time` | SHIFT TIME | text | center |
| 5 | `start_time` | START TIME | time_hm | center |
| 6 | `end_time` | END TIME | time_hm | center |
| 7 | `active_hours` | ACTIVE HOURS | text | right |
| 8 | `coverage_pct` | COV% | decimal2 | right |
| 9 | `distance_km` | KM | decimal2 | right |
| 10 | `avg_speed` | AVG SPEED | decimal2 | right |
| 11 | `actual_agni` | ACTUAL AGNI. | text | left |
| 12 | `remark` | REMARK | text | left |

**Totals** — none in source; per-firm sub-totals only.
**Remarks logic** — derived from `coverage_pct` < threshold → "LESS WORKING";
`active_hours` < 4h → "NOT WORKED"; overspeeding flag → "OVERSPEEDING".
Combine with comma if multiple match.
**Data source** — wraps `GetShiftBasedOpsReport` (shift = `night_sweep`) +
joins to `vehicle_route_assignments` for firm grouping.

---

### 2. `open_depot_gvp_shift_3` — Open Depot GVP (3rd Shift, 07:30 AM)

**Description**
Open Depot (Garbage Vulnerable Point) coverage for the night shift that
closed at 06:00 AM. Reports per zone × firm: total GVPs, total lifted,
Jhajhla Patti collected, and cleaning percentage.

**Filters** — `date` (required), `zone` (optional), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `firm` | FIRM | text | left |
| 4 | `total_gvp` | TOTAL GVP | int | right |
| 5 | `total_lifted` | TOTAL LIFTED | int | right |
| 6 | `jhajhla_patti` | JHAJHLA PATTI | int | right |
| 7 | `cleaning_pct` | CLEANING % | decimal2 | right |

**Totals** — Grand Total row: `total_gvp`, `total_lifted`, `jhajhla_patti`
summed; `cleaning_pct` weighted average over `total_gvp`.
**Remarks logic** — none.
**Data source** — wraps `GetOpenDepotDashboard` filtered by `shift_no = 3`.

---

### 3. `ts_point_reached_0730` — D2D Reached at 07:30 Check (07:45 AM)

**Description**
Per-zone check whether each ward's D2D vehicle reached its assigned route
by 07:30 AM. Two sub-tables per zone: "NOT REACHED" (vehicles not yet on
route) and "REACHED" (vehicles already on route at the cutoff). Each
sub-table has its own SR-NO sequence; totals row reports the count of
reached vs not-reached.

**Filters** — `date` (required), `zone` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `status` | STATUS | text | center |
| 2 | `sr_no` | SR NO. | int | center |
| 3 | `ward` | Ward | text | left |
| 4 | `vehicle_reg_no` | VEHICLE REG. NO. | text | left |
| 5 | `time` | TIME | time_hm | center |

**Totals** — `total_reached`, `total_not_reached` (counts).
**Remarks logic** — none.
**Data source** — **new aggregation** over `gps_data` (first ping per
vehicle on the day, compared against 07:30 cutoff) ⋈
`vehicle_route_assignments`.

---

### 4. `helper_attendance` — Helper Attendance (08:00 AM)

**Description**
Per-vehicle helper-on-vehicle attendance check at 08:00 AM. Each row is one
vehicle; the helper's present/absent status and whether they are in dress
code is captured against the assigned ward.

**Filters** — `date` (required), `zone` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `ward` | Ward | text | left |
| 3 | `vehicle_reg_no` | VEHICLE REG. NO. | text | left |
| 4 | `helper` | HELPER | text | center |
| 5 | `dress` | DRESS | text | center |

**Totals** — `total_present`, `total_absent` (counts).
**Remarks logic** — none in source; derived `dress` cell = "NO" if helper
present but out of uniform.
**Data source** — wraps `GetAttendance` filtered by
`designation = helper, captured_at_lt = 08:00`.

---

### 5. `helper_attendance_summary` — Helper Attendance Summary (08:01 AM)

**Description**
Roll-up of `helper_attendance` by zone × firm: total helpers assigned,
how many present, how many in dress code, how many absent.

**Filters** — `date` (required), `zone` (optional), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `firm` | FIRM | text | left |
| 4 | `total_helper` | TOTAL HELPER | int | right |
| 5 | `helper_present` | HELPER PRESENT | int | right |
| 6 | `dress` | DRESS | int | right |
| 7 | `total_absent` | TOTAL ABSENT | int | right |

**Totals** — Grand Total row sums every numeric column.
**Remarks logic** — none.
**Data source** — derived from `helper_attendance` row set (group by zone,
firm). Implemented in masterreport via `helper_attendance`'s repo path +
SQL aggregation.

---

### 6. `ts_point_reached` — TS Point Reached Check (09:00 AM)

**Description**
Per-zone check whether each waste-collection vehicle has reached its
assigned transfer station (or dumpsite) by 09:00 AM. Rows partitioned by
vehicle type (Refuse Compactor / Hook Loader / Dumper).

**Filters** — `date` (required), `zone` (optional), `vehicle_type` (optional;
maps to existing `route_type` filter).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `vehicle_reg_no` | VEHICLE REG. NO. | text | left |
| 3 | `vehicle_type` | VEHICLE TYPE | text | left |
| 4 | `ts_point` | TS POINT/ECT | text | left |
| 5 | `time` | TIME | time_hm | center |
| 6 | `remark` | REMARK | text | left |

**Totals** — `total_reached`, `total_not_reached` (counts).
**Remarks logic** — "REACHED" or "NOT REACHED" derived from cutoff
comparison.
**Data source** — **new aggregation** over `gps_data` first-ping-in-geofence
join to `transfer_stations` / `dumpsites` geofences.

---

### 7. `govt_street_sweeper_attendance` — Govt. Employee Street Sweeper Attendance (10:15 AM)

**Description**
Per-ward attendance of municipal street-sweeping employees (Safai
Karamchari). Each row is one employee in one street/ward; present or
absent at the 10:15 AM roll-call.

**Filters** — `date` (required), `zone` (optional), `ward` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `ward` | Ward | text | left |
| 3 | `street_name` | STREET NAME | text | left |
| 4 | `employee_name` | EMPLOYEE NAME | text | left |
| 5 | `status` | PRESENT/ABSENT | text | center |

**Totals** — `total_present`, `total_absent`.
**Remarks logic** — none.
**Data source** — wraps `GetAttendance` filtered by
`designation = safai_karamchari` and `roll_call_time <= 10:15`. If no
match exists, **new aggregation** via the `safai_karamchari_attendance`
table.

---

### 8. `street_sweeper_summary` — Street Sweeper Attendance Summary (10:16 AM)

**Description**
Roll-up of `govt_street_sweeper_attendance` by zone.

**Filters** — `date` (required), `zone` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `total_employee` | TOTAL EMPLOYEE | int | right |
| 4 | `helper_present` | HELPER PRESENT | int | right |
| 5 | `dress` | DRESS | int | right |
| 6 | `total_absent` | TOTAL ABSENT | int | right |

**Totals** — Grand Total row sums every numeric column.
**Remarks logic** — none.
**Data source** — aggregation over `govt_street_sweeper_attendance` row set.

---

### 9. `open_depot_gvp_shift_1` — Open Depot GVP (1st Shift, 11:30 AM)

Same shape as report #2 (`open_depot_gvp_shift_3`), filtered to `shift_no = 1`.
Data source: `GetOpenDepotDashboard` with `shift_no = 1`.

---

### 10. `active_hoppers_summary` — Active Hoppers Summary (12:00 PM, 1st Shift)

**Description**
Per-zone count of how many D2D hoppers and sweeping hoppers are currently
active (have moved in last N minutes). Snapshot taken at end of 1st shift.

**Filters** — `date` (required), `zone` (optional), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `firm` | FIRM | text | left |
| 4 | `total_d2d_hopper` | TOTAL D2D HOPPER | int | right |
| 5 | `active_sweeping_hopper` | ACTIVE SWEEPING HOPPER | int | right |
| 6 | `active` | ACTIVE | int | right |

**Totals** — Grand Total row sums every numeric column.
**Remarks logic** — none.
**Data source** — wraps `GetActiveVehicleSummaryReport` joined with
`vehicle_type` to split D2D vs sweeping.

---

### 11. `early_departure_d2d` — Early Departed D2D Hoppers Summary (03:00 PM)

**Description**
Count per zone of D2D hoppers that departed (last GPS ping) before the
12:01 PM cutoff. Identifies vehicles that left their route too early.

**Filters** — `date` (required), `zone` (optional), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `firm` | FIRM | text | left |
| 4 | `total_d2d_hopper` | TOTAL D2D HOPPER | int | right |
| 5 | `departed_till_1201` | DEPARTED TILL 12:01 PM | int | right |

**Totals** — Grand Total row sums every numeric column.
**Remarks logic** — none.
**Data source** — wraps `GetEarlyDepartureReport` aggregated by zone × firm.

---

### 12. `open_depot_gvp_shift_2` — Open Depot GVP (2nd Shift, 04:00 PM)

Same shape as report #2, filtered to `shift_no = 2`.
Data source: `GetOpenDepotDashboard` with `shift_no = 2`.

---

### 13. `d2d_vehicle_coverage` — D2D Vehicle Coverage by Ward (04:10 PM)

**Description**
Per-vehicle D2D coverage detail by ward and zone: covered %, distance,
average speed, trips, with manual remarks column. This is the most
data-dense report in the catalog.

**Filters** — `date` (required), `zone` (required), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `ward` | Ward | text | left |
| 3 | `vehicle_reg_no` | VEHICLE REG. NO. | text | left |
| 4 | `covered_pct` | COVERED % | decimal2 | right |
| 5 | `total_distance_km` | Total Distance (KM) | decimal2 | right |
| 6 | `avg_speed_kmh` | Average Speed (KM/h) | decimal2 | right |
| 7 | `trips` | TRIPS | int | right |
| 8 | `remarks` | REMARKS | text | left |

**Totals** — Grand Total row: trips sum, distance sum, covered_pct
weighted-average over distance.
**Remarks logic** — `covered_pct < 70` → "LOW COVERAGE";
`trips == 0` → "NO TRIP".
**Data source** — wraps `GetD2DRouteCoverageReport`.

---

### 14. `d2d_zone_summary` — All Zones D2D Hoppers Summary (04:11 PM)

**Description**
Roll-up of `d2d_vehicle_coverage` by zone × firm: total hoppers, not-worked
count, covered %, distance, trips. The Average/Total row at the bottom is
the catalog's exemplar of "weighted-average totals".

**Filters** — `date` (required), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `firm` | FIRM | text | left |
| 4 | `total_d2d_hoppers` | NO. OF D2D HOPPERS | int | right |
| 5 | `not_worked_hoppers` | NO. OF NOT WORKED HOPPERS | int | right |
| 6 | `covered_pct` | COVERED % | decimal2 | right |
| 7 | `total_distance_km` | Total Distance (KM) | decimal2 | right |
| 8 | `trips` | TRIPS | int | right |

**Totals** — Average/Total row: counts summed, covered_pct
weighted-average over total_d2d_hoppers, distance averaged, trips summed.
**Remarks logic** — none.
**Data source** — aggregation over `d2d_vehicle_coverage` row set grouped
by zone × firm.

---

### 15. `street_sweeping_detail` — Street Sweeping Hopper Detail (04:15 PM)

**Description**
Per-vehicle street-sweeping movement: start time, end time, active hours,
distance, trips, average speed, manual remarks.

**Filters** — `date` (required), `zone` (required), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `ward` | Ward | text | left |
| 3 | `vehicle_reg_no` | VEHICLE REG. NO. | text | left |
| 4 | `start_time` | Start Time | time_hm | center |
| 5 | `end_time` | End Time | time_hm | center |
| 6 | `active_hours` | Active Hours | text | right |
| 7 | `total_distance_km` | Total Distance (KM) | decimal2 | right |
| 8 | `trips` | TRIPS | int | right |
| 9 | `avg_speed_kmh` | Average Speed (KM/h) | decimal2 | right |
| 10 | `remarks` | REMARKS | text | left |

**Totals** — Grand Total: trips sum, distance sum, active_hours total.
**Remarks logic** — `active_hours < 4` → "LESS WORKING";
`total_distance_km < 10` → "LESS COVERAGE".
**Data source** — wraps `GetVehicleSummaryReport` filtered by
`vehicle_purpose = street_sweeping`.

---

### 16. `street_sweeping_summary` — All Zones Street Sweeping Summary (04:16 PM)

**Description**
Roll-up of `street_sweeping_detail` by zone × firm.

**Filters** — `date` (required), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `firm` | FIRM | text | left |
| 4 | `total_sweeping_hoppers` | NO. OF SWEEPING HOPPERS | int | right |
| 5 | `not_worked_hoppers` | NO. OF NOT WORKED HOPPERS | int | right |
| 6 | `total_distance_km` | Total Distance (KM) | decimal2 | right |
| 7 | `trips` | TRIPS | int | right |

**Totals** — Average/Total row: numerics summed; distance averaged.
**Remarks logic** — none.
**Data source** — aggregation over `street_sweeping_detail` row set.

---

### 17. `d2d_working_check` — D2D Hopper Working Check (04:30 PM)

**Description**
End-of-day check whether each D2D vehicle has worked and whether the
helper was present. Single boolean status per vehicle.

**Filters** — `date` (required), `zone` (required), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `vehicle_reg_no` | VEHICLE REG. NO. | text | left |
| 3 | `started` | STARTED OR NOT | text | center |
| 4 | `helper_present` | HELPER PRESENT OR NOT | text | center |
| 5 | `remark` | REMARK | text | left |

**Totals** — `total_working`, `not_working_till_1630` (counts).
**Remarks logic** — "GPS ISSUE" when no ping all day; "STARTED LATE" when
first ping after shift start.
**Data source** — wraps `GetActiveVehicleSummaryReport` enriched with
helper-attendance join.

---

### 18. `commercial_hopper_summary` — All Zones D2D Commercial Hoppers Summary (04:31 PM)

**Description**
Roll-up showing commercial hoppers vs total, not-working count, helper
present count by zone × firm.

**Filters** — `date` (required), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `firm` | FIRM | text | left |
| 4 | `total_commercial_hoppers` | NO. OF COMMERCIAL HOPPERS | int | right |
| 5 | `not_working_hoppers` | NO. OF NOT WORKING HOPPERS | int | right |
| 6 | `helper_present` | HELPRE PRESENT | int | right |

**Totals** — Average/Total row: every numeric summed.
**Remarks logic** — none.
**Data source** — aggregation over `d2d_working_check` joined with vehicle
type = commercial.

---

### 19. `safai_karamchari_worked` — Safai Karamchari Worked Report (06:00 PM)

**Description**
Per-employee street-cleaning report from the mobile app. Captures
employee start time, end time, active hours, and whether they marked the
street as cleaned. Sourced from the existing `cleaning_tasks` /
`open_depot_submissions` mobile-app data.

**Filters** — `date` (required), `zone` (optional), `ward` (optional),
`employee` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `ward` | WARD | text | left |
| 4 | `street_name` | STREET NAME | text | left |
| 5 | `employee` | EMPLOYEE | text | left |
| 6 | `start_time` | START TIME | time_hm | center |
| 7 | `end_time` | END TIME | time_hm | center |
| 8 | `active_hours` | ACTIVE HOURS | text | right |
| 9 | `street_clean` | STREET CLEAN OR NOT | text | center |
| 10 | `remark` | REMARK | text | left |

**Totals** — `total_streets_cleaned`, `total_employees_present`.
**Remarks logic** — "NOT CLEANED" when `street_clean = NO`.
**Data source** — wraps `GetCleaningTasks` (sweeping_handlers.go).

---

### 20. `beet_sweeping_summary` — Beet Sweeping Summary (06:10 PM)

**Description**
Per-zone roll-up of beet (segment) sweeping activity: total wards, total
streets, total employees, present employees, cleaned streets count.

**Filters** — `date` (required), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `total_ward` | TOTAL WARD | int | right |
| 4 | `total_street` | TOTAL STREET | int | right |
| 5 | `total_employee` | TOTAL EMPLOYEE | int | right |
| 6 | `present_employee` | PRESENT EMPLOYEE | int | right |
| 7 | `cleaned_street` | CLEANED STREET | int | right |

**Totals** — Average/Total row sums every numeric column.
**Remarks logic** — none.
**Data source** — aggregation over `safai_karamchari_worked` row set
grouped by zone.

---

### 21. `gts_trip` — GTS Trip Detail (06:30 PM)

**Description**
Per-vehicle GTS trip detail by vehicle type (Refuse Compactor / Hook Loader
/ Dumper). Captures TS point, start/end time, active hours, KM, trips at
dumpsite, total waste transported.

**Filters** — `date` (required), `zone` (optional), `vehicle_type`
(optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `vehicle_reg_no` | VEHICLE REG. NO. | text | left |
| 3 | `vehicle_type` | VEHICLE TYPE | text | left |
| 4 | `ts_point` | TS POINT/ECT | text | left |
| 5 | `reached_time` | REACHED TIME | time_hm | center |
| 6 | `start_time` | START TIME | time_hm | center |
| 7 | `end_time` | END TIME | time_hm | center |
| 8 | `active_hours` | ACTIVE HOURS | text | right |
| 9 | `km` | KM | decimal2 | right |
| 10 | `trips_at_dumpsite` | TRIPS AT DUMPSITE | int | right |
| 11 | `total_waste_transport` | TOTAL WASTE TRANSPORT | decimal2 | right |
| 12 | `remark` | REMARK | text | left |

**Totals** — Grand Total: trips, KM, total_waste summed.
**Remarks logic** — "MULTI-TRIP" when trips_at_dumpsite > 1; "NO TRIP"
when 0.
**Data source** — wraps `GetGTSTripReport` joined with `weighbridge_data`
for waste totals.

---

### 22. `weight_bridge_report` — Weight Bridge Final Report (07:00 PM)

**Description**
Per-dumpsite × firm summary: total vehicles, total trips, total weight in
tons for the day.

**Filters** — `date` (required), `dumpsite` (optional), `firm` (optional).
(`dumpsite` is a new filter key; alternatively reuse `transfer_station`.)

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `dumpsite` | DUMPSITE | text | left |
| 3 | `firm` | FIRM | text | left |
| 4 | `total_vehicle` | TOTAL VEHICLE | int | right |
| 5 | `total_trips` | TOTAL TRIPS | int | right |
| 6 | `total_weight_tons` | TOTAL WEIGHT IN TONS | decimal2 | right |

**Totals** — Grand Total: every numeric summed.
**Remarks logic** — none.
**Data source** — **new aggregation** over `weighbridge_data` GROUP BY
dumpsite, firm.

---

### 23. `rfid_collection` — RFID Collection (07:30 PM)

**Description**
Per-zone × firm RFID-tag scan count and revenue collected (in Rs).

**Filters** — `date` (required), `zone` (optional), `firm` (optional).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `sr_no` | SR NO. | int | center |
| 2 | `zone` | ZONE | text | left |
| 3 | `firm` | FIRM | text | left |
| 4 | `total_household_commercial` | TOTAL HOUSEHOLD/COMMERCIAL | int | right |
| 5 | `collected_today` | COLLECTED H/C (TODAY) | int | right |
| 6 | `collection_rs` | COLLECTION IN Rs | decimal2 | right |

**Totals** — Average/Total row: every numeric summed.
**Remarks logic** — none.
**Data source** — **new aggregation** over `rfid_scan_log` ⋈ `households`
⋈ `payments`.

---

### 24. `evening_d2d_check` — Evening D2D Working Check (08:15 PM)

Same shape as report #17 (`d2d_working_check`) but with cutoff at 08:00 PM
and including all vehicle types (commercial + residential).

Data source: same as `d2d_working_check`, different cutoff.

---

### 25. `evening_commercial_detail` — Evening Commercial Hoppers Detail (11:10 PM)

Same shape as report #15 (`street_sweeping_detail`) but for evening
commercial route hoppers (04:00 AM to 11:00 PM window).

Data source: wraps `GetVehicleSummaryReport` filtered by
`vehicle_purpose = commercial_evening`.

---

### 26. `evening_commercial_summary` — All Zones Evening Commercial Summary (11:15 PM)

Same shape as report #14 (`d2d_zone_summary`) but rolling up
`evening_commercial_detail`.

Data source: aggregation over `evening_commercial_detail`.

---

### 27. `daily_master_consolidated` — Daily Master Consolidated Report

**Description**
The pre-existing daily consolidated report (currently served at
`/ultimate-reports/daily`). Aggregates all zone metrics into a single
day-level summary. Kept as a catalog entry for backward compatibility per
user decision #1.

**Filters** — `date` (required).

**Columns**

| # | Key | Header | Type | Align |
|---|----|----|----|----|
| 1 | `section` | Section | text | left |
| 2 | `metric` | Metric | text | left |
| 3 | `value` | Value | decimal2 | right |
| 4 | `target` | Target | decimal2 | right |
| 5 | `coverage_pct` | Coverage % | decimal2 | right |
| 6 | `remarks` | Remarks | text | left |

**Totals** — none (totals are interleaved as section rows).
**Remarks logic** — preserved from existing service.
**Data source** — wraps `ultimatereport.UltimateReportService.BuildReportData`.

---

## Data-source coverage matrix

| Existing service | Reports it powers |
|----|----|
| `GetD2DRouteCoverageReport` | 13, 14 |
| `GetGTSTripReport` | 21 |
| `GetActiveVehicleSummaryReport` | 10, 17, 24 |
| `GetEarlyDepartureReport` | 11 |
| `GetVehicleSummaryReport` | 15, 25 |
| `GetOpenDepotDashboard` (filtered by shift) | 2, 9, 12 |
| `GetAttendance` | 4, 7 |
| `GetShiftBasedOpsReport` | 1 |
| `GetCleaningTasks` | 19 |
| `ultimatereport.UltimateReportService.BuildReportData` | 27 |

**New aggregations needed** (8 reports):
- `ts_point_reached_0730` (#3): first GPS ping per vehicle per day vs 07:30 cutoff.
- `helper_attendance_summary` (#5): aggregation over `helper_attendance`.
- `ts_point_reached` (#6): first GPS ping in TS-geofence per vehicle.
- `street_sweeper_summary` (#8): aggregation over `govt_street_sweeper_attendance`.
- `d2d_zone_summary` (#14): aggregation over `d2d_vehicle_coverage`.
- `street_sweeping_summary` (#16): aggregation over `street_sweeping_detail`.
- `commercial_hopper_summary` (#18): aggregation over `d2d_working_check`.
- `beet_sweeping_summary` (#20): aggregation over `safai_karamchari_worked`.
- `weight_bridge_report` (#22): GROUP BY dumpsite, firm over `weighbridge_data`.
- `rfid_collection` (#23): `rfid_scan_log` ⋈ `households` ⋈ `payments`.
- `evening_commercial_summary` (#26): aggregation over `evening_commercial_detail`.

Roll-ups #5, #8, #14, #16, #18, #20, #26 share a structural pattern
(group by zone [× firm], sum/avg numerics). A shared adapter helper —
`NewRollupAdapter(detailReport, groupBy, aggregations)` — will let those
seven reports share one ~50-line implementation.

---

## Architecture changes required by this catalog

1. `ReportDefinition` adds `ScheduledTime time.Duration` (24-hour clock as
   a time-of-day offset from midnight) and `DisplayOrder int` and
   `Description string`. `TemplateXLSX` field is removed (Phase B).
2. New filter key `firm` added to the closed FilterKey set (used by 15+
   reports).
3. `weight_bridge_report` needs `dumpsite` filter — either reuse
   `transfer_station` or introduce `dumpsite` filter key. Resolution:
   reuse `transfer_station` (semantically equivalent in this dataset).
4. `ExcelExporter` becomes purely programmatic — no template loading,
   no template directory parameter (Phase B).
5. The `_storage/report-templates/master/_` folder and its README are
   removed (Phase B).
6. The frontend report selector becomes a dropdown sorted by
   `DisplayOrder` rather than alphabetical (Phase C).

---

## Implementation phases (after this doc lands)

- **Phase B** — Remove runtime template architecture.
- **Phase C** — Rebuild the 27 `ReportDefinition` registrations against
  the column specs above.
- **Phase D** — Wire each `ReportDefinition` to its data source per the
  matrix above. Existing-handler closures live in
  `internal/api/master_report_adapters.go` (new file in `api` so it can
  reach `*Handler` without import-cycle pain); the 11 new-aggregation
  reports get adapters in `internal/masterreport/reports_*.go`.

Once Phase D lands, the workbook can be physically deleted from the repo
or relocated to `docs/reference/` if you want it kept for audit.
