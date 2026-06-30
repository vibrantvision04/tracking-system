import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Feature: master-consolidated-reporting
 * Property 15: Sidebar Visibility Gate (Master Consolidated Reports sub-item)
 *
 * **Validates: Requirements 9.3, 9.4**
 *
 * For any principal P (random subset of the global permission universe) and
 * any random `permissionsLoaded` boolean, the rendered nav tree (after
 * `filterByPermissions`) contains the sub-item
 *   { label: "Master Consolidated Reports", href: "/master-reports" }
 * iff
 *   permissionsLoaded === false  OR
 *   P is empty                    OR
 *   P contains "reports.view"     OR
 *   P contains "*"
 *
 * The test exercises the pure recursive filter logic (mirroring
 * `filterByPermissions` in `web/src/components/Sidebar.tsx`) against a minimal
 * `fullNavData`-shaped tree containing the parent "Master Consolidated Report"
 * group with the gated child sub-item. Mirrors the style of
 * `web/__tests__/sidebarFilter.property.test.ts`.
 */

// ---------- Pure logic under test (mirrors Sidebar.tsx filterByPermissions) ----------

interface NavItem {
  label: string;
  href?: string;
  permission?: string;
  children?: NavItem[];
}

/**
 * Filter nav items based on user's permission set.
 * - Items without a `permission` field are always shown (backwards compatible).
 * - Super_Admin (wildcard "*") sees everything.
 * - If permissions haven't loaded yet, show all items by default.
 * - If permissions array is empty after loading, show all items.
 * - Children are filtered recursively so per-sub-item gates are applied.
 */
function filterByPermissions(
  items: NavItem[],
  hasPermission: (perm: string) => boolean,
  permissionsLoaded: boolean,
  permissions: string[]
): NavItem[] {
  if (!permissionsLoaded) return items;
  if (permissions.length === 0) return items;

  return items
    .filter((item) => {
      if (!item.permission) return true;
      return hasPermission(item.permission);
    })
    .map((item) => {
      if (item.children && item.children.length > 0) {
        return {
          ...item,
          children: filterByPermissions(item.children, hasPermission, permissionsLoaded, permissions),
        };
      }
      return item;
    });
}

function buildHasPermission(permissions: string[]): (perm: string) => boolean {
  const isSuperAdmin = permissions.includes("*");
  return (perm: string) => {
    if (isSuperAdmin) return true;
    return permissions.includes(perm);
  };
}

/**
 * Returns true if any node (or descendant) in `tree` is the master-reports
 * sub-item identified by href "/master-reports" with label
 * "Master Consolidated Reports".
 */
function containsMasterReportsItem(tree: NavItem[]): boolean {
  for (const node of tree) {
    if (node.label === "Master Consolidated Reports" && node.href === "/master-reports") {
      return true;
    }
    if (node.children && node.children.length > 0) {
      if (containsMasterReportsItem(node.children)) return true;
    }
  }
  return false;
}

// ---------- Minimal nav tree fixture (mirrors fullNavData shape) ----------

/**
 * Builds a fresh nav tree per test run so mutation via spread in the recursive
 * filter does not bleed across iterations.
 */
function buildNavData(): NavItem[] {
  return [
    {
      label: "Master Consolidated Report",
      children: [
        { label: "Daily Master Consolidated Report", href: "/ultimate-reports/daily" },
        { label: "Master Consolidated Reports", href: "/master-reports", permission: "reports.view" },
      ],
    },
  ];
}

// ---------- Generators ----------

const KNOWN_PERMISSIONS = [
  "reports.view",
  "reports.force_recalculate",
  "employees.view",
  "vehicles.view",
  "routes.view",
  "devices.view",
  "sweeping.routes.view",
  "*",
];

/** Generate a random permission set (subset of known permissions, may be empty). */
const arbPermissionSet = fc.subarray(KNOWN_PERMISSIONS, { minLength: 0 });

// ---------- Property Tests ----------

describe("Property 15: Sidebar Visibility Gate — Master Consolidated Reports", () => {
  it("the master-reports sub-item is visible iff permissionsLoaded is false, permissions are empty, or principal holds reports.view or '*'", () => {
    /**
     * Validates: Requirements 9.3, 9.4
     *
     * Universal property: for any random permission set P and any
     * `permissionsLoaded` boolean, the filtered nav tree contains the
     * "Master Consolidated Reports" sub-item iff the gate-open condition
     * holds.
     */
    fc.assert(
      fc.property(arbPermissionSet, fc.boolean(), (permissions, permissionsLoaded) => {
        const navData = buildNavData();
        const hasPermission = buildHasPermission(permissions);

        const filtered = filterByPermissions(navData, hasPermission, permissionsLoaded, permissions);

        const gateOpen =
          permissionsLoaded === false ||
          permissions.length === 0 ||
          permissions.includes("reports.view") ||
          permissions.includes("*");

        expect(containsMasterReportsItem(filtered)).toBe(gateOpen);
      }),
      { numRuns: 200 }
    );
  });

  it("when principal holds reports.view (and permissions are non-empty and loaded), the master-reports sub-item is always visible", () => {
    /**
     * Validates: Requirement 9.4
     * "WHILE the requesting principal holds the `reports.view` Base_Permission,
     *  THE Sidebar SHALL render the 'Master Consolidated Reports' navigation
     *  item in an enabled, clickable state."
     */
    fc.assert(
      fc.property(arbPermissionSet, (extraPerms) => {
        const permissions = Array.from(new Set(["reports.view", ...extraPerms]));
        const navData = buildNavData();
        const hasPermission = buildHasPermission(permissions);

        const filtered = filterByPermissions(navData, hasPermission, true, permissions);

        expect(containsMasterReportsItem(filtered)).toBe(true);
      }),
      { numRuns: 150 }
    );
  });

  it("when principal lacks reports.view, lacks '*', has non-empty permissions, and permissions are loaded, the master-reports sub-item is omitted from the rendered tree", () => {
    /**
     * Validates: Requirement 9.3
     * "IF the requesting principal does not hold the `reports.view` Base_Permission,
     *  THEN THE Sidebar SHALL omit the 'Master Consolidated Reports' navigation
     *  item from the rendered DOM such that it is neither visible nor focusable
     *  via keyboard navigation."
     */
    const permsWithoutReports = KNOWN_PERMISSIONS.filter(
      (p) => p !== "reports.view" && p !== "*"
    );
    const arbNonReportsPerms = fc.subarray(permsWithoutReports, { minLength: 1 });

    fc.assert(
      fc.property(arbNonReportsPerms, (permissions) => {
        const navData = buildNavData();
        const hasPermission = buildHasPermission(permissions);

        const filtered = filterByPermissions(navData, hasPermission, true, permissions);

        expect(containsMasterReportsItem(filtered)).toBe(false);
      }),
      { numRuns: 150 }
    );
  });

  it("recursive filtering preserves backwards compatibility: sibling sub-items without a permission field remain visible regardless of permission set", () => {
    /**
     * Sanity check on the recursive filter refactor: the sibling
     * "Daily Master Consolidated Report" has no `permission` field and must
     * continue to show even when the master-reports sub-item is filtered out.
     */
    const permsWithoutReports = KNOWN_PERMISSIONS.filter(
      (p) => p !== "reports.view" && p !== "*"
    );
    const arbNonReportsPerms = fc.subarray(permsWithoutReports, { minLength: 1 });

    fc.assert(
      fc.property(arbNonReportsPerms, (permissions) => {
        const navData = buildNavData();
        const hasPermission = buildHasPermission(permissions);

        const filtered = filterByPermissions(navData, hasPermission, true, permissions);

        // Parent group still present
        expect(filtered.find((n) => n.label === "Master Consolidated Report")).toBeTruthy();

        // Sibling without permission still visible
        const parent = filtered.find((n) => n.label === "Master Consolidated Report");
        const sibling = parent?.children?.find(
          (c) => c.label === "Daily Master Consolidated Report"
        );
        expect(sibling).toBeTruthy();
      }),
      { numRuns: 150 }
    );
  });
});
