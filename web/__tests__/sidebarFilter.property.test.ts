import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Feature: unified-employee-management
 * Property 17: Permission-Based Menu Filtering
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4
 *
 * This tests the pure sidebar filtering logic extracted from Sidebar.tsx.
 * Given a set of nav items (some with a `permission` field, some without),
 * a `hasPermission` function, and a `permissionsLoaded` flag, the filter:
 *   - Returns ALL items when permissionsLoaded is false
 *   - Always shows items without a `permission` field
 *   - Shows items with a `permission` field only when hasPermission returns true
 *   - Super_Admin (wildcard "*") sees all items
 */

// ---------- Pure logic under test (mirrors Sidebar.tsx filterByPermissions) ----------

interface NavItem {
  label: string;
  href?: string;
  permission?: string;
}

/**
 * Filter nav items based on user's permission set.
 * - Items without a `permission` field are always shown (backwards compatible).
 * - Super_Admin (wildcard "*") sees everything.
 * - If permissions haven't loaded yet, show all items by default.
 */
function filterByPermissions(
  items: NavItem[],
  hasPermission: (perm: string) => boolean,
  permissionsLoaded: boolean
): NavItem[] {
  if (!permissionsLoaded) return items;

  return items.filter((item) => {
    if (!item.permission) return true;
    return hasPermission(item.permission);
  });
}

/**
 * Build a hasPermission function from a set of permission strings.
 * If the set contains "*", the user is Super_Admin and has all permissions.
 */
function buildHasPermission(permissions: string[]): (perm: string) => boolean {
  const isSuperAdmin = permissions.includes("*");
  return (perm: string) => {
    if (isSuperAdmin) return true;
    return permissions.includes(perm);
  };
}

// ---------- Generators ----------

const KNOWN_PERMISSIONS = [
  "employees.view",
  "employees.create",
  "employees.edit",
  "vehicles.view",
  "vehicles.edit",
  "reports.view",
  "reports.export",
  "attendance.view",
  "roles.manage",
  "departments.view",
  "dashboard.view",
];

/** Generate a random permission string from the known set */
const arbPermission = fc.constantFrom(...KNOWN_PERMISSIONS);

/** Generate a random set of permissions (subset of known permissions) */
const arbPermissionSet = fc.subarray(KNOWN_PERMISSIONS, { minLength: 0 });

/** Generate a nav item with an optional permission field */
const arbNavItem: fc.Arbitrary<NavItem> = fc.record({
  label: fc.string({ minLength: 1, maxLength: 30 }),
  href: fc.option(fc.webUrl(), { nil: undefined }),
  permission: fc.option(arbPermission, { nil: undefined }),
});

/** Generate a list of nav items */
const arbNavItems = fc.array(arbNavItem, { minLength: 1, maxLength: 20 });

// ---------- Property Tests ----------

describe("Property 17: Permission-Based Menu Filtering", () => {
  it("items without a permission field are always visible regardless of user permissions", () => {
    /**
     * Validates: Requirements 14.1
     * For any nav items without a permission field and any permission set,
     * those items should always appear in the filtered result.
     */
    fc.assert(
      fc.property(arbNavItems, arbPermissionSet, (items, permissions) => {
        const hasPermission = buildHasPermission(permissions);
        const result = filterByPermissions(items, hasPermission, true);

        const itemsWithoutPermission = items.filter((i) => !i.permission);
        for (const item of itemsWithoutPermission) {
          expect(result).toContainEqual(item);
        }
      }),
      { numRuns: 150 }
    );
  });

  it("items with a permission field are visible only when user has that permission", () => {
    /**
     * Validates: Requirements 14.1, 14.2
     * For any nav item with a permission field, it should appear in the result
     * if and only if the user's permission set includes that permission code.
     */
    fc.assert(
      fc.property(arbNavItems, arbPermissionSet, (items, permissions) => {
        const hasPermission = buildHasPermission(permissions);
        const result = filterByPermissions(items, hasPermission, true);

        for (const item of items) {
          if (item.permission) {
            const shouldBeVisible = permissions.includes(item.permission);
            const isVisible = result.includes(item);
            expect(isVisible).toBe(shouldBeVisible);
          }
        }
      }),
      { numRuns: 150 }
    );
  });

  it("wildcard '*' permission makes all items visible (Super_Admin)", () => {
    /**
     * Validates: Requirements 14.3
     * When a user has the wildcard "*" permission (Super_Admin),
     * all menu items should be visible regardless of their permission field.
     */
    fc.assert(
      fc.property(arbNavItems, (items) => {
        const superAdminPerms = ["*"];
        const hasPermission = buildHasPermission(superAdminPerms);
        const result = filterByPermissions(items, hasPermission, true);

        // All items should be visible
        expect(result).toHaveLength(items.length);
        for (const item of items) {
          expect(result).toContainEqual(item);
        }
      }),
      { numRuns: 150 }
    );
  });

  it("when permissions not loaded, all items are visible", () => {
    /**
     * Validates: Requirements 14.4
     * When permissionsLoaded is false, the filter should return all items
     * to avoid flash of empty sidebar during loading.
     */
    fc.assert(
      fc.property(arbNavItems, arbPermissionSet, (items, permissions) => {
        const hasPermission = buildHasPermission(permissions);
        const result = filterByPermissions(items, hasPermission, false);

        // All items should be returned unfiltered
        expect(result).toHaveLength(items.length);
        expect(result).toEqual(items);
      }),
      { numRuns: 150 }
    );
  });

  it("filtered result is always a subset of original items (no items added)", () => {
    /**
     * Validates: Requirements 14.1
     * The filtering operation should never introduce items that weren't
     * in the original list — it can only remove items.
     */
    fc.assert(
      fc.property(
        arbNavItems,
        arbPermissionSet,
        fc.boolean(),
        (items, permissions, permissionsLoaded) => {
          const hasPermission = buildHasPermission(permissions);
          const result = filterByPermissions(items, hasPermission, permissionsLoaded);

          // Result length should be <= original length
          expect(result.length).toBeLessThanOrEqual(items.length);

          // Every item in result should be in original
          for (const item of result) {
            expect(items).toContainEqual(item);
          }
        }
      ),
      { numRuns: 150 }
    );
  });

  it("empty permission set hides all permission-gated items but shows ungated items", () => {
    /**
     * Validates: Requirements 14.1, 14.2
     * A user with no permissions should see only items without a permission field.
     */
    fc.assert(
      fc.property(arbNavItems, (items) => {
        const emptyPerms: string[] = [];
        const hasPermission = buildHasPermission(emptyPerms);
        const result = filterByPermissions(items, hasPermission, true);

        // Only items without permission should be visible
        const expectedVisible = items.filter((i) => !i.permission);
        expect(result).toEqual(expectedVisible);
      }),
      { numRuns: 150 }
    );
  });
});
