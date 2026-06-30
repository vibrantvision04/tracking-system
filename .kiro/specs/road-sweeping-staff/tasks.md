# Road Sweeping Staff — Implementation Tasks

## Phase 1: Database Migrations
- [ ] Migration 060: ALTER attendance — add sweeper metadata columns
- [ ] Migration 061: Create `sweeping_routes` table with PostGIS geometry
- [ ] Migration 062: Create `sweeping_assignments` table
- [ ] Migration 063: Create `cleaning_tasks` table with indexes
- [ ] Migration 064: Add `road_sweeper` to user role enum

## Phase 2: Backend — Route Management
- [ ] `sweeping_handlers.go`: CreateSweepingRoute, GetSweepingRoutes, UpdateSweepingRoute, DeleteSweepingRoute
- [ ] `sweeping_handlers.go`: AssignSweepingRoute, GetSweepingAssignments, DeleteSweepingAssignment
- [ ] `rbac_permissions.go`: Register sweeping permissions
- [ ] `router.go`: Register sweeping route endpoints with permission middleware

## Phase 3: Backend — Mobile APIs
- [ ] `mobile_handlers.go`: Extend MobileLogin for road_sweeper role
- [ ] `mobile_handlers.go`: Extend MobilePunchIn with ward geofence check
- [ ] `mobile_scope.go`: Extend resolveScope for road_sweeper
- [ ] `sweeping_mobile_handlers.go`: GET /sweeping/route — assigned route with polyline
- [ ] `sweeping_mobile_handlers.go`: POST /sweeping/before-image — validate Point A radius
- [ ] `sweeping_mobile_handlers.go`: POST /sweeping/after-image — validate Point B radius, trigger coverage calc
- [ ] `sweeping_mobile_handlers.go`: GET /sweeping/coverage — current coverage %
- [ ] `sweeping_mobile_handlers.go`: GET /sweeping/tasks — list cleaning tasks
- [ ] `router.go`: Register mobile sweeping endpoints under mobile auth group

## Phase 4: Backend — Web APIs
- [ ] `sweeping_approval_handlers.go`: GET /sweeping/tasks — list with filters
- [ ] `sweeping_approval_handlers.go`: PUT /sweeping/tasks/{id}/review — approve/reject
- [ ] `coverage_engine.go`: Coverage calculation service (15m buffer, 10m segments, velocity filter)
- [ ] `report_handlers.go` or new: Sweeping report data endpoints
- [ ] `router.go`: Register web sweeping endpoints with permission middleware

## Phase 5: Mobile App
- [ ] `src/types/index.ts`: Add 'road_sweeper' to Role type
- [ ] `src/navigation/RootNavigator.tsx`: Add road_sweeper route group
- [ ] `src/hooks/useEmployeeLocationTracking.ts`: 8s interval for road_sweeper
- [ ] `src/screens/road_sweeper/HomeScreen.tsx`: Dashboard grid (same pattern as driver)
- [ ] `src/screens/road_sweeper/PunchInScreen.tsx`: Extended punch-in with ward check
- [ ] `src/screens/road_sweeper/RouteMapScreen.tsx`: Map with A→B polyline, distance overlays
- [ ] `src/screens/road_sweeper/BeforeImageScreen.tsx`: Camera + Point A radius validation
- [ ] `src/screens/road_sweeper/AfterImageScreen.tsx`: Camera + Point B radius validation
- [ ] `src/screens/road_sweeper/CoverageScreen.tsx`: Ring chart + segment breakdown
- [ ] `src/screens/road_sweeper/AttendanceScreen.tsx`: Paginated attendance list
- [ ] `src/screens/road_sweeper/AlertsScreen.tsx`: Alert feed (reuse pattern)
- [ ] `src/services/attendance.ts`: Add sweeper API methods
- [ ] `src/services/route.ts`: Add sweeping route method
- [ ] `src/i18n/en.json`: Add sweeper strings
- [ ] `src/i18n/hi.json`: Add Hindi translations

## Phase 6: Web Dashboard
- [ ] `Sidebar.tsx`: Add Road Sweeping category with sub-menus
- [ ] `web/src/app/vswm/sweeping-routes/page.tsx`: Map-based route creation with Point A/B
- [ ] `web/src/app/vswm/sweeping-assignments/page.tsx`: Assignment management
- [ ] `web/src/app/vswm/cleaning-tasks/page.tsx`: Before/after review with approval
- [ ] `web/src/app/vswm/employee-monitoring/page.tsx`: Role filter + sweeper icon
- [ ] `web/src/app/vswm/live-attendance/page.tsx`: Add sweeper role filter
- [ ] Master Consolidated Reports: Register sweeping reports

## Phase 7: Testing & Verification
- [ ] Ward boundary punch-in restriction (inside/outside)
- [ ] Point A radius validation (before image)
- [ ] Point B radius validation (after image)
- [ ] 8s GPS tracking reliability
- [ ] Coverage calculation accuracy
- [ ] Offline queue for GPS pings
- [ ] Offline queue for image submissions
- [ ] Role-based access control
- [ ] Backward compatibility with driver/supervisor/zone_manager
- [ ] Hindi language strings
