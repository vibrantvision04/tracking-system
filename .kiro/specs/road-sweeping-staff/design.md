# Road Sweeping Staff — Design Document

## Architecture Overview

### Component Map

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile App (Expo/RN)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Home/Dash│  │Punch-In  │  │Route Map │  │Before/   │ │
│  │ (grid)   │  │(face+GPS)│  │(A→B poly)│  │After Img │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Coverage │  │Attend.   │  │ Alerts   │  │Complaints│ │
│  │ (% ring) │  │(history) │  │(feed)    │  │(readonly)│ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                     ↕ 8s GPS                             │
│              useEmployeeLocationTracking                  │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP/JSON
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Backend (Go/chi + PostgreSQL)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Auth/Login│  │Punch-In  │  │ Location │  │Sweeping  │ │
│  │(extended) │  │(extended)│  │/tracking │  │Routes CRUD│ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Cleaning  │  │Coverage  │  │Approval  │  │Reports   │ │
│  │Tasks     │  │Engine    │  │Workflow  │  │(existing)│ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP/JSON
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Web Dashboard (Next.js)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Sweeping  │  │Route     │  │Cleaning  │  │Employee  │ │
│  │Routes    │  │Assign.   │  │Tasks Rev.│  │Monitoring │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────────┐ │
│  │Attend.   │  │Reports   │  │Master Consolidated       │ │
│  │(filter)  │  │(existing)│  │Reports (extended)        │ │
│  └──────────┘  └──────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **No new telemetry table** — reuse `employee_live_locations` with `role='road_sweeper'` filter
2. **No new attendance table** — extend existing `attendance` with new columns + role filter
3. **New sweeping_routes** — separate from vehicle routes because sweepers use Point A→Point B walkable paths vs vehicle lane points
4. **Cleaning tasks** — new table for before/after image verification workflow
5. **Approval workflow** — extend existing pattern (open depot cleaning approval) for sweeping tasks
6. **GPS 8s** — modify existing tracking hook to check role and use 8s vs 15s interval
7. **Coverage engine** — new server-side calculation using PostGIS ST_Buffer + ST_Intersects

## API Conventions (follow existing)

- Mobile: `POST /api/mobile/...` → `RespondWithJSON` / `RespondWithError`
- Web: `GET /api/sweeping/...` → `sendJSON(w, 200, map)`
- Auth: `AuthMiddleware` + `GetClaims(r)` for user context
- Pagination: `parsePagination(r)` for list endpoints
- Permissions: `h.RequirePermission("code")` middleware

## File Structure (new files)

```
internal/api/
├── sweeping_handlers.go        # CRUD for routes + assignments
├── sweeping_mobile_handlers.go # Mobile endpoints for sweepers
├── sweeping_approval_handlers.go # Review/approve cleaning tasks

internal/service/
├── coverage_engine.go          # GPS-to-route coverage calculation

mobile/src/screens/road_sweeper/
├── HomeScreen.tsx
├── PunchInScreen.tsx
├── RouteMapScreen.tsx
├── BeforeImageScreen.tsx
├── AfterImageScreen.tsx
├── CoverageScreen.tsx
├── AttendanceScreen.tsx
├── AlertsScreen.tsx
└── ComplaintsScreen.tsx

web/src/app/vswm/
├── sweeping-routes/page.tsx
├── sweeping-assignments/page.tsx
└── cleaning-tasks/page.tsx
```
