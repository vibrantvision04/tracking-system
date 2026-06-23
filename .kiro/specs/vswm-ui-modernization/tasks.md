# Implementation Plan: VSWM UI Modernization

## Overview

This plan migrates the VSWM Jaipur frontend from its current mixed-style state to a consistent, token-driven dark enterprise UI. The work is split into five logical phases:

1. **Foundation** — Design system token files + Tailwind theme sync
2. **Primitive UI components** — Button, AppCard, Input/TextArea, AppSelect, AppDatePicker, FormField
3. **Layout & structural components** — FilterBar, DataTable, Sidebar, TopNavbar, PageHeader, CrudDirectory
4. **Screen migrations** — Dashboard, Playback, Reports, Vehicle Management, VSWM CRUD pages
5. **Audit & documentation** — UI audit report and final summary

No routes, API calls, business logic, form handlers, or feature behavior shall change at any point.

---

## Tasks

- [x] 1. Set up design system token files
  - [x] 1.1 Create `src/design-system/colors.ts`
    - Export `colors` object with `as const` containing the five token groups: `background` (base, surface, card, elevated), `brand` (primary, primaryHover, primaryLight), `semantic` (success, warning, error, info), `text` (default, dim, inverted), `border` (default, subtle)
    - Use exact hex values from Requirement 3
    - Export `Colors` type alias
    - _Requirements: 1.1, 3.1–3.11_

  - [x] 1.2 Create `src/design-system/spacing.ts`
    - Compute spacing scale with 4 px base unit, numeric keys 0–16, `rem` string values
    - Use the `Object.fromEntries` + `Array.from` pattern from the design document
    - _Requirements: 1.2_

  - [~] 1.3 Write property test for spacing scale
    - **Property 1: Spacing scale follows the 4 px base unit formula**
    - Create `src/design-system/__tests__/spacing.test.ts` using `fast-check` + `vitest`
    - Assert `spacing[k] === k * 0.25 + "rem"` for every integer k in [0, 16]
    - **Validates: Requirements 1.2**

  - [x] 1.4 Create `src/design-system/typography.ts`
    - Export `typography` object with `as const` for tokens: `pageTitle` (32 px / 2rem, 800), `sectionTitle` (24 px / 1.5rem, 700), `cardTitle` (18 px / 1.125rem, 600), `body` (14 px / 0.875rem, 400), `label` (12 px / 0.75rem, 500)
    - Each token includes `fontSize`, `lineHeight`, `fontWeight`
    - _Requirements: 1.3, 4.2–4.6_

  - [x] 1.5 Create `src/design-system/shadows.ts` and `src/design-system/radius.ts`
    - `shadows.ts`: export `shadows` with `as const` for `none`, `sm`, `md`, `lg`
    - `radius.ts`: export `radius` with `as const` for `sm` (6px), `md` (8px), `lg` (12px), `xl` (16px), `full` (9999px)
    - _Requirements: 1.4, 1.5_

  - [x] 1.6 Create `src/design-system/tokens.ts` barrel export
    - Re-export `colors`, `spacing`, `typography`, `shadows`, `radius` as named exports
    - Re-export `Colors` type
    - _Requirements: 1.6, 1.7_

- [x] 2. Synchronize Tailwind theme with design tokens
  - [x] 2.1 Update `globals.css` `@theme` block and `:root`
    - Add granular `--color-theme-{group}-{name}` CSS custom properties for all color tokens
    - Add backward-compat aliases: `--color-theme-base`, `--color-theme-surface`, `--color-theme-card`, `--color-theme-elevated`, `--color-theme-accent`, `--color-theme-accent-hover`, `--color-theme-text`, `--color-theme-text-dim`, `--color-theme-border`
    - Ensure existing `bg-theme-surface`, `bg-theme-base`, `bg-theme-card`, `text-theme-dim` classes continue to work without modification
    - Add `animate-fade-in` and update `animate-slide-in` keyframes per animation strategy
    - _Requirements: 2.1–2.4, 20.1–20.5_

- [x] 3. Checkpoint — Design system foundation
  - Ensure all token files exist, TypeScript compiles with `tsc --noEmit` (zero errors from new files), and all backward-compat aliases are working. Ask the user if questions arise.

- [x] 4. Implement primitive UI components
  - [x] 4.1 Update `src/components/ui/Button.tsx`
    - Extend with `success` and `ghost` variants; update `primary` variant to `bg-theme-accent` (#DC2626)
    - Implement all six variants with correct background, text, and hover classes from the design document
    - Enforce `min-h-[36px] px-4 rounded-[8px]` (radius.md)
    - Implement `disabled` prop: `opacity-50 cursor-not-allowed`
    - Implement `loading` prop: spinner + `loadingText` + `pointer-events-none`
    - Hover transition: `transition-colors duration-150`
    - _Requirements: 5.1–5.9_

  - [~] 4.2 Write property tests for Button component
    - Create `src/components/ui/__tests__/Button.test.tsx`
    - **Property 2: Button renders without throwing for any variant string** — use `fc.string()` to generate arbitrary variant values
    - **Property 3: Button applies variant-specific classes for all valid variants** — use `fc.constantFrom` over the six valid variant names
    - **Validates: Requirements 5.1, 5.2, 19.8**

  - [x] 4.3 Update `src/components/ui/Card.tsx` (AppCard)
    - Set background to `bg-theme-card` (#1E293B), radius to `rounded-[16px]` (radius.xl), default shadow to `shadow-sm`
    - Implement `hoverable` prop: `hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`
    - Update sub-component padding: `CardHeader` `p-4`/`p-5` with `border-b border-theme-border`; `CardContent` `p-4`/`p-5`; `CardFooter` `p-4` with `border-t border-theme-border bg-theme-elevated`
    - _Requirements: 6.1–6.6_

  - [~] 4.4 Write property test for AppCard hoverable prop
    - Create `src/components/ui/__tests__/Card.test.tsx`
    - **Property 7: AppCard hoverable prop controls elevation classes** — use `fc.boolean()` and assert presence/absence of hover shadow and translate classes
    - **Validates: Requirements 6.3**

  - [x] 4.5 Update `src/components/ui/Input.tsx` and create `src/components/ui/TextArea.tsx`
    - `Input`: keep `bg-theme-background-base` fill; update radius to `rounded-[12px]` (radius.lg); padding `px-3 py-2`; focus ring `focus:ring-2 focus:ring-[#DC2626]/30`; error state `border-[#EF4444] focus:ring-[#EF4444]/20` + `text-xs text-[#EF4444]` error text below field
    - `FormField` label inside Input: `text-xs font-semibold uppercase tracking-wider text-theme-text-dim block mb-1.5`
    - `TextArea.tsx`: identical visual spec to Input; `min-h-[80px] resize-y`
    - Remove all hardcoded hex values; use only CSS variable tokens
    - _Requirements: 11.1–11.6_

  - [~] 4.6 Write property test for Input error propagation
    - Create `src/components/ui/__tests__/Input.test.tsx`
    - **Property 4: Input error prop propagates to rendered output** — use `fc.string({ minLength: 1 })`, assert error text node present and red border class on input element
    - **Validates: Requirements 11.5**

  - [x] 4.7 Update `src/components/ui/Select.tsx` (AppSelect)
    - Set background to `bg-white text-gray-900`; border `border border-gray-300`; focus ring `focus:ring-2 focus:ring-[#DC2626]/30`; height `h-9` (36 px)
    - Replace inline SVG chevron with `ChevronDown` from `lucide-react`
    - Error state: `border-[#EF4444]` + `text-xs text-[#EF4444]` error message below
    - Option elements: `bg-white text-gray-900`
    - Remove the dark `bg-theme-base` override on the select element itself
    - _Requirements: 9.1–9.6_

  - [~] 4.8 Write property test for AppSelect error propagation
    - Create `src/components/ui/__tests__/Select.test.tsx`
    - **Property 5: Select error prop propagates to rendered output** — use `fc.string({ minLength: 1 })`, assert error text node present and red border class on select element
    - **Validates: Requirements 9.6**

  - [x] 4.9 Create `src/components/ui/DatePicker.tsx` (AppDatePicker)
    - Thin wrapper around `<input type="date">` / `<input type="datetime-local">` / `<input type="time">`
    - Style: `bg-white text-gray-900 border border-gray-300 rounded-[8px] h-9` (radius.md, 36 px height)
    - Focus: `focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 transition-all duration-150`
    - Accept `label`, `error`, and all standard HTML input props via `DatePickerProps` interface
    - Label: `text-xs font-semibold uppercase tracking-wider text-theme-text-dim`
    - Error: `border-[#EF4444]` + `text-xs text-[#EF4444]` below
    - _Requirements: 10.1–10.5_

- [x] 5. Checkpoint — Primitive components complete
  - Ensure Button, AppCard, Input, TextArea, AppSelect, AppDatePicker compile cleanly and property tests pass. Ask the user if questions arise.

- [x] 6. Implement layout and structural components
  - [x] 6.1 Create `src/components/shared/FilterBar.tsx`
    - Implement `FilterBarProps`: `children`, `actions?`, `className?`
    - Layout: `flex flex-wrap gap-3 items-center p-3 bg-theme-surface border border-theme-border rounded-[12px]`
    - `actions` slot: `ml-auto flex items-center gap-2`
    - All direct child controls constrained to `h-9` (36 px) via CSS child selector or convention
    - _Requirements: 8.1–8.5_

  - [x] 6.2 Update `src/components/shared/Table.tsx` (DataTable)
    - Sticky header: add `sticky top-0 z-10 bg-theme-card` to `<thead>` rows
    - Zebra striping: `[&>tbody>tr:nth-child(odd)]:bg-theme-card [&>tbody>tr:nth-child(even)]:bg-theme-surface` on the table wrapper
    - Row hover: `hover:bg-theme-elevated transition-colors duration-150` on `<tr>` elements
    - Header cells: `text-xs font-semibold uppercase tracking-wider text-theme-text-dim`
    - Empty state: centered layout with Lucide `Inbox` icon, `text-sm font-semibold` primary message, `text-xs text-theme-text-dim` hint
    - Loading state: `animate-spin` circle + "Loading records..." (replaces emoji spinner)
    - Data cells: `text-sm`
    - Pagination active page: `bg-theme-accent text-white` (update to use new token class)
    - Horizontal scroll wrapper: `overflow-x-auto` on scroll container
    - Extract pure `paginationSummary(n, itemsPerPage, currentPage)` helper function from Table.tsx for testability
    - _Requirements: 7.1–7.10_

  - [~] 6.3 Write property test for DataTable pagination summary
    - Create `src/components/shared/__tests__/Table.test.tsx`
    - **Property 6: DataTable pagination entry count is correct for any dataset size** — use `fc.integer` for `n` and `itemsPerPage`, derive valid `currentPage`, assert "Showing X to Y of n entries" output
    - **Validates: Requirements 7.8**

  - [x] 6.4 Update `src/components/Sidebar.tsx`
    - Active item: replace gradient fill with `border-l-[3px] border-[#DC2626] bg-theme-elevated`
    - Item hover: `hover:bg-theme-elevated transition-colors duration-150` for all items
    - Replace text glyphs (`▶ / ◀ / ✕`) with Lucide icons: `ChevronRight`, `ChevronLeft`, `X`
    - Collapse/expand arrow: `ChevronLeft` / `ChevronRight`; category expand: `ChevronRight` with `rotate-90` when open
    - Footer: ensure avatar uses `w-9 h-9 rounded-full`; update text to `text-xs font-semibold` for name, `text-[10px] text-theme-text-dim` for role
    - Sidebar transition: confirm `transition-all duration-300` with `cubic-bezier(0.16, 1, 0.3, 1)` on `width`
    - Flyout mega-menu background: confirm `bg-theme-surface/95 backdrop-blur-[16px]`
    - Preserve all existing flyout, collapse, and mobile overlay behavior; change only visual styling
    - _Requirements: 12.1–12.5, 13.1–13.9_

  - [x] 6.5 Update `src/components/MainHeader.tsx` (TopNavbar)
    - Online status text: `text-[#16A34A]` (semantic.success) instead of `text-theme-accent`
    - User avatar: ensure `w-9 h-9 rounded-full`
    - Confirm: `h-16 sticky top-0 z-[9999] bg-theme-surface border-b border-theme-border shadow-sm` (update tokens if any are hardcoded)
    - _Requirements: 14.1–14.6_

  - [x] 6.6 Update `src/components/shared/PageHeader.tsx`
    - `<h1>`: change to `text-3xl font-extrabold`
    - Description: change to `text-sm text-theme-text-dim`
    - Breadcrumbs: confirm `text-xs font-semibold uppercase tracking-wider`
    - _Requirements: 4.2, 15.2_

  - [x] 6.7 Update `src/components/shared/CrudDirectory.tsx`
    - Form submit button: change variant from `accent` to `success`
    - Cancel/close button: confirm `outline` variant
    - Add/open button in header: confirm `primary` variant
    - Form panel open animation: confirm `animate-fade-in` at 200 ms
    - Confirm form panel uses `AppCard`, list panel uses `AppCard`, search uses `Input`, table uses `DataTable`
    - _Requirements: 19.1–19.8_

- [x] 7. Checkpoint — Layout and structural components complete
  - Run `tsc --noEmit` and confirm zero new TypeScript errors. Verify sidebar, navbar, CrudDirectory compile cleanly. Ask the user if questions arise.

- [x] 8. Migrate screen-level components
  - [x] 8.1 Migrate `src/components/dashboard/StatCard.tsx`
    - Replace `bg-white` → `bg-theme-card`
    - Replace `border-slate-200` → `border-theme-border`
    - Replace `text-slate-900` → `text-theme-text` (or the CSS variable equivalent)
    - Replace `text-slate-500` → `text-theme-text-dim`
    - Map `accentColor` prop: `emerald` → `text-[#16A34A]`, `amber` → `text-[#F59E0B]`, `blue` → `text-[#06B6D4]`, `slate` → `text-theme-text-dim`
    - KPI value: confirm `text-4xl font-extrabold` is retained
    - _Requirements: 15.1–15.3, 15.5_

  - [x] 8.2 Migrate `src/app/page.tsx` (Dashboard Screen) and `DashboardGrid`
    - `DashboardGrid`: replace `bg-slate-50/50` → `bg-theme-base`; `border-slate-200` → `border-theme-border`
    - `page.tsx`: ensure all widget containers use `AppCard`; confirm 3-column KPI row layout is preserved
    - Use `semantic` colors for KPI accent icons per Requirement 15.3
    - Verify layout at 1366×768 by checking that no fixed pixel widths exceed available viewport
    - _Requirements: 15.1–15.6_

  - [x] 8.3 Migrate `src/app/playback/page.tsx` (Playback Screen)
    - Wrap all filter controls (date, vehicle, route) inside `FilterBar`
    - Replace native `<select>` with `AppSelect`; replace `<input type="date">` with `AppDatePicker`
    - Group playback controls (Play, Pause, Replay, Speed, AI Correction) in a styled toolbar `<div>` below the FilterBar
    - Active/pressed playback buttons: use `primary` Button variant for `bg-theme-accent text-white`
    - Do not modify playback state logic, map rendering, or API calls
    - _Requirements: 16.1–16.5, 22.1–22.5_

  - [x] 8.4 Migrate `src/app/reports/page.tsx` (Reports Screen)
    - Wrap all filter inputs and selects in `FilterBar`; place Load / Recalculate buttons in the `actions` slot
    - Replace native selects and date inputs with `AppSelect` / `AppDatePicker`
    - Ensure data table uses `DataTable` component (migrate from custom table if needed)
    - Apply typography scale to column headers and cell data per Requirement 17.5
    - Do not modify filter state, data fetching, or column definitions
    - _Requirements: 17.1–17.5, 22.1–22.5_

  - [x] 8.5 Migrate `src/app/vehicles/page.tsx` (Vehicle Management Screen)
    - Ensure vehicle list uses `DataTable`
    - Wrap list container in `AppCard`
    - Add or update `PageHeader` with title, breadcrumbs, and add-vehicle action button
    - Migrate add/edit form to use `FormField` + `AppSelect` + `Input`
    - Do not modify data fetching or form submission logic
    - _Requirements: 18.1–18.4, 22.1–22.5_

  - [x] 8.6 Verify VSWM CRUD pages (`src/app/vswm/*/page.tsx`)
    - Confirm all pages use `CrudDirectory` shell; no per-page layout changes needed
    - Verify that the updated `CrudDirectory` (Task 6.7) correctly propagates the new Button variants and AppCard styling to all VSWM CRUD pages
    - If any VSWM CRUD page overrides Button variants or card styling locally, remove those overrides and defer to `CrudDirectory`
    - _Requirements: 19.1–19.8_

- [~] 9. Checkpoint — Screen migrations complete
  - Run `tsc --noEmit` and `vitest --run` and confirm all tests pass. Ask the user if questions arise.

- [~] 10. Icon standardization sweep
  - [~] 10.1 Audit and remove duplicate inline SVGs
    - Search all component files for inline `<svg>` elements that duplicate a Lucide icon
    - Replace each with the corresponding `lucide-react` import (e.g., `import { Truck } from 'lucide-react'`)
    - Do not change any icon that has no Lucide equivalent — leave in place
    - _Requirements: 12.1–12.5_

- [~] 11. UI Audit and documentation
  - [~] 11.1 Write `src/design-system/UI_AUDIT_REPORT.md`
    - Enumerate all components and files that had hardcoded hex colors (before migration)
    - List all components that used non-standard spacing
    - List all pages that mixed multiple card or table styles
    - List all icon usages that were outside Lucide React
    - _Requirements: 23.1_

  - [~] 11.2 Write `src/design-system/MIGRATION_SUMMARY.md`
    - List every file modified, every component created or refactored, and every screen affected
    - Note design decisions made (e.g., white background for selects, left-border active indicator, success variant for CRUD submit)
    - _Requirements: 23.2_

- [-] 12. Final checkpoint — Full build verification
  - Run `tsc --noEmit` and confirm zero TypeScript errors introduced by the redesign
  - Run `vitest --run` and confirm all property tests and unit tests pass
  - Ensure all test files created in tasks 1.3, 4.2, 4.4, 4.6, 4.8, 6.3 are passing
  - Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. All 7 correctness properties have dedicated optional property-test sub-tasks.
- Each task references specific requirements for traceability.
- The `paginationSummary` helper (Task 6.2) must be exported from `Table.tsx` to make Property 6 testable without DOM rendering.
- Token `as const` assertions (Tasks 1.1–1.5) enforce compile-time safety per Requirements 1.7 and 1.8 — no additional runtime guards needed.
- Screen migrations (Tasks 8.1–8.6) must never touch API calls, route paths, form handlers, filter state, or column definitions per Requirement 22.
- The backward-compat aliases in `globals.css` (Task 2.1) allow Tasks 4–8 to proceed independently without a big-bang cutover.
- Property test files go in `src/design-system/__tests__/` (token tests) and `src/components/**/__tests__/` (component tests).
- Run tests with `npx vitest --run` (single-execution mode, not watch mode).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.3", "1.6"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["4.1", "4.3", "4.5", "4.7", "4.9"] },
    { "id": 4, "tasks": ["4.2", "4.4", "4.6", "4.8", "6.1", "6.2", "6.4", "6.5", "6.6"] },
    { "id": 5, "tasks": ["6.3", "6.7", "10.1"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "8.4", "8.5"] },
    { "id": 8, "tasks": ["8.6", "11.1"] },
    { "id": 9, "tasks": ["11.2"] }
  ]
}
```
