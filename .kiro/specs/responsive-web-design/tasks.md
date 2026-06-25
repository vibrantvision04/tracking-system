# Implementation Plan: Responsive Web Design

## Overview

Make the SWIFT web application fully responsive across mobile (< 640px), tablet (640px–1024px), and desktop (> 1024px) viewports using Tailwind CSS 4 responsive prefixes. Implementation follows a mobile-first approach, modifying shared components so responsive behavior propagates to all pages. No new JavaScript layout logic is introduced.

The task order starts with foundational/shared components (AppShell, global CSS, MainHeader, Sidebar), then content components (DashboardGrid, Table, FilterBar, CrudDirectory, PageHeader), then page-specific changes (Login, Maps, Charts, Drawers).

## Tasks

- [x] 1. Foundational layout and global styles
  - [x] 1.1 Add global CSS overflow prevention and touch target rules
    - In `web/src/app/globals.css`, add `max-width: 100vw` and `overflow-x: hidden` to `html, body`
    - Add mobile touch target rule: `button, a, [role="button"]` get `min-height: 44px; min-width: 44px` at `max-width: 639px`
    - Add exception classes (`.inline-link`, `[data-compact]`) to unset the minimum sizing where needed
    - _Requirements: 9.4, 11.1, 11.3_

  - [x] 1.2 Update AppShell root container for overflow control and responsive padding
    - In `web/src/components/AppShell.tsx`, add `overflow-hidden max-w-[100vw] overflow-x-hidden` to the root flex container
    - Add `overflow-x-hidden` to the `<main>` content area
    - Update main content padding to `p-4 sm:p-5 lg:p-6` (mobile 16px, tablet 20px, desktop 24px)
    - _Requirements: 1.1, 9.1, 9.2, 11.1, 11.3, 12.2_

  - [x] 1.3 Update MainHeader for mobile content visibility
    - In `web/src/components/MainHeader.tsx`, add a mobile-only compact title `"SWIFT"` visible below `sm:` breakpoint
    - Ensure the full title and subtitle remain hidden on mobile (`hidden sm:flex`)
    - Increase hamburger button touch target to `min-w-[44px] min-h-[44px]`
    - _Requirements: 1.7, 9.4_

  - [x] 1.4 Verify and enhance Sidebar mobile behavior
    - In `web/src/components/Sidebar.tsx`, confirm backdrop tap-to-close calls `setSidebarOpen(false)`
    - Confirm navigation link clicks close the sidebar
    - Add `hidden lg:block` to the flyout mega-menu container so it only renders on desktop
    - Ensure the close button has `min-w-[44px] min-h-[44px]` touch target
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 9.4_

- [x] 2. Checkpoint - Verify foundational components
  - Ensure all files save without errors. Open the app in a browser at 375px and 768px viewports to confirm no horizontal overflow and that the sidebar toggle works correctly. Ask the user if questions arise.

- [x] 3. Content components - DashboardGrid and Table
  - [x] 3.1 Update DashboardGrid for responsive column stacking
    - In `web/src/components/dashboard/DashboardGrid.tsx`, update stat cards grid to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
    - Update data row grids to stack on mobile (`grid-cols-1 md:grid-cols-2`)
    - Update gap values to `gap-4 sm:gap-5 lg:gap-6`
    - Set map column to `min-h-[300px] sm:min-h-[350px]` with explicit height `h-[350px] sm:h-[400px] xl:h-full`
    - Ensure map stacks below data content on mobile/tablet (full-width `w-full`, only side-by-side at `xl:`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.2 Update Table component for mobile compact mode and pagination stacking
    - In `web/src/components/shared/Table.tsx`, add responsive cell padding: `px-2 py-2.5 sm:px-3 sm:py-3.5`
    - Add responsive font size: `text-[11px] sm:text-xs` for body cells, `text-[9px] sm:text-[10px]` for headers
    - Confirm `overflow-x-auto` is present on the table container
    - Confirm scroll-hint gradient is at least 24px wide (existing `w-8` = 32px satisfies this)
    - Confirm `whitespace-nowrap` on header cells
    - Confirm pagination uses `flex-col sm:flex-row` for stacking on mobile
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.3 Update FilterBar for grid-based responsive layout
    - In `web/src/components/shared/FilterBar.tsx`, change root layout to `grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap`
    - Set action buttons container to `flex flex-col sm:flex-row` with `col-span-1 sm:col-span-2 lg:ml-auto lg:w-auto`
    - Ensure all filter controls have `min-h-[44px]` for touch targets
    - Ensure no control overflows the viewport boundary
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 3.4 Update CrudDirectory for responsive form fields and buttons
    - In `web/src/components/shared/CrudDirectory.tsx`, update root padding to `p-4 sm:p-5 lg:p-8`
    - Update form fields wrapper to use `grid grid-cols-1 sm:grid-cols-2 gap-4`
    - Add `sm:col-span-2` documentation/convention for wide fields (address, textarea)
    - Update submit/cancel buttons to `w-full sm:w-auto min-h-[44px]` with `flex-col sm:flex-row` container
    - Update search input to `w-full sm:w-72`
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

  - [x] 3.5 Update PageHeader for responsive title and action layout
    - In `web/src/components/shared/PageHeader.tsx`, update title to `text-xl sm:text-2xl lg:text-3xl`
    - Update actions container to `self-stretch sm:self-start md:self-center`
    - Ensure action buttons use `w-full sm:w-auto` for full-width on mobile
    - _Requirements: 5.3, 9.3_

- [x] 4. Checkpoint - Verify content components
  - Ensure all files save without errors. Test the dashboard, a CRUD page, a report page with filters, and a table at 375px, 768px, and 1280px viewports. Confirm column stacking, gap reduction, and pagination layout. Ask the user if questions arise.

- [x] 5. Page-specific changes - Login, Maps, Charts, Drawers
  - [x] 5.1 Update Login page for mobile responsiveness
    - In `web/src/app/login/page.tsx`, ensure form card uses `w-full max-w-md` with `mx-4 sm:mx-0` spacing
    - Set input text to `text-[16px] sm:text-sm` to prevent iOS auto-zoom on focus
    - Set label font size to `text-[13px] sm:text-xs`
    - Confirm input height is at least 44px (`h-11` = 44px)
    - Confirm vertical and horizontal centering at all viewports
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 5.2 Add global CSS rules for map views
    - In `web/src/app/globals.css`, add `.leaflet-container { touch-action: none; }` to prevent page scroll during map interaction
    - Add media query (`max-width: 639px`) for `.leaflet-control-zoom a` with `width: 44px`, `height: 44px`, `line-height: 44px`, `font-size: 20px`
    - Add media query for `.leaflet-popup-content-wrapper` with `max-width: 90vw`
    - Add media query for `.leaflet-popup-content` with `max-width: calc(90vw - 40px)`
    - _Requirements: 6.2, 6.3, 6.5_

  - [x] 5.3 Update map container components for responsive sizing
    - In map parent containers (DashboardGrid map slot, monitoring page layouts), ensure `min-h-[300px]` on mobile and full viewport width minus 16px padding per side
    - For pages with a sidebar panel alongside the map, add responsive stacking: `flex-col lg:flex-row` with map `min-h-[250px]` when panel is present
    - _Requirements: 6.1, 6.4_

  - [x] 5.4 Update chart components for mobile responsiveness
    - In dashboard chart components, set `trigger="click"` on Recharts `<Tooltip>` for tap interaction on mobile
    - Set `interval="preserveStartEnd"` on `<XAxis>` to auto-thin axis labels
    - Set minimum axis label font size to 10px
    - Ensure chart containers have `min-h-[200px]` and `w-full`
    - Ensure coverage donut charts render at max 90% container width and min 120px diameter
    - Ensure legend uses `wrapperStyle={{ fontSize: '12px' }}` minimum with text wrapping enabled
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 5.5 Update Drawer Panels for responsive width
    - In all drawer panel components (Zone Coverage, Garbage Tonnage, Open Depot drawers), set drawer width to `w-full sm:w-[80%] sm:max-w-[80vw] lg:max-w-md` (or `lg:max-w-lg` for larger drawers)
    - Add scrollable content area with `flex-1 overflow-y-auto`
    - Reduce internal grids from 3+ columns to `grid-cols-2 sm:grid-cols-3` on mobile
    - Ensure close button has `min-w-[44px] min-h-[44px]` touch target in a sticky/fixed header
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 6. Final checkpoint - Full responsive verification
  - Ensure all files save without errors. Test all page types (dashboard, CRUD, reports, monitoring, login) at 375px, 640px, 768px, 1024px, and 1280px viewports. Confirm no horizontal scrollbar at any width from 320px to 2560px. Verify desktop layout at 1280px is visually unchanged. Ask the user if questions arise.

## Notes

- All changes use Tailwind CSS responsive prefixes only — no new JavaScript layout logic
- The mobile-first approach means base (unprefixed) classes target mobile, with `sm:`, `md:`, `lg:`, `xl:` adding tablet and desktop overrides
- Existing desktop classes must NOT be removed or modified — only new mobile/tablet classes are added
- The Sidebar already implements slide-in drawer with backdrop; minimal changes needed
- Property-based testing is not applicable (CSS-only feature with no pure functions or algorithms)
- Visual regression testing at 1280px desktop viewport is recommended to confirm Requirement 12 compliance
- Touch target minimum of 44×44px applies to all interactive elements on mobile

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.4", "5.5"] },
    { "id": 4, "tasks": ["5.3"] }
  ]
}
```
