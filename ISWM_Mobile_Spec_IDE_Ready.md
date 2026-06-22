# ISWM Mobile Application — IDE-Ready Implementation Specification
**Version:** 1.0  
**Project:** Integrated Solid Waste Management — Field Mobile App  
**Stack:** React Native + Expo (TypeScript) → Existing Go Backend + TimescaleDB/PostgreSQL  
**Phase:** 1 (Core Field Operations)

---

## Table of Contents

1. [Architecture Principles](#1-architecture-principles)
2. [Technology Stack](#2-technology-stack)
3. [Project Folder Structure](#3-project-folder-structure)
4. [Authentication & Session](#4-authentication--session)
5. [Role System](#5-role-system)
6. [GPS & Location Rules](#6-gps--location-rules)
7. [Screen-by-Screen Flows](#7-screen-by-screen-flows)
   - 7.1 [Shared: Login Screen](#71-shared-login-screen)
   - 7.2 [Driver Flows](#72-driver-flows)
   - 7.3 [Supervisor Flows](#73-supervisor-flows)
   - 7.4 [Zone Manager Flows](#74-zone-manager-flows)
   - 7.5 [Open Depot Operator Flows](#75-open-depot-operator-flows)
8. [Camera & Face Detection Rules](#8-camera--face-detection-rules)
9. [Lane Point Blockage Workflow](#9-lane-point-blockage-workflow)
10. [Backend API Contracts](#10-backend-api-contracts)
11. [Database Schema Additions](#11-database-schema-additions)
12. [UI/UX Guidelines (Low-End Device First)](#12-uiux-guidelines-low-end-device-first)
13. [Alert System](#13-alert-system)
14. [Open Depot Module](#14-open-depot-module)
15. [Punch-In / Punch-Out Logic Summary](#15-punch-in--punch-out-logic-summary)
16. [Phase 1 Deliverables Checklist](#16-phase-1-deliverables-checklist)
17. [Future Phase (Out of Scope Now)](#17-future-phase-out-of-scope-now)

---

## 1. Architecture Principles

| Principle | Rule |
|-----------|------|
| Single backend | All mobile API calls hit the existing Go backend. No separate mobile service. |
| Single database | One PostgreSQL/TimescaleDB DB. Mobile reads from the same tables as the web admin. |
| Source of truth | Web Admin. Mobile is read-heavy + limited write (attendance, blockage reports, open depot photos). |
| Image storage | VPS local storage. Attendance photos, open depot photos, blockage photos all stored server-side. |
| No gallery access | Every camera capture in the app must use `expo-camera` live capture only. Gallery picker is disabled everywhere. |
| GPS mandatory | All photo submissions must embed GPS coordinates captured at time of photo. |

---

## 2. Technology Stack

### Mobile (React Native / Expo)

| Package | Purpose |
|---------|---------|
| `expo` (SDK 52+) | Base framework |
| `expo-camera` | Live camera capture (no gallery) |
| `expo-location` | GPS coordinates |
| `react-navigation` (v6) | Screen navigation |
| `@tanstack/react-query` (v5) | API data fetching & caching |
| `axios` | HTTP client |
| `react-native-maps` or `@maplibre/maplibre-react-native` | Map display for routes |
| `expo-secure-store` | Secure JWT storage |
| `expo-image` | Optimised image display |
| `@react-native-async-storage/async-storage` | Non-sensitive local state |
| TypeScript | Strict mode enabled |

### Backend Additions (Go / Fiber v3)

Add a new route group `/api/mobile/` to the existing backend. All handlers reuse existing DB queries and business logic where possible.

---

## 3. Project Folder Structure

```
tracking-system/
├── backend/                  # Existing Go backend
│   └── internal/
│       └── mobile/           # New: mobile API handlers
│           ├── auth.go
│           ├── attendance.go
│           ├── routes.go
│           ├── coverage.go
│           ├── alerts.go
│           ├── blockages.go
│           └── open_depot.go
├── web/                      # Existing web frontend
└── mobile/                   # New: React Native app
    ├── app.json
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── components/       # Reusable UI components
        │   ├── CameraCapture.tsx
        │   ├── MapView.tsx
        │   ├── AlertBanner.tsx
        │   ├── LanePointMarker.tsx
        │   └── StatusBadge.tsx
        ├── screens/
        │   ├── auth/
        │   │   └── LoginScreen.tsx
        │   ├── driver/
        │   │   ├── HomeScreen.tsx
        │   │   ├── PunchInScreen.tsx
        │   │   ├── RouteMapScreen.tsx
        │   │   ├── CoverageScreen.tsx
        │   │   ├── AlertsScreen.tsx
        │   │   └── BlockageReportScreen.tsx
        │   ├── supervisor/
        │   │   ├── HomeScreen.tsx
        │   │   ├── PunchInScreen.tsx
        │   │   ├── DriverAttendanceScreen.tsx
        │   │   ├── WardCoverageScreen.tsx
        │   │   ├── LiveTrackingScreen.tsx
        │   │   ├── OpenDepotScreen.tsx
        │   │   └── AlertsScreen.tsx
        │   ├── zone_manager/
        │   │   ├── HomeScreen.tsx
        │   │   ├── PunchInScreen.tsx
        │   │   ├── ZoneCoverageScreen.tsx
        │   │   ├── LiveTrackingScreen.tsx
        │   │   └── AlertsScreen.tsx
        │   └── open_depot/
        │       ├── LoginScreen.tsx
        │       └── SubmitPhotoScreen.tsx
        ├── features/
        │   ├── auth/          # Auth slice, token management
        │   ├── attendance/    # Punch-in logic, face count
        │   ├── coverage/      # Coverage % calculation helpers
        │   ├── blockage/      # Blockage report flow
        │   └── alerts/        # Alert polling/display
        ├── services/
        │   ├── api.ts         # Axios instance, base URL, interceptors
        │   ├── authService.ts
        │   ├── attendanceService.ts
        │   ├── routeService.ts
        │   ├── coverageService.ts
        │   ├── alertService.ts
        │   ├── blockageService.ts
        │   └── openDepotService.ts
        ├── hooks/
        │   ├── useGPS.ts
        │   ├── useCamera.ts
        │   ├── usePunchStatus.ts
        │   └── useAlerts.ts
        ├── types/
        │   ├── auth.ts
        │   ├── attendance.ts
        │   ├── route.ts
        │   ├── alert.ts
        │   └── openDepot.ts
        ├── navigation/
        │   ├── RootNavigator.tsx     # Role-based root switch
        │   ├── DriverNavigator.tsx
        │   ├── SupervisorNavigator.tsx
        │   └── ZoneManagerNavigator.tsx
        └── utils/
            ├── gpsValidator.ts       # Ward boundary checks
            ├── imageValidator.ts     # Blur/dark detection
            └── faceCounter.ts        # Face count logic (calls backend)
```

---

## 4. Authentication & Session

### Login Flow

1. User opens app → check `expo-secure-store` for existing `access_token`.
2. If token exists and valid → skip login, go to Role Home Screen.
3. If no token → show Login Screen.
4. Login is **one-time permanent** (until uninstall or admin-forced logout).

### Token Storage

```typescript
// Secure storage keys
const KEYS = {
  ACCESS_TOKEN: 'iswm_access_token',
  REFRESH_TOKEN: 'iswm_refresh_token',
  USER_PROFILE: 'iswm_user_profile',  // JSON string
}
```

### JWT Refresh

- On every API call, attach `Authorization: Bearer <access_token>`.
- On `401` response → call `/api/mobile/refresh` with refresh token.
- On refresh failure → clear storage → redirect to Login Screen.

### Forced Logout (Admin)

- Backend can invalidate refresh tokens (existing mechanism).
- Mobile detects this on next refresh attempt and clears local session.

---

## 5. Role System

| Role | ID (use existing DB enum) | Home After Login |
|------|--------------------------|-----------------|
| `driver` | Existing | Driver Home |
| `supervisor` | Existing | Supervisor Home |
| `zone_manager` | Existing | Zone Manager Home |
| `open_depot_operator` | Existing | Open Depot Submit Screen |

The `/api/mobile/me` response includes `role`. `RootNavigator.tsx` switches the navigator tree based on this.

### Pre-Punch-In Gate (Driver Only)

Before punch-in, all menu items are visible but **non-tappable** (show `opacity: 0.4`, disable `onPress`). Tapping any locked item shows a Toast: `"Punch in first to access this feature."`.

After punch-in, all items unlock for the rest of the shift.

---

## 6. GPS & Location Rules

### Ward Boundary Validation

```typescript
// gpsValidator.ts
export function isInsideWard(
  userLat: number,
  userLng: number,
  wardPolygon: GeoJSON.Polygon   // fetched from backend on login
): boolean {
  // Use point-in-polygon algorithm (e.g. @turf/boolean-point-in-polygon)
}
```

| Role | GPS Rule |
|------|---------|
| Driver | Must be inside their single **assigned ward** to punch in. Checked at moment of photo capture. |
| Supervisor | Must be inside any one of their **assigned wards OR their assigned zone**. |
| Zone Manager | No GPS restriction. Can punch in from anywhere. |
| Open Depot Operator | Must be within configurable radius of selected depot. |

On GPS failure: show `"GPS signal required. Please enable location services and try again."` — block submission.

---

## 7. Screen-by-Screen Flows

---

### 7.1 Shared: Login Screen

**File:** `src/screens/auth/LoginScreen.tsx`

**UI Elements:**
- ISWM logo (top center, large)
- `TextInput` — Phone / Employee ID
- `TextInput` — Password (secureTextEntry)
- `TouchableOpacity` — "Login" button (large, full width)
- Loading spinner overlay during API call

**On Submit:**
```
POST /api/mobile/login
Body: { identifier: string, password: string }
Response: { access_token, refresh_token, user: UserProfile }
```

**Success:** Store tokens → navigate to Role Home.  
**Error:** Show inline error message below the form.

---

### 7.2 Driver Flows

#### 7.2.1 Driver Home Screen

**File:** `src/screens/driver/HomeScreen.tsx`

**Menu Items** (large card-style buttons, 2-column grid):

| Card | Icon | Locked until punch-in? |
|------|------|----------------------|
| Punch In | Clock | No (always accessible) |
| My Route | Map | Yes |
| Coverage | Percent | Yes |
| Alerts | Bell | Yes |
| Complaints | Flag | Yes (shows "Coming Soon" when tapped) |

**Punch-in Status Banner:** Top of screen shows green `"PUNCHED IN – Shift Active"` or amber `"NOT PUNCHED IN"`.

---

#### 7.2.2 Driver Punch-In Screen

**File:** `src/screens/driver/PunchInScreen.tsx`

**Step-by-step flow:**

```
Step 1: GPS Check
  → Request expo-location foreground permission
  → Get current coordinates
  → Validate: inside assigned ward?
      NO  → Show error: "You are outside your assigned ward. Move to [Ward Name] to punch in."
            Block further action.
      YES → Proceed to Step 2

Step 2: Live Camera Capture
  → Open expo-camera (front-facing)
  → Gallery disabled (no media library picker)
  → User taps capture button

Step 3: Image Validation (call backend POST /api/mobile/attendance/validate-photo)
  Backend returns:
  {
    valid: boolean,
    face_count: 0 | 1 | 2 | "too_many",
    issues: ("blur" | "dark" | "no_face" | "too_many_faces")[]
  }
  
  face_count = 0        → "No face detected. Please retake."  [Retake]
  face_count = "too_many" → "Too many people in frame. Only driver (+ helper) allowed."  [Retake]
  issues includes "blur" → "Photo is blurry. Please retake."  [Retake]
  issues includes "dark" → "Photo too dark. Move to better light and retake."  [Retake]
  
  face_count = 1 or 2 → Proceed to Step 4

Step 4: Confirm Photo Screen
  → Show captured photo (full width)
  → Show detected count: "1 person detected" or "2 people detected (Driver + Helper)"
  → Buttons: [Retake]  [Looks Good →]

Step 5: Name Entry & Vehicle Display
  face_count = 1:
    Form fields:
      Driver Name: TextInput (pre-filled with logged-in user's name, editable)
      Vehicle: Text display (auto-fetched from user's assignment, read-only)
    
  face_count = 2:
    Form fields:
      Driver Name: TextInput (pre-filled, editable)
      Helper Name: TextInput (empty, required)
      Vehicle: Text display (auto-fetched, read-only)

Step 6: Submit
  POST /api/mobile/attendance/punch-in
  Body: {
    driver_name: string,
    helper_name?: string,          // only if face_count = 2
    helper_present: boolean,
    photo_base64: string,          // or multipart upload
    gps_lat: number,
    gps_lng: number,
    face_count: number,
    vehicle_id: string             // from user assignment
  }
  
  Success → Show Toast "Punched in successfully!" → Navigate back to Driver Home
  Error   → Show error message, allow retry
```

---

#### 7.2.3 Driver Route Map Screen

**File:** `src/screens/driver/RouteMapScreen.tsx`

**Data fetch:**
```
GET /api/mobile/routes/my
Response: {
  ward: { id, name, polygon: GeoJSON },
  route: { id, geojson: GeoJSON.LineString },
  lane_points: LanePoint[],
  checkpoints: Checkpoint[]
}
```

**Map display:**
- Ward boundary polygon (light blue fill, blue border)
- Route line (solid dark blue)
- Lane point markers:
  - Green dot → Achieved
  - Yellow dot → Pending approval (blockage reported)
  - Red dot → Missed / Not achieved
  - White dot → Upcoming (not yet reached)
- On tap of any lane point marker → show popup with: Point name, status, "Report Blockage" button (if status is upcoming/pending and sequential order is correct)

**Sequential vs Non-Sequential:**
- Backend returns `is_sequential: boolean` per route.
- If sequential: disable "Report Blockage" for a point until the previous point is achieved.
- If non-sequential: any point can be reported at any time.

---

#### 7.2.4 Driver Coverage Screen

**File:** `src/screens/driver/CoverageScreen.tsx`

**Data fetch:**
```
GET /api/mobile/coverage/my?date=today
Response: {
  total_lane_points: number,
  achieved: number,
  pending_approval: number,
  missed: number,
  coverage_percent: number,  // (achieved / total) * 100
  shift_start: ISO8601,
  shift_end: ISO8601
}
```

**UI:**
- Large circular progress ring showing `coverage_percent`
- Below ring: "Achieved: X / Total: Y"
- Stats row: Pending (yellow) | Missed (red) | Done (green)
- Shift timer: "Shift ends at HH:MM"

---

#### 7.2.5 Driver Alerts Screen

**File:** `src/screens/driver/AlertsScreen.tsx`

**Data fetch (poll every 60 seconds):**
```
GET /api/mobile/alerts/my
Response: {
  alerts: Alert[]
}

Alert: {
  id: string,
  type: "overspeed" | "lane_point_missed" | "vehicle_stopped",
  message: string,
  severity: "minor" | "major",
  created_at: ISO8601,
  acknowledged: boolean
}
```

**Display rule:** Show only `severity = "major"` alerts.

**Major alert types:**
| Type | Trigger condition |
|------|-----------------|
| `overspeed` | Vehicle exceeds speed limit (existing backend logic) |
| `lane_point_missed` | Lane point missed in sequential route |
| `vehicle_stopped` | Vehicle stationary > 10 minutes (existing backend alert) |

Each alert card: Alert type icon + Message + Timestamp + "Acknowledge" button.

---

#### 7.2.6 Driver Blockage Report Screen

**File:** `src/screens/driver/BlockageReportScreen.tsx`

**Trigger:** Tap on a lane point marker → tap "Report Blockage".

**Flow:**

```
Step 1: Lane Point Pre-selected
  → Show: "Reporting blockage at: [Lane Point Name]"
  → Show: "You must be within 10m of this point OR within 10m of the previous point."

Step 2: GPS Validation
  → Get current GPS
  → Backend validates: is user within allowed_radius of target_point OR previous_point?
      NO  → "You are too far from this lane point to report a blockage. Move closer and try again."
      YES → Proceed

Step 3: Live Camera Capture
  → Open expo-camera rear-facing
  → Gallery disabled
  → User captures photo of blockage

Step 4: Photo Preview
  → Show captured photo
  → [Retake] [Submit Report]

Step 5: Submit
  POST /api/mobile/blockages
  Body: {
    lane_point_id: string,
    photo_base64: string,
    gps_lat: number,
    gps_lng: number
  }
  
  Response: {
    status: "pending",
    initial_approval: true   // auto-approved to continue route
  }
  
  On success:
    → Lane point marker turns Yellow on map
    → Toast: "Blockage reported. You may continue your route."
    → Navigate back to Route Map
```

**Status colours on map:**
| Colour | Meaning |
|--------|---------|
| Green | Achieved / Approved |
| Yellow | Pending supervisor/admin review (initial approval given) |
| Red | Rejected OR not achieved |

---

### 7.3 Supervisor Flows

#### 7.3.1 Supervisor Home Screen

**File:** `src/screens/supervisor/HomeScreen.tsx`

**Menu Cards:**

| Card | Description |
|------|-------------|
| Punch In | Supervisor self punch-in |
| Driver / Helper Attendance | Mark attendance on behalf of driver |
| Ward Coverage | View assigned wards' coverage |
| Live Tracking | Live vehicle tracking for assigned wards |
| Open Depot Reports | View open depot photos & submissions |
| Complaints | View ward-based complaints |
| Alerts | View alerts for assigned wards |
| Blockage Approvals | Approve/reject driver blockage reports |

---

#### 7.3.2 Supervisor Punch-In Screen

**File:** `src/screens/supervisor/PunchInScreen.tsx`

**Flow:**
```
Step 1: GPS Check
  → Validate: inside any assigned ward OR assigned zone?
      NO  → Error: "You are outside your assigned area."
      YES → Proceed

Step 2: Live Camera (self photo, front-facing)
  → Capture photo
  → No face count validation required for supervisor self-punch

Step 3: Name Entry
  → Supervisor Name: TextInput (pre-filled with their profile name, editable)
  → No vehicle field (supervisors are not assigned vehicles)

Step 4: Submit
  POST /api/mobile/attendance/punch-in
  Body: {
    role: "supervisor",
    supervisor_name: string,
    photo_base64: string,
    gps_lat: number,
    gps_lng: number
  }
```

**Punch-out:** Automatic (shift-based). Backend toggle `manual_punchout_enabled` — if true, show "Punch Out" button in home screen header.

---

#### 7.3.3 Driver / Helper Attendance Screen (Supervisor)

**File:** `src/screens/supervisor/DriverAttendanceScreen.tsx`

**Flow:**
```
Step 1: Select driver
  → Search bar: search by name, phone, or employee ID
  → Dropdown list of assigned drivers in supervisor's wards

Step 2: Live Camera (capture photo of driver and/or helper)
  → Same face count validation as driver self-punch-in
  → face_count = 1 → only driver
  → face_count = 2 → driver + helper

Step 3: Confirm names
  → Driver Name: show searched name (auto-populated from search)
  → Helper Name: TextInput if face_count = 2
  → Vehicle: auto-displayed from driver's assignment

Step 4: Submit
  POST /api/mobile/attendance/mark
  Body: {
    marked_by: supervisor_user_id,
    driver_id: string,
    driver_name: string,
    helper_present: boolean,
    helper_name?: string,
    vehicle_id: string,
    photo_base64: string,
    gps_lat: number,
    gps_lng: number,
    reason?: string         // optional reason for manual marking
  }
  
  Audit trail: server stores marked_by = supervisor_id + marked_at timestamp
```

---

#### 7.3.4 Ward Coverage Screen (Supervisor)

**File:** `src/screens/supervisor/WardCoverageScreen.tsx`

```
GET /api/mobile/coverage/wards?supervisor_id=<id>
Response: {
  wards: [{
    ward_id, ward_name,
    coverage_percent,
    vehicles_active,
    drivers_present,
    open_depots_submitted
  }]
}
```

Show each ward as a card with coverage %, active vehicles count, and a "View Details" link.

---

#### 7.3.5 Blockage Approvals (Supervisor)

```
GET /api/mobile/blockages?ward_ids=<csv>&status=pending
Response: { blockages: Blockage[] }

Blockage: {
  id, lane_point_id, lane_point_name,
  driver_name, vehicle_number,
  photo_url, gps_lat, gps_lng,
  submitted_at,
  status: "pending" | "approved" | "rejected"
}

PATCH /api/mobile/blockages/:id
Body: { action: "approve" | "reject", reviewed_by: supervisor_id }
```

On approve → lane point turns Green for driver.  
On reject → lane point turns Red for driver.

---

### 7.4 Zone Manager Flows

#### 7.4.1 Zone Manager Home Screen

**File:** `src/screens/zone_manager/HomeScreen.tsx`

**Menu Cards:**

| Card | Description |
|------|-------------|
| Punch In | Self punch-in |
| Zone Coverage | Full zone + all wards coverage |
| Live Tracking | All vehicles in zone |
| Attendance | Mark driver and supervisor attendance |
| Open Depot Reports | Zone-wide open depot submissions |
| Complaints | Zone-level complaints |
| Alerts | Zone-level alerts |

---

#### 7.4.2 Zone Manager Punch-In Screen

**Flow:**
```
Step 1: No GPS restriction (zone managers can punch in from anywhere)

Step 2: Live Camera (self photo)
  → Capture

Step 3: Name Entry
  → Name: TextInput (pre-filled, editable)

Step 4: Submit
  POST /api/mobile/attendance/punch-in
  Body: { role: "zone_manager", name: string, photo_base64: string, gps_lat, gps_lng }
```

---

#### 7.4.3 Zone Coverage Screen

```
GET /api/mobile/coverage/zone?zone_manager_id=<id>
Response: {
  zone: { id, name, total_wards, total_vehicles },
  coverage_percent: number,
  wards: WardCoverage[],
  active_vehicles: number,
  drivers_present: number
}
```

Display zone-level summary at top, then collapsible ward-by-ward breakdown below.

---

#### 7.4.4 Zone Manager Live Tracking Screen

```
GET /api/mobile/tracking/zone?zone_manager_id=<id>
Response: {
  vehicles: [{
    vehicle_id, vehicle_number, driver_name,
    ward_id, ward_name,
    lat, lng, speed,
    last_update: ISO8601,
    status: "moving" | "stopped" | "idle"
  }]
}
```

Map with all zone vehicles as markers. Colour-coded: green = moving, amber = idle, red = stopped >10 min.

---

### 7.5 Open Depot Operator Flows

#### 7.5.1 Open Depot Login Screen

**File:** `src/screens/open_depot/LoginScreen.tsx`

Same structure as the main login. Role detected from JWT → routes directly to Submit Photo screen.

#### 7.5.2 Open Depot Submit Photo Screen

**File:** `src/screens/open_depot/SubmitPhotoScreen.tsx`

**Flow:**
```
Step 1: Select Depot
  → Dropdown: list of depots assigned to this operator
  → Shows: submitted depots (greyed out with "Already submitted this shift")
             available depots (active, selectable)

Step 2: GPS Validation
  → Must be within [configurable radius, default 50m] of selected depot
      NO  → "You are not at this depot. Move closer and try again."
      YES → Proceed

Step 3: Live Camera (rear-facing)
  → Gallery disabled
  → Capture photo of depot

Step 4: Photo Preview
  → [Retake] [Submit]

Step 5: Submit
  POST /api/mobile/open-depot
  Body: {
    depot_id: string,
    photo_base64: string,
    gps_lat: number,
    gps_lng: number,
    shift: "morning" | "evening"  // derived from server time
  }

Constraint: One submission per depot per shift. Backend enforces and returns 409 if already submitted.
```

---

## 8. Camera & Face Detection Rules

### Implementation Options

**Recommended:** Server-side face detection via existing backend (avoids heavy on-device ML models on low-end Android).

```typescript
// useCamera.ts
export async function captureAndValidate(cameraRef): Promise<CaptureResult> {
  const photo = await cameraRef.current.takePictureAsync({
    quality: 0.7,
    base64: true,
    exif: false
  });
  
  // Get GPS at moment of capture
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  
  // Send to backend for validation
  const result = await validatePhoto(photo.base64, location.coords);
  return { photo, location, validation: result };
}
```

**Backend validation endpoint:**
```
POST /api/mobile/attendance/validate-photo
Body: { photo_base64: string, gps_lat: number, gps_lng: number }
Response: {
  valid: boolean,
  face_count: number,       // 0, 1, 2, or 99 (too many)
  issues: string[],          // "blur", "dark", "no_face", "too_many_faces"
  gps_valid: boolean,
  ward_check: "inside" | "outside" | "unknown"
}
```

### Face Count Rules

| Detected Faces | Action |
|---------------|--------|
| 0 | Reject: "No face detected. Please retake." |
| 1 | Driver only → proceed to name form |
| 2 | Driver + Helper → proceed to name form (both required) |
| 3+ | Reject: "Too many people in frame. Only driver and helper allowed." |

### Image Quality Rules

| Issue | User Message |
|-------|-------------|
| `blur` | "Photo is blurry. Please move to a steadier position and retake." |
| `dark` | "Photo is too dark. Move to a brighter area and retake." |
| Both | Show both messages |

---

## 9. Lane Point Blockage Workflow

### Sequential Route Logic

```
Route: P1 → P2 → P3 → P4 → P5 (sequential)

Driver achieves P1, P2, P3.
P4 is blocked.

Driver can report blockage at P4 if:
  GPS is within 10m of P4 (at the blockage)
  OR GPS is within 10m of P3 (closest achieved point behind blockage)

Backend checks:
  ST_DWithin(user_point, p4_point, 10) OR ST_DWithin(user_point, p3_point, 10)
  
Initial approval granted → P4 turns YELLOW → Driver continues to P5.

Supervisor/Admin later reviews:
  APPROVE → P4 turns GREEN
  REJECT  → P4 turns RED (driver's coverage recalculated)
```

### Non-Sequential Routes

Any lane point can be reported as blocked at any time, no order dependency.

---

## 10. Backend API Contracts

All endpoints prefixed `/api/mobile/`. All require `Authorization: Bearer <token>` except login.

### Authentication

```
POST   /api/mobile/login
POST   /api/mobile/refresh
GET    /api/mobile/me
POST   /api/mobile/logout
```

### Attendance

```
POST   /api/mobile/attendance/validate-photo    # Image + GPS validation
POST   /api/mobile/attendance/punch-in           # Self punch-in (driver/supervisor/ZM)
POST   /api/mobile/attendance/mark               # Supervisor marks driver attendance
GET    /api/mobile/attendance/status             # Current punch-in status for calling user
GET    /api/mobile/attendance/list?ward_id=&date= # Supervisor: list ward attendance
```

### Routes & Coverage

```
GET    /api/mobile/routes/my                    # Driver's assigned route, lane points
GET    /api/mobile/coverage/my?date=            # Driver's own coverage stats
GET    /api/mobile/coverage/wards               # Supervisor: all assigned wards coverage
GET    /api/mobile/coverage/zone                # Zone Manager: full zone coverage
```

### Alerts

```
GET    /api/mobile/alerts/my                    # Alerts for calling user's vehicle
GET    /api/mobile/alerts/ward?ward_id=         # Supervisor: ward-level alerts
GET    /api/mobile/alerts/zone                  # Zone Manager: zone-level alerts
POST   /api/mobile/alerts/acknowledge/:id       # Mark alert as read
POST   /api/mobile/alerts/custom                # Supervisor sends custom alert to driver
```

### Blockages

```
POST   /api/mobile/blockages                    # Driver submits blockage report
GET    /api/mobile/blockages?ward_ids=&status=  # Supervisor/ZM: list blockage reports
PATCH  /api/mobile/blockages/:id                # Supervisor/ZM: approve or reject
```

### Open Depot

```
GET    /api/mobile/open-depot/depots            # List depots for operator
GET    /api/mobile/open-depot/submissions?date= # List today's submissions
POST   /api/mobile/open-depot                   # Submit depot photo
```

### Live Tracking

```
GET    /api/mobile/tracking/ward?ward_id=       # Supervisor: vehicles in a ward
GET    /api/mobile/tracking/zone                # Zone Manager: all zone vehicles
```

---

## 11. Database Schema Additions

Add these tables/columns to the existing PostgreSQL database. All other data comes from existing tables.

### `mobile_attendance` table

```sql
CREATE TABLE mobile_attendance (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          INTEGER NOT NULL REFERENCES employees(id),
  role             VARCHAR(20) NOT NULL,         -- driver, supervisor, zone_manager
  punch_in_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  punch_out_at     TIMESTAMPTZ,
  punch_out_mode   VARCHAR(10),                 -- 'auto' | 'manual'
  driver_name      VARCHAR(100),
  helper_name      VARCHAR(100),
  helper_present   BOOLEAN DEFAULT FALSE,
  vehicle_id       INTEGER REFERENCES vehicles(id),
  photo_path       VARCHAR(500),                -- server path to stored image
  gps_lat          DECIMAL(10, 7),
  gps_lng          DECIMAL(10, 7),
  ward_id          INTEGER REFERENCES wards(id),
  marked_by        INTEGER REFERENCES employees(id),  -- NULL if self, else supervisor_id
  is_valid         BOOLEAN DEFAULT TRUE,
  shift_id         INTEGER REFERENCES shifts(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### `mobile_blockage_reports` table

```sql
CREATE TABLE mobile_blockage_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_point_id    INTEGER NOT NULL REFERENCES lane_points(id),
  driver_id        INTEGER NOT NULL REFERENCES employees(id),
  vehicle_id       INTEGER NOT NULL REFERENCES vehicles(id),
  photo_path       VARCHAR(500) NOT NULL,
  gps_lat          DECIMAL(10, 7) NOT NULL,
  gps_lng          DECIMAL(10, 7) NOT NULL,
  status           VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected
  initial_approved BOOLEAN DEFAULT TRUE,
  reviewed_by      INTEGER REFERENCES employees(id),
  reviewed_at      TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### `mobile_open_depot_submissions` table (if not exists)

```sql
CREATE TABLE mobile_open_depot_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id         INTEGER NOT NULL REFERENCES open_depots(id),
  operator_id      INTEGER NOT NULL REFERENCES employees(id),
  photo_path       VARCHAR(500) NOT NULL,
  gps_lat          DECIMAL(10, 7) NOT NULL,
  gps_lng          DECIMAL(10, 7) NOT NULL,
  shift            VARCHAR(10) NOT NULL,          -- morning | evening
  submitted_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (depot_id, operator_id, shift, DATE(submitted_at))  -- one per shift per depot
);
```

### Backend Config Toggle

```sql
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS manual_punchout_enabled BOOLEAN DEFAULT FALSE;
-- When TRUE: Supervisor and Zone Manager see a manual Punch Out button in their home screen header
```

---

## 12. UI/UX Guidelines (Low-End Device First)

### Target Device

Low-end Android phones (2-3 GB RAM, small screens ~5.5 inch, slow CPUs). Design accordingly.

### Design Rules

| Rule | Detail |
|------|--------|
| Touch targets | Minimum 56dp height for all interactive elements |
| Button text | Minimum 16sp, bold |
| Card-based layout | No small icon-only buttons. Every action is a full-width or half-width card |
| Colours | High contrast. Use system dark/light. Avoid light grey on white |
| Font size | Body: 14sp minimum. Labels: 12sp minimum. Headings: 18sp+ |
| Loading states | Every API call shows a loading indicator. No blank screens |
| Error states | Every error shows a user-readable message with a retry option |
| Offline detection | Show persistent top banner when network is unavailable |
| Language | All UI text in Hindi or English (backend returns both; use locale preference) |
| Animations | None or minimal. Avoid heavy animations for low-end device performance |
| Image display | Use `expo-image` with `contentFit="cover"` and lazy loading |
| Map performance | Load map tiles progressively. Show spinner while tiles load |

### Navigation Pattern

Bottom tab bar for the home screens. Max 4-5 tabs. No nested tab bars.

### Colour Palette

| Usage | Colour |
|-------|--------|
| Primary action | `#1565C0` (blue) |
| Success / achieved | `#2E7D32` (green) |
| Warning / pending | `#F57F17` (amber) |
| Error / missed | `#C62828` (red) |
| Background | `#F5F5F5` |
| Card background | `#FFFFFF` |
| Text primary | `#212121` |
| Text secondary | `#616161` |

---

## 13. Alert System

### Alert Sources

All alerts originate from the existing web backend alert engine. Mobile app only reads them.

### Alert Types

| `type` | Severity | Shown to |
|--------|---------|---------|
| `overspeed` | major | Driver + Supervisor + ZM |
| `lane_point_missed` | major | Driver + Supervisor + ZM |
| `vehicle_stopped` | major (>10 min only) | Driver + Supervisor + ZM |

Minor alerts (stopped < 10 min, brief speed spikes) are NOT shown on mobile.

### Polling

- Poll `/api/mobile/alerts/my` every 60 seconds using React Query `refetchInterval`.
- On new unacknowledged major alert → show persistent red banner at top of screen.
- Banner dismisses when user opens Alerts screen or taps "Acknowledge".

### Custom Alert (Supervisor → Driver)

```
POST /api/mobile/alerts/custom
Body: {
  driver_id: string,
  message: string,       // max 200 chars
  ward_id: string
}
```

Driver sees custom alerts in their Alerts screen tagged as "Supervisor Message".

---

## 14. Open Depot Module

### Business Rules

| Rule | Detail |
|------|--------|
| One submission per depot per shift | Enforced by DB unique constraint and backend 409 response |
| Gallery disabled | `expo-camera` only, no media picker |
| GPS mandatory | GPS coordinates required; submission blocked if GPS unavailable |
| Shift determination | Server derives shift (morning/evening) from current server time |
| Depot GPS radius | Configurable per depot in `open_depots` table. Default: 50 metres |

### Depot List Display

- Green checkmark on depots already submitted this shift.
- Grey/disabled state for completed depots (still visible, cannot be re-tapped).
- White/active state for pending depots.

---

## 15. Punch-In / Punch-Out Logic Summary

| Role | Punch-In Method | GPS Required | Punch-Out |
|------|----------------|-------------|----------|
| Driver | Self (face photo + name + vehicle) | Yes – inside assigned ward | Automatic at shift end |
| Supervisor | Self (photo + name) | Yes – inside assigned ward/zone | Automatic; manual if toggle ON |
| Zone Manager | Self (photo + name) | No restriction | Automatic; manual if toggle ON |
| Open Depot Operator | No punch-in concept | Yes – near depot | N/A |

**Driver can also be punched in by Supervisor** (supervisor marks attendance on driver's behalf using driver search).

---

## 16. Phase 1 Deliverables Checklist

### Mobile App Screens

- [ ] Login Screen (all roles)
- [ ] Driver Home Screen
- [ ] Driver Punch-In Screen (camera + GPS + face count + name entry)
- [ ] Driver Route Map Screen (MapLibre, lane points, colour states)
- [ ] Driver Coverage Screen
- [ ] Driver Alerts Screen
- [ ] Driver Blockage Report Screen
- [ ] Supervisor Home Screen
- [ ] Supervisor Punch-In Screen
- [ ] Supervisor Driver/Helper Attendance Screen
- [ ] Supervisor Ward Coverage Screen
- [ ] Supervisor Live Tracking Screen
- [ ] Supervisor Blockage Approvals Screen
- [ ] Supervisor Open Depot Screen
- [ ] Supervisor Alerts Screen
- [ ] Zone Manager Home Screen
- [ ] Zone Manager Punch-In Screen
- [ ] Zone Manager Zone Coverage Screen
- [ ] Zone Manager Live Tracking Screen
- [ ] Zone Manager Attendance Screen
- [ ] Open Depot Operator Login Screen
- [ ] Open Depot Operator Submit Photo Screen

### Backend API Endpoints

- [ ] POST /api/mobile/login
- [ ] POST /api/mobile/refresh
- [ ] GET  /api/mobile/me
- [ ] POST /api/mobile/attendance/validate-photo
- [ ] POST /api/mobile/attendance/punch-in
- [ ] POST /api/mobile/attendance/mark
- [ ] GET  /api/mobile/attendance/status
- [ ] GET  /api/mobile/routes/my
- [ ] GET  /api/mobile/coverage/my
- [ ] GET  /api/mobile/coverage/wards
- [ ] GET  /api/mobile/coverage/zone
- [ ] GET  /api/mobile/alerts/my
- [ ] GET  /api/mobile/alerts/ward
- [ ] GET  /api/mobile/alerts/zone
- [ ] POST /api/mobile/alerts/acknowledge/:id
- [ ] POST /api/mobile/alerts/custom
- [ ] POST /api/mobile/blockages
- [ ] GET  /api/mobile/blockages
- [ ] PATCH /api/mobile/blockages/:id
- [ ] GET  /api/mobile/open-depot/depots
- [ ] POST /api/mobile/open-depot
- [ ] GET  /api/mobile/tracking/ward
- [ ] GET  /api/mobile/tracking/zone

### Database

- [ ] `mobile_attendance` table created
- [ ] `mobile_blockage_reports` table created
- [ ] `mobile_open_depot_submissions` table created (or verified existing)
- [ ] `manual_punchout_enabled` column added to `app_settings`

---

## 17. Future Phase (Out of Scope Now)

| Feature | Notes |
|---------|-------|
| Government Complaints API | External government portal API integration. Ward/zone-based complaint feed. |
| Push Notifications | FCM integration for real-time alerts instead of polling. |
| Attendance Analytics | Dashboard charts for attendance patterns. |
| Payroll Integration | Link attendance data to payroll system. |
| Device Binding | Lock app to specific device IMEI to prevent credential sharing. |
| Advanced Reporting | Exportable shift reports, route completion PDFs. |
| Offline Mode | Cache route data for GPS-only mode when network is unavailable. |

---

*End of Specification — v1.0*  
*Prepared for: ISWM Field Mobile Application, Phase 1*  
*All backend references assume existing Go/Fiber v3 + PostgreSQL/TimescaleDB architecture.*
