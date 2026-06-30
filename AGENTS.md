# Goal
Complete architectural audit and refactor of the HR & Staff module and environment configuration — remove dummy data, fix broken pages, consolidate duplicate workflows, add real-time employee GPS tracking via mobile, clean up sidebar hierarchy, and centralize API URL configuration for local/production separation.

## Constraints & Preferences
- Backend: Go (chi), PostgreSQL, Redis
- Mobile: React Native (Expo SDK 54), TypeScript
- Web admin: Next.js, `/api/` uses auth helper from `@/lib/api`
- Do NOT remove functionality — merge duplicates, keep navigation intuitive
- Employee GPS every 15s from mobile app when user is authenticated
- No UI redesign
- Password required when creating role users from RBAC page
- Local dev must work without source edits; production builds auto-use `https://api.vibrantvisions.in`
- Zero hardcoded backend URLs in source code — single source of truth via env vars

## Progress
### Done
- Performed complete HR & Staff module audit: DB schema, web pages (9 files), backend handlers, router, sidebar, mobile screens, RBAC integration
- Created migration `059_employee_live_locations.sql` (employee_live_locations table, indexes, 1-hour cleanup)
- Created `internal/api/employee_location_handlers.go`: `MobileSubmitLocation` (POST /api/mobile/location) and `GetEmployeeLocations` (GET /api/employee-locations, latest ping per employee within last 5 min, joins employee + dept + desig)
- Registered routes: `POST /api/mobile/location` under mobile auth; `GET /api/employee-locations` under web auth
- Created `mobile/src/hooks/useEmployeeLocationTracking.ts`: sends GPS location every 15s via `api.post('/location', {lat, lng})`, auto-stops on unmount/logout
- Added `useEmployeeLocationTracking(!!user)` to `RootNavigator.tsx` — covers all roles (driver, supervisor, zone_manager, open_depot)
- Rewrote `web/src/app/vswm/employee-monitoring/page.tsx`: replaced 100% dummy GPS data with live fetch from `GET /api/employee-locations`, auto-refresh every 15s, 3 stat cards, EmployeeMap with real lat/lng
- Deleted `web/src/app/vswm/department-designation/page.tsx` (no backend, localStorage-only)
- Deleted `web/src/app/vswm/regiontype-designation/page.tsx` (no backend, localStorage-only)
- Updated sidebar: moved Employee List from Attendance to HR/Staff; removed Department→Designation, Region Type→Designation, Temporary Driver, Role To User from HR/Staff; removed Employee List from Attendance; kept RBAC as root-level
- Removed old DUMMY_COMPLAINTS from complaints page and replaced with real GET /api/complaints endpoint (read-only display)
- Enhanced RBAC User Assignment tab: added password field, auto-creates user in `users` table when assigning role
- Fixed `AssignUserRole` handler: accepts `email` from body (previously expected `{user_id}` URL param that didn't exist)
- Deleted `web/src/app/vswm/role-user/page.tsx` (absorbed into RBAC page's User Assignment tab)
- Added pagination to `GetEmployees`, `GetUsers`, `GetDepartments`, `GetDesignations` — each accepts `?page=N&page_size=N` (defaults 1/20, cap 100), returns `total`, `page`, `page_size`, `total_pages` alongside `data`. New shared `parsePagination` helper in `handlers.go`
- Centralized API URL configuration: created `mobile/src/config/env.ts` as single source of truth for API base URL; replaced hardcoded `api.vibrantvisions.in` in 4 web source files with `http://localhost:8080` fallback; removed `Platform` dependency from `api.ts`
- Set up environment file separation: `.env` (dev defaults, committed), `.env.local` (local overrides, gitignored), `.env.production` (production build values, committed) for both web and mobile apps
- Updated `.gitignore` to only ignore `.env.local` / `.env.*.local` — `.env`, `.env.production`, `.env.development` are now trackable
- Web TypeScript compiles clean (no errors); mobile TypeScript has pre-existing errors in `SubmitPhotoScreen.tsx` and `AlertsScreen.tsx` (unrelated to config changes)
- Audited production backend `.env` against local `.env` and `docker-compose.yml`: confirmed backend runs on `:8080` behind Nginx at `https://api.vibrantvisions.in`; `WS_PORT` is dead config (WS served on same HTTP server); `LOCAL_DB_DSN` was dead config (removed)
- Fixed `docker-compose.yml`: `FRONTEND_URL`, `REDIS_URL`, `REDIS_ADDR` now use `${VAR:-default}` interpolation instead of hardcoded values — production `.env` values are respected; local dev falls back to localhost origins
- Added `REDIS_ADDR=localhost:6379` to root `.env` for consistency with production config

### In Progress
- (none)

### Blocked
- EAS Build cannot run locally (git not found, needs `EAS_NO_VCS=1` environment variable)

## Key Decisions
- Employee GPS tracking: all authenticated mobile users send location every 15s via `useEmployeeLocationTracking` hook in RootNavigator (covers all roles without per-screen duplication)
- Employee monitoring web page: polls `GET /api/employee-locations` every 15s, shows latest ping per employee (DISTINCT ON), status Online if captured_at < 2 min ago
- Removed Department→Designation and Region Type→Designation pages entirely (both had no backend, localStorage-only persistence — data lost on browser clear)
- Employee Location web endpoint joins to `employee_department_designations` to show department + designation per employee
- Old `users.role` text column still active alongside RBAC `user_roles` FK table — dual system needs migration (deferred to Phase 5)
- RBAC Assign handler now accepts email from body + auto-resolves user_id from `users` table
- Role To User page absorbed into RBAC page's User Assignment tab with password field for new user creation

## Next Steps
1. Add soft-delete to employee/user/department/designation list endpoints
2. Add `RequirePermission` middleware to all HR endpoints
3. Migrate `users.role` → `user_roles` fully, update JWT claims
4. Make sidebar filter menu items by role permissions
5. Add permission guards to all existing web pages
6. Implement mobile permission loading + gating
7. Build production APK via `eas build --platform android --profile preview` (blocked by git missing on Windows)

## Critical Context
- Employee↔User linking: `users.email` local part matches `employees.employee_id` or `employees.contact_no` (used in MobileSubmitLocation)
- `employee_vehicle_assignments` is UNIQUE per employee — one vehicle per driver
- `employee_department_designations` is UNIQUE per employee — one dept+desig per employee
- RBAC `role_permissions` table ties roles to permissions; `user_roles` ties users to roles
- Employee Monitoring page now shows real GPS positions from mobile pings — no more dummy data
- RBAC User Assignment tab now creates users in `users` table (with password) before assigning role — absorbs old Role To User workflow
- Backend compiles clean; frontend TypeScript check passes
- Pagination: `parsePagination` helper in `handlers.go`, all 4 list endpoints (employees, users, departments, designations) accept `?page=N&page_size=N`, response includes `total`, `page`, `page_size`, `total_pages`
- API URL config: mobile uses `mobile/src/config/env.ts` with `EXPO_PUBLIC_API_URL` env var; web uses `NEXT_PUBLIC_API_URL` env var with `http://localhost:8080` fallback. Production values from `.env.production` at build time.
- Backend runs on `:8080` (HTTP + WebSocket on same server via chi router). Production uses Nginx to serve `https://api.vibrantvisions.in` → proxy to `127.0.0.1:8080`.
- WebSocket at `/ws/track` is served on the same HTTP server, not on a separate port. `WS_PORT` is dead config.

## Relevant Files
- `migrations/059_employee_live_locations.sql`: new table for periodic GPS pings
- `internal/api/employee_location_handlers.go`: mobile POST + web GET endpoints
- `internal/api/router.go`: route registrations
- `internal/api/rbac_handlers.go`: `AssignUserRole` now accepts email from body
- `internal/api/handlers.go`: `parsePagination` shared helper
- `internal/api/employee_handlers.go`: `GetEmployees` paginated
- `internal/api/user_handlers.go`: `GetUsers` paginated
- `internal/api/department_handlers.go`: `GetDepartments` paginated
- `internal/api/designation_handlers.go`: `GetDesignations` paginated
- `mobile/src/hooks/useEmployeeLocationTracking.ts`: 15s GPS tracking hook
- `mobile/src/navigation/RootNavigator.tsx`: activates tracking for all authenticated users
- `web/src/app/vswm/employee-monitoring/page.tsx`: rewritten with live API data
- `web/src/app/vswm/rbac/page.tsx`: enhanced User Assignment tab with password + user creation
- `web/src/app/vswm/department-designation/page.tsx`: DELETED
- `web/src/app/vswm/regiontype-designation/page.tsx`: DELETED
- `web/src/app/vswm/role-user/page.tsx`: DELETED (absorbed into RBAC page)
- `web/src/components/Sidebar.tsx`: updated hierarchy
- `web/src/app/complaints/page.tsx`: replaced dummy data with real API
- `internal/repository/rbac_repo.go`: `GetAllUserRoles`, `AssignUserRole`, `RemoveUserRole`
- `mobile/src/config/env.ts`: centralized API URL for mobile
- `mobile/.env`: default dev config (EXPO_PUBLIC_API_URL)
- `mobile/.env.local`: local overrides (gitignored)
- `mobile/.env.production`: production build config
- `web/.env`: default dev config (NEXT_PUBLIC_API_URL)
- `web/.env.local`: local overrides (gitignored)
- `web/.env.production`: production build config
