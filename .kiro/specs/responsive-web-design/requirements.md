# Requirements Document

## Introduction

This document defines the requirements for making the SWIFT (Smart Waste Integrated Fleet Tracking) web application fully responsive across all screen sizes — mobile phones (< 640px), tablets (640px–1024px), and desktops (> 1024px). The existing visual design, color scheme, and component aesthetics remain unchanged; only layout adaptation and sizing adjustments are applied to ensure usability on smaller screens.

The application is built with Next.js, React, and Tailwind CSS 4. It contains a dashboard with maps and charts, CRUD management pages, report pages with data tables and filters, monitoring pages with live maps, and authentication pages. The responsive adaptation must cover all of these page types and their shared components.

## Glossary

- **Application_Shell**: The top-level layout wrapper (`AppShell.tsx`) containing the Sidebar navigation and MainHeader, which frames all authenticated pages.
- **Sidebar**: The navigation drawer component providing access to all application sections via a hierarchical menu with flyout sub-menus.
- **MainHeader**: The top sticky header bar displaying the application logo, title, user info, and hamburger menu toggle.
- **Dashboard_Grid**: The main dashboard layout component (`DashboardGrid.tsx`) that arranges stat cards, charts, and the live map in a two-column layout.
- **Data_Table**: The shared `Table` component used across CRUD and report pages to display tabular data with pagination.
- **Filter_Bar**: The shared `FilterBar` component used on report pages to present filter controls (dropdowns, date pickers, search inputs).
- **CRUD_Directory**: The shared `CrudDirectory` component providing a standardized layout for entity management pages (form + table).
- **Map_View**: Any Leaflet-based map component (LiveMap, D2D Map, DepotMap, etc.) used for geographic visualization.
- **Drawer_Panel**: The slide-in panel overlay (e.g., Zone Coverage Drawer, Garbage Tonnage Drawer) used to display detailed breakdowns.
- **Report_Page**: Any page under `/reports` or `/vswm/*-report` that displays filtered tabular data with export functionality.
- **Login_Page**: The authentication page at `/login`.
- **Breakpoint_Mobile**: Screen width below 640px (Tailwind `sm` threshold).
- **Breakpoint_Tablet**: Screen width between 640px and 1024px (Tailwind `sm` to `lg` range).
- **Breakpoint_Desktop**: Screen width above 1024px (Tailwind `lg` and above).

## Requirements

### Requirement 1: Responsive Application Shell Layout

**User Story:** As a user on a mobile or tablet device, I want the application shell to adapt its layout to my screen size, so that I can navigate and use the application comfortably without horizontal scrolling.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Mobile, THE Application_Shell SHALL display the MainHeader at full width and hide the Sidebar off-screen by default.
2. WHEN the user taps the hamburger menu button on a mobile viewport, THE Sidebar SHALL slide in as a full-screen overlay with a semi-transparent backdrop that covers the remaining viewport area.
3. WHEN the user taps a navigation link in the Sidebar overlay, THE Sidebar SHALL close automatically and navigate to the selected page.
4. WHEN the user taps the backdrop area outside the Sidebar overlay, THE Sidebar SHALL close without navigating.
5. WHILE the viewport width is at Breakpoint_Tablet, THE Application_Shell SHALL behave identically to Breakpoint_Mobile (Sidebar hidden by default, accessible via hamburger toggle with overlay).
6. WHILE the viewport width is at Breakpoint_Desktop, THE Application_Shell SHALL display the MainHeader at full width with the Sidebar accessible via hamburger toggle as currently implemented.
7. WHILE the viewport width is at Breakpoint_Mobile, THE MainHeader SHALL hide the application subtitle and user email, displaying only the logo, application title, and hamburger menu button.

### Requirement 2: Responsive Dashboard Grid

**User Story:** As a user viewing the dashboard on a mobile or tablet device, I want the dashboard content to stack vertically and remain readable, so that I can view all KPIs and the map without horizontal scrolling.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Mobile, THE Dashboard_Grid SHALL stack all content in a single column in the following top-to-bottom order: stat cards, coverage charts, infrastructure card, charts, and map card, with each element occupying 100% of the available container width.
2. WHILE the viewport width is at Breakpoint_Tablet, THE Dashboard_Grid SHALL display the stat cards in a 2-column grid, stack the coverage charts, infrastructure card, and charts at full container width below the stat cards, and stack the map card below all data content.
3. WHILE the viewport width is at Breakpoint_Desktop, THE Dashboard_Grid SHALL display the current two-column layout (50% data, 50% map) as designed.
4. WHILE the viewport width is at Breakpoint_Mobile, THE Map_View within the Dashboard_Grid SHALL have a minimum height of 300px and occupy 100% of the Dashboard_Grid container width.
5. WHILE the viewport width is below Breakpoint_Desktop, THE Dashboard_Grid SHALL apply a vertical gap of 16px between each stacked content section.
6. WHILE the viewport width is at Breakpoint_Tablet, THE Map_View within the Dashboard_Grid SHALL have a minimum height of 350px and occupy 100% of the Dashboard_Grid container width.

### Requirement 3: Responsive Data Tables

**User Story:** As a user viewing report or management pages on a mobile device, I want data tables to be scrollable and readable, so that I can access all columns without the page layout breaking.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Mobile or Breakpoint_Tablet, THE Data_Table container SHALL apply horizontal scroll overflow (`overflow-x: auto`) so that the table is scrollable when content exceeds the viewport width without causing page-level horizontal overflow.
2. WHILE the viewport width is at Breakpoint_Mobile, THE Data_Table SHALL reduce cell padding to no less than 8px and font size to no smaller than 12px to increase data density while preserving a minimum legible text size.
3. WHILE the viewport width is at Breakpoint_Mobile, THE Data_Table pagination controls SHALL wrap to a stacked layout with the summary text above and the page navigation buttons below, each occupying full container width.
4. WHILE the viewport width is at Breakpoint_Mobile, IF horizontally scrollable content exists and the table is not scrolled fully to the right, THEN THE Data_Table SHALL display a scroll-hint gradient indicator (minimum 24px wide) on the right edge of the table container.
5. THE Data_Table header cells SHALL use `whitespace-nowrap` to prevent column headers from wrapping on all screen sizes.
6. WHILE the viewport width is at Breakpoint_Mobile, IF the user scrolls the Data_Table fully to the right edge, THEN THE scroll-hint gradient indicator SHALL be hidden.

### Requirement 4: Responsive Filter Bars

**User Story:** As a user on a mobile device, I want filter controls on report pages to wrap and stack properly, so that I can apply filters without controls overlapping or being cut off.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Mobile, THE Filter_Bar SHALL stack filter controls vertically with each control occupying 100% of the Filter_Bar's content width.
2. WHILE the viewport width is at Breakpoint_Tablet, THE Filter_Bar SHALL wrap filter controls into multiple rows with 2 equally-sized controls per row.
3. WHILE the viewport width is at Breakpoint_Desktop, THE Filter_Bar SHALL display filter controls in a single horizontal row as currently designed.
4. WHILE the viewport width is at Breakpoint_Mobile, THE Filter_Bar action buttons (Apply, Export, Reset) SHALL each display at full width, stacked vertically below the filter controls.
5. WHILE the viewport width is above Breakpoint_Mobile, THE Filter_Bar action buttons SHALL display inline (auto-width) aligned to the trailing edge of the Filter_Bar.
6. WHILE the viewport width is at Breakpoint_Mobile, THE Filter_Bar filter controls and action buttons SHALL have a minimum height of 44px to ensure adequate touch targets.
7. THE Filter_Bar SHALL NOT allow any filter control or action button to overflow or be clipped beyond the viewport boundary on any screen size.

### Requirement 5: Responsive CRUD Directory Pages

**User Story:** As a user managing entities (vehicles, routes, employees) on a mobile device, I want the form and table layout to adapt to my screen size, so that I can add and edit records without layout issues.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Mobile, THE CRUD_Directory form fields SHALL stack vertically with each input occupying full width.
2. WHILE the viewport width is at Breakpoint_Tablet, THE CRUD_Directory form fields SHALL display in a 2-column grid with each field occupying equal column width, except fields whose input content requires more horizontal space (e.g., address, description, or textarea fields) which SHALL span the full row width.
3. WHILE the viewport width is at Breakpoint_Mobile, THE CRUD_Directory page header SHALL stack the title and action button vertically with the title displayed above the action button and the button at full width.
4. WHILE the viewport width is at Breakpoint_Mobile, THE CRUD_Directory search input SHALL expand to full width.
5. WHILE the viewport width is at Breakpoint_Mobile, THE CRUD_Directory form submit and cancel buttons SHALL display at full width, stacked vertically with a minimum height of 44px each.
6. WHILE the viewport width is at Breakpoint_Tablet or Breakpoint_Desktop, THE CRUD_Directory form submit and cancel buttons SHALL display inline (side-by-side) at their intrinsic width.

### Requirement 6: Responsive Map Views

**User Story:** As a user viewing live tracking or monitoring maps on a mobile device, I want the map to fill the available screen space and map controls to remain accessible, so that I can monitor vehicle locations effectively.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Mobile, THE Map_View SHALL occupy the full viewport width minus 16px padding on each side and have a minimum height of 300px.
2. WHILE the viewport width is at Breakpoint_Mobile, THE Map_View zoom controls SHALL have a minimum touch target of 44x44px and SHALL NOT be obscured by popups, markers, or overlapping elements.
3. WHILE the viewport width is at Breakpoint_Mobile, THE Map_View popups SHALL have a maximum width of 90% of the viewport width to prevent overflow.
4. IF a Map_View sidebar panel (vehicle list, legend) exists alongside the map, THEN WHILE the viewport width is at Breakpoint_Mobile, THE Application_Shell SHALL stack the panel below the map instead of displaying it side-by-side, and the Map_View SHALL retain a minimum height of 250px.
5. WHILE the viewport width is at Breakpoint_Mobile, THE Map_View SHALL support touch gestures for panning and pinch-to-zoom without triggering page scroll.

### Requirement 7: Responsive Drawer Panels

**User Story:** As a user on a mobile device, I want slide-in drawer panels to occupy the full screen width, so that I can read detailed breakdowns without content being cut off.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Mobile, THE Drawer_Panel SHALL occupy 100% of the viewport width and enable vertical scrolling for its content area when the content exceeds the viewport height.
2. WHILE the viewport width is at Breakpoint_Tablet, THE Drawer_Panel SHALL occupy a maximum of 80% of the viewport width.
3. WHILE the viewport width is at Breakpoint_Desktop, THE Drawer_Panel SHALL maintain its existing maximum-width constraint as defined per drawer instance (`max-w-md` for Zone Coverage and Open Depot drawers, `max-w-lg` for Garbage Tonnage drawer).
4. WHILE the viewport width is at Breakpoint_Mobile, THE Drawer_Panel internal grid layouts that use 3 or more columns SHALL reduce to a maximum of 2 columns.
5. WHILE the viewport width is at Breakpoint_Mobile, THE Drawer_Panel close button SHALL have a minimum touch target size of 44x44px and remain visible in a fixed header area above the scrollable content.

### Requirement 8: Responsive Login Page

**User Story:** As a user accessing the application on a mobile device, I want the login page to display correctly and be easy to use, so that I can sign in without layout issues.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Mobile, THE Login_Page form card SHALL occupy full width with horizontal padding of no less than 16px on each side.
2. THE Login_Page input fields and submit button SHALL have a minimum height of 44px on all screen sizes to ensure touch targets meet accessibility guidelines.
3. THE Login_Page SHALL center the form vertically and horizontally on all viewport sizes.
4. WHILE the viewport width is at Breakpoint_Tablet or Breakpoint_Desktop, THE Login_Page form card SHALL have a maximum width of 480px and remain horizontally centered.
5. IF a login validation error is displayed, THEN THE Login_Page error message SHALL remain fully visible within the form card boundaries without causing horizontal overflow on Breakpoint_Mobile.
6. WHILE the viewport width is at Breakpoint_Mobile, THE Login_Page form card font size for labels and input text SHALL be no smaller than 16px to prevent automatic zoom on input focus in mobile browsers.

### Requirement 9: Responsive Typography and Spacing

**User Story:** As a user on a mobile device, I want text and spacing to scale appropriately for smaller screens, so that content remains readable without excessive white space or cramped text.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Mobile, THE Application_Shell page padding SHALL reduce from the desktop value (24px–32px) to 16px on all sides.
2. WHILE the viewport width is at Breakpoint_Tablet, THE Application_Shell page padding SHALL reduce from the desktop value (24px–32px) to 20px on all sides.
3. WHILE the viewport width is at Breakpoint_Mobile, THE PageHeader title font size SHALL scale down from `text-2xl`/`text-3xl` to `text-xl` (equivalent to 1.25rem / 20px).
4. WHILE the viewport width is at Breakpoint_Mobile, THE Application_Shell SHALL maintain a minimum touch target size of 44×44 CSS pixels (width and height of the clickable area) for all interactive elements including buttons, links, and toggle controls.
5. WHILE the viewport width is at Breakpoint_Mobile, THE vertical spacing (gap or margin) between adjacent card components within any page layout SHALL reduce from 24px to 16px.
6. WHILE the viewport width is at Breakpoint_Tablet, THE vertical spacing between adjacent card components within any page layout SHALL reduce from 24px to 20px.

### Requirement 10: Responsive Charts and Visualizations

**User Story:** As a user viewing dashboard charts on a mobile device, I want charts to resize and remain readable, so that I can understand trends without pinch-zooming.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Mobile, THE Dashboard charts (Recharts components) SHALL resize to fit the full container width and maintain a minimum height of 200px.
2. WHILE the viewport width is at Breakpoint_Mobile, THE coverage donut charts SHALL render with a maximum diameter equal to 90% of the container width and no smaller than 120px in diameter.
3. WHILE the viewport width is at Breakpoint_Mobile, THE chart legend labels SHALL wrap to multiple lines rather than being clipped, and legend text SHALL remain at a minimum font size of 12px.
4. WHILE the viewport width is at Breakpoint_Mobile, THE Dashboard charts SHALL display tooltips on tap interaction rather than requiring hover, with the tooltip dismissing when the user taps outside the chart area.
5. WHILE the viewport width is at Breakpoint_Mobile, THE chart axis labels SHALL reduce in count (via tick interval or auto-fitting) so that adjacent labels do not overlap, and each visible label SHALL have a minimum font size of 10px.

### Requirement 11: No Horizontal Overflow

**User Story:** As a user on any device, I want the application to never produce a horizontal scrollbar at the page level, so that navigation feels native and smooth.

#### Acceptance Criteria

1. THE Application_Shell SHALL prevent horizontal overflow such that no horizontal scrollbar is rendered on the `body` or root layout element at any viewport width from 320px to 2560px.
2. IF any component content exceeds the viewport width, THEN THE containing element SHALL clip or internally scroll the overflowing content so that no descendant element causes a page-level horizontal scrollbar.
3. THE Application_Shell SHALL apply `max-width: 100vw` and `overflow-x: hidden` on the root container for all breakpoints defined in the Glossary (Breakpoint_Mobile, Breakpoint_Tablet, Breakpoint_Desktop).
4. IF a vertical scrollbar is visible, THEN THE Application_Shell SHALL account for the scrollbar width so that `100vw`-based elements do not extend beyond the visible viewport and trigger horizontal overflow.
5. WHEN the device orientation changes or the viewport is resized, THE Application_Shell SHALL re-render without introducing a horizontal scrollbar within 1 frame update.

### Requirement 12: Preserve Desktop Design Integrity

**User Story:** As a user on a desktop device, I want the application to look and function exactly as it does today, so that the responsive changes do not alter the existing desktop experience.

#### Acceptance Criteria

1. WHILE the viewport width is at Breakpoint_Desktop, THE Application_Shell and all child components SHALL produce identical computed CSS layout properties (width, height, margin, padding, position, display, grid-template, flex properties) and identical DOM structure as the current implementation prior to responsive changes.
2. THE responsive implementation SHALL use Tailwind CSS responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`) exclusively, adding mobile-first styles at lower breakpoints without removing, reordering, or changing the value of any existing Tailwind utility class that applies at Breakpoint_Desktop.
3. THE responsive implementation SHALL NOT introduce new JavaScript-based layout calculations or resize observers for layout purposes at any breakpoint.
4. WHILE the viewport width is at Breakpoint_Desktop, THE Application_Shell SHALL maintain page load and interaction performance within 50ms of the pre-responsive baseline for Time to First Contentful Paint and layout recalculation events.
5. IF a visual regression test comparison detects a pixel difference greater than 0.1% of the page area on any page at Breakpoint_Desktop (viewport width of 1280px), THEN THE responsive implementation SHALL be considered failing the desktop integrity requirement.
