# Requirements Document

## Introduction

This document specifies requirements for the Unified Employee Management System — a consolidation of the existing HR/Staff, RBAC, Department, Designation, and Role-User workflows into a single Discord-inspired management interface. The current system suffers from overlapping menus, duplicate assignment pages, a fragmented RBAC workflow, and confusing administration. The redesign merges employee creation, role assignment, permission configuration, and scope assignment (zone/ward) into a streamlined set of pages and APIs.

## Glossary

- **Employee_Management_System**: The unified module that handles employee lifecycle, role assignment, permission configuration, and scope-based access within the SWIFT application.
- **Employee**: A person record with identity, contact, and organizational information stored in the `employees` table.
- **User_Account**: A login credential record in the `users` table that enables an Employee to authenticate via web or mobile.
- **Role**: A named permission bundle (e.g., Driver, Supervisor, Zone_Manager, Admin, Operator) that defines system behavior and access rights. Stored in the `roles` table.
- **Permission**: A granular access right (e.g., `vehicles.view`, `reports.export`) belonging to a Permission_Category. Stored in the `permissions` table.
- **Permission_Category**: A grouping of related Permissions for UI organization (e.g., Dashboard, Vehicles, Employees). Stored in `permission_categories`.
- **Department**: An organizational unit (Accounts, Health, Solid Waste, Administration, Transport). Stored in the `departments` table.
- **Designation**: A job title that maps to a Role for display/HR purposes. After analysis, Designation is retained for HR reporting but Role governs system access.
- **Scope**: The geographic or operational boundary assigned to an Employee based on their Role — Zone for Zone_Manager, Ward(s) for Supervisor, none for Driver.
- **Zone**: A geographic administrative area containing multiple Wards.
- **Ward**: A subdivision of a Zone used for operational tracking.
- **Employee_Form**: The single-page creation/edit form consolidating all Employee, User_Account, Role, Department, Designation, and Scope fields.
- **Role_Configuration_Page**: The single page for creating a Role, configuring its Permissions, and viewing assigned Employees (Discord-style).
- **Dynamic_Fields**: Form fields that appear or disappear based on the selected Role (e.g., Zone selector appears for Zone_Manager).
- **Sidebar**: The navigation menu component rendered in `web/src/components/Sidebar.tsx`.

## Requirements

### Requirement 1: Unified Employee Creation

**User Story:** As an Admin, I want to create an Employee with all related information (identity, login, role, department, designation, scope) on a single page, so that I do not need to navigate multiple screens.

#### Acceptance Criteria

1. WHEN the Admin submits the Employee_Form with valid data, THE Employee_Management_System SHALL create an Employee record, a User_Account record, a Role assignment, a Department assignment, a Designation assignment, and a Scope assignment in a single atomic transaction.
2. WHEN the Admin selects a Role on the Employee_Form, THE Employee_Management_System SHALL display Dynamic_Fields relevant to that Role.
3. WHEN the Admin selects Zone_Manager as the Role, THE Employee_Management_System SHALL display a Zone selector field.
4. WHEN the Admin selects Supervisor as the Role, THE Employee_Management_System SHALL display a multi-select Ward field.
5. WHEN the Admin selects Driver, Helper, Operator, Open_Depot_Worker, Road_Sweeping_Staff, or RFID_Operator as the Role, THE Employee_Management_System SHALL hide Zone and Ward selector fields.
6. IF the Employee_Form submission fails validation, THEN THE Employee_Management_System SHALL display field-level error messages and preserve the entered data.
7. THE Employee_Management_System SHALL require Employee_ID, First_Name, Last_Name, Contact_No, Department, Role, and Password as mandatory fields during creation.

### Requirement 2: Unified Employee Editing

**User Story:** As an Admin, I want to edit all Employee attributes (including Role, Department, Scope, and login credentials) from a single page, so that I can manage employee changes without navigating multiple screens.

#### Acceptance Criteria

1. WHEN the Admin opens an existing Employee for editing, THE Employee_Management_System SHALL pre-populate the Employee_Form with the current Employee, User_Account, Role, Department, Designation, and Scope data.
2. WHEN the Admin changes the Role on the Employee_Form, THE Employee_Management_System SHALL update Dynamic_Fields and clear stale Scope values.
3. WHEN the Admin submits the updated Employee_Form, THE Employee_Management_System SHALL update all changed records atomically.
4. WHEN the Admin changes an Employee's Role from Zone_Manager to Driver, THE Employee_Management_System SHALL remove the Zone assignment for that Employee.
5. IF the Admin leaves the Password field blank during editing, THEN THE Employee_Management_System SHALL retain the existing password without modification.

### Requirement 3: Discord-Style Role Configuration

**User Story:** As an Admin, I want to create and configure Roles with permissions in a single workflow (Create → Configure Permissions → Save), so that role management is intuitive and consolidated.

#### Acceptance Criteria

1. THE Role_Configuration_Page SHALL present a list of all Roles with their active/inactive status, assigned Employee count, and system/custom flag.
2. WHEN the Admin creates a new Role, THE Role_Configuration_Page SHALL display the Permission configuration panel immediately after entering the Role name.
3. WHEN the Admin configures Permissions for a Role, THE Role_Configuration_Page SHALL group Permissions by Permission_Category with toggle controls.
4. WHEN the Admin saves a Role with Permissions, THE Employee_Management_System SHALL persist both the Role record and all Role-Permission associations atomically.
5. WHEN the Admin duplicates an existing Role, THE Employee_Management_System SHALL create a new Role with the same Permission set under a new name.
6. THE Employee_Management_System SHALL prevent deletion of system-defined Roles (Super_Admin, Admin).

### Requirement 4: Consolidated RBAC User Assignment

**User Story:** As an Admin, I want to assign Roles to Employees directly from the Role_Configuration_Page, so that I have a single place to manage who holds each Role.

#### Acceptance Criteria

1. WHEN the Admin views a Role on the Role_Configuration_Page, THE Employee_Management_System SHALL display a list of Employees currently assigned to that Role.
2. WHEN the Admin assigns an Employee to a Role, THE Employee_Management_System SHALL replace the Employee's previous Role assignment.
3. WHEN the Admin removes an Employee from a Role, THE Employee_Management_System SHALL revoke all Permissions associated with that Role for that Employee.
4. THE Employee_Management_System SHALL enforce a single-Role-per-User constraint.

### Requirement 5: Designation Analysis and Consolidation

**User Story:** As an Admin, I want Designation to serve as an HR display label while Role controls system access, so that there is no ambiguity between the two concepts.

#### Acceptance Criteria

1. THE Employee_Management_System SHALL retain the Designation field on the Employee_Form for HR reporting purposes.
2. THE Employee_Management_System SHALL derive all system access decisions exclusively from the assigned Role, not the Designation.
3. WHEN an Employee has a Designation of "Zone Manager" but a Role of "Viewer", THE Employee_Management_System SHALL grant only Viewer-level Permissions.
4. THE Employee_Management_System SHALL allow Designation values to differ from Role names without affecting system behavior.

### Requirement 6: Department Retention as Organizational Unit

**User Story:** As an Admin, I want to assign Employees to Departments as organizational units for reporting and filtering, so that the organizational structure is maintained independently of Roles.

#### Acceptance Criteria

1. THE Employee_Management_System SHALL present Department as a dropdown on the Employee_Form.
2. THE Employee_Management_System SHALL support CRUD operations for Departments on a dedicated management section.
3. WHEN the Admin filters the Employee list by Department, THE Employee_Management_System SHALL return only Employees assigned to that Department.
4. THE Employee_Management_System SHALL allow an Employee to belong to exactly one Department at a time.

### Requirement 7: Scope-Based Data Access

**User Story:** As a Zone_Manager or Supervisor, I want to see only the data within my assigned Zone or Wards, so that I have a focused operational view without information overload.

#### Acceptance Criteria

1. WHILE an Employee has the Zone_Manager Role with an assigned Zone, THE Employee_Management_System SHALL restrict that Employee's data visibility to vehicles, routes, wards, and reports within that Zone.
2. WHILE an Employee has the Supervisor Role with assigned Wards, THE Employee_Management_System SHALL restrict that Employee's data visibility to vehicles, routes, and reports within those assigned Wards.
3. WHEN a Zone_Manager's Zone assignment changes, THE Employee_Management_System SHALL immediately reflect the new data scope on the Zone_Manager's next data request.
4. THE Employee_Management_System SHALL store Scope assignments in a dedicated `employee_scopes` table referencing `zones` or `wards`.

### Requirement 8: Sidebar and Menu Consolidation

**User Story:** As an Admin, I want a simplified sidebar where Employee management, Role management, and Department/Designation management are accessible from a single "Employee Management" section, so that navigation is intuitive.

#### Acceptance Criteria

1. THE Sidebar SHALL contain a single "Employee Management" top-level menu item replacing the current "HR / Staff" and standalone "RBAC" entries.
2. WHEN the Admin expands the "Employee Management" menu, THE Sidebar SHALL display sub-items: "Employees", "Roles & Permissions", "Departments", and "Designations".
3. THE Sidebar SHALL remove the following legacy menu items: "Employee to Designation & Department" assignment page, and any standalone "Role To User" entry.
4. THE Sidebar SHALL retain "Driver to Vehicle" under a separate "Operational Assignments" sub-section since vehicle assignment changes frequently.

### Requirement 9: Driver-Vehicle Assignment Separation

**User Story:** As an Admin, I want Driver-to-Vehicle assignment to remain as a separate operational workflow, so that frequent vehicle reassignments do not require editing the Employee record.

#### Acceptance Criteria

1. THE Employee_Management_System SHALL maintain Driver-to-Vehicle assignment as a standalone page accessible from the Sidebar.
2. THE Employee_Management_System SHALL not include vehicle assignment fields on the Employee_Form.
3. WHEN an Employee's Role changes from Driver to a non-Driver Role, THE Employee_Management_System SHALL remove existing vehicle assignments for that Employee.

### Requirement 10: Unified Employee API

**User Story:** As a developer, I want a single API endpoint for employee creation and update that handles all related entities atomically, so that the frontend does not need to coordinate multiple API calls.

#### Acceptance Criteria

1. WHEN the frontend sends a POST request to the unified Employee creation endpoint, THE Employee_Management_System SHALL create Employee, User_Account, Role assignment, Department assignment, Designation assignment, and Scope assignment in one transaction.
2. WHEN the frontend sends a PUT request to the unified Employee update endpoint, THE Employee_Management_System SHALL update all changed entities atomically and return the complete Employee state.
3. IF any part of the atomic transaction fails, THEN THE Employee_Management_System SHALL roll back all changes and return a descriptive error response.
4. THE Employee_Management_System SHALL return HTTP 400 with field-level validation errors when request payload validation fails.

### Requirement 11: Migration from Legacy Schema

**User Story:** As an Admin, I want existing data to be preserved during migration from the old multi-table assignment system to the unified system, so that no Employee records are lost.

#### Acceptance Criteria

1. WHEN the migration runs, THE Employee_Management_System SHALL transfer all existing `employee_department_designations` records into the new unified structure.
2. WHEN the migration runs, THE Employee_Management_System SHALL map existing `users.role` text values to corresponding entries in the `user_roles` table.
3. WHEN the migration runs, THE Employee_Management_System SHALL preserve all existing `user_roles` and `role_permissions` associations.
4. IF an Employee has conflicting assignments (e.g., `users.role` says "ADMIN" but `user_roles` maps to "Viewer"), THEN THE Employee_Management_System SHALL prefer the `user_roles` entry and log the conflict.
5. THE Employee_Management_System SHALL provide a dry-run migration mode that reports changes without applying them.

### Requirement 12: Future Role Extensibility

**User Story:** As an Admin, I want to add new Roles without creating new menu items or code deployments, so that the system can adapt to organizational changes.

#### Acceptance Criteria

1. WHEN the Admin creates a new Role and configures its Permissions, THE Employee_Management_System SHALL make the new Role available for assignment without code changes.
2. WHEN the Admin creates a new Role that requires Scope (zone or ward), THE Employee_Management_System SHALL allow configuring scope-type as a Role property.
3. THE Employee_Management_System SHALL support a "scope_type" field on Roles with values: "none", "zone", or "ward" to control Dynamic_Fields on the Employee_Form.

### Requirement 13: Employee Lifecycle Status Management

**User Story:** As an Admin, I want to activate, deactivate, or archive Employees, so that departed employees are retained for historical reporting but cannot access the system.

#### Acceptance Criteria

1. WHEN the Admin deactivates an Employee, THE Employee_Management_System SHALL set the Employee's status to inactive and disable the associated User_Account login.
2. WHEN the Admin reactivates an Employee, THE Employee_Management_System SHALL re-enable the associated User_Account login and restore the previous Role assignment.
3. WHILE an Employee has inactive status, THE Employee_Management_System SHALL exclude that Employee from active Employee lists, attendance tracking, and mobile login.
4. THE Employee_Management_System SHALL retain inactive Employee records for historical reporting and audit trail purposes.

### Requirement 14: Permission-Based Menu Visibility

**User Story:** As a logged-in user, I want to see only the menu items my Role grants me access to, so that the interface is not cluttered with inaccessible options.

#### Acceptance Criteria

1. WHEN a User logs into the web application, THE Sidebar SHALL filter menu items based on the Permissions associated with the User's assigned Role.
2. WHEN a User does not have the `employees.view` Permission, THE Sidebar SHALL hide the "Employee Management" menu section.
3. WHEN a User has the Super_Admin Role, THE Sidebar SHALL display all menu items without filtering.
4. WHEN a User's Role Permissions change, THE Sidebar SHALL reflect the updated visibility on the next page load or session refresh.
