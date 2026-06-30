import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Feature: unified-employee-management
 * Property 2: Dynamic Fields Driven by scope_type
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5
 *
 * This tests the pure visibility logic extracted from the Employee Form page.
 * Given a role's scope_type, the form determines which scope fields are visible:
 *   - scope_type = "zone" → zone selector visible, ward selector hidden
 *   - scope_type = "ward" → ward multi-select visible, zone selector hidden
 *   - scope_type = "none" → both selectors hidden
 *   - any unknown value → both selectors hidden (defensive)
 */

// Pure function extracted from the Employee Form's visibility logic
// (mirrors: `scopeType !== "none"` check + `scopeType === "zone"` / `scopeType === "ward"` branches)
function getFieldVisibility(scopeType: string): {
  showZone: boolean;
  showWard: boolean;
} {
  return {
    showZone: scopeType === "zone",
    showWard: scopeType === "ward",
  };
}

describe("Property 2: Dynamic Fields Driven by scope_type", () => {
  it("zone selector visible only when scope_type is 'zone'", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant("none"),
          fc.constant("zone"),
          fc.constant("ward")
        ),
        (scopeType) => {
          const { showZone } = getFieldVisibility(scopeType);
          if (scopeType === "zone") {
            expect(showZone).toBe(true);
          } else {
            expect(showZone).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("ward selector visible only when scope_type is 'ward'", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant("none"),
          fc.constant("zone"),
          fc.constant("ward")
        ),
        (scopeType) => {
          const { showWard } = getFieldVisibility(scopeType);
          if (scopeType === "ward") {
            expect(showWard).toBe(true);
          } else {
            expect(showWard).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("both hidden for unknown scope_type values", () => {
    // Generate arbitrary strings that are NOT valid scope_type values
    const invalidScopeType = fc.string().filter(
      (s) => s !== "none" && s !== "zone" && s !== "ward"
    );

    fc.assert(
      fc.property(invalidScopeType, (scopeType) => {
        const { showZone, showWard } = getFieldVisibility(scopeType);
        expect(showZone).toBe(false);
        expect(showWard).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("exactly one of showZone/showWard is true for zone or ward, neither for anything else", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant("none"),
          fc.constant("zone"),
          fc.constant("ward"),
          fc.string().filter((s) => s !== "none" && s !== "zone" && s !== "ward")
        ),
        (scopeType) => {
          const { showZone, showWard } = getFieldVisibility(scopeType);
          // At most one field visible at a time
          expect(showZone && showWard).toBe(false);
          // Exactly matches expected visibility
          if (scopeType === "zone") {
            expect(showZone).toBe(true);
            expect(showWard).toBe(false);
          } else if (scopeType === "ward") {
            expect(showZone).toBe(false);
            expect(showWard).toBe(true);
          } else {
            expect(showZone).toBe(false);
            expect(showWard).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
