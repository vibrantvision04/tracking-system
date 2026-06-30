# Technical Implementation Blueprint: Road Sweeping Staff Module

## 💡 CRITICAL ARCHITECTURAL MANDATE

> This is an extension of an active production-grade enterprise codebase (Go/chi + PostgreSQL + Redis backend, Next.js web dashboard, React Native Expo mobile app). Do NOT recreate existing modules, core services, or baseline tables. **Analyze, Extend, and Reuse** current infrastructure for:
> - Attendance engine (punch-in/out with face recognition)
> - GPS telemetry pipeline (employee_live_locations table, 15s tracking)
> - Route management (existing routes table, route assignments, lane points)
> - Approval workflow (open depot cleaning approval pattern)
> - Employee monitoring dashboard (live GPS map)
> - RBAC permissions system
> - Master consolidated reporting engine

---

## 1. New Role: `road_sweeper`

The system currently has roles: `driver`, `supervisor`, `zone_manager`, `open_depot_operator`. Add `road_sweeper` as a new role.

### Key Differences from Driver
- **Single person** — no helper, no two-person crew
- **Self-attendance** — punches in alone via face recognition
- **Ward-bound** — can only punch-in within allocated ward boundary
- **Route-based cleaning** — assigned a road sweeping route with Point A (start) and Point B (end)
- **Before/After image verification** — must submit "before cleaning" photo at Point A and "after cleaning" photo at Point B
- **GPS every 8 seconds** — more frequent than the current 15s for drivers
- **Coverage calculation** — GPS trail matched against route polyline with 15m buffer

---

## 2. Database Changes

### 2.1 Extend Existing Tables (ALTER, never drop/duplicate)

```sql
-- Add road_sweeper to existing role enum if using enum type
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'road_sweeper';

-- Extend attendance table with sweeping-specific metadata
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS face_match_confidence NUMERIC(5,2);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS device_battery_punch_in INT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS gps_accuracy_punch_in NUMERIC(5,2);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS network_type_punch_in VARCHAR(20);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_supervisor_override BOOLEAN DEFAULT FALSE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS override_by_user_id INT;
```

### 2.2 New Tables

```sql
-- Road sweeping routes (extends existing route concept)
CREATE TABLE IF NOT EXISTS sweeping_routes (
    id SERIAL PRIMARY KEY,
    route_code VARCHAR(50) UNIQUE NOT NULL,
    ward_id INT REFERENCES wards(id),
    name VARCHAR(255) NOT NULL,
    polyline GEOMETRY(LineString, 4326) NOT NULL,
    point_a GEOMETRY(Point, 4326) NOT NULL,
    point_b GEOMETRY(Point, 4326) NOT NULL,
    point_a_radius_m INT DEFAULT 20,
    point_b_radius_m INT DEFAULT 20,
    length_m NUMERIC(10,2),
    direction VARCHAR(20) DEFAULT 'ONE_WAY',  -- ONE_WAY, TWO_WAY
    status VARCHAR(20) DEFAULT 'ACTIVE',
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sweeping_routes_ward ON sweeping_routes(ward_id);
CREATE INDEX idx_sweeping_routes_geo ON sweeping_routes USING GIST(polyline);

-- Route assignments for sweepers
CREATE TABLE IF NOT EXISTS sweeping_assignments (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id),
    route_id INT REFERENCES sweeping_routes(id),
    ward_id INT REFERENCES wards(id),
    shift_start TIME NOT NULL,
    shift_end TIME NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sweeping_assignments_emp ON sweeping_assignments(employee_id);
CREATE INDEX idx_sweeping_assignments_route ON sweeping_assignments(route_id);

-- Cleaning tasks (before/after images)
CREATE TABLE IF NOT EXISTS cleaning_tasks (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id),
    route_id INT REFERENCES sweeping_routes(id),
    attendance_id INT REFERENCES attendance(id),
    before_image_url TEXT NOT NULL,
    before_lat NUMERIC(10,8) NOT NULL,
    before_lng NUMERIC(11,8) NOT NULL,
    before_timestamp TIMESTAMPTZ NOT NULL,
    after_image_url TEXT,
    after_lat NUMERIC(10,8),
    after_lng NUMERIC(11,8),
    after_timestamp TIMESTAMPTZ,
    coverage_pct NUMERIC(5,2) DEFAULT 0,
    approval_status VARCHAR(20) DEFAULT 'PENDING',
    reviewed_by INT REFERENCES users(id),
    rejection_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cleaning_tasks_emp ON cleaning_tasks(employee_id);
CREATE INDEX idx_cleaning_tasks_status ON cleaning_tasks(approval_status);
```

---

## 3. API Endpoints

### 3.1 Mobile API (under `/api/mobile/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mobile/login` | Extend existing login to support `road_sweeper` role |
| POST | `/api/mobile/attendance/punch-in` | Extended existing punch-in with ward geofence check |
| POST | `/api/mobile/attendance/punch-out` | Punch-out with final location |
| GET | `/api/mobile/attendance/status` | Check current punch status |
| GET | `/api/mobile/attendance/list` | Paginated attendance history |
| POST | `/api/mobile/location` | Existing endpoint — use with 8s frequency for sweepers |
| GET | `/api/mobile/sweeping/route` | Get assigned route with Point A/B and polyline |
| POST | `/api/mobile/sweeping/before-image` | Submit before-cleaning photo (validated against Point A) |
| POST | `/api/mobile/sweeping/after-image` | Submit after-cleaning photo (validated against Point B) |
| GET | `/api/mobile/sweeping/coverage` | Get current coverage percentage |
| GET | `/api/mobile/sweeping/tasks` | List cleaning tasks with status |
| GET | `/api/mobile/alerts/my` | Existing alerts endpoint |
| GET | `/api/mobile/complaints` | Existing complaints endpoint |
| GET | `/api/mobile/dashboard` | Existing dashboard with sweeper stats |

### 3.2 Web Admin API (under `/api/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sweeping/routes` | List sweeping routes (paginated) |
| POST | `/api/sweeping/routes` | Create sweeping route |
| PUT | `/api/sweeping/routes/{id}` | Update sweeping route |
| DELETE | `/api/sweeping/routes/{id}` | Delete sweeping route |
| GET | `/api/sweeping/assignments` | List route assignments |
| POST | `/api/sweeping/assignments` | Assign route to employee |
| DELETE | `/api/sweeping/assignments/{id}` | Remove assignment |
| GET | `/api/sweeping/tasks` | List all cleaning tasks with filters |
| GET | `/api/sweeping/tasks/{id}` | Get task detail with images |
| PUT | `/api/sweeping/tasks/{id}/review` | Approve/reject cleaning task |
| GET | `/api/employee-locations` | Existing — now includes sweepers with distinct icons |
| GET | `/api/attendance` | Existing — filterable by `role=road_sweeper` |

---

## 4. Mobile App Changes

### 4.1 New Screens (following driver dashboard pattern)

```
src/screens/road_sweeper/
├── HomeScreen.tsx           # Dashboard with punch status + menu grid
├── PunchInScreen.tsx        # 3-step punch-in (GPS → face → confirm) + ward check
├── RouteMapScreen.tsx       # Assigned route with Point A/B, distance to each
├── BeforeImageScreen.tsx    # Capture before-cleaning photo (Point A radius check)
├── AfterImageScreen.tsx     # Capture after-cleaning photo (Point B radius check)
├── CoverageScreen.tsx       # Coverage %, segment breakdown
├── AttendanceScreen.tsx     # Personal attendance history
├── AlertsScreen.tsx         # Alert feed (reuse existing pattern)
└── ComplaintsScreen.tsx     # Complaints view (reuse shared component)
```

### 4.2 Navigation Changes (`RootNavigator.tsx`)

Add `'road_sweeper'` case to the role-based routing:
```typescript
if (user.role === 'road_sweeper') {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SweeperHome" component={SweeperHomeScreen} />
      <Stack.Screen name="SweeperPunchIn" component={SweeperPunchInScreen} />
      <Stack.Screen name="SweeperRouteMap" component={SweeperRouteMapScreen} />
      <Stack.Screen name="SweeperBeforeImage" component={SweeperBeforeImageScreen} />
      <Stack.Screen name="SweeperAfterImage" component={SweeperAfterImageScreen} />
      <Stack.Screen name="SweeperCoverage" component={SweeperCoverageScreen} />
      <Stack.Screen name="SweeperAttendance" component={SweeperAttendanceScreen} />
      <Stack.Screen name="SweeperAlerts" component={SweeperAlertsScreen} />
      <Stack.Screen name="Complaints" component={ComplaintsScreen} />
    </Stack.Navigator>
  );
}
```

### 4.3 GPS Tracking

The existing `useEmployeeLocationTracking` hook in `RootNavigator.tsx` already activates for all authenticated users. Modify it to use **8-second intervals** for `road_sweeper` role (keep 15s for others).

### 4.4 Punch-In Flow (extend existing)

Current punch-in verifies GPS + face. For sweepers, add:
- **Ward geofence validation** — `POST /api/attendance/verify-gps` extended to check ward boundary polygon containment
- **Single person** — no helper name field (unlike driver's two-person flow)
- **Auto-start tracking** — after successful punch-in, start 8s GPS tracking

### 4.5 Home Screen Layout

Same 2-column grid pattern as driver dashboard:
- **Punch In** — always accessible
- **Route Map** — unlocked after punch-in, shows assigned route with Point A/B
- **Before Image** — unlocked after punch-in, disabled until within Point A radius
- **After Image** — unlocked only after Before Image submitted, disabled until within Point B radius
- **Coverage** — unlocked after punch-in, shows % complete
- **Attendance** — unlocked after punch-in
- **Alerts** — unlocked after punch-in
- **Complaints** — unlocked after punch-in

---

## 5. Web Dashboard Changes

### 5.1 Sidebar Menu

Under a new top-level **Road Sweeping** category:
- **Sweeping Routes** (`/vswm/sweeping-routes`) — CRUD for routes with map-based drawing
- **Route Assignments** (`/vswm/sweeping-assignments`) — assign sweepers to routes
- **Cleaning Tasks** (`/vswm/cleaning-tasks`) — view/approve before/after submissions

### 5.2 Employee Monitoring

The existing `/vswm/employee-monitoring` page already fetches all employee locations. Add:
- Filter toggle: "Show Sweepers" / "Show Drivers" / "Show All"
- Distinct map icon for sweepers (e.g., broom icon vs vehicle icon)
- Role badge on employee popup

### 5.3 Attendance Pages

Extend existing attendance pages (`/vswm/live-attendance`, `/vswm/driver-attendance`) to support `role=road_sweeper` filter.

### 5.4 Approval Workflow

Extend existing approval UI (currently used for open depot cleaning) to handle sweeping task review:
- Side-by-side before/after image comparison
- Map showing Point A and Point B locations
- GPS audit: verify images were taken within correct radius
- Approve/Reject with comments
- Coverage % display

### 5.5 Reports

Register new reports in the Master Consolidated Reports engine:
- **Sweeper Attendance Report** — employee, ward, punch-in/out times, face match score
- **Cleaning Coverage Report** — route, assigned length, covered length, coverage %, efficiency rating
- **Task Verification Report** — task ID, before/after timestamps, approval status, reviewer

---

## 6. Route Creation & Assignment (Web)

### 6.1 Route Drawing
- Reuse the existing map component (`RouteBuilderMap` from route management page)
- Draw polyline on map (snap to roads)
- Mark Point A (start) and Point B (end) with draggable markers
- Set radius (meters) for each point
- Auto-calculate route length

### 6.2 Route Assignment
- Select sweeper employee, route, shift times, validity dates
- Prevent concurrent assignment (same route, same shift, same time)
- Support multi-route allocation (sequential routes in one day)

---

## 7. Coverage Calculation Algorithm

```
1. Generate 15m buffer polygon around assigned route polyline
2. Match GPS tracking points within this buffer
3. Divide route into 10m sequential segments
4. A segment is "Cleaned" if:
   - At least 2 consecutive GPS points fall within the segment
   - Staff velocity between 0.5 km/h and 6 km/h (walking/sweeping speed)
5. Coverage % = (Cleaned Segments / Total Segments) × 100
```

---

## 8. RBAC Permissions to Add

Register these permissions in `rbac_permissions.go`:

| Code | Category | Description |
|------|----------|-------------|
| `sweeping.routes.view` | Routes | View sweeping routes |
| `sweeping.routes.create` | Routes | Create sweeping routes |
| `sweeping.routes.edit` | Routes | Edit sweeping routes |
| `sweeping.routes.delete` | Routes | Delete sweeping routes |
| `sweeping.assignments.view` | Routes | View route assignments |
| `sweeping.assignments.create` | Routes | Assign sweepers to routes |
| `sweeping.assignments.delete` | Routes | Remove route assignments |
| `sweeping.tasks.view` | Approvals | View cleaning tasks |
| `sweeping.tasks.approve` | Approvals | Approve/reject cleaning tasks |
| `sweeping.reports.view` | Reports | View sweeping reports |

---

## 9. Implementation Order

### Phase 1: Database
1. Migration: ALTER attendance table
2. Migration: Create sweeping_routes, sweeping_assignments, cleaning_tasks tables
3. Add indexes

### Phase 2: Backend — Route Management
1. CRUD handlers for sweeping_routes (route creation with Point A/B)
2. CRUD handlers for sweeping_assignments
3. Register routes in router.go
4. Add RBAC permissions + middleware

### Phase 3: Backend — Mobile APIs
1. Extend login to support road_sweeper role
2. Extend punch-in with ward geofence validation
3. Sweeping route endpoint (GET /api/mobile/sweeping/route)
4. Before/after image submission with radius validation
5. Coverage calculation service
6. Cleaning tasks list endpoint
7. Register in router.go under mobile auth group

### Phase 4: Backend — Web APIs
1. Cleaning tasks list + review endpoint
2. Sweeping reports data endpoints
3. Extend employee-locations with role filter
4. Register in router.go

### Phase 5: Mobile App
1. Add road_sweeper to types and navigation
2. Create HomeScreen (dashboard grid)
3. Create PunchInScreen (extend existing, add ward check)
4. Create RouteMapScreen with Point A/B display
5. Create BeforeImageScreen with radius validation
6. Create AfterImageScreen with radius validation
7. Create CoverageScreen
8. Create AttendanceScreen (reuse pattern)
9. Create AlertsScreen (reuse pattern)
10. Update GPS tracking interval to 8s for sweepers
11. Add Hindi translations for all new strings

### Phase 6: Web Dashboard
1. Create Sweeping Routes page with map drawing
2. Create Route Assignments page
3. Create Cleaning Tasks page with approval UI
4. Add sweeper filter to Employee Monitoring
5. Add sweeper filter to Attendance pages
6. Register sweeping reports in Master Consolidated Reports
7. Update Sidebar with new menu items

### Phase 7: Testing
1. Ward boundary punch-in restriction
2. Point A/Point B radius validation
3. Coverage calculation accuracy
4. 8s GPS tracking reliability
5. Offline queue for GPS + image submissions
6. Role-based access control
7. Backward compatibility with existing roles

---

## 10. Key Files to Modify

### Backend
- `internal/api/router.go` — new routes
- `internal/api/handlers.go` — new handler methods
- `internal/api/mobile_handlers.go` — extend login, punch-in
- `internal/api/employee_location_handlers.go` — extend if needed
- `internal/api/rbac_permissions.go` — new permissions
- `internal/api/mobile_scope.go` — extend resolveScope
- `internal/repository/*.go` — new repository methods

### Mobile
- `src/navigation/RootNavigator.tsx` — add road_sweeper route
- `src/screens/road_sweeper/*.tsx` — new screens
- `src/hooks/useEmployeeLocationTracking.ts` — 8s for sweepers
- `src/services/attendance.ts` — new endpoints
- `src/services/api.ts` — no changes needed
- `src/types/index.ts` — add role
- `src/i18n/en.json`, `hi.json` — new strings
- `src/context/AuthContext.tsx` — no changes needed

### Web
- `web/src/components/Sidebar.tsx` — new menu items
- `web/src/app/vswm/sweeping-routes/page.tsx` — new page
- `web/src/app/vswm/sweeping-assignments/page.tsx` — new page
- `web/src/app/vswm/cleaning-tasks/page.tsx` — new page
- `web/src/app/vswm/employee-monitoring/page.tsx` — add sweeper filter
- `web/src/app/vswm/live-attendance/page.tsx` — add role filter
