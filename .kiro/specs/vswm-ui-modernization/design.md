# Design Document: VSWM UI Modernization

## Overview

This document covers the technical design for the VSWM Jaipur UI modernization — a purely visual and structural refactor of the existing Next.js 16 / React 19 / Tailwind CSS v4 frontend. No routes, API calls, business logic, or feature behavior changes. The goal is to establish a centralized, token-driven design system and migrate every screen to a consistent enterprise command-center aesthetic inspired by Linear, Vercel Dashboard, and Stripe Dashboard.

The existing codebase already has partial design token usage via `--color-theme-*` CSS variables and a working component set (Button, Card, Input, Select, Table, Sidebar, MainHeader, CrudDirectory). This design refines and extends that foundation.

### Key Design Decisions

- **Token-first**: All color, spacing, typography, shadow, and radius values live in `src/design-system/` TypeScript files. CSS custom properties in `globals.css` mirror them for Tailwind utility class consumption.
- **Dark palette anchored on #0F172A**: Background base, with `#111827` surface, `#1E293B` card, `#243244` elevated.
- **Brand red #DC2626** for active states, selection indicators, primary actions.
- **Success green #16A34A** for Load / Apply / Generate / Execute actions.
- **White backgrounds for all dropdowns/selects/pickers** — required for option-text readability against the dark base.
- **Lucide React** is the sole icon source; all inline SVG icons that duplicate Lucide icons are removed.
- **Transition range**: 150 ms – 300 ms exclusively. No glows, glassmorphism on primary surfaces, or flash animations.

---

## Architecture

### High-Level Component Hierarchy

```
RootLayout (layout.tsx)
├── Sidebar (components/Sidebar.tsx)           ← Redesigned: 64px/180px, left-border active indicator
├── MainHeader (components/MainHeader.tsx)     ← Redesigned: 64px fixed, online status, avatar
└── main
    └── [Page]
        ├── PageHeader (components/shared/PageHeader.tsx)   ← h1 text-3xl font-extrabold
        ├── FilterBar (NEW: components/shared/FilterBar.tsx) ← wrapping row of controls
        │   ├── AppSelect (components/ui/Select.tsx)         ← white bg, ChevronDown from lucide
        │   └── AppDatePicker (NEW: components/ui/DatePicker.tsx)
        ├── AppCard (components/ui/Card.tsx)                 ← bg.card, radius.xl, shadows.sm
        │   ├── CardHeader / CardTitle / CardDescription
        │   ├── CardContent
        │   └── CardFooter
        └── DataTable (components/shared/Table.tsx)         ← sticky headers, zebra, pagination
```

### Design System Layer

```
src/design-system/
├── colors.ts       → colors object (background, brand, semantic, text, border groups)
├── spacing.ts      → spacing scale (keys 0–16, 4px base unit, rem values)
├── typography.ts   → typography tokens (pageTitle, sectionTitle, cardTitle, body, label)
├── shadows.ts      → shadow tokens (none, sm, md, lg)
├── radius.ts       → radius tokens (sm, md, lg, xl, full)
└── tokens.ts       → barrel re-export of all above
```

### Tailwind Theme Synchronization

`globals.css` declares two sets of CSS custom properties:

1. **Granular token variables** (`--color-theme-{group}-{name}`) for precise targeting.
2. **Backward-compat aliases** (`--color-theme-base`, `--color-theme-surface`, etc.) so existing components keep working without simultaneous mass-refactor.

The `@theme` block maps both sets so Tailwind generates utility classes (`bg-theme-card`, `bg-theme-surface`, `text-theme-dim`, etc.).

---

## Components and Interfaces

### Design System Token Files (`src/design-system/`)

#### `colors.ts`

```typescript
export const colors = {
  background: {
    base:     '#0F172A',
    surface:  '#111827',
    card:     '#1E293B',
    elevated: '#243244',
  },
  brand: {
    primary:      '#DC2626',
    primaryHover: '#B91C1C',
    primaryLight: '#FEE2E2',
  },
  semantic: {
    success: '#16A34A',
    warning: '#F59E0B',
    error:   '#EF4444',
    info:    '#06B6D4',
  },
  text: {
    default:  '#F8FAFC',
    dim:      '#94A3B8',
    inverted: '#0F172A',
  },
  border: {
    default: '#1E293B',
    subtle:  '#243244',
  },
} as const;

export type Colors = typeof colors;
```

#### `spacing.ts`

```typescript
// 4px base unit, keys 0–16
const base = 4;
export const spacing = Object.fromEntries(
  Array.from({ length: 17 }, (_, k) => [k, `${(k * base) / 16}rem`])
) as Record<number, string>;
// e.g. spacing[4] === "1rem", spacing[1] === "0.25rem"
```

#### `typography.ts`

```typescript
export const typography = {
  pageTitle:    { fontSize: '2rem',    lineHeight: '1.2', fontWeight: '800' },  // 32px
  sectionTitle: { fontSize: '1.5rem',  lineHeight: '1.3', fontWeight: '700' },  // 24px
  cardTitle:    { fontSize: '1.125rem',lineHeight: '1.4', fontWeight: '600' },  // 18px
  body:         { fontSize: '0.875rem',lineHeight: '1.5', fontWeight: '400' },  // 14px
  label:        { fontSize: '0.75rem', lineHeight: '1.4', fontWeight: '500' },  // 12px
} as const;
```

#### `shadows.ts`

```typescript
export const shadows = {
  none: 'none',
  sm:   '0 1px 2px 0 rgba(0,0,0,0.3)',
  md:   '0 4px 6px -1px rgba(0,0,0,0.4), 0 2px 4px -1px rgba(0,0,0,0.2)',
  lg:   '0 10px 15px -3px rgba(0,0,0,0.5), 0 4px 6px -2px rgba(0,0,0,0.3)',
} as const;
```

#### `radius.ts`

```typescript
export const radius = {
  sm:   '6px',
  md:   '8px',
  lg:   '12px',
  xl:   '16px',
  full: '9999px',
} as const;
```

#### `tokens.ts` (barrel)

```typescript
export { colors }     from './colors';
export { spacing }    from './spacing';
export { typography } from './typography';
export { shadows }    from './shadows';
export { radius }     from './radius';
export type { Colors } from './colors';
```

---

### Tailwind Theme Synchronization (`globals.css`)

The `@theme` block and `:root` are updated to declare granular token variables **and** preserve backward-compat aliases:

```css
@theme {
  /* ── Granular token variables ── */
  --color-theme-background-base:     #0F172A;
  --color-theme-background-surface:  #111827;
  --color-theme-background-card:     #1E293B;
  --color-theme-background-elevated: #243244;
  --color-theme-brand-primary:       #DC2626;
  --color-theme-brand-primaryHover:  #B91C1C;
  --color-theme-brand-primaryLight:  #FEE2E2;
  --color-theme-semantic-success:    #16A34A;
  --color-theme-semantic-warning:    #F59E0B;
  --color-theme-semantic-error:      #EF4444;
  --color-theme-semantic-info:       #06B6D4;
  --color-theme-text-default:        #F8FAFC;
  --color-theme-text-dim:            #94A3B8;
  --color-theme-text-inverted:       #0F172A;
  --color-theme-border-default:      #1E293B;
  --color-theme-border-subtle:       #243244;

  /* ── Backward-compat aliases (existing components continue working) ── */
  --color-theme-base:         var(--color-theme-background-base);
  --color-theme-surface:      var(--color-theme-background-surface);
  --color-theme-card:         var(--color-theme-background-card);
  --color-theme-elevated:     var(--color-theme-background-elevated);
  --color-theme-accent:       var(--color-theme-brand-primary);
  --color-theme-accent-hover: var(--color-theme-brand-primaryHover);
  --color-theme-text:         var(--color-theme-text-default);
  --color-theme-text-dim:     var(--color-theme-text-dim);
  --color-theme-border:       var(--color-theme-border-default);
}
```

New Tailwind utility classes generated by the updated theme:
- `bg-theme-card` → `#1E293B`
- `bg-theme-elevated` → `#243244`
- `text-theme-primary` → `#DC2626`
- `bg-theme-success` → `#16A34A`
- `bg-theme-error` → `#EF4444`

---

### Button Component (`src/components/ui/Button.tsx`)

The existing Button is extended with the `success` and `ghost` variants and updated to reference design system tokens. The `primary` variant changes from indigo to brand red.

**Props interface:**

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'success' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}
```

**Variant → class mapping:**

| Variant   | Background                     | Text    | Hover background         |
|-----------|-------------------------------|---------|--------------------------|
| primary   | `bg-theme-accent` (#DC2626)   | white   | `bg-theme-accent-hover`  |
| success   | `bg-[#16A34A]`               | white   | `bg-[#15803D]`           |
| secondary | `bg-theme-surface`           | default | `bg-theme-elevated`      |
| danger    | `bg-red-600`                 | white   | `bg-red-700`             |
| ghost     | transparent, no border       | default | `bg-theme-surface`       |
| outline   | transparent                  | default | `bg-theme-surface`       |

**Behavioral constraints:**
- Minimum height 36 px (`min-h-[36px]`), horizontal padding `px-4` (16 px).
- Border-radius `rounded-[8px]` (radius.md).
- `disabled` prop: `opacity-50 cursor-not-allowed`, variant color unchanged.
- `loading` prop: renders `<span className="animate-spin ..."/>` + `loadingText`, `pointer-events-none`.
- Hover transition: `transition-colors duration-150`.

---

### AppCard Component (`src/components/ui/Card.tsx`)

The existing Card is updated to use design system tokens. Key changes from the current implementation:

- Background: `bg-theme-card` (#1E293B) instead of `bg-theme-surface`.
- Border-radius: `rounded-[16px]` (radius.xl) instead of `rounded-xl` (12 px).
- Default shadow: `shadow-sm` (shadows.sm token value).
- `hoverable` prop: `hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`.
- `CardFooter`: `bg-theme-elevated` background.

**Sub-component spacing:**

| Sub-component    | Padding                 | Border                   |
|-----------------|-------------------------|--------------------------|
| CardHeader      | `p-4` or `p-5`          | `border-b border-theme-border` |
| CardContent     | `p-4` or `p-5`          | none                     |
| CardFooter      | `p-4`                   | `border-t border-theme-border` |

---

### DataTable Component (`src/components/shared/Table.tsx`)

The existing Table is upgraded. Key changes:

- **Sticky header**: `<thead>` rows get `sticky top-0 z-10 bg-theme-card`.
- **Zebra striping**: Odd rows `bg-theme-card`, even rows `bg-theme-surface`. Applied via `className` on `<tr>` elements or passed from parent via child row conventions. Since the Table renders `children` as `<tr>` elements, the striping is applied using CSS `[&>tbody>tr:nth-child(odd)]` selector on the table wrapper.
- **Header cells**: `text-xs font-semibold uppercase tracking-wider text-theme-text-dim`.
- **Row hover**: `hover:bg-theme-elevated transition-colors duration-150` on each `<tr>`.
- **Empty state**: Centered column, Lucide icon (`Inbox` from lucide-react), `text-sm font-semibold` primary message, `text-xs text-theme-text-dim` hint.
- **Loading state**: `animate-spin` circle + "Loading records..." label (replaces the emoji approach).
- **Pagination active page**: `bg-theme-accent text-white` (already done in existing code — kept and updated to use new token class).
- **Data cells**: `text-sm`.
- **Horizontal scroll wrapper**: `overflow-x-auto` on the scroll container.

---

### FilterBar Component (NEW: `src/components/shared/FilterBar.tsx`)

A new layout-only component that wraps filter controls.

```typescript
interface FilterBarProps {
  children: React.ReactNode;
  actions?: React.ReactNode; // right-aligned primary action buttons
  className?: string;
}
```

**Layout spec:**
- `flex flex-wrap gap-3 items-center p-3` — 12 px gap between controls.
- `bg-theme-surface border border-theme-border rounded-[12px]` (radius.lg).
- All direct child `<input>`, `<select>` wrappers constrained to `h-9` (36 px) via CSS child selector or by convention.
- `actions` slot: `ml-auto flex items-center gap-2` so buttons stay right-aligned on wide viewports.
- Below 1024 px: flex-wrap causes natural second-line wrapping; no overflow.

```tsx
export function FilterBar({ children, actions, className = '' }: FilterBarProps) {
  return (
    <div className={`flex flex-wrap gap-3 items-center p-3 bg-theme-surface border border-theme-border rounded-[12px] ${className}`}>
      {children}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

---

### AppSelect Component (`src/components/ui/Select.tsx`)

Key changes from the current implementation:

- Background: `bg-white text-gray-900` (white, not dark base).
- Border: `border border-gray-300` (light border color #D1D5DB).
- Focus ring: `focus:ring-2 focus:ring-[#DC2626]/30` (brand.primary at 30% opacity).
- Chevron icon: `ChevronDown` from `lucide-react` (replaces inline SVG).
- Height: `h-9` (36 px).
- Error state: `border-[#EF4444]` + error message in `text-xs text-[#EF4444]`.
- Option elements: `bg-white text-gray-900` (override browser default dark-mode option styling).

The `label` and `error` props are preserved. The dark background override (`bg-theme-base`) is removed for the select itself; only the option list stays white.

---

### AppDatePicker Component (NEW: `src/components/ui/DatePicker.tsx`)

A thin wrapper around `<input type="date">` / `<input type="datetime-local">` with design system styling.

```typescript
interface DatePickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  type?: 'date' | 'datetime-local' | 'time';
}
```

**Visual spec:**
- `bg-white text-gray-900 border border-gray-300 rounded-[8px]` (radius.md).
- Height: `h-9` (36 px).
- Focus: `focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 transition-all duration-150`.
- Label: `text-xs font-semibold uppercase tracking-wider text-theme-text-dim`.
- Error: `border-[#EF4444]` + `text-xs text-[#EF4444]` below.

---

### FormField, Input, and TextArea (`src/components/ui/Input.tsx` + new `TextArea.tsx`)

**Input changes from current:**
- Background: `bg-theme-background-base` (unchanged — inputs stay dark unlike selects/pickers).
- Radius: `rounded-[12px]` (radius.lg).
- Padding: `px-3 py-2` (12 px horizontal, 8 px vertical).
- Focus ring: `focus:ring-2 focus:ring-[#DC2626]/30` (brand.primary, replacing indigo).
- Error: `border-[#EF4444] focus:ring-[#EF4444]/20` + error string in `text-xs text-[#EF4444]`.
- No hardcoded hex values — all colors via CSS variable tokens.

**TextArea** (`src/components/ui/TextArea.tsx`) — identical visual spec to Input:
- Same background, border, radius, padding, focus ring, error state.
- `min-h-[80px] resize-y`.

**FormField** (embedded in Input/Select/TextArea via `label` prop, or standalone wrapper):
- Label: `text-xs font-semibold uppercase tracking-wider text-theme-text-dim block mb-1.5`.

---

### Sidebar (`src/components/Sidebar.tsx`)

The Sidebar is incrementally updated. The existing flyout mega-menu and collapse/expand machinery are preserved.

**Width tokens:**
- Collapsed: `w-[64px]` (already correct in current code).
- Expanded: `w-[180px]` (already correct in current code).

**Active item indicator change:**
- Current: `bg-gradient-to-r from-red-500/[.15] to-transparent` (subtle background tint).
- New: `border-l-[3px] border-[#DC2626] bg-theme-elevated` — 3 px left-border accent, `bg-theme-elevated` background. No full red fill.
- Hover on all items (including active): `bg-theme-elevated transition-colors duration-150`.

**Flyout mega-menu:**
- Background: `bg-theme-surface/95 backdrop-blur-[16px]` (minimum 16 px blur, already present in current code).
- Appears within 150 ms (already present via CSS `transition-all duration-300`).
- Disappears with 250 ms debounce (already present via `closeTimeoutRef`).

**Sidebar footer:**
- Displays: user avatar initials (circular, `w-9 h-9 rounded-full`), display name (`text-xs font-semibold`), role label (`text-[10px] text-theme-text-dim`).
- Current footer already has this structure; minor styling updates to use `rounded-full` for the avatar.

**Chevron icons:**
- Replace the `▶ / ◀ / ✕` text glyphs with Lucide icons: `ChevronRight`, `ChevronLeft`, `X`.
- Collapse/expand button: `ChevronLeft` / `ChevronRight`.
- Category expand arrow: `ChevronRight` with `rotate-90` when open.

**Mobile:**
- Below 1024 px: overlay hidden by default, shown via `sidebarOpen` state (already implemented).
- Auto-hide on navigation and outside click (already implemented via `setSidebarOpen(false)` in link onClick and `handleClickOutside`).

**Collapse/expand transition:**
- `transition-all duration-300` with `cubic-bezier(0.16, 1, 0.3, 1)` easing on `width`.

---

### TopNavbar (`src/components/MainHeader.tsx`)

Updates to the existing `MainHeader`:

- Height: `h-16` (already correct — 64 px).
- Sticky: `sticky top-0 z-[9999]` (already present).
- Background: `bg-theme-surface` (already correct).
- Bottom border: `border-b border-theme-border` (already present).
- Shadow: `shadow-sm` (already present).
- Left section: JMC logo + "VSWM - NAGAR NIGAM JAIPUR" + subtitle (already present).
- Online status: `text-[#16A34A]` (semantic.success) instead of `text-theme-accent`.
- User avatar: `w-9 h-9 rounded-full` (36 px diameter, already close to spec).

---

### PageHeader (`src/components/shared/PageHeader.tsx`)

Updates:
- `<h1>`: `text-3xl font-extrabold` (changed from `text-xl sm:text-2xl`).
- Breadcrumbs: `text-xs font-semibold uppercase tracking-wider` (already present).
- Description: `text-sm text-theme-text-dim` (changed from `text-xs`).

---

### CrudDirectory (`src/components/shared/CrudDirectory.tsx`)

Updates aligned to design system:

| Element                  | Current variant | New variant   |
|--------------------------|----------------|---------------|
| Form submit Button       | `accent`       | `success`     |
| Cancel/Close Button      | `outline`      | `outline`     |
| Add/Open Button (header) | `primary`      | `primary`     |

- Form panel container: `AppCard` (already using Card).
- List panel container: `AppCard` (already using Card).
- Search input: `Input` component (already used).
- Table: passes `tableHeaders` and row children to `DataTable` (already done).
- Form panel open animation: `animate-fade-in` (already present); transition duration set to 200 ms.

---

## Data Models

The design system itself exports typed token objects. The key data shapes are:

```typescript
// colors.ts — enforced via `as const` for literal type inference
type BackgroundGroup = { base: string; surface: string; card: string; elevated: string };
type BrandGroup      = { primary: string; primaryHover: string; primaryLight: string };
type SemanticGroup   = { success: string; warning: string; error: string; info: string };
type TextGroup       = { default: string; dim: string; inverted: string };
type BorderGroup     = { default: string; subtle: string };

// spacing.ts
type SpacingScale = Record<0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16, string>;

// typography.ts
type TypographyToken = { fontSize: string; lineHeight: string; fontWeight: string };
type TypographyScale = {
  pageTitle: TypographyToken; sectionTitle: TypographyToken; cardTitle: TypographyToken;
  body: TypographyToken; label: TypographyToken;
};

// shadows.ts
type ShadowScale = { none: string; sm: string; md: string; lg: string };

// radius.ts
type RadiusScale = { sm: string; md: string; lg: string; xl: string; full: string };
```

These `as const` assertions mean TypeScript will error if a component references `colors.background.nonexistent` or `radius.xxl` — satisfying Requirements 1.7 and 1.8.

### Component Props Summary

| Component       | Key Props                                                     | Source File                             |
|----------------|---------------------------------------------------------------|-----------------------------------------|
| Button          | `variant`, `size`, `loading`, `loadingText`, `disabled`       | `src/components/ui/Button.tsx`          |
| Card / sub-cmps | `hoverable`, `className`                                      | `src/components/ui/Card.tsx`            |
| DataTable       | `headers`, `isLoading`, `emptyState`, `itemsPerPage`, `paginate` | `src/components/shared/Table.tsx`    |
| FilterBar       | `children`, `actions`, `className`                            | `src/components/shared/FilterBar.tsx`   |
| AppSelect       | `label`, `error`, `options`, `children`                       | `src/components/ui/Select.tsx`          |
| AppDatePicker   | `label`, `error`, `type`                                      | `src/components/ui/DatePicker.tsx`      |
| Input           | `label`, `error`, `type`                                      | `src/components/ui/Input.tsx`           |
| TextArea        | `label`, `error`, `minRows`                                   | `src/components/ui/TextArea.tsx`        |
| PageHeader      | `title`, `description`, `breadcrumbs`, `actions`             | `src/components/shared/PageHeader.tsx`  |
| CrudDirectory   | (existing props, no changes)                                  | `src/components/shared/CrudDirectory.tsx` |

---

## Screen-Level Migration Approach

### Dashboard Screen (`src/app/page.tsx`)

**Current issues:**
- `StatCard` in `src/components/dashboard/StatCard.tsx` uses `bg-white border-slate-200 text-slate-*` — hardcoded light-theme classes.
- `DashboardGrid` uses `bg-slate-50/50 border-slate-200` — hardcoded.

**Migration steps:**
1. **StatCard migration** (must complete before Dashboard renders):
   - Replace `bg-white` → `bg-theme-card`.
   - Replace `border-slate-200` → `border-theme-border`.
   - Replace `text-slate-900` → `text-theme-text`.
   - Replace `text-slate-500` → `text-theme-text-dim`.
   - Icon accent colors: use `text-[#16A34A]` (success) for positive metrics, `text-[#F59E0B]` (warning) for caution.
   - `accentColor` prop: map `emerald` → `text-[#16A34A]`, `amber` → `text-[#F59E0B]`, `blue` → `text-[#06B6D4]`, `slate` → `text-theme-text-dim`.
2. **DashboardGrid migration**:
   - Replace `bg-slate-50/50` → `bg-theme-base`.
   - Replace `border-slate-200` → `border-theme-border`.
3. **KPI stat value**: apply `text-4xl font-extrabold` (already present in StatCard via `text-4xl font-extrabold text-slate-900`).
4. **Layout**: 3-column KPI row preserved; no structural changes to grid layout.

### Playback Screen (`src/app/playback/page.tsx`)

**Migration steps:**
1. Wrap all filter controls (date picker, vehicle selector, route selector) in a `FilterBar` component.
2. Replace native `<select>` and `<input type="date">` with `AppSelect` and `AppDatePicker`.
3. Wrap playback controls (Play, Pause, Replay, Speed) in a `div` styled as a secondary toolbar below the FilterBar.
4. Active/pressed playback buttons: apply `bg-theme-accent text-white` via `primary` Button variant.
5. No changes to playback state logic, map rendering, or API calls.

### Reports Screen (`src/app/reports/page.tsx`)

**Migration steps:**
1. Wrap filter row in `FilterBar`, action buttons (`actions` prop) for Load / Recalculate.
2. Replace native selects and date inputs with `AppSelect` / `AppDatePicker`.
3. Wrap data display in `DataTable` (if using a custom table, migrate to shared `Table.tsx`).
4. Apply typography scale to column headers and cell data (already present in `Table.tsx`).
5. No changes to filter state, data fetching, or column definitions.

### Vehicle Management Screen (`src/app/vehicles/page.tsx`)

**Migration steps:**
1. Ensure vehicle list uses the shared `DataTable` component.
2. Wrap list container in `AppCard`.
3. Add `PageHeader` with title, breadcrumbs, and add-button action.
4. Migrate add/edit form to use `FormField` + `AppSelect` + `Input`.
5. No changes to vehicle data fetching or form submission logic.

### VSWM CRUD Pages (`src/app/vswm/*/page.tsx`)

All CRUD pages already use `CrudDirectory`. The shell migration (Requirement 19) is applied at the `CrudDirectory` level only — updating Button variants and ensuring AppCard usage. Individual page files require no changes.

---

## Animation and Transition Strategy

All transitions use CSS `transition` properties exclusively. JavaScript animation libraries are not introduced.

| Interaction                         | Duration | Easing                          | Property          |
|------------------------------------|----------|---------------------------------|-------------------|
| Button hover (color)               | 150 ms   | `ease-in-out`                   | `background-color`, `color` |
| Card hover (shadow + translate)    | 200 ms   | `ease-in-out`                   | `box-shadow`, `transform` |
| Row hover (background)             | 150 ms   | `ease-in-out`                   | `background-color` |
| Input / Select focus ring          | 150 ms   | `ease-in-out`                   | `box-shadow`      |
| Sidebar collapse / expand          | 300 ms   | `cubic-bezier(0.16, 1, 0.3, 1)` | `width`           |
| Sidebar flyout appear              | 150 ms   | `ease-out`                      | `opacity`, `transform` |
| Sidebar flyout disappear           | 250 ms debounce | `ease-in`               | `opacity`, `transform` |
| CrudDirectory form panel open      | 200 ms   | `ease-out`                      | `opacity` (`animate-fade-in`) |
| Page route transition              | —        | —                               | Handled by Next.js; no custom animation added |

**Prohibited animations:**
- No `box-shadow: 0 0 N px color` neon glow effects.
- No `backdrop-filter: blur` on primary page surfaces (only allowed on flyout mega-menu and mobile overlay).
- No animation durations > 300 ms for interactive states.
- No flash or strobe effects.

The `animate-fade-in` keyframe is added to `globals.css`:
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.2s ease-out forwards;
}
```

The existing `animate-slide-in` (sidebar) is updated to use the specified easing:
```css
@keyframes slideIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
.animate-slide-in {
  animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

---

## Responsive Layout Approach

The application targets enterprise desktop resolutions: 1366×768, 1440×900, 1920×1080. Mobile support is limited to the sidebar overlay pattern (≥1024 px: sidebar always visible; <1024 px: sidebar hidden by default).

### Breakpoint Strategy

| Breakpoint | Behavior                                                       |
|------------|---------------------------------------------------------------|
| < 768 px   | Not a primary target; Sidebar hidden, single-column layout    |
| 768–1023 px | MobileHeader shown, Sidebar in overlay mode                  |
| ≥ 1024 px  | Desktop layout: Sidebar always visible, FilterBar single-row |
| ≥ 1280 px  | FilterBar stays single-row                                    |
| ≥ 1366 px  | Primary target: all content fits without horizontal scroll    |

### Layout Shell

```
html, body { height: 100%; overflow: hidden; }  (already present)

.flex h-screen overflow-hidden
├── Sidebar (fixed width: 64px or 180px)
└── .flex-1 flex flex-col min-w-0 overflow-hidden
    ├── MainHeader (h-16, sticky)
    └── main .flex-1 flex flex-col min-h-0 overflow-y-auto
```

The `min-w-0` on the flex child prevents content from pushing the layout wider than the viewport — this is the primary mechanism preventing horizontal scroll at 1366 px.

### FilterBar Responsive Rules

- `flex flex-wrap gap-3`: allows wrapping at narrow viewports.
- Individual filter controls have `min-w-[120px] max-w-[200px]` to prevent them from collapsing too small.
- At ≥ 1280 px: most filter bars naturally fit on one row given the available content area (1366 − 180 sidebar − 48 padding = ~1138 px usable).

### DataTable Overflow

- Table wrapper: `overflow-x-auto` — wide tables scroll horizontally rather than breaking page layout.
- The outer Card container clips at its boundary; content area scrolls inside.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

This feature is primarily visual and structural. Property-based testing applies to the pure logic layers: token value computations, component variant rendering, form error propagation, and pagination arithmetic. UI layout, CSS transitions, and screen-level migration are tested via example-based snapshot or integration tests.

The project already has `fast-check` (^3.23.2) and `vitest` (^2.1.9) installed, making them the natural PBT pair.

---

**Property Reflection:** Before finalizing, reviewing for redundancy:

- Property 1 (spacing formula) is unique.
- Properties 4 (Input error) and 5 (Select error) both test "error string is rendered" for different components — kept separate since they test different components.
- Property 2 (Button no-throw) and Property 3 (Button variant classes) are complementary and non-redundant — Property 3 tests correct output, Property 2 tests absence of runtime errors.
- Property 6 (pagination entry count) is unique.
- Property 7 (Card hoverable classes) is unique.

Final set: 7 properties (spacing formula, button no-throw, button variant, input error, select error, pagination summary, card hoverable).

---

### Property 1: Spacing scale follows the 4 px base unit formula

*For any* integer key `k` in the range [0, 16], the value `spacing[k]` shall equal `(k * 0.25) + "rem"` — that is, exactly 4 px per unit expressed as a rem value assuming 16 px root font size.

**Validates: Requirements 1.2**

---

### Property 2: Button renders without throwing for any variant string

*For any* string value passed as the `variant` prop to the Button component, the component shall render without throwing a runtime error or returning null.

**Validates: Requirements 5.1, 19.8**

---

### Property 3: Button applies variant-specific classes for all valid variants

*For any* variant name in the set `['primary', 'success', 'secondary', 'danger', 'ghost', 'outline']`, rendering the Button component with that variant shall produce a className string that contains the expected background-color class for that variant.

**Validates: Requirements 5.1, 5.2**

---

### Property 4: Input error prop propagates to rendered output

*For any* non-empty string `errorMessage` passed as the `error` prop to the Input component, the rendered output shall contain a text node whose content includes `errorMessage`, and the input element's className shall include a red border indicator class.

**Validates: Requirements 11.5**

---

### Property 5: Select (AppSelect) error prop propagates to rendered output

*For any* non-empty string `errorMessage` passed as the `error` prop to the AppSelect component, the rendered output shall contain a text node whose content includes `errorMessage`, and the select element's className shall include a red border indicator class.

**Validates: Requirements 9.6**

---

### Property 6: DataTable pagination entry count is correct for any dataset size

*For any* array of `n` items where `n > itemsPerPage` and `itemsPerPage > 0`, and for any valid `currentPage` in `[1, ceil(n / itemsPerPage)]`, the pagination summary text shall read "Showing X to Y of n entries" where `X = (currentPage - 1) * itemsPerPage + 1` and `Y = min(currentPage * itemsPerPage, n)`.

**Validates: Requirements 7.8**

---

### Property 7: AppCard hoverable prop controls elevation classes

*For any* boolean value of the `hoverable` prop passed to the Card component, rendering with `hoverable=true` shall produce a className string containing hover shadow and translate classes, and rendering with `hoverable=false` shall produce a className string that does not contain those hover classes.

**Validates: Requirements 6.3**

---

## Error Handling

Since this is a visual-only refactor, "errors" in scope are:

### Token Reference Errors

- TypeScript `as const` on all token objects means invalid key access produces a compile-time type error.
- `tsc --noEmit` in CI catches these before runtime.

### Missing Token Class Errors

- If a Tailwind utility class references a CSS variable that doesn't exist, the class silently produces no styling (browser behavior). Mitigation: the full `@theme` block is declared before any component migration.
- The backward-compat alias layer ensures existing `bg-theme-surface` / `bg-theme-base` classes keep working during the incremental migration.

### Component Prop Errors

- `Button` with an unrecognized `variant` value: the component falls back to `primary` styling (or the provided variant string simply finds no matching entry in the variants map, producing no extra classes). The component must not throw — this is enforced by Property 2.
- `DataTable` with empty `headers`: renders an empty header row (no crash).
- `FilterBar` with no `children`: renders an empty bar (no crash).

### Build-Time Safety

- `next build` must succeed with zero TypeScript errors introduced by the redesign.
- Existing TypeScript errors from unrelated code are tracked separately (Requirement 22.6).
- The redesign does not modify any API call signatures, route paths, form handlers, or permission logic.

---

## Testing Strategy

### Overview

This is a visual refactor with no new business logic. The testing strategy is:

1. **Unit/example tests** — verify specific component rendering (variants, error states, loading states, empty states).
2. **Property-based tests** — verify universal invariants across generated inputs (spacing formula, error propagation, pagination arithmetic, variant safety).
3. **TypeScript compilation** — validates token type safety and prop contracts at build time.
4. **Manual visual review** — layouts, transitions, and responsive behavior at 1366/1440/1920 px.

Snapshot tests are explicitly **not** added for this refactor — they would need to be rewritten for every visual change and provide low value during active migration.

---

### Property-Based Testing

**Library**: `fast-check` (already installed).
**Runner**: `vitest --run` (already installed).
**Minimum iterations**: 100 per property test.

Tests live in `src/design-system/__tests__/` and `src/components/**/__tests__/`.

**Tag format**: `// Feature: vswm-ui-modernization, Property {N}: {property_text}`

#### Test file: `src/design-system/__tests__/spacing.test.ts`

```typescript
// Feature: vswm-ui-modernization, Property 1: Spacing scale follows the 4px base unit formula
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { spacing } from '../spacing';

describe('spacing scale', () => {
  it('every key k in [0,16] maps to k*0.25 + "rem"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 16 }), (k) => {
        expect(spacing[k]).toBe(`${k * 0.25}rem`);
      }),
      { numRuns: 100 }
    );
  });
});
```

#### Test file: `src/components/ui/__tests__/Button.test.tsx`

```typescript
// Feature: vswm-ui-modernization, Property 2: Button renders without throwing for any variant string
// Feature: vswm-ui-modernization, Property 3: Button applies variant-specific classes for all valid variants
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import Button from '../Button';

const VALID_VARIANTS = ['primary', 'success', 'secondary', 'danger', 'ghost', 'outline'] as const;

describe('Button', () => {
  it('renders without throwing for any string variant', () => {
    fc.assert(
      fc.property(fc.string(), (variant) => {
        expect(() => render(<Button variant={variant as any}>label</Button>)).not.toThrow();
      }),
      { numRuns: 100 }
    );
  });

  it('applies correct background class for each valid variant', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VALID_VARIANTS), (variant) => {
        const { container } = render(<Button variant={variant}>label</Button>);
        const btn = container.querySelector('button')!;
        // Each variant has a known class; check it's present
        expect(btn.className.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
```

#### Test file: `src/components/ui/__tests__/Input.test.tsx`

```typescript
// Feature: vswm-ui-modernization, Property 4: Input error prop propagates to rendered output
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import Input from '../Input';

describe('Input', () => {
  it('renders error message for any non-empty error string', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (errorMessage) => {
        const { getByText } = render(<Input error={errorMessage} />);
        expect(getByText(errorMessage, { exact: false })).toBeTruthy();
      }),
      { numRuns: 100 }
    );
  });
});
```

#### Test file: `src/components/ui/__tests__/Select.test.tsx`

```typescript
// Feature: vswm-ui-modernization, Property 5: Select error prop propagates to rendered output
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import Select from '../Select';

describe('AppSelect', () => {
  it('renders error message for any non-empty error string', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (errorMessage) => {
        const { getByText } = render(<Select error={errorMessage} />);
        expect(getByText(errorMessage, { exact: false })).toBeTruthy();
      }),
      { numRuns: 100 }
    );
  });
});
```

#### Test file: `src/components/shared/__tests__/Table.test.tsx`

```typescript
// Feature: vswm-ui-modernization, Property 6: DataTable pagination entry count is correct
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Pure function extracted from Table.tsx for testability
function paginationSummary(n: number, itemsPerPage: number, currentPage: number): string {
  const x = (currentPage - 1) * itemsPerPage + 1;
  const y = Math.min(currentPage * itemsPerPage, n);
  return `Showing ${x} to ${y} of ${n} entries`;
}

describe('pagination summary', () => {
  it('computes correct entry range for any valid n, itemsPerPage, currentPage', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 50 }),
        (n, itemsPerPage) => {
          const totalPages = Math.ceil(n / itemsPerPage);
          fc.pre(totalPages > 0);
          const currentPage = Math.ceil(Math.random() * totalPages) || 1;
          const summary = paginationSummary(n, itemsPerPage, currentPage);
          const expected_x = (currentPage - 1) * itemsPerPage + 1;
          const expected_y = Math.min(currentPage * itemsPerPage, n);
          expect(summary).toContain(`Showing ${expected_x} to ${expected_y} of ${n} entries`);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

#### Test file: `src/components/ui/__tests__/Card.test.tsx`

```typescript
// Feature: vswm-ui-modernization, Property 7: AppCard hoverable prop controls elevation classes
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import { Card } from '../Card';

describe('Card', () => {
  it('hoverable=true includes hover shadow/translate classes', () => {
    fc.assert(
      fc.property(fc.boolean(), (hoverable) => {
        const { container } = render(<Card hoverable={hoverable}>content</Card>);
        const div = container.firstChild as HTMLElement;
        const hasHoverClasses = div.className.includes('hover:shadow') || div.className.includes('hover:-translate');
        expect(hasHoverClasses).toBe(hoverable);
      }),
      { numRuns: 100 }
    );
  });
});
```

---

### Unit / Example Tests

| Component       | Test case                                        | Type    |
|----------------|--------------------------------------------------|---------|
| colors.ts       | Each token group and hex value matches spec      | Example |
| typography.ts   | Each named token has correct fontSize/weight     | Example |
| shadows.ts      | All four elevation levels are non-empty strings  | Example |
| radius.ts       | sm=6px, md=8px, lg=12px, xl=16px, full=9999px   | Example |
| tokens.ts       | All five sub-modules are re-exported             | Example |
| Button          | disabled=true renders opacity-50                 | Example |
| Button          | loading=true renders spinner + loadingText       | Example |
| DataTable       | isLoading=true shows spinner, not empty state    | Example |
| DataTable       | empty + isLoading=false shows empty state        | Example |
| MainHeader      | Online status renders in success color class     | Example |
| Sidebar         | Active item has border-l class, not full bg fill | Example |

---

### TypeScript Compilation Check

Run as part of CI (`next build` or `tsc --noEmit`):
- Verifies `as const` token types prevent invalid key access.
- Verifies component prop interfaces are satisfied by all usages.
- Requirement 22.6: build must produce zero TypeScript errors from redesign changes.

---

### Manual Visual QA Checklist

- [ ] Dashboard at 1366×768, 1440×900, 1920×1080 — no horizontal scroll
- [ ] Sidebar collapse/expand animation smooth at 300 ms
- [ ] Flyout mega-menu appears/disappears within spec timings
- [ ] All dropdowns / selects / date pickers show white background
- [ ] Button variants visually correct (primary=red, success=green, etc.)
- [ ] Active sidebar item shows 3 px left-border, not full red background
- [ ] FilterBar wraps on narrow viewports
- [ ] DataTable horizontal scroll on overflow
- [ ] StatCard — dark theme, no white background visible
