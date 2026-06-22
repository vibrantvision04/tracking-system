# Requirements Document

## Introduction

This feature covers a complete frontend UI/UX modernization and design system refactor of the VSWM Jaipur Integrated Solid Waste Management System. The project is a Next.js 16 / React 19 / Tailwind CSS v4 application with a Go backend.

The scope is **exclusively visual and structural**: no routes, APIs, backend calls, form logic, business rules, permissions, filters, table columns, or existing feature behavior shall change. The goal is to establish a consistent, token-driven design system and migrate every screen to use it, producing a modern enterprise command-center aesthetic inspired by Linear, Vercel Dashboard, and Stripe Dashboard.

The codebase already has partial design token usage (`--color-theme-*` CSS variables), an existing `Button`, `Card`, `Input`, `Select`, `Table`, `Sidebar`, `MainHeader`, and `CrudDirectory` component set, and Lucide React for icons. The modernization refines and extends this foundation rather than replacing it wholesale.

---

## Glossary

- **Design_System**: The centralized collection of design tokens, component specifications, and usage guidelines stored under `src/design-system/`.
- **Token**: A named design constant (color, spacing, radius, shadow, typography size) exported from the Design_System.
- **Theme_Variables**: The CSS custom properties declared in `globals.css` under `:root` and `@theme`, consumed by Tailwind utility classes.
- **AppCard**: The standardized card component (`src/components/ui/Card.tsx`) implementing the Design_System card specification.
- **DataTable**: The standardized table component (`src/components/shared/Table.tsx`) implementing the Design_System table specification.
- **FilterBar**: A layout component encapsulating one or more filter controls (selects, date pickers, search inputs) with consistent height, spacing, and responsive wrapping.
- **AppSelect**: The standardized dropdown/select component (`src/components/ui/Select.tsx`) with a white background on light surfaces.
- **AppDatePicker**: A date/datetime input wrapper with consistent focus state and white background.
- **FormField**: A layout wrapper that pairs a label with an input, select, or textarea with consistent spacing and error display.
- **Sidebar**: The left navigation component (`src/components/Sidebar.tsx`) with flyout mega-menu.
- **TopNavbar**: The top header component (`src/components/MainHeader.tsx`).
- **PageHeader**: The per-page title/breadcrumb/action bar component (`src/components/shared/PageHeader.tsx`).
- **CrudDirectory**: The shared CRUD page shell (`src/components/shared/CrudDirectory.tsx`).
- **Playback_Screen**: The route playback page at `/playback`.
- **Reports_Screen**: The vehicle movement report page at `/reports`.
- **Dashboard_Screen**: The application home page at `/`.
- **VSWM_System**: The overall VSWM Jaipur Integrated Solid Waste Management System frontend application.
- **Design_Token_File**: Any of `colors.ts`, `spacing.ts`, `typography.ts`, `shadows.ts`, `radius.ts`, or `tokens.ts` inside `src/design-system/`.
- **Lucide_React**: The icon library package already installed (`lucide-react ^1.17.0`) used as the sole icon source.
- **Inter**: The primary typeface (Google Font, already loaded in `layout.tsx`) used for all UI text.
- **Tailwind_Theme**: The `@theme` block in `globals.css` that maps Design_System token values to Tailwind utility class names.

---

## Requirements

### Requirement 1: Design System Token Files

**User Story:** As a frontend developer, I want all design constants centralized in typed TypeScript files, so that every component references a single source of truth and theme changes propagate automatically.

#### Acceptance Criteria

1. THE Design_System SHALL export a `colors` object from `src/design-system/colors.ts` containing, at minimum, the following named token groups: `background` (base, surface, card, elevated), `brand` (primary, primaryHover, primaryLight), `semantic` (success, warning, error, info), `text` (default, dim, inverted), and `border` (default, subtle).
2. THE Design_System SHALL export a `spacing` scale from `src/design-system/spacing.ts` providing numeric keys 0–16 mapped to `rem` string values following a 4 px base unit.
3. THE Design_System SHALL export a `typography` object from `src/design-system/typography.ts` containing named size tokens: `pageTitle` (32 px), `sectionTitle` (24 px), `cardTitle` (18 px), `body` (14 px), and `label` (12 px), each paired with a recommended `lineHeight` and `fontWeight`.
4. THE Design_System SHALL export a `shadows` object from `src/design-system/shadows.ts` providing at least four elevation levels: `none`, `sm`, `md`, and `lg`.
5. THE Design_System SHALL export a `radius` object from `src/design-system/radius.ts` providing tokens: `sm` (6 px), `md` (8 px), `lg` (12 px), `xl` (16 px), and `full` (9999 px).
6. THE Design_System SHALL export a `tokens` barrel object from `src/design-system/tokens.ts` that re-exports `colors`, `spacing`, `typography`, `shadows`, and `radius` as named exports.
7. WHEN a Design_Token_File is imported in a component, THE Design_System SHALL provide TypeScript type inference for all token keys so that invalid token references produce a compile-time error.
8. IF no Design_Token_File is imported in a component that references design tokens, THEN THE VSWM_System SHALL allow compile-time errors to surface rather than suppressing them.

---

### Requirement 2: Tailwind Theme Synchronization

**User Story:** As a developer, I want the Tailwind CSS utility classes to reference Design_System tokens, so that I can use token-backed classes like `bg-theme-card` and `text-theme-primary` without writing inline styles.

#### Acceptance Criteria

1. THE Tailwind_Theme SHALL declare CSS custom properties in `globals.css` for every color token in the Design_System `colors` object, using the naming convention `--color-theme-{group}-{name}` (e.g., `--color-theme-background-card`).
2. THE Tailwind_Theme SHALL map the following semantic aliases for backward compatibility: `--color-theme-base` → background.base, `--color-theme-surface` → background.surface, `--color-theme-accent` → brand.primary, `--color-theme-accent-hover` → brand.primaryHover, `--color-theme-text` → text.default, `--color-theme-text-dim` → text.dim, `--color-theme-border` → border.default.
3. WHEN a component uses a Tailwind utility class backed by a theme token (e.g., `bg-theme-surface`), THE VSWM_System SHALL render the correct token color without requiring any inline `style` prop or hardcoded hex value.
4. IF a hardcoded hex color exists in a component file that corresponds to a defined Design_System token, THEN THE VSWM_System SHALL replace it with the corresponding token-backed Tailwind class during migration. IF the migration cannot complete successfully for a given component, THEN THE VSWM_System SHALL allow the hardcoded color to remain in place rather than failing the build.

---

### Requirement 3: Color Palette Alignment

**User Story:** As a UI designer, I want the entire application to use a consistent, predefined dark color palette, so that screens feel cohesive and premium rather than patchwork.

#### Acceptance Criteria

1. THE VSWM_System SHALL use `#0F172A` as the application background base color (`background.base`).
2. THE VSWM_System SHALL use `#111827` as the primary surface color (`background.surface`).
3. THE VSWM_System SHALL use `#1E293B` as the card background color (`background.card`).
4. THE VSWM_System SHALL use `#243244` as the elevated surface color (`background.elevated`).
5. THE VSWM_System SHALL use `#DC2626` as the brand primary color (`brand.primary`), reserved for active states, important actions, highlights, and selection indicators.
6. THE VSWM_System SHALL use `#B91C1C` as the brand primary hover color (`brand.primaryHover`).
7. THE VSWM_System SHALL use `#FEE2E2` as the brand primary light color (`brand.primaryLight`), used for icon backgrounds or subtle tints on dark surfaces.
8. THE VSWM_System SHALL use `#16A34A` as the success color (`semantic.success`), applied to Load, Apply, Generate, and Execute action buttons.
9. THE VSWM_System SHALL use `#F59E0B` as the warning color (`semantic.warning`).
10. THE VSWM_System SHALL use `#EF4444` as the error color (`semantic.error`).
11. WHEN rendering dropdown menus, date pickers, search inputs, select menus, popovers, and modals, THE VSWM_System SHALL use a white (`#FFFFFF`) or near-white background surface rather than the dark base color, to maintain readability of option text. This requirement applies regardless of whether the dropdown contains text options, icons, or colored indicators.

---

### Requirement 4: Typography System

**User Story:** As a developer, I want a consistent typography scale applied across all pages, so that information hierarchy is immediately readable and pages do not mix font sizes arbitrarily.

#### Acceptance Criteria

1. THE VSWM_System SHALL use the Inter typeface (loaded via `next/font/google`) as the default font family for all UI text.
2. WHEN rendering a page-level title (`<h1>` in `PageHeader`), THE VSWM_System SHALL apply `text-3xl` (equivalent to 32 px / 2 rem) with `font-extrabold`.
3. WHEN rendering a section title (`<h2>`), THE VSWM_System SHALL apply `text-2xl` (24 px) with `font-bold`.
4. WHEN rendering a card title (`CardTitle` component), THE VSWM_System SHALL apply `text-lg` (18 px) with `font-semibold`.
5. WHEN rendering body copy or table cell content, THE VSWM_System SHALL apply `text-sm` (14 px) with `font-normal`.
6. WHEN rendering labels, badges, metadata, or table header text, THE VSWM_System SHALL apply `text-xs` (12 px).
7. THE VSWM_System SHALL NOT mix more than three distinct font sizes within a single card or panel component.
8. FOR UI elements that do not fall into the defined typography categories (page title, section title, card title, body copy, label), THE VSWM_System SHALL allow any appropriate font size at the developer's discretion.

---

### Requirement 5: Button Component System

**User Story:** As a developer, I want a unified Button component with clearly defined variants, so that every call-to-action across the application looks consistent and communicates its intent.

#### Acceptance Criteria

1. THE Button_Component SHALL support the following variants: `primary` (brand red, for primary destructive or brand actions), `success` (green `#16A34A`, for Load / Apply / Generate / Execute), `secondary` (surface background with border), `danger` (red, for delete/remove actions), `ghost` (transparent background, no border), and `outline` (transparent background, visible border).
2. WHEN a Button_Component is in `default` state, THE Button_Component SHALL render its variant background and label color as specified in the Design_System.
3. WHEN a Button_Component receives focus or hover, THE Button_Component SHALL transition to the hover color within 150 ms using a CSS `transition` property.
4. WHEN a Button_Component has its `disabled` prop set to `true`, THE Button_Component SHALL reduce opacity to 50% and set `cursor: not-allowed`, without changing the variant color.
5. WHEN a Button_Component has its `loading` prop set to `true`, THE Button_Component SHALL display a spinning indicator and the `loadingText` string, and SHALL disable click interactions until `loading` is `false`.
6. THE Button_Component SHALL have a minimum height of 36 px and horizontal padding of at least 16 px for all variants.
7. THE Button_Component SHALL apply `border-radius` equal to the `radius.md` token (8 px) by default.
8. IF a Button_Component is used for a form submit action within a CRUD form, THEN THE Button_Component SHALL use the `success` variant.
9. IF a Button_Component is used to delete a record, THEN THE Button_Component SHALL use the `danger` variant.

---

### Requirement 6: AppCard Component

**User Story:** As a developer, I want a standardized card component, so that every panel, widget, and content container shares the same visual treatment.

#### Acceptance Criteria

1. THE AppCard SHALL render with background color `background.card` (`#1E293B`), a 1 px border using `border.default`, and `border-radius` equal to `radius.xl` (16 px).
2. THE AppCard SHALL apply a default box shadow using the `shadows.sm` token.
3. WHEN the `hoverable` prop is `true` and the user hovers over THE AppCard, THE AppCard SHALL elevate to `shadows.md` and translate upward by 2 px within 200 ms.
4. THE AppCard SHALL provide sub-components: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter`, each with Design_System-compliant spacing (16 px / 20 px padding using the spacing scale).
5. THE CardHeader SHALL render a bottom border using `border.default` to visually separate it from `CardContent`.
6. THE CardFooter SHALL render a top border using `border.default` and use `background.elevated` as its background to distinguish it from `CardContent`.

---

### Requirement 7: DataTable Component

**User Story:** As an operator, I want tables to be easy to scan and navigate, so that I can find records quickly without visual fatigue.

#### Acceptance Criteria

1. THE DataTable SHALL render table header cells with a sticky `position: sticky; top: 0` behavior when the table's scroll container overflows vertically.
2. WHEN a user hovers over a data row, THE DataTable SHALL apply a background highlight of `background.elevated` within 150 ms.
3. THE DataTable SHALL apply alternating row backgrounds (zebra striping) using `background.card` and `background.surface` for odd and even rows respectively.
4. THE DataTable SHALL render header cells using `text-xs`, `font-semibold`, `uppercase`, `tracking-wider`, and `text.dim` color.
5. WHEN the data set is empty and `isLoading` is `false`, THE DataTable SHALL display a centered empty state with a Lucide_React icon, a primary message in `text-sm font-semibold`, and a secondary hint in `text-xs text.dim`.
6. WHEN `isLoading` is `true`, THE DataTable SHALL display a centered spinner using a CSS `animate-spin` class and a "Loading records..." label.
7. WHEN the data set is empty and `isLoading` is `true`, THE DataTable SHALL display the loading spinner rather than the empty state.
8. WHEN the data set exceeds `itemsPerPage` rows and `paginate` is `true`, THE DataTable SHALL render pagination controls showing: previous button, up to 5 page number buttons, next button, and an entry count summary (e.g., "Showing 1 to 20 of 87 entries").
9. THE DataTable SHALL apply `text-sm` font size to all data cells.
10. THE DataTable pagination active page button SHALL use `brand.primary` background with white text.

---

### Requirement 8: FilterBar Component

**User Story:** As an operator, I want filter controls to be uniformly laid out above data tables and reports, so that I can apply filters quickly without hunting for misaligned or differently-sized controls.

#### Acceptance Criteria

1. THE FilterBar SHALL render its child filter controls in a flex-wrap row with a 12 px gap between controls.
2. THE FilterBar SHALL enforce a consistent height of 36 px for all direct child input, select, and date-picker controls.
3. WHEN the viewport width is below 1024 px, THE FilterBar SHALL allow controls to wrap to a second row without horizontal overflow. WHEN the viewport width is 1024 px or above, THE FilterBar SHALL maintain a single-row layout without wrapping.
4. THE FilterBar SHALL render on a `background.surface` background with `border.default` border and `radius.lg` (12 px) border-radius.
5. THE FilterBar SHALL include a designated slot for primary action buttons (Load / Apply / Generate) right-aligned within the bar on wide viewports.

---

### Requirement 9: AppSelect Component

**User Story:** As an operator, I want dropdown selects to be clearly visible and easy to interact with, so that I can choose options without confusion about what is selected.

#### Acceptance Criteria

1. THE AppSelect SHALL render with a white (`#FFFFFF`) background and dark text (`#111827`) regardless of the surrounding dark surface, to maximize option-text readability.
2. THE AppSelect SHALL render a 1 px border using a light border color (`#D1D5DB`) in its default state.
3. WHEN the AppSelect receives focus, THE AppSelect SHALL display a 2 px focus ring using the `brand.primary` color at 30% opacity, within 150 ms.
4. THE AppSelect SHALL display a chevron-down icon from Lucide_React on the right side, replacing any browser-default arrow.
5. THE AppSelect SHALL have a consistent height of 36 px.
6. IF an `error` prop is provided to THE AppSelect, THEN THE AppSelect SHALL render a red border (`semantic.error`) and display the error message below the control in `text-xs` using `semantic.error` color.

---

### Requirement 10: AppDatePicker Component

**User Story:** As an operator, I want date and datetime inputs to match the visual language of other form controls, so that filter bars and forms feel unified.

#### Acceptance Criteria

1. THE AppDatePicker SHALL render with a white (`#FFFFFF`) background, consistent with AppSelect.
2. THE AppDatePicker SHALL have a consistent height of 36 px.
3. WHEN the AppDatePicker receives focus, THE AppDatePicker SHALL display a 2 px focus ring using `brand.primary` at 30% opacity, within 150 ms.
4. THE AppDatePicker SHALL apply `radius.md` (8 px) border-radius.
5. THE AppDatePicker SHALL accept `label`, `error`, and all standard HTML `<input type="date">` or `<input type="datetime-local">` props.

---

### Requirement 11: FormField, Input, and TextArea Components

**User Story:** As a developer, I want all form controls to share a consistent label-input-error layout, so that forms are easy to build and consistent across CRUD pages.

#### Acceptance Criteria

1. THE FormField SHALL render a label above its child control using `text-xs font-semibold uppercase tracking-wider` in `text.dim` color.
2. THE Input_Component SHALL render with `background.base` fill, `border.default` border, `radius.lg` border-radius, 12 px horizontal padding, and 8 px vertical padding.
3. WHEN THE Input_Component receives focus, THE Input_Component SHALL highlight with a 2 px ring using `brand.primary` at 30% opacity within 150 ms.
4. THE TextArea_Component SHALL share the same visual specification as THE Input_Component, with a minimum height of 80 px and `resize: vertical`.
5. IF an `error` prop is provided to THE Input_Component or THE TextArea_Component, THEN THE component SHALL apply a red border using `semantic.error` and display the error string below the field in `text-xs` `semantic.error` color.
6. THE Input_Component and THE TextArea_Component SHALL NOT use hardcoded hex values; all colors SHALL reference Design_System tokens.

---

### Requirement 12: Icon Standardization

**User Story:** As a developer, I want all icons sourced from a single library, so that the application has visual consistency and no redundant icon packages.

#### Acceptance Criteria

1. THE VSWM_System SHALL use Lucide_React as the sole icon library for all UI icons.
2. WHEN an icon is needed in a component, THE component SHALL import it directly from `lucide-react` (e.g., `import { Truck } from 'lucide-react'`).
3. THE VSWM_System SHALL NOT contain any inline SVG icons that duplicate a Lucide_React icon.
4. THE VSWM_System SHALL NOT import icons from any library other than `lucide-react`.
5. THE Sidebar SHALL use Lucide_React icons for all category-level navigation items.

---

### Requirement 13: Sidebar Redesign

**User Story:** As an operator, I want the sidebar to feel modern and navigable, so that I can find sections quickly and the active page is always visually clear.

#### Acceptance Criteria

1. THE Sidebar SHALL have a collapsed width of 64 px and an expanded width of 180 px.
2. WHEN the Sidebar is in expanded state, THE Sidebar SHALL display category labels next to their icons.
3. WHEN a navigation item corresponds to the current route, THE Sidebar SHALL indicate the active state using a 3 px vertical `brand.primary` left-border accent line on the item row, NOT a full red background fill.
4. WHEN a user hovers over a navigation item (including the currently active item), THE Sidebar SHALL apply `background.elevated` as the item background within 150 ms, providing consistent interactive feedback.
5. THE Sidebar collapse/expand animation SHALL complete within 300 ms using a CSS `transition` on `width`.
6. THE Sidebar flyout mega-menu SHALL appear within 150 ms on category hover and disappear with a 250 ms debounce delay on mouse-leave.
7. THE Sidebar flyout mega-menu SHALL use `background.surface` background with a `backdrop-filter: blur` of at least 16 px.
8. THE Sidebar footer area SHALL display the current user's avatar initials, display name, and role label.
9. IF the Sidebar is on a mobile viewport (< 1024 px), THEN THE Sidebar SHALL be hidden by default and toggleable via the `MobileHeader` menu button. WHEN the Sidebar is open on mobile, THE Sidebar SHALL automatically hide when the user navigates to a new page or clicks outside the Sidebar.

---

### Requirement 14: TopNavbar Redesign

**User Story:** As an operator, I want the top navigation bar to clearly identify the system and show my status, so that I always know which system I am using and whether I am connected.

#### Acceptance Criteria

1. THE TopNavbar SHALL have a fixed height of 64 px and remain sticky at the top of the viewport with `z-index` above all page content.
2. THE TopNavbar SHALL display the Jaipur Municipal Corporation logo, the system title "VSWM - NAGAR NIGAM JAIPUR", and the subtitle "INTEGRATED SOLID WASTE MANAGEMENT SYSTEM" on the left side.
3. THE TopNavbar SHALL display the current user's name, an online/offline status indicator, and the user avatar on the right side.
4. WHEN the system is online, THE TopNavbar SHALL display the status indicator text in `semantic.success` color.
5. THE TopNavbar SHALL use `background.surface` background with a `border.default` bottom border and `shadows.sm` box-shadow.
6. THE TopNavbar user avatar SHALL be a circular element with a diameter of 36 px.

---

### Requirement 15: Dashboard Screen Redesign

**User Story:** As a supervisor, I want the dashboard to show KPIs, coverage metrics, and hardware status in a unified dark theme, so that I can monitor operational health at a glance.

#### Acceptance Criteria

1. THE Dashboard_Screen SHALL render KPI summary cards using the AppCard component with the `background.card` surface.
2. WHEN rendering KPI stat cards, THE Dashboard_Screen SHALL display the metric value at `text-4xl font-extrabold` and the label at `text-sm font-semibold text.dim`.
3. WHEN the Design_System has been adopted in a component, THE Dashboard_Screen SHALL use the Design_System `semantic` colors for accent icons on KPI cards: success (green) for positive metrics, warning (amber) for caution metrics. Semantic colors SHALL NOT be used for accent icons in components that have not yet adopted the Design_System.
4. THE Dashboard_Screen SHALL render coverage chart widgets, infrastructure asset cards, and revenue cards all using the AppCard component with consistent padding and typography.
5. THE Dashboard_Screen `StatCard` component (`src/components/dashboard/StatCard.tsx`) SHALL be migrated to reference Design_System tokens exclusively, removing its hardcoded `bg-white border-slate-200` and `text-slate-*` classes. THE Dashboard_Screen SHALL NOT render until the `StatCard` migration is complete.
6. THE Dashboard_Screen layout SHALL support viewports of 1366×768, 1440×900, and 1920×1080 without horizontal scroll or content overflow.

---

### Requirement 16: Playback Screen Redesign

**User Story:** As an operator, I want the playback controls and filters to be grouped logically and visually consistent, so that I can configure and control route playback without hunting for controls.

#### Acceptance Criteria

1. THE Playback_Screen SHALL render all filter controls (date, vehicle, route selectors) inside a FilterBar component at the top of the content area.
2. THE Playback_Screen SHALL render playback controls (Play, Pause, Replay, Speed selector, AI Correction toggle) in a unified toolbar below the FilterBar.
3. WHEN a playback control button is in active/pressed state, THE Playback_Screen SHALL highlight it using `brand.primary` color.
4. THE Playback_Screen filter selects and date inputs SHALL use the AppSelect and AppDatePicker components.
5. THE Playback_Screen filter bar and toolbar SHALL render consistently at viewports 1366×768 and above without overflow.

---

### Requirement 17: Reports Screen Redesign

**User Story:** As a manager, I want the reports screen filters and data table to be clearly organized, so that I can load and read report data quickly.

#### Acceptance Criteria

1. THE Reports_Screen SHALL render all filter inputs and selects inside a FilterBar component above the data table.
2. THE Reports_Screen "Load" and "Recalculate" buttons MAY use different Button_Component variants to visually distinguish their functions, provided each variant clearly communicates the action's intent.
3. THE Reports_Screen data display SHALL use the DataTable component.
4. THE Reports_Screen FilterBar SHALL maintain its layout without overflow at viewport width 1366 px.
5. THE Reports_Screen SHALL apply the Design_System typographic scale to column headers and cell data.

---

### Requirement 18: Vehicle Management Screen Redesign

**User Story:** As an admin, I want the vehicle list to use the standardized DataTable, so that it matches every other list screen in the system.

#### Acceptance Criteria

1. THE Vehicle_Management_Screen SHALL render its vehicle list using the DataTable component.
2. THE Vehicle_Management_Screen SHALL use the AppCard component as the list container.
3. THE Vehicle_Management_Screen SHALL use the PageHeader component for its title, breadcrumbs, and action buttons.
4. THE Vehicle_Management_Screen add/edit form SHALL use FormField components with AppSelect and Input components.

---

### Requirement 19: CrudDirectory Shell Migration

**User Story:** As a developer, I want all CRUD management pages to use the CrudDirectory shell with Design_System components, so that every management screen is instantly consistent without per-page redesign.

#### Acceptance Criteria

1. THE CrudDirectory SHALL use the AppCard component for its form panel and list panel containers.
2. THE CrudDirectory form submit button SHALL use the `success` variant of the Button_Component.
3. THE CrudDirectory close/cancel button SHALL use the `outline` variant of the Button_Component.
4. THE CrudDirectory add/open button in the PageHeader SHALL use the `primary` variant of the Button_Component.
5. THE CrudDirectory search input SHALL use the Input_Component.
6. THE CrudDirectory SHALL pass `tableHeaders` and row children to the DataTable component.
7. WHEN the CrudDirectory form panel is opened, THE CrudDirectory SHALL animate the panel into view using a fade-in CSS animation completing within 200 ms.
8. IF a Button_Component is rendered with an incorrect variant within the CrudDirectory, THEN THE Button_Component SHALL render using the provided variant as-is without failing or throwing a render error.

---

### Requirement 20: Animation and Transition Standards

**User Story:** As a user, I want UI interactions to feel snappy and smooth, so that the application feels responsive without being distracting.

#### Acceptance Criteria

1. THE VSWM_System SHALL use CSS `transition` durations exclusively in the range of 150 ms to 300 ms for all UI interactions.
2. WHEN a card, button, or row has a hover state, THE VSWM_System SHALL apply the hover transition within 150 ms.
3. THE Sidebar collapse/expand transition SHALL use a 300 ms duration with a `cubic-bezier(0.16, 1, 0.3, 1)` easing function.
4. THE VSWM_System SHALL NOT use animation durations longer than 300 ms for any interactive hover, focus, or click transition.
5. THE VSWM_System SHALL NOT use neon glow effects, glassmorphism blur on primary surfaces, or rapid flash animations.

---

### Requirement 21: Responsive Layout Support

**User Story:** As an operator, I want the application to be usable across standard enterprise monitor resolutions, so that the UI does not break or overflow on the screens deployed in control centers.

#### Acceptance Criteria

1. THE VSWM_System SHALL render without horizontal scroll at viewport widths of 1366 px, 1440 px, and 1920 px.
2. THE VSWM_System SHALL render without vertical content overflow in the main content area at 768 px viewport height when the content area is scrollable.
3. WHEN the viewport width is below 1024 px, THE Sidebar SHALL collapse to its mobile overlay state.
4. THE FilterBar SHALL wrap its controls to a second line rather than overflow horizontally when viewport width is below 1280 px.
5. THE DataTable SHALL render a horizontally scrollable container when the table content would overflow the viewport width, so that wide tables do not break the page layout. On large viewports where the table fits without overflow, the scroll container is not required.

---

### Requirement 22: No Functional Regression

**User Story:** As a product owner, I want the UI redesign to leave all application functionality intact, so that operators experience zero workflow disruption.

#### Acceptance Criteria

1. THE VSWM_System SHALL preserve all existing API call signatures, query parameters, and response handling logic unchanged after the redesign.
2. THE VSWM_System SHALL preserve all existing route paths and Next.js page file locations unchanged.
3. THE VSWM_System SHALL preserve all form field names, validation logic, and submission handlers unchanged.
4. THE VSWM_System SHALL preserve all permission checks, role guards, and conditional rendering logic unchanged.
5. THE VSWM_System SHALL preserve all table column definitions, data transformations, and filter state logic unchanged.
6. WHEN the VSWM_System is built with `next build`, THE VSWM_System SHALL produce zero TypeScript compilation errors related to the redesign changes, and the entire build SHALL succeed with zero TypeScript errors from any source. IF TypeScript errors from other sources persist, THEN the build process MAY succeed while tracking and reporting those errors separately.

---

### Requirement 23: UI Audit and Migration Documentation

**User Story:** As a developer, I want a documented record of all inconsistencies found and changes made, so that future contributors understand the design system and do not reintroduce legacy patterns.

#### Acceptance Criteria

1. THE VSWM_System SHALL produce a UI Audit Report identifying: all components with hardcoded hex colors, all components using non-standard spacing, all pages mixing multiple card or table styles, and all icon usages outside Lucide_React.
2. THE VSWM_System SHALL produce a Final Summary document listing: every file modified, every component created or refactored, design decisions made, and every screen affected by the migration.
3. WHEN a new component is created as part of the Design_System, THE component file SHOULD include a JSDoc comment block describing its props, variants, and usage example. Compliance with this requirement relies on developer discipline and code review processes rather than automated enforcement.
