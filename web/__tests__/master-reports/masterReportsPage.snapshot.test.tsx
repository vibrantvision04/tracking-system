// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

/**
 * Feature: master-consolidated-reporting
 * Task 22.3 — Snapshot tests for the Master Reports page at a desktop viewport.
 *
 * Validates: Requirements 13.1, 13.2
 *
 * Goal: lock the rendered DOM structure of `<MasterReportsPage>` across its
 * four states (loading, error, empty-catalog, loaded) at a single desktop
 * viewport (1920×1080). The component's only viewport-aware piece is the
 * `<NoticeBar>`, which uses `window.matchMedia` to detect viewports below
 * 1280px; jsdom does not implement matchMedia by default, so we install a
 * stub that always reports `matches: false` (desktop-and-above) so the
 * notice bar stays absent from the loaded snapshot — exactly the behaviour
 * Req 13.2 mandates above the 1280-pixel threshold.
 *
 * The catalog fetch is the page's single side-effect on mount. We mock the
 * `api` helper from `@/lib/api` so each test controls the resolved value
 * (or rejection) independently. The mock also exports `API_URL` and
 * `getStoredAccessToken` because `<ExportButtons>` imports those names —
 * leaving them out would crash the loaded-state render.
 *
 * To keep snapshots stable, we don't snapshot raw HTML. Instead, every
 * test asserts a structural fingerprint of:
 *   - all element IDs starting with `master-reports-` (the spec-mandated
 *     region/state IDs)
 *   - all `<h1>` and `<h2>` text contents (region headings)
 * That fingerprint is what `toMatchInlineSnapshot()` captures.
 */

// ─── api mock — hoisted so the vi.mock factory can reference it ───────────
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  API_URL: "http://localhost:8080",
  getStoredAccessToken: () => null,
}));

import MasterReportsPage, {
  type ReportDefinition,
} from "@/app/master-reports/_components/MasterReportsPage";

// ─── Test helpers ─────────────────────────────────────────────────────────

/**
 * Pin the jsdom viewport to a desktop resolution and install a matchMedia
 * stub that responds `matches: false` to every query. The page only queries
 * `(max-width: 1279px)` (via NoticeBar), so `matches: false` is equivalent
 * to "viewport is ≥ 1280px wide".
 */
function setDesktopViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

/**
 * Build the structural fingerprint we snapshot: page-scoped IDs and h1/h2
 * headings, both in document order. We restrict IDs to the
 * `master-reports-` prefix so unrelated children (e.g. ReportSelector's
 * `mcr-cat-*` h3 groups) don't pollute the snapshot.
 */
function fingerprint(root: HTMLElement): {
  ids: string[];
  headings: string[];
} {
  const ids = Array.from(
    root.querySelectorAll<HTMLElement>("[id^='master-reports-']"),
  ).map((el) => el.id);
  const headings = Array.from(
    root.querySelectorAll<HTMLElement>("h1, h2"),
  ).map(
    (el) => `${el.tagName.toLowerCase()}: ${(el.textContent ?? "").trim()}`,
  );
  return { ids, headings };
}

const SAMPLE_REPORTS: ReportDefinition[] = [
  {
    report_id: "rfid_collection",
    name: "RFID Collection",
    category: "rfid",
    filters: [{ key: "date", required: true }],
    permission_key: "reports.rfid_collection.view",
  },
  {
    report_id: "active_vehicle_summary",
    name: "Active Vehicle Summary",
    category: "active_vehicle",
    filters: [{ key: "date", required: true }],
    permission_key: "reports.active_vehicle_summary.view",
  },
  {
    report_id: "daily_consolidated",
    name: "Daily Master Consolidated",
    category: "consolidated",
    filters: [{ key: "date", required: true }],
    permission_key: "reports.daily_consolidated.view",
  },
];

beforeEach(() => {
  // Desktop viewport (1920×1080): above the 1280px threshold so NoticeBar
  // is absent from the rendered DOM per Req 13.1 / 13.2.
  setDesktopViewport(1920, 1080);
  apiMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("Master Reports page — snapshot at 1920×1080 desktop viewport", () => {
  it("loading state renders only the loading shell", () => {
    /**
     * The catalog fetch is in flight. The page must render the
     * loading shell (`#master-reports-page-shell-loading`) and nothing
     * else from the four region IDs.
     */
    // Promise that never resolves within the synchronous render window.
    apiMock.mockReturnValueOnce(new Promise(() => {}));

    const { container } = render(<MasterReportsPage />);

    // Region-presence assertion (the brief's "key DOM ids" requirement).
    expect(
      container.querySelector("#master-reports-page-shell-loading"),
    ).not.toBeNull();
    // None of the loaded-state regions should exist while loading.
    expect(
      container.querySelector("#master-reports-page-shell-loaded"),
    ).toBeNull();
    expect(
      container.querySelector("#master-reports-page-shell-error"),
    ).toBeNull();
    expect(
      container.querySelector("#master-reports-page-shell-empty"),
    ).toBeNull();

    expect(fingerprint(container)).toMatchInlineSnapshot(`
      {
        "headings": [],
        "ids": [
          "master-reports-page-shell-loading",
        ],
      }
    `);
  });

  it("error state renders the error shell with the 'Could not load reports' heading", async () => {
    /**
     * The catalog fetch throws. The page must render
     * `#master-reports-page-shell-error` containing an h2 with the exact
     * "Could not load reports" copy required by the brief.
     */
    apiMock.mockRejectedValueOnce(new Error("network down"));

    const { container } = render(<MasterReportsPage />);

    await waitFor(() => {
      expect(
        container.querySelector("#master-reports-page-shell-error"),
      ).not.toBeNull();
    });

    // Heading copy assertion (brief: "contains the 'Could not load reports' header").
    const heading = container.querySelector(
      "#master-reports-page-shell-error h2",
    );
    expect(heading?.textContent?.trim()).toBe("Could not load reports");

    expect(fingerprint(container)).toMatchInlineSnapshot(`
      {
        "headings": [
          "h2: Could not load reports",
        ],
        "ids": [
          "master-reports-page-shell-error",
        ],
      }
    `);
  });

  it("empty-catalog state renders the empty shell with the 'No accessible reports' heading", async () => {
    /**
     * The backend returned HTTP 200 with `{reports: [], error: {code:
     * "no_accessible_reports"}}` (Req 1.7). The page must render the
     * `#master-reports-page-shell-empty` shell.
     */
    apiMock.mockResolvedValueOnce({
      reports: [],
      error: { code: "no_accessible_reports" },
    });

    const { container } = render(<MasterReportsPage />);

    await waitFor(() => {
      expect(
        container.querySelector("#master-reports-page-shell-empty"),
      ).not.toBeNull();
    });

    const heading = container.querySelector(
      "#master-reports-page-shell-empty h2",
    );
    expect(heading?.textContent?.trim()).toBe("No accessible reports");

    expect(fingerprint(container)).toMatchInlineSnapshot(`
      {
        "headings": [
          "h2: No accessible reports",
        ],
        "ids": [
          "master-reports-page-shell-empty",
        ],
      }
    `);
  });

  it("loaded state renders the loaded shell with all five region IDs", async () => {
    /**
     * Three sample reports across different categories. The page must
     * render `#master-reports-page-shell-loaded` plus the five region
     * IDs from design §17:
     *   - master-reports-selector
     *   - master-reports-filter-bar
     *   - master-reports-action-region
     *   - master-reports-preview
     *   - master-reports-export
     *
     * The `<NoticeBar>` must be absent above the 1280px threshold
     * (Req 13.2): the structural snapshot below has no
     * `master-reports-notice` entry.
     */
    apiMock.mockResolvedValueOnce({ reports: SAMPLE_REPORTS });

    const { container } = render(<MasterReportsPage />);

    await waitFor(() => {
      expect(
        container.querySelector("#master-reports-page-shell-loaded"),
      ).not.toBeNull();
    });

    // All five region IDs from the brief must be present.
    expect(container.querySelector("#master-reports-selector")).not.toBeNull();
    expect(
      container.querySelector("#master-reports-filter-bar"),
    ).not.toBeNull();
    expect(
      container.querySelector("#master-reports-action-region"),
    ).not.toBeNull();
    expect(container.querySelector("#master-reports-preview")).not.toBeNull();
    expect(container.querySelector("#master-reports-export")).not.toBeNull();

    // NoticeBar is absent above the 1280px threshold.
    expect(container.querySelector("#master-reports-notice")).toBeNull();

    expect(fingerprint(container)).toMatchInlineSnapshot(`
      {
        "headings": [
          "h1: Master Consolidated Reports",
          "h2: Report selector",
          "h2: Filters",
          "h2: Actions",
          "h2: Preview",
          "h2: Export",
        ],
        "ids": [
          "master-reports-page-shell-loaded",
          "master-reports-selector",
          "master-reports-selector-heading",
          "master-reports-selector-content",
          "master-reports-filter-bar",
          "master-reports-filter-bar-heading",
          "master-reports-filter-bar-content",
          "master-reports-action-region",
          "master-reports-action-region-heading",
          "master-reports-action-region-content",
          "master-reports-preview",
          "master-reports-preview-heading",
          "master-reports-preview-content",
          "master-reports-export",
          "master-reports-export-heading",
          "master-reports-export-content",
        ],
      }
    `);
  });
});
