# Implementation Plan: Unified Employee Management

## Overview

This plan implements the unified employee management system foundation-first: database migration → backend handlers → frontend pages → sidebar update → scope integration. The system consolidates HR/Staff, RBAC, Department, Designation, and scope management into a single streamlined workflow with atomic API operations, Discord-style role configuration, and permission-based menu filtering.

## Tasks

- [x] 1. Database migration and schema changes
  - [x] 1.1 Create migration file `migrations/060_unified_employee_management.sql`
    - Add `scope_type` column to `roles` table with CHECK constraint ('none', 'zone', 'ward')
    - Set scope_type defaults for existing roles (zone_manager → 'zone', supervisor → 'ward')
    - Add `status` column to `employees` table with CHECK constraint ('active', 'inactive', 'archived')
    - Migrate existing `is_active` boolean to `status` text
    - Create `employee_scopes` table with employee_id, scope_type, region_id, indexes, and unique constraint
    - Populate `employee_scopes` from existing `employee_department_designations` + regions join
    - Migrate `users.role` text values to `user_roles` FK entries (where not already present)
    - Log conflicts to stdout when `users.role` disagrees with `user_roles`
    - _Requirements: 7.4, 11.1, 11.2, 11.3, 11.4, 12.3, 13.4_

  - [x] 1.2 Write property tests for scope_type constraint enforcement
    - **Property 18: scope_type Constraint Enforcement**
    - Test that only 'none', 'zone', 'ward' are accepted as scope_type values
    - Use Go `rapid` to generate arbitrary strings and verify DB rejects invalid values
    - **Validates: Requirements 12.3**

- [x] 2. Backend unified employee handlers
  - [x] 2.1 Create `internal/api/unified_employee_handlers.go` with request/response types
    - Define `UnifiedEmployeeRequest` struct with all fields (identity, login, org, scope, status)
    - Define `UnifiedEmployeeResponse` struct with complete employee state including joins
    - Define `ScopeEntry` struct for zone/ward scope representation
    - Add validation logic for required fields (employee_id, first_name, last_name, contact_no, department_id, role_id, password on create)
    - _Requirements: 1.7, 10.4_

  - [x] 2.2 Implement `CreateUnifiedEmployee` handler (POST /api/employees)
    - Begin PostgreSQL transaction
    - INSERT into employees table → get emp_id
    - INSERT/UPSERT into users table → get user_id
    - UPSERT into user_roles (enforce single-role-per-user)
    - UPSERT into employee_department_designations
    - DELETE + INSERT into employee_scopes based on role's scope_type
    - COMMIT or ROLLBACK on any error
    - Return 201 with complete UnifiedEmployeeResponse
    - Return 400 with field_errors on validation failure
    - Return 409 on duplicate employee_id or contact_no
    - _Requirements: 1.1, 10.1, 10.3, 10.4_

  - [x] 2.3 Implement `UpdateUnifiedEmployee` handler (PUT /api/employees/{id})
    - Load existing employee state
    - Skip password update if password field is blank
    - Detect role change → clear stale scopes and insert new scopes
    - If role changes from Driver → non-Driver, remove vehicle assignments
    - Atomic transaction for all updates
    - Return 200 with complete UnifiedEmployeeResponse
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 9.3, 10.2_

  - [x] 2.4 Implement `GetUnifiedEmployee` and `GetUnifiedEmployees` handlers
    - GET /api/employees/{id}: join employees + users + user_roles + roles + employee_department_designations + employee_scopes + regions
    - GET /api/employees: list with same joins, support `?department_id` filter, support `?status=active` filter (default active-only)
    - Return UnifiedEmployeeResponse with scopes array
    - _Requirements: 6.3, 13.3_

  - [x] 2.5 Implement `DeactivateEmployee` and `ReactivateEmployee` handlers
    - PUT /api/employees/{id}/status with body `{"status": "active"|"inactive"}`
    - On deactivate: set employees.status = 'inactive', disable user login (set users.is_active = false)
    - On reactivate: set employees.status = 'active', re-enable user login, restore previous role
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 2.6 Write property tests for unified employee creation round-trip
    - **Property 1: Atomic Creation Round-Trip**
    - Use Go `rapid` to generate valid UnifiedEmployeeRequest payloads
    - POST then GET and verify all fields match
    - **Validates: Requirements 1.1, 2.1, 10.1, 10.2**

  - [x] 2.7 Write property tests for validation rejection
    - **Property 3: Validation Rejects Invalid Payloads**
    - Use Go `rapid` to generate payloads missing required fields
    - Verify HTTP 400 with field-level errors and no DB records created
    - **Validates: Requirements 1.6, 1.7, 10.4**

  - [x] 2.8 Write property tests for role change clears stale scopes
    - **Property 5: Role Change Clears Stale Scopes**
    - Generate employee with scopes, change role to different scope_type
    - Verify old scopes removed and new scope_type applied
    - **Validates: Requirements 2.2, 2.4**

  - [x] 2.9 Write property tests for transaction rollback
    - **Property 14: Transaction Rollback on Partial Failure**
    - Generate payloads with invalid FK references (non-existent role_id, dept_id)
    - Verify no records created in any table
    - **Validates: Requirements 10.3**

- [x] 3. Checkpoint - Backend handlers complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend RBAC handler extensions
  - [x] 4.1 Extend `internal/api/rbac_handlers.go` with scope_type and role employee list
    - Extend GET /api/rbac/roles to return scope_type and assigned employee count
    - Extend PUT /api/rbac/roles/{id} to accept and persist scope_type field
    - Add GET /api/rbac/roles/{id}/employees endpoint returning list of assigned employees
    - Add POST /api/rbac/roles/{id}/duplicate endpoint for role duplication
    - Prevent deletion of system-defined roles (is_system = true)
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 4.1, 12.1, 12.2, 12.3_

  - [x] 4.2 Write property tests for role management
    - **Property 6: Role Duplication Preserves Permission Set**
    - **Property 7: System Roles Cannot Be Deleted**
    - **Property 8: Single-Role-Per-User Invariant**
    - Use Go `rapid` to test duplication preserves permissions, system roles resist deletion, and single-role constraint holds
    - **Validates: Requirements 3.5, 3.6, 4.2, 4.4**

  - [x] 4.3 Write property tests for permission derivation
    - **Property 9: Role Removal Revokes All Permissions**
    - **Property 10: Permissions Derived Exclusively from Role**
    - Verify permission set matches role config regardless of designation
    - **Validates: Requirements 4.3, 5.2, 5.3, 5.4**

- [x] 5. Scope resolution integration
  - [x] 5.1 Update `internal/api/mobile_scope.go` employeeRegion function
    - Add priority check: query `employee_scopes` table first
    - Fall back to `employee_department_designations` → regions join if no employee_scopes entry
    - Handle nil scope for admin-level roles (city-wide access)
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 5.2 Write property tests for scope resolution
    - **Property 12: Scope Resolution Reflects Current employee_scopes**
    - Verify resolveScope returns correct zone/ward after scope updates
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 6. Backend route registration
  - [x] 6.1 Register unified employee routes in `internal/api/router.go`
    - POST /api/employees → CreateUnifiedEmployee (RequirePermission: employees.create)
    - PUT /api/employees/{id} → UpdateUnifiedEmployee (RequirePermission: employees.edit)
    - GET /api/employees/{id} → GetUnifiedEmployee (RequirePermission: employees.view)
    - GET /api/employees → GetUnifiedEmployees (RequirePermission: employees.view)
    - PUT /api/employees/{id}/status → DeactivateEmployee (RequirePermission: employees.edit)
    - GET /api/rbac/roles/{id}/employees → GetRoleEmployees (RequirePermission: roles.view)
    - POST /api/rbac/roles/{id}/duplicate → DuplicateRole (RequirePermission: roles.create)
    - _Requirements: 10.1, 10.2, 14.1_

- [x] 7. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Frontend Employee Form page
  - [x] 8.1 Create Employee List page at `web/src/app/vswm/employee-management/employees/page.tsx`
    - Fetch from GET /api/employees with department and status filters
    - Display table with name, employee_id, role, department, status
    - Add "Create Employee" button linking to creation form
    - Add edit action linking to /employees/[id]
    - _Requirements: 6.3, 13.3_

  - [x] 8.2 Create Employee Form page at `web/src/app/vswm/employee-management/employees/[id]/page.tsx`
    - Single-page form with sections: Identity, Login, Organization, Scope
    - Fetch roles list (with scope_type), departments, designations for dropdowns
    - Implement dynamic fields: show zone selector when role.scope_type = 'zone', show ward multi-select when scope_type = 'ward', hide both when 'none'
    - On create: POST /api/employees; on edit: pre-populate form then PUT /api/employees/{id}
    - Display field-level validation errors from API response
    - Password field: required on create, optional on edit (blank = keep existing)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.5, 5.1_

  - [x] 8.3 Write property tests for dynamic field visibility (TypeScript fast-check)
    - **Property 2: Dynamic Fields Driven by scope_type**
    - Generate roles with random scope_type values
    - Verify field visibility rules match scope_type
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**

- [x] 9. Frontend Role Configuration page
  - [x] 9.1 Create Role Configuration page at `web/src/app/vswm/employee-management/roles/page.tsx`
    - Discord-style layout: left panel (role list with search, badges, employee count), right panel (tabs)
    - Permissions tab: fetch permission_categories + permissions, render category-grouped toggles
    - Members tab: show employees assigned to selected role, allow assign/remove
    - Settings tab: role name, description, scope_type dropdown, duplicate button, delete button (disabled for system roles)
    - Create new role: name input → immediately show permissions panel
    - Save role + permissions atomically via PUT /api/rbac/roles/{id}
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 12.1, 12.2_

- [x] 10. Frontend Department and Designation management
  - [x] 10.1 Create Departments page at `web/src/app/vswm/employee-management/departments/page.tsx`
    - CRUD operations for departments using existing /api/departments endpoints
    - Table with name, employee count
    - Add/edit/delete actions
    - _Requirements: 6.1, 6.2_

  - [x] 10.2 Create Designations page at `web/src/app/vswm/employee-management/designations/page.tsx`
    - CRUD operations for designations using existing /api/designations endpoints
    - Table with name, employee count
    - Add/edit/delete actions
    - _Requirements: 5.1, 5.4_

- [x] 11. Sidebar and navigation update
  - [x] 11.1 Update `web/src/components/Sidebar.tsx` with new Employee Management menu structure
    - Replace "HR / Staff" top-level item with "Employee Management"
    - Add sub-items: Employees, Roles & Permissions, Departments, Designations
    - Add "Operational Assignments" sub-section with "Driver to Vehicle"
    - Remove legacy menu items: "Employee to Designation & Department", standalone "Role To User"
    - Remove standalone "RBAC" root-level entry (absorbed into Roles & Permissions)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 11.2 Implement permission-based sidebar filtering
    - Fetch user permissions via GET /api/rbac/me/permissions on app load
    - Filter sidebar items based on user's permission set
    - Hide "Employee Management" section if user lacks `employees.view` permission
    - Show all items for Super_Admin role (wildcard permission)
    - Reflect permission changes on next page load
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 11.3 Write property tests for sidebar permission filtering (TypeScript fast-check)
    - **Property 17: Permission-Based Menu Filtering**
    - Generate random permission sets and verify correct menu visibility
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**

- [x] 12. Checkpoint - Frontend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Employee lifecycle and vehicle assignment integration
  - [x] 13.1 Implement driver role change → vehicle assignment removal
    - In UpdateUnifiedEmployee: detect role change from Driver to non-Driver
    - DELETE from employee_vehicle_assignments WHERE employee_id = target
    - Verify Driver-to-Vehicle page remains accessible separately
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 13.2 Write property tests for driver role change removes vehicle assignment
    - **Property 13: Driver Role Change Removes Vehicle Assignment**
    - Create employee with Driver role and vehicle assignment, change role
    - Verify zero active vehicle assignments
    - **Validates: Requirements 9.3**

  - [x] 13.3 Write property tests for employee deactivation
    - **Property 15: Deactivation Excludes from Active Lists**
    - **Property 16: Reactivation Restores Access**
    - Verify status changes, list exclusion, and login behavior
    - **Validates: Requirements 13.1, 13.2, 13.3**

  - [x] 13.4 Write property tests for department filter
    - **Property 11: Department Filter Returns Only Matching Employees**
    - Generate employees across departments, filter by one, verify completeness
    - **Validates: Requirements 6.3**

  - [x] 13.5 Write property tests for atomic update preserving unchanged fields
    - **Property 4: Atomic Update Preserves Unchanged Fields**
    - Update employee with blank password, verify hash unchanged
    - **Validates: Requirements 2.3, 2.5**

- [x] 14. Final checkpoint - All integration verified
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The migration (task 1.1) must run before any backend handler work
- Backend handlers (tasks 2-6) must be complete before frontend pages can be tested end-to-end
- The sidebar update (task 11) depends on frontend pages being routable

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5"] },
    { "id": 3, "tasks": ["2.6", "2.7", "2.8", "2.9", "4.1", "5.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.2"] },
    { "id": 5, "tasks": ["8.1", "8.2", "9.1", "10.1", "10.2"] },
    { "id": 6, "tasks": ["8.3", "11.1", "11.2", "13.1"] },
    { "id": 7, "tasks": ["11.3", "13.2", "13.3", "13.4", "13.5"] }
  ]
}
```
