// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import { render, cleanup } from "@testing-library/react";
import FilterBar from "@/app/master-reports/_components/FilterBar";
import type {
  FilterControlDef,
  ReportDefinition,
} from "@/app/master-reports/_components/MasterReportsPage";

/**
 * Feature: master-consolidated-reporting
 * Property 3: FilterSchema Visibility Invariant (frontend)
 *
 * **Validates: Requirements 2.3, 2.7**
 *
 * For any ReportDefinition D and any prior session state S, after the user
 * selects D the Shared_Filter_Bar renders exactly the set of FilterControl
 * keys declared in D.filters — no superset, no subset — and any value bound
 * to a key not in D.filters is discarded.
 *
 * Tested at two levels:
 *   1. Pure pruning logic (the function `pruneValues` mirrors the useEffect
 *      body in FilterBar.tsx) — fast assertion over many cases.
 *   2. Component render (React Testing Library) — confirms the same logic
 *      holds when the real <FilterBar> mounts and emits onChange.
 */

// ---------- Pure logic mirroring FilterBar's pruning effect ----------
function pruneValues(
  values: Record<string, unknown>,
  report: ReportDefinition | null
): Record<string, unknown> {
  if (!report) return {};
  const allowed = new Set(report.filters.map((fc) => fc.key));
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(values)) {
    if (allowed.has(k)) out[k] = values[k];
  }
  return out;
}

// ---------- Generators ----------

// Closed FilterControl key catalog per design §3.1
const FILTER_KEYS = [
  "date",
  "date_range",
  "zone",
  "ward",
  "shift",
  "route",
  "route_type",
  "department",
  "designation",
  "employee",
  "vehicle",
] as const;

const arbFilterKey = fc.constantFrom(...FILTER_KEYS);

// Build a ReportDefinition with a UNIQUE subset of filter keys. A real
// catalog never declares the same FilterKey twice; the rendered DOM would
// also collapse duplicates on a single `data-filter-key` selector.
const arbReportDefinition: fc.Arbitrary<ReportDefinition> = fc
  .subarray([...FILTER_KEYS], { minLength: 0, maxLength: FILTER_KEYS.length })
  .chain((keys) =>
    fc
      .record({
        report_id: fc.string({ minLength: 1, maxLength: 20 }),
        name: fc.string({ minLength: 1, maxLength: 40 }),
        category: fc.string({ minLength: 1, maxLength: 20 }),
        permission_key: fc.string({ minLength: 1, maxLength: 20 }),
        requireds: fc.array(fc.boolean(), {
          minLength: keys.length,
          maxLength: keys.length,
        }),
      })
      .map(
        (rec): ReportDefinition => ({
          report_id: rec.report_id,
          name: rec.name,
          category: rec.category,
          permission_key: rec.permission_key,
          filters: keys.map(
            (k, i): FilterControlDef => ({
              key: k,
              required: rec.requireds[i] ?? false,
            })
          ),
        })
      )
  );

// Prior session state: a mix of valid filter keys and arbitrary noise keys,
// each bound to a value of arbitrary shape. This guarantees the property
// must hold for "extra" keys that are not declared in any FilterSchema.
const arbPriorValues: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.oneof(arbFilterKey, fc.string({ minLength: 1, maxLength: 8 })),
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.constant(null),
    fc.array(fc.string(), { maxLength: 2 })
  ),
  { maxKeys: 10 }
);

// ---------- Pure-logic property tests ----------

describe("Property 3: FilterSchema Visibility Invariant — pure pruning", () => {
  it("pruned values contain exactly the intersection of value keys and declared filter keys", () => {
    /**
     * **Validates: Requirements 2.3, 2.7**
     * For any (D, V), every key in prune(V, D) is in D.filters, and every key
     * in (Object.keys(V) ∩ D.filters) is in prune(V, D).
     */
    fc.assert(
      fc.property(arbReportDefinition, arbPriorValues, (report, values) => {
        const pruned = pruneValues(values, report);
        const allowed = new Set(report.filters.map((f) => f.key));
        const prunedKeys = new Set(Object.keys(pruned));
        // Subset: every key in pruned must be allowed
        for (const k of prunedKeys) {
          expect(allowed.has(k)).toBe(true);
        }
        // Completeness: every allowed key present in V must survive pruning
        for (const k of Object.keys(values)) {
          if (allowed.has(k)) {
            expect(prunedKeys.has(k)).toBe(true);
            expect(pruned[k]).toEqual(values[k]);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it("values bound to keys not in D.filters are discarded", () => {
    /**
     * **Validates: Requirement 2.7**
     * For any (D, V), no key in V that is absent from D.filters appears as
     * an own property of the pruned result. (We test own properties only —
     * the `in` operator would walk Object.prototype and report inherited
     * names like "valueOf" as present even when no binding exists.)
     */
    fc.assert(
      fc.property(arbReportDefinition, arbPriorValues, (report, values) => {
        const pruned = pruneValues(values, report);
        const allowed = new Set(report.filters.map((f) => f.key));
        for (const k of Object.keys(values)) {
          if (!allowed.has(k)) {
            expect(Object.prototype.hasOwnProperty.call(pruned, k)).toBe(false);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it("when every prior key is in D.filters, pruning is the identity", () => {
    /**
     * **Validates: Requirement 2.3**
     * For any D, when V's keys are a subset of D.filters keys, prune(V, D) = V.
     */
    fc.assert(
      fc.property(arbReportDefinition, (report) => {
        if (report.filters.length === 0) return;
        const values: Record<string, unknown> = {};
        for (const f of report.filters) values[f.key] = `value-for-${f.key}`;
        const pruned = pruneValues(values, report);
        expect(pruned).toEqual(values);
      }),
      { numRuns: 100 }
    );
  });

  it("when no report is selected, all values are discarded", () => {
    /**
     * **Validates: Requirement 2.7**
     * prune(V, null) = {} for any V. (When the user clears the selection,
     * the filter bar must drop every bound value.)
     */
    fc.assert(
      fc.property(arbPriorValues, (values) => {
        const pruned = pruneValues(values, null);
        expect(pruned).toEqual({});
      }),
      { numRuns: 100 }
    );
  });
});

// ---------- Component-render property tests ----------

afterEach(() => cleanup());

describe("Property 3: FilterSchema Visibility Invariant — <FilterBar> render", () => {
  it("rendered data-filter-key set equals D.filters keys exactly (no superset, no subset)", () => {
    /**
     * **Validates: Requirement 2.3**
     * For any D, mounting <FilterBar report=D values={} /> produces exactly
     * one element with data-filter-key=k for each k in D.filters, and no
     * other data-filter-key elements.
     */
    fc.assert(
      fc.property(arbReportDefinition, (report) => {
        const onChange = vi.fn();
        const { container, unmount } = render(
          <FilterBar report={report} values={{}} onChange={onChange} />
        );
        const rendered = Array.from(
          container.querySelectorAll<HTMLElement>("[data-filter-key]")
        )
          .map((el) => el.getAttribute("data-filter-key"))
          .filter((v): v is string => v !== null);
        const declared = report.filters.map((f) => f.key);
        expect(rendered.slice().sort()).toEqual(declared.slice().sort());
        unmount();
      }),
      { numRuns: 30 }
    );
  });

  it("stale values are discarded via onChange when prior state contains non-schema keys", () => {
    /**
     * **Validates: Requirement 2.7**
     * When V contains at least one key not in D.filters, mounting <FilterBar>
     * triggers an onChange whose latest argument contains only keys declared
     * in D.filters.
     */
    fc.assert(
      fc.property(arbReportDefinition, arbPriorValues, (report, values) => {
        const allowed = new Set(report.filters.map((f) => f.key));
        const hasStale = Object.keys(values).some((k) => !allowed.has(k));
        if (!hasStale) return; // precondition not met → property vacuously holds
        const onChange = vi.fn();
        const { unmount } = render(
          <FilterBar report={report} values={values} onChange={onChange} />
        );
        // The pruning useEffect runs synchronously after the first commit;
        // we expect at least one onChange call whose latest payload is clean.
        expect(onChange).toHaveBeenCalled();
        const lastArg = onChange.mock.calls[onChange.mock.calls.length - 1][0] as Record<
          string,
          unknown
        >;
        for (const k of Object.keys(lastArg)) {
          expect(allowed.has(k)).toBe(true);
        }
        for (const k of Object.keys(values)) {
          if (!allowed.has(k)) {
            expect(Object.prototype.hasOwnProperty.call(lastArg, k)).toBe(false);
          }
        }
        unmount();
      }),
      { numRuns: 30 }
    );
  });

  it("when report is null, all prior values are cleared via onChange({})", () => {
    /**
     * **Validates: Requirement 2.7**
     * Mounting <FilterBar report={null} values={V}/> with V non-empty fires
     * onChange({}) so no stale bindings survive a cleared selection.
     */
    fc.assert(
      fc.property(arbPriorValues, (values) => {
        if (Object.keys(values).length === 0) return;
        const onChange = vi.fn();
        const { unmount } = render(
          <FilterBar report={null} values={values} onChange={onChange} />
        );
        expect(onChange).toHaveBeenCalled();
        const lastArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
        expect(lastArg).toEqual({});
        unmount();
      }),
      { numRuns: 30 }
    );
  });
});
