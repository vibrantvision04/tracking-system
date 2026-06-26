# Implementation Plan: Mobile App UI Redesign

## Overview

This plan implements the SWIFT mobile app UI redesign in a dependency-driven order: foundation (theme + i18n) first, then the reusable component library, then screen redesigns and flows, and finally global wiring. Tasks are structured for maximum parallelism within each layer.

## Tasks

- [x] 1. Foundation: Theme Module
  - [x] 1.1 Create the theme token module at `mobile/src/theme/theme.ts`
    - Define the full `theme` object with `colors`, `typography`, `spacing`, `borderRadius`, and `sizes` sections exactly as specified in the design document
    - Export the `Theme` type and utility types (`ColorToken`, `SpacingToken`, `BorderRadiusToken`, `SizeToken`)
    - Ensure all color values, font sizes, spacing multiples, and size constants match the design spec
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 5.2_

  - [x] 1.2 Write unit tests for theme token values
    - Verify each color, spacing, border radius, and size token matches its specified value
    - Verify WCAG contrast ratio >= 4.5:1 for textDark on surface and textDark on background
    - Create test file at `mobile/__tests__/theme/theme.test.ts`
    - _Requirements: 1.6, 5.4_

- [x] 2. Foundation: Internationalization System
  - [x] 2.1 Create the LanguageContext provider at `mobile/src/i18n/LanguageContext.tsx`
    - Implement `LanguageProvider` with state for `'hi' | 'en'`, defaulting to `'hi'`
    - Load persisted language from AsyncStorage on mount (key: `iswm_language_preference`)
    - Implement `setLanguage` that updates state and persists to AsyncStorage (non-blocking on failure)
    - Implement `t(key)` function with fallback chain: selected language → English → raw key
    - Render `null` until persisted preference is loaded (prevent flash of wrong language)
    - Export `useLanguage` hook
    - _Requirements: 3.1, 3.3, 3.4, 3.7, 3.8, 14.3, 14.4, 14.5_

  - [x] 2.2 Create the `useTranslation` hook at `mobile/src/i18n/useTranslation.ts`
    - Re-export `t`, `language`, and `setLanguage` from `useLanguage`
    - _Requirements: 3.2_

  - [x] 2.3 Create English translation file at `mobile/src/i18n/en.json`
    - Include all translation keys covering: login, home (greeting, status, menu cards), punch-in flow (steps, errors, success), alerts, coverage, supervisor, zone manager, offline banner, and common strings
    - Follow the naming convention `{screen}.{section}.{element}`
    - _Requirements: 3.2, 3.6_

  - [x] 2.4 Create Hindi translation file at `mobile/src/i18n/hi.json`
    - Translate all keys from en.json to Hindi
    - Cover Login, Home screens, Punch In flow, Alerts, Coverage, system dialogs, and common strings
    - Ensure no screen would display a mixture of both languages
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.5 Write property tests for translation system (P1, P2, P3)
    - **Property 1: Translation Completeness** — For any key referenced in the app, `t(key)` never returns the raw key itself in either language mode
    - **Validates: Requirements 3.2**
    - **Property 2: Language Persistence Round-Trip** — `setLanguage(lang)` followed by AsyncStorage read returns the same value
    - **Validates: Requirements 3.3, 14.3**
    - **Property 3: English Fallback** — For keys missing in Hindi, `t(key)` with language 'hi' returns the English value
    - **Validates: Requirements 3.7, 4.6**
    - Create test file at `mobile/__tests__/i18n/translation.property.test.ts` using fast-check
    - _Requirements: 3.2, 3.3, 3.7, 4.6, 14.3_

- [x] 3. Checkpoint – Foundation verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Component Library: Core UI Components
  - [x] 4.1 Create Button component at `mobile/src/components/ui/Button.tsx`
    - Implement `primary`, `secondary`, and `danger` variants with theme tokens
    - Primary: emerald bg, white text, 56px height, 12px radius
    - Pressed state: shift to primaryHover with opacity 0.9 within 100ms
    - Disabled state: 50% opacity, non-interactive
    - Loading state: show ActivityIndicator, disable press
    - _Requirements: 2.1, 5.2, 5.7_

  - [x] 4.2 Create Card component at `mobile/src/components/ui/Card.tsx`
    - White background, 1px border (#E2E8F0), 8px radius, elevation 2
    - Support `highlighted` prop (emerald accent left border)
    - Support `dimmed` prop (40% opacity for locked state)
    - Minimum height 120px for navigation cards
    - Press feedback within 100ms (opacity change)
    - _Requirements: 2.2, 5.1, 5.5, 5.7, 7.4_

  - [x] 4.3 Create Input component at `mobile/src/components/ui/Input.tsx`
    - 56px height, 12px border radius, 16px horizontal padding, 16px font size
    - Label above in secondary font (14px, textDim color)
    - Error state: red border + error message below
    - Support `maxLength`, `secureTextEntry`, `keyboardType` props
    - _Requirements: 2.3, 5.3, 6.2_

  - [x] 4.4 Create Header component at `mobile/src/components/ui/Header.tsx`
    - Fixed 56px height, white background, 1px bottom border
    - Back arrow with 48x48 touch target (shown when `showBack` is true)
    - Title in heading typography, truncated with ellipsis
    - Maximum 2 right-side action buttons, each 48x48 touch target
    - _Requirements: 2.5, 12.1, 12.2, 12.4_

  - [x] 4.5 Create StatusBanner component at `mobile/src/components/ui/StatusBanner.tsx`
    - Support `success`, `warning`, `error`, and `info` variants
    - Success: primaryLight bg; Warning: warningLight bg; Error: errorLight bg
    - Padding: 12px vertical, 16px horizontal
    - _Requirements: 2.4_

  - [x] 4.6 Create LanguageToggle component at `mobile/src/components/ui/LanguageToggle.tsx`
    - Segmented control with "हिंदी" and "English" labels
    - Active: emerald bg (#10B981), white text; Inactive: transparent bg, dark text
    - Minimum 48x48 touch target per segment
    - Calls `setLanguage()` from LanguageContext on tap
    - Support `compact` prop for header placement
    - _Requirements: 3.5, 14.1, 14.2_

  - [x] 4.7 Write property test for Button height (P5)
    - **Property 5: Primary Button Height Minimum** — For any text string (varying lengths, Hindi or English), primary Button height >= 56dp
    - **Validates: Requirements 5.2**
    - Create test file at `mobile/__tests__/components/Button.property.test.tsx` using fast-check
    - _Requirements: 5.2_

  - [x] 4.8 Write property test for Input maxLength enforcement (P6)
    - **Property 6: Input MaxLength Enforcement** — For any string with specified maxLength, stored value length <= maxLength
    - **Validates: Requirements 6.2**
    - Create test file at `mobile/__tests__/components/Input.property.test.tsx` using fast-check
    - _Requirements: 6.2_

  - [x] 4.9 Write property test for touch target minimum size (P4)
    - **Property 4: Touch Target Minimum Size** — For any interactive component (Button, Card with onPress, LanguageToggle segment, Header action), computed touchable area >= 48x48dp
    - **Validates: Requirements 5.1**
    - Create test file at `mobile/__tests__/components/TouchTarget.property.test.tsx` using fast-check
    - _Requirements: 5.1_

- [x] 5. Checkpoint – Component library verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Screen Redesigns: Login Screen
  - [x] 6.1 Redesign LoginScreen at `mobile/src/screens/auth/LoginScreen.tsx`
    - Replace existing styling with theme tokens throughout
    - Add LanguageToggle in header area (visible before login)
    - Display JMC logo, "SWIFT" title, subtitle using emerald theme
    - Employee ID input (maxLength 20) and Password input (maxLength 64) using the new Input component (56px height, 16px font)
    - All labels and placeholders use `t()` for localization
    - Primary Sign In button using new Button component (emerald, 56px, bold white text)
    - Empty field validation: highlight with red border + localized message, prevent submission
    - Login error handling: red error banner with localized messages (invalid credentials, network error, timeout)
    - Loading state: disable button + loading indicator; 30s timeout re-enables button
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 6.2 Write unit tests for LoginScreen
    - Test rendering with theme styling applied
    - Test empty field validation (red border, localized message)
    - Test error banner display for invalid credentials, network error, timeout
    - Test loading state (button disabled, indicator shown)
    - Test language toggle changes labels/placeholders
    - Create test file at `mobile/__tests__/screens/LoginScreen.test.tsx`
    - _Requirements: 6.2, 6.5, 6.6, 6.7_

- [x] 7. Screen Redesigns: Driver Home Screen
  - [x] 7.1 Redesign Driver HomeScreen at `mobile/src/screens/driver/HomeScreen.tsx`
    - Header with driver name (20px bold), time-based greeting in selected language, logout button (48x48 touch target)
    - Punch status banner: emerald-light when punched in, amber-light when not punched in, localized text
    - Alert banner (error-red) showing unacknowledged alert count when applicable
    - 2-column navigation grid with 7 cards (Punch In, Alerts, Coverage, Route Map, Blockage Report, Live Tracking, Attendance): icon + title + subtitle in selected language, min 120px height, emerald accent on Punch In card
    - Dimmed state (40% opacity) for all cards except Punch In when not punched in, with localized restriction message
    - Tapping dimmed card shows inline localized message (no navigation)
    - Use new Card, Header, StatusBanner components with theme tokens
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 5.5, 5.6_

  - [x] 7.2 Write unit tests for Driver HomeScreen
    - Test punched-in vs not-punched-in rendering (banner color, card opacity)
    - Test dimmed card tap behavior (inline message, no navigation)
    - Test alert banner with count display
    - Test greeting based on time of day
    - Create test file at `mobile/__tests__/screens/DriverHome.test.tsx`
    - _Requirements: 7.2, 7.4, 7.5, 7.6_

- [x] 8. Screen Redesigns: Supervisor Home Screen
  - [x] 8.1 Redesign Supervisor HomeScreen at `mobile/src/screens/supervisor/HomeScreen.tsx`
    - Header with "Supervisor Control Panel" title in selected language, supervisor name, punch-out button (when applicable), logout button, each 48x48 touch target
    - Navigation cards for: Punch In, Mark Driver Attendance, Ward Coverage, Live Tracking, Blockage Approvals, Open Depot Reports, Ward Alerts, Complaints — each with icon, title, subtitle in selected language
    - White background cards, 8px radius, emerald accent on primary action card, min 120px height
    - Punch status banner matching Driver Home style (emerald/amber)
    - Use new Card, Header, StatusBanner components
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 9. Screen Redesigns: Zone Manager Home Screen
  - [x] 9.1 Redesign Zone Manager HomeScreen at `mobile/src/screens/zone_manager/HomeScreen.tsx`
    - Header with "Zone Manager Panel" title in selected language, manager name, punch-out button (when applicable), logout button, each 48x48 touch target
    - Navigation cards for: Punch In, Zone Coverage, Live Tracking, Attendance Panel, Zone Alerts, Complaints — each with icon, title, subtitle in selected language
    - Consistent Design_System styling with emerald accent on primary action card
    - Use new Card, Header, StatusBanner components
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 10. Flow Redesigns: Punch In Screen
  - [x] 10.1 Redesign Punch In flow screen
    - Implement 3-step indicator (GPS verification, Camera capture, Form confirmation): active step in emerald, completed steps with checkmark, upcoming steps muted, labels in selected language
    - GPS step: loading indicator with localized text; error if outside assigned ward (localized message with ward name, blocks progression)
    - Camera step: localized instruction for front-facing photo; retry prompts for each failure type (no face, too many faces, blurry, dark) with 56px retry button
    - Confirmation step: form inputs (56px, 16px font, localized labels)
    - Success state: emerald checkmark + congratulatory text in selected language, auto-navigate home within 3s
    - Primary action buttons: emerald bg, 56px height, bold 16px text in selected language
    - Use Header component with back button and LanguageToggle
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 10.2 Write property test for step indicator states (P7)
    - **Property 7: Step Indicator State Correctness** — For any currentStep (1, 2, 3): steps < current show completed, step == current shows active, steps > current show upcoming
    - **Validates: Requirements 10.1**
    - Create test file at `mobile/__tests__/screens/PunchInScreen.test.tsx` using fast-check
    - _Requirements: 10.1_

- [x] 11. Flow Redesigns: Alerts and Coverage Screens
  - [x] 11.1 Redesign Alerts screen
    - Alert items with colored severity indicators: error-red for critical, warning-amber for warnings, emerald for informational
    - All alert messages and status badges in selected language
    - Minimum 48px height per list item for easy tapping
    - Tap alert → show full details in modal/detail view with localized text
    - Use theme tokens and localization throughout
    - _Requirements: 11.1, 11.3, 11.4, 11.5_

  - [x] 11.2 Redesign Coverage screen
    - Coverage percentage in emerald for achieved targets, error-red for missed targets
    - All labels and status badges in selected language
    - Use theme tokens for consistent styling
    - _Requirements: 11.2, 11.3_

- [x] 12. Global Features: Offline Banner and App Provider Setup
  - [x] 12.1 Create/modify OfflineBanner component at `mobile/src/components/OfflineBanner.tsx`
    - Persistent amber banner at top when device has no connectivity
    - Localized offline status text using `t()`
    - Remove banner within 3 seconds of reconnection
    - Dim network-dependent action buttons when offline
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 12.2 Update App.tsx with LanguageProvider in the provider hierarchy
    - Insert LanguageProvider in the correct position: SafeAreaProvider → QueryClientProvider → AuthProvider → **LanguageProvider** → OfflineBanner → RootNavigator
    - Ensure OfflineBanner renders above the navigator and below LanguageProvider
    - _Requirements: 3.1, 3.3, 12.5_

- [x] 13. Screen Layout Consistency Pass
  - [x] 13.1 Apply standard screen layout pattern across all redesigned screens
    - Verify fixed 56px header (white bg, bottom border) on every screen
    - Verify scrollable content area with base background (#F3F4F6) and 16px padding
    - Verify bottom-anchored action area (16px padding) on screens with primary submit/confirm actions
    - Verify back navigation (48x48 touch target) on all non-Home screens
    - Verify header keeps fixed while content scrolls; bottom action stays fixed
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 14. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific UI rendering, styling, and interaction behaviors
- The theme module and i18n system (tasks 1-2) are the foundation; all subsequent tasks depend on them
- Component library (task 4) depends on the theme module but not on i18n (components receive translated text as props)
- Screen redesigns (tasks 6-11) depend on both the component library and i18n system
- The offline banner and App.tsx wiring (task 12) can be done in parallel with screen redesigns

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["2.5", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 4, "tasks": ["4.7", "4.8", "4.9", "12.1", "12.2"] },
    { "id": 5, "tasks": ["6.1", "7.1", "8.1", "9.1", "10.1", "11.1", "11.2"] },
    { "id": 6, "tasks": ["6.2", "7.2", "10.2", "13.1"] }
  ]
}
```
