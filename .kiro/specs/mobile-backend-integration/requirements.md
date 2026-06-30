# Requirements Document

## Introduction

This feature replaces all dummy, placeholder, and mocked data in the React Native (Expo) mobile application with secure, production-grade integrations against the existing Go backend (`/api/mobile/*` routes served by the chi router in `internal/api/router.go`). The objective is to make the mobile app a fully functional, role-aware client of the same data that powers the existing web dashboard, without redesigning the existing UI or layouts.

The mobile app currently contains hardcoded responses in several backend handlers (for example `MobileMyCoverage`, `MobileWardsCoverage`, `MobileZoneCoverage`, `MobileMyAlerts`, `MobileWardAlerts`, `MobileZoneAlerts` return static values, and `MobileMyRoutes` returns a "Mock Ward"). The mobile client also stores authentication tokens in `AsyncStorage` even though `expo-secure-store` is available. This feature corrects these gaps and introduces a new read-only Complaints module and a redefined Vehicle Alerts module (replacing the existing Zone Alerts).

Three roles are supported with strict, backend-enforced, role-based access: **Zone Manager**, **Supervisor** (Ward Manager), and **Driver**. The backend is the single source of truth for both data and authorization; the mobile client never determines a user's permissions on its own.

## Glossary

- **Mobile_Client**: The React Native (Expo) application that consumes backend APIs and renders screens for all three roles.
- **API_Layer**: The mobile-side networking module (`mobile/src/services/api.ts` and related typed service modules) that issues HTTP requests, attaches authentication tokens, and normalizes responses and errors.
- **Backend_API**: The Go backend exposing endpoints under `/api/mobile/*`; it is the authoritative source for data and access-control decisions.
- **Auth_Manager**: The mobile-side component responsible for token storage, retrieval, refresh, auto-login, and auto-logout.
- **Secure_Storage**: The encrypted on-device storage mechanism (`expo-secure-store`) used to persist authentication tokens.
- **Access_Token**: A short-lived JWT used to authorize API requests.
- **Refresh_Token**: A long-lived JWT used to obtain a new Access_Token without re-entering credentials.
- **Zone_Manager**: The highest-authority mobile role; has read-only visibility across an entire assigned zone and may send manual alerts to supervisors and drivers.
- **Supervisor**: Also called Ward Manager; has read-only visibility limited to a single assigned ward and may send manual alerts only to drivers.
- **Driver**: A role limited to the driver's own assigned vehicle, route, coverage, attendance, and alerts; has view-only access to alerts and cannot send alerts.
- **Role_Scope**: The set of data a role is authorized to access (zone-wide, ward-only, or own-data-only), enforced by the Backend_API.
- **Dashboard**: The home screen for each role that displays summary cards and statistics.
- **Live_Tracking**: The map screen that displays vehicle markers and live telemetry.
- **Coverage**: The set of data describing lane-point completion, coverage percentage, and distance for a route or area on a given day.
- **Attendance_Report**: A filterable, paginated list of attendance records with status, check-in time, and check-out time.
- **Complaint**: A record created on the web dashboard describing an issue, viewable (read-only) on mobile.
- **Vehicle_Alert**: A notification originating either automatically from the backend (for example overspeed, geofence, idle, ignition, offline) or manually from an authorized user.
- **Manual_Alert**: A Vehicle_Alert created by a Zone_Manager or Supervisor and directed to a permitted recipient role.
- **Lane_Point**: A discrete geographic point along a route used to measure coverage.
- **Unread_Count**: The number of Vehicle_Alerts a user has not yet read.
- **Empty_State**: The UI shown when an authorized request returns no records.

## Requirements

### Requirement 1: Authentication and Token Lifecycle

**User Story:** As a mobile user, I want to log in securely and stay authenticated, so that I can access the app without repeatedly entering credentials while keeping my session protected.

#### Acceptance Criteria

1. WHEN a user submits valid credentials, THE Backend_API SHALL return an Access_Token, a Refresh_Token, and a user profile containing the backend-determined role.
2. IF a user submits invalid credentials, THEN THE Backend_API SHALL return an HTTP 401 response and THE Mobile_Client SHALL display an authentication error message without storing any token.
3. WHEN authentication succeeds, THE Auth_Manager SHALL persist the Access_Token and Refresh_Token in Secure_Storage.
4. WHEN the Mobile_Client launches AND a valid unexpired Refresh_Token exists in Secure_Storage, THE Auth_Manager SHALL restore the session and navigate to the role-appropriate home screen without prompting for credentials.
5. IF an API request returns HTTP 401 due to an expired Access_Token AND a valid Refresh_Token exists, THEN THE Auth_Manager SHALL request a new Access_Token using the Refresh_Token and retry the original request once.
6. IF the Refresh_Token is expired or rejected by the Backend_API, THEN THE Auth_Manager SHALL clear all tokens from Secure_Storage and navigate the user to the login screen.
7. WHEN a user logs out, THE Auth_Manager SHALL invalidate the session with the Backend_API and remove all tokens and cached profile data from Secure_Storage.
8. WHILE concurrent API requests receive HTTP 401 during a single token refresh, THE Auth_Manager SHALL perform exactly one refresh operation and apply the refreshed Access_Token to the queued requests.

### Requirement 2: Role-Based Navigation and Backend-Enforced Authorization

**User Story:** As a system owner, I want each role to see only the data and actions permitted for that role, so that access control is consistent and cannot be bypassed from the client.

#### Acceptance Criteria

1. WHEN a session is established, THE Mobile_Client SHALL present the navigation structure corresponding to the role returned by the Backend_API.
2. THE Backend_API SHALL determine the Role_Scope for every request from the authenticated token rather than from any role value supplied by the Mobile_Client.
3. WHEN a Zone_Manager requests zone-scoped data, THE Backend_API SHALL return data for all wards, supervisors, drivers, and vehicles within the Zone_Manager's assigned zone.
4. WHEN a Supervisor requests data, THE Backend_API SHALL return data limited to the Supervisor's assigned ward.
5. WHEN a Driver requests data, THE Backend_API SHALL return data limited to the Driver's own assigned vehicle, route, coverage, attendance, and alerts.
6. IF a user requests data outside the user's Role_Scope, THEN THE Backend_API SHALL return an HTTP 403 response.
7. WHERE an action is not permitted for the authenticated role, THE Mobile_Client SHALL hide the control that triggers that action.
8. IF the Backend_API returns HTTP 403 for a request, THEN THE Mobile_Client SHALL display an authorization error message and SHALL NOT render restricted data.

### Requirement 3: Dashboard Data Integration

**User Story:** As a Zone Manager, Supervisor, or Driver, I want my dashboard to show real values from the backend, so that I can rely on the numbers I see.

#### Acceptance Criteria

1. WHEN a Dashboard screen loads, THE API_Layer SHALL retrieve every displayed card value from the Backend_API scoped to the user's Role_Scope.
2. THE Mobile_Client SHALL display dashboard metrics for coverage percentage, total vehicle count, running vehicle count, completed route count, pending route count, active driver count, attendance summary, alert count, and complaint count using values returned by the Backend_API.
3. WHILE a Dashboard request is in progress, THE Mobile_Client SHALL display a loading indicator in place of the affected cards.
4. IF a Dashboard request returns no records for a metric, THEN THE Mobile_Client SHALL display a zero or Empty_State value for that metric.
5. IF a Dashboard request fails, THEN THE Mobile_Client SHALL display an error state with a retry control.
6. THE Mobile_Client SHALL NOT display any hardcoded or placeholder dashboard value.

### Requirement 4: Live Tracking

**User Story:** As a Zone Manager, Supervisor, or Driver, I want to see vehicles on a live map, so that I can monitor current location and status within my scope.

#### Acceptance Criteria

1. WHEN the Live_Tracking screen loads, THE API_Layer SHALL retrieve vehicle telemetry from the Backend_API scoped to the user's Role_Scope.
2. THE Mobile_Client SHALL render a map marker for each returned vehicle showing current location, vehicle status, speed, ignition state, and last-updated time.
3. WHILE the Live_Tracking screen is in the foreground, THE Mobile_Client SHALL refresh vehicle telemetry on a fixed interval of 15 seconds or less.
4. WHEN the Live_Tracking screen leaves the foreground, THE Mobile_Client SHALL stop issuing telemetry refresh requests.
5. WHEN a Driver opens Live_Tracking, THE Backend_API SHALL return telemetry only for the Driver's own assigned vehicle.
6. IF a vehicle has no telemetry within the last reporting interval, THEN THE Mobile_Client SHALL mark that vehicle as offline using the backend-provided status.
7. THE Backend_API SHALL return a vehicle status derived from telemetry rather than a fixed default value.

### Requirement 5: Coverage

**User Story:** As a Zone Manager, Supervisor, or Driver, I want coverage figures that match the web dashboard, so that mobile and web report the same operational picture.

#### Acceptance Criteria

1. WHEN a Coverage screen loads, THE API_Layer SHALL retrieve daily coverage data from the Backend_API scoped to the user's Role_Scope.
2. THE Mobile_Client SHALL display total lane points, completed lane points, remaining lane points, coverage percentage, covered distance, and pending distance using values returned by the Backend_API.
3. THE Mobile_Client SHALL display the coverage timeline and vehicle route using data returned by the Backend_API.
4. WHEN the same date and scope are requested, THE Backend_API SHALL return coverage values consistent with the values served to the web dashboard.
5. IF a Coverage request returns no records for the selected date, THEN THE Mobile_Client SHALL display an Empty_State.
6. THE Mobile_Client SHALL NOT display any hardcoded coverage value.

### Requirement 6: Attendance and Attendance Report

**User Story:** As a Zone Manager or Supervisor, I want a searchable attendance report, so that I can review attendance for the people in my scope.

#### Acceptance Criteria

1. WHEN the Attendance_Report screen loads, THE API_Layer SHALL retrieve attendance records from the Backend_API scoped to the user's Role_Scope.
2. THE Mobile_Client SHALL display each attendance record with attendance status of Present, Absent, Late, or Leave, along with check-in time, check-out time, and date.
3. WHEN a user enters a search term, THE Mobile_Client SHALL request attendance records filtered by that search term from the Backend_API.
4. WHEN a user applies a status or date filter, THE Backend_API SHALL return attendance records matching the applied filter within the user's Role_Scope.
5. WHEN an attendance result set exceeds one page, THE Backend_API SHALL return paginated results AND THE Mobile_Client SHALL allow navigation between pages.
6. THE Mobile_Client SHALL continue to use the existing attendance marking flow for recording attendance.
7. IF an attendance request returns no records, THEN THE Mobile_Client SHALL display an Empty_State.

### Requirement 7: Complaints (Read-Only)

**User Story:** As a Zone Manager, Supervisor, or Driver, I want to view complaints relevant to my scope, so that I stay informed about reported issues, while complaint creation remains a web-only action.

#### Acceptance Criteria

1. WHEN the Complaints screen loads, THE API_Layer SHALL retrieve complaints from the Backend_API scoped to the user's Role_Scope.
2. THE Mobile_Client SHALL display each Complaint with complaint id, title, description, priority, status, assigned vehicle, assigned driver, created date, updated date, location, and images.
3. THE Mobile_Client SHALL present the Complaints module as read-only and SHALL NOT provide any control to create, edit, or delete a Complaint.
4. WHEN a Supervisor requests complaints, THE Backend_API SHALL return only complaints associated with the Supervisor's assigned ward.
5. WHEN a Driver requests complaints, THE Backend_API SHALL return only complaints associated with the Driver's own assigned vehicle or routes.
6. IF a complaint request returns no records, THEN THE Mobile_Client SHALL display an Empty_State.

### Requirement 8: Vehicle Alerts

**User Story:** As a Zone Manager, Supervisor, or Driver, I want to receive vehicle alerts from automatic and manual sources, so that I can respond to operational events within my scope.

#### Acceptance Criteria

1. THE Mobile_Client SHALL remove the existing Zone Alerts module and present a Vehicle_Alerts module in its place.
2. WHEN the Vehicle_Alerts screen loads, THE API_Layer SHALL retrieve Vehicle_Alerts from the Backend_API scoped to the user's Role_Scope.
3. THE Backend_API SHALL include automatically generated Vehicle_Alerts for overspeed, geofence entry, geofence exit, idle, ignition, offline, battery, and harsh braking events.
4. THE Backend_API SHALL include Manual_Alerts created by authorized users in the Vehicle_Alerts results.
5. WHEN a Zone_Manager sends a Manual_Alert, THE Backend_API SHALL accept recipients of role Supervisor and role Driver.
6. WHEN a Supervisor sends a Manual_Alert, THE Backend_API SHALL accept recipients of role Driver only.
7. IF a Supervisor attempts to send a Manual_Alert to a Zone_Manager, THEN THE Backend_API SHALL return an HTTP 403 response.
8. WHERE the authenticated role is Driver, THE Mobile_Client SHALL hide all controls for creating a Manual_Alert.
9. THE Mobile_Client SHALL display the Unread_Count and the read status for each Vehicle_Alert.
10. WHEN a user opens a Vehicle_Alert, THE Mobile_Client SHALL mark that Vehicle_Alert as read and decrement the Unread_Count accordingly.
11. THE Mobile_Client SHALL display alert details and notification history using data returned by the Backend_API.
12. WHERE the Backend_API supports push notifications, THE Mobile_Client SHALL register for and display push notifications for new Vehicle_Alerts.

### Requirement 9: Driver Route

**User Story:** As a Driver, I want my assigned route and progress to come from the backend, so that I follow the correct route and see accurate completion.

#### Acceptance Criteria

1. WHEN the Driver Route screen loads, THE API_Layer SHALL retrieve the Driver's assigned route from the Backend_API.
2. THE Backend_API SHALL return the assigned route, route lane points, completed lane points, remaining lane points, route path geometry, coverage, and current vehicle position for the authenticated Driver.
3. THE Mobile_Client SHALL display route progress using lane-point completion data returned by the Backend_API.
4. THE Backend_API SHALL return the ward associated with the Driver's assigned route rather than a placeholder ward value.
5. IF no route is assigned to the Driver, THEN THE Backend_API SHALL return an HTTP 404 response AND THE Mobile_Client SHALL display an Empty_State.
6. THE Mobile_Client SHALL NOT display any hardcoded route or lane-point data.

### Requirement 10: API Layer, Typed Models, and Error Handling

**User Story:** As a developer, I want a consistent typed API layer with predictable error handling, so that screens behave reliably across network conditions.

#### Acceptance Criteria

1. THE API_Layer SHALL attach the current Access_Token as a bearer token to every authenticated request to the Backend_API.
2. THE API_Layer SHALL map each Backend_API response to a typed model defined in the mobile type definitions.
3. WHEN the Backend_API returns HTTP 401, 403, 404, or 500, THE API_Layer SHALL surface a categorized error that the calling screen can render.
4. IF a request exceeds the configured timeout, THEN THE API_Layer SHALL return a timeout error to the calling screen.
5. IF the device has no network connectivity, THEN THE Mobile_Client SHALL display an offline indicator AND SHALL defer dependent requests until connectivity is restored.
6. WHEN a transient network error or HTTP 500 occurs on an idempotent GET request, THE API_Layer SHALL retry the request up to a bounded maximum of 3 attempts before surfacing the error.
7. WHILE a request is in progress, THE Mobile_Client SHALL display a loading state for the affected screen region.
8. THE API_Layer SHALL NOT reference any dummy or mock data source.

### Requirement 11: Security and Token Handling

**User Story:** As a security stakeholder, I want tokens and permissions handled safely, so that sensitive data and access controls are not exposed or controlled by the client.

#### Acceptance Criteria

1. THE Auth_Manager SHALL store the Access_Token and Refresh_Token only in Secure_Storage.
2. THE Mobile_Client SHALL determine the visibility of restricted actions from the role returned by the Backend_API and SHALL NOT grant access based on any client-side permission value.
3. THE Backend_API SHALL validate the JWT signature and expiry on every authenticated request.
4. IF a request carries an invalid or expired JWT, THEN THE Backend_API SHALL return an HTTP 401 response.
5. THE Mobile_Client SHALL exclude token values and credential values from log output and error messages.
6. WHEN a session ends through logout or refresh failure, THE Auth_Manager SHALL remove all tokens and cached profile data from Secure_Storage.

### Requirement 12: Performance and Data Efficiency

**User Story:** As a mobile user, I want the app to load quickly and avoid unnecessary requests, so that it remains responsive on mobile networks.

#### Acceptance Criteria

1. WHERE a list endpoint supports pagination, THE Mobile_Client SHALL request and render results one page at a time.
2. WHEN a user types in a search field, THE Mobile_Client SHALL debounce search requests so that no more than one request is issued per 300 milliseconds of input inactivity.
3. WHEN previously fetched data is still within its cache validity window, THE Mobile_Client SHALL render cached data while revalidating in the background.
4. WHILE the Live_Tracking screen is active, THE Mobile_Client SHALL reuse existing markers and update their positions rather than recreating the full marker set on each refresh.
5. WHEN navigating between screens that share data, THE Mobile_Client SHALL avoid issuing duplicate concurrent requests for the same resource.
6. WHEN list content has not changed between refreshes, THE Mobile_Client SHALL avoid re-rendering unchanged list items.

### Requirement 13: UI and Layout Preservation

**User Story:** As an existing mobile user, I want the app to look and behave as before, so that the transition to real data does not disrupt familiarity.

#### Acceptance Criteria

1. THE Mobile_Client SHALL retain the existing screen layouts, navigation structure, and visual components while replacing dummy data sources with Backend_API integrations.
2. WHERE an existing screen previously displayed dummy data, THE Mobile_Client SHALL render the equivalent backend-sourced data within the same layout.
3. IF a layout change is unavoidable to display required backend data, THEN THE Mobile_Client SHALL limit the change to the minimum needed to present that data.
