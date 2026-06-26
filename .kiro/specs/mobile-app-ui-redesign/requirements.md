# Requirements Document

## Introduction

This document specifies the requirements for a comprehensive UI redesign of the SWIFT (Smart Waste Integrated Fleet Tracking) mobile application built with React Native (Expo). The redesign aligns the mobile app's visual identity with the web application's emerald/green theme, introduces bilingual support (Hindi and English), and optimizes the interface for non-tech-savvy field workers including older users. The app serves drivers, supervisors, zone managers, and open depot operators performing daily waste management operations in Jaipur.

## Glossary

- **Design_System**: The centralized theme module defining colors, typography, spacing, and component styles used consistently across all screens
- **Localization_Engine**: The internationalization (i18n) system that manages language translations and dynamic text switching between Hindi and English
- **Touch_Target**: An interactive UI element (button, card, input field) that users tap to perform an action
- **Screen**: A distinct view within the mobile application corresponding to a specific user workflow (e.g., Login, Home, PunchIn)
- **Field_Worker**: Municipal workers (drivers, supervisors, zone managers) who use the app daily for waste management operations
- **Emerald_Theme**: The color palette based on emerald/green (#10B981 primary, #059669 hover, #D1FAE5 light) matching the web application design language
- **Navigation_System**: The role-based stack navigation that routes users to their appropriate screens based on their assigned role
- **Accessibility_Standard**: The minimum usability criteria ensuring the app is operable by users with limited technical literacy or physical dexterity

## Requirements

### Requirement 1: Emerald Design System Foundation

**User Story:** As a field worker, I want the mobile app to have the same clean emerald/green visual identity as the web app, so that I experience a consistent brand across both platforms.

#### Acceptance Criteria

1. THE Design_System SHALL define a color palette with primary emerald (#10B981), primary hover (#059669), primary light (#D1FAE5), background base (#F3F4F6), surface white (#FFFFFF), text dark (#1E293B), text dim (#64748B), border default (#E2E8F0), success green (#16A34A), warning amber (#F59E0B), and error red (#EF4444)
2. THE Design_System SHALL define typography with a system default font family, font weights of 400 for body text and 600 for headings, a base font size of 16 density-independent pixels for body text, 20 density-independent pixels for headings, 12 density-independent pixels minimum for secondary text, and line heights of 1.5 for body text and 1.3 for headings
3. THE Design_System SHALL define spacing tokens with a base unit of 4 density-independent pixels, using multiples (8, 12, 16, 20, 24, 32) for consistent padding and margins
4. THE Design_System SHALL define border radius tokens of 8 density-independent pixels for cards, 12 density-independent pixels for buttons and inputs, and 16 density-independent pixels for modal containers
5. THE Design_System SHALL export all tokens as a single importable theme module that every screen and component references for color, typography, spacing, and border radius values
6. THE Design_System SHALL ensure that text dark (#1E293B) on surface white (#FFFFFF) and text dark (#1E293B) on background base (#F3F4F6) color combinations each meet a minimum contrast ratio of 4.5:1 per WCAG 2.1 Level AA

### Requirement 2: Emerald-Themed Component Library

**User Story:** As a field worker, I want all buttons, cards, inputs, and banners to follow the emerald design language, so that the app looks modern and consistent.

#### Acceptance Criteria

1. THE Design_System SHALL style primary action buttons with emerald (#10B981) background, white text, 12px border radius, and a minimum height of 56px
2. THE Design_System SHALL style card components with white background, 1px border in border-default color (#E2E8F0), 8px border radius, and subtle shadow (elevation 2)
3. THE Design_System SHALL style text input fields with a height of 56px, 12px border radius, 1px border in border-default color, and 16px horizontal padding
4. THE Design_System SHALL style status banners (punched-in, punched-out, alert) using emerald-light background for success states and amber-light background for warning states
5. THE Design_System SHALL style the header/app bar with white background, bottom border in border-default color, and emerald accent for active indicators
6. IF a component does not match the Design_System token definitions, THEN THE Design_System SHALL log a warning during development builds

### Requirement 3: Bilingual Localization System

**User Story:** As a field worker, I want to use the app in Hindi or English, so that I can understand all labels and instructions in my preferred language.

#### Acceptance Criteria

1. THE Localization_Engine SHALL support two languages: Hindi (hi) and English (en)
2. THE Localization_Engine SHALL store translation key-value pairs for all user-facing text strings across all screens, such that no screen displays untranslated keys or raw key identifiers to the user
3. WHEN the user selects a language preference, THE Localization_Engine SHALL persist the selection to device storage and re-render all visible text in the selected language within 2 seconds without requiring app restart
4. THE Localization_Engine SHALL default to Hindi (hi) as the initial language on first app launch
5. THE Localization_Engine SHALL provide a language toggle accessible from the Login screen and from every Home screen (Driver, Supervisor, Zone Manager)
6. THE Localization_Engine SHALL translate all labels, button text, status messages, error messages, alert content, and placeholder text, ensuring no screen contains a mixture of both languages simultaneously (except proper nouns or technical identifiers)
7. IF a translation key has no value defined for the currently selected language, THEN THE Localization_Engine SHALL display the English (en) translation as a fallback
8. IF persisting the language preference to device storage fails, THEN THE Localization_Engine SHALL apply the selected language for the current session and display a non-blocking notification indicating the preference was not saved and will need to be re-selected on next launch

### Requirement 4: Hindi Translation Coverage

**User Story:** As a Hindi-speaking field worker, I want every piece of text in the app translated accurately to Hindi, so that I never encounter English-only content when using Hindi mode.

#### Acceptance Criteria

1. THE Localization_Engine SHALL provide Hindi translations for the Login screen including field labels, placeholders, button text, and error messages
2. THE Localization_Engine SHALL provide Hindi translations for all Home screen elements including greeting text, menu card titles, menu card subtitles, and status banners
3. THE Localization_Engine SHALL provide Hindi translations for the Punch In flow including step instructions, button labels, form field labels, and success messages
4. THE Localization_Engine SHALL provide Hindi translations for Alerts, Coverage, Route Map, Blockage Report, Live Tracking, and Attendance screens
5. THE Localization_Engine SHALL provide Hindi translations for system dialogs including confirmation prompts, error alerts, and informational messages
6. WHEN a translation key is missing for the selected language, THE Localization_Engine SHALL fall back to the English translation for that key

### Requirement 5: Accessibility for Non-Tech-Savvy Users

**User Story:** As an older field worker with limited smartphone experience, I want large touch targets and simple layouts, so that I can use the app easily without mistakes.

#### Acceptance Criteria

1. THE Design_System SHALL enforce a minimum touch target size of 48x48 density-independent pixels for all interactive elements, with a minimum spacing of 8 density-independent pixels between adjacent interactive elements
2. THE Design_System SHALL enforce a minimum button height of 56 density-independent pixels for primary action buttons
3. THE Design_System SHALL enforce a minimum font size of 14px for secondary text (labels, captions, and supporting information) and 16px for primary content text (body paragraphs, button labels, card titles, and input field text)
4. THE Design_System SHALL maintain a color contrast ratio of at least 4.5:1 between text and background for all text elements
5. THE Design_System SHALL limit each screen to a maximum of 6 primary action cards in the navigation grid, and each card SHALL display both an icon and a text label in the selected language
6. THE Navigation_System SHALL use a single-level flat navigation structure within each role, avoiding nested menus deeper than one level
7. WHEN the user taps an interactive element, THE Design_System SHALL provide visual feedback (such as opacity change or background color shift) within 100 milliseconds to confirm the interaction was registered

### Requirement 6: Login Screen Redesign

**User Story:** As a field worker, I want the login screen to be simple, clearly branded with emerald theme, and available in Hindi, so that I can sign in quickly and confidently.

#### Acceptance Criteria

1. THE Screen SHALL display the Jaipur Municipal Corporation logo, "SWIFT" brand title, and subtitle using emerald-themed styling from the Design_System
2. THE Screen SHALL display input fields for Employee ID/Phone (maximum 20 characters) and Password (maximum 64 characters) with 56px height, 16px font size, and Hindi/English labels and placeholder text based on the selected language
3. THE Screen SHALL display a primary Sign In button with emerald background, minimum 56px height, and bold white text in the selected language
4. THE Screen SHALL display a language toggle (Hindi/English switch) in the header area, visible before login
5. IF login fails due to invalid credentials, network error, or server error, THEN THE Screen SHALL display an error banner with red background and error text in the selected language indicating the category of failure
6. WHILE the login request is in progress, THE Screen SHALL disable the Sign In button and display a loading indicator, and IF the login request does not receive a response within 30 seconds, THEN THE Screen SHALL re-enable the Sign In button and display a timeout error in the selected language
7. IF the user taps Sign In with either the Employee ID/Phone or Password field empty, THEN THE Screen SHALL highlight the empty field with an error-red border and display a validation message in the selected language without submitting the request

### Requirement 7: Driver Home Screen Redesign

**User Story:** As a driver, I want my home screen to show my status clearly and give me large, easy-to-tap menu cards for all my tasks, so that I can start working quickly.

#### Acceptance Criteria

1. THE Screen SHALL display a header with the driver's name in 20px bold text, a time-based greeting (morning, afternoon, evening) in the selected language, and a logout button with minimum 48x48px touch target
2. THE Screen SHALL display a punch status banner using emerald-light background when punched in and amber-light background when not punched in, with status text in the selected language
3. THE Screen SHALL display navigation cards for Punch In, Alerts, Coverage, Route Map, Blockage Report, Live Tracking, and Attendance in a 2-column grid with minimum 120px height, white background, emerald accent border for the primary action (Punch In), and icon + title + subtitle in the selected language
4. WHILE the driver is not punched in, THE Screen SHALL visually dim all navigation cards except Punch In with 40% opacity and display access restriction messaging on each dimmed card in the selected language
5. IF the driver taps a dimmed navigation card, THEN THE Screen SHALL display an inline message in the selected language indicating that punching in is required before accessing the feature, without navigating away from the home screen
6. IF unacknowledged alerts exist, THEN THE Screen SHALL display an alert banner in error-red color showing the count of unacknowledged alerts with text in the selected language

### Requirement 8: Supervisor Home Screen Redesign

**User Story:** As a supervisor, I want my control panel to show all management actions with clear icons and Hindi labels, so that I can oversee drivers and ward operations efficiently.

#### Acceptance Criteria

1. THE Screen SHALL display a header with "Supervisor Control Panel" title in the selected language, the supervisor's name, punch-out button (when applicable), and logout button, each with minimum 48x48px touch target
2. THE Screen SHALL display navigation cards for Punch In, Mark Driver Attendance, Ward Coverage, Live Tracking, Blockage Approvals, Open Depot Reports, Ward Alerts, and Complaints, each with icon, title, and subtitle in the selected language
3. THE Screen SHALL style all cards with white background, 8px border radius, emerald accent for the primary action card, and minimum 120px card height
4. THE Screen SHALL display the punch status banner using the same emerald/amber styling as the Driver Home screen

### Requirement 9: Zone Manager Home Screen Redesign

**User Story:** As a zone manager, I want my management panel to display zone-level operations with clear, large cards and Hindi labels, so that I can manage the entire zone effectively.

#### Acceptance Criteria

1. THE Screen SHALL display a header with "Zone Manager Panel" title in the selected language, the manager's name, punch-out button (when applicable), and logout button, each with minimum 48x48px touch target
2. THE Screen SHALL display navigation cards for Punch In, Zone Coverage, Live Tracking, Attendance Panel, Zone Alerts, and Complaints, each with icon, title, and subtitle in the selected language
3. THE Screen SHALL style all cards consistently with the Design_System tokens using emerald accent for the primary action card

### Requirement 10: Punch In Flow Redesign

**User Story:** As a field worker, I want the punch-in process to guide me step-by-step with large buttons and clear Hindi instructions, so that I complete attendance without confusion.

#### Acceptance Criteria

1. THE Screen SHALL display a step indicator showing three steps (GPS verification, Camera capture, Form confirmation) where the current step is highlighted with emerald color, completed steps display a checkmark icon, and upcoming steps are shown in muted style, with step labels in the selected language
2. THE Screen SHALL display primary action buttons with emerald background, minimum 56px height, and bold 16px text in the selected language
3. THE Screen SHALL display form input fields with 56px height, 16px font size, and labels in the selected language
4. WHILE GPS verification is in progress, THE Screen SHALL display a loading indicator with descriptive text in the selected language indicating location is being determined
5. WHEN GPS verification succeeds, THE Screen SHALL transition to the camera step displaying instructions to capture a front-facing photo in the selected language
6. IF GPS verification fails because the user is outside their assigned ward, THEN THE Screen SHALL display an error message in the selected language indicating the assigned ward name the user must move to, and SHALL prevent progression to the camera step
7. WHEN photo validation fails, THE Screen SHALL display a retry prompt in the selected language specifying the detected issue (no face detected, too many faces, blurry image, or insufficient lighting) and a retry button with minimum 56px height
8. WHEN punch-in submission succeeds, THE Screen SHALL display a success confirmation with emerald-themed checkmark icon and congratulatory text in the selected language, then navigate to the Home screen within 3 seconds

### Requirement 11: Alerts and Coverage Screens Redesign

**User Story:** As a field worker, I want alerts and coverage information displayed with clear color coding and Hindi text, so that I understand my performance and any issues immediately.

#### Acceptance Criteria

1. THE Screen SHALL display alert items with colored severity indicators: error-red for critical alerts, warning-amber for warnings, and emerald for informational notices
2. THE Screen SHALL display coverage percentage using emerald color for achieved targets and error-red for missed targets
3. THE Screen SHALL display all alert messages, coverage labels, and status badges in the selected language
4. THE Screen SHALL use minimum 48px height for each list item to ensure easy tapping
5. WHEN an alert is tapped, THE Screen SHALL display full alert details in a modal or detail view with text in the selected language

### Requirement 12: Consistent Screen Layout Pattern

**User Story:** As a field worker, I want all screens to follow the same layout pattern (header, content, actions), so that I always know where to look for information and buttons.

#### Acceptance Criteria

1. THE Design_System SHALL define a standard screen layout with: a fixed header of 56px height (white background, 1px bottom border in border-default color), a scrollable content area (base background #F3F4F6), and a bottom-anchored primary action area with 16px padding on screens that contain a primary submit or confirm action
2. THE Design_System SHALL define a standard header pattern with back navigation arrow (minimum 48x48px touch target) on the left, a screen title in the selected language (truncated with ellipsis if exceeding the available width), and a maximum of 2 right-side action buttons each with minimum 48x48px touch target
3. THE Design_System SHALL apply consistent padding of 16px horizontal and 16px vertical for content areas across all screens
4. THE Navigation_System SHALL provide a back navigation button on all screens except Home screens, with minimum 48x48px touch target
5. WHILE content in the scrollable area is being scrolled, THE Design_System SHALL keep the header fixed at the top of the viewport and the bottom action area (if present) fixed at the bottom of the viewport

### Requirement 13: Offline State Communication

**User Story:** As a field worker in areas with poor connectivity, I want clear visual feedback when the app is offline, so that I know my actions may not be saved immediately.

#### Acceptance Criteria

1. WHILE the device has no network connectivity, THE Screen SHALL display a persistent offline banner at the top of the screen with amber background and offline status text in the selected language
2. WHILE the device has no network connectivity, THE Design_System SHALL dim network-dependent action buttons to indicate unavailability
3. WHEN network connectivity is restored, THE Screen SHALL remove the offline banner and restore full interactivity within 3 seconds of reconnection

### Requirement 14: Language Toggle Interaction

**User Story:** As a field worker, I want to switch between Hindi and English at any time with a simple toggle, so that I can choose whatever language is comfortable for me in the moment.

#### Acceptance Criteria

1. THE Localization_Engine SHALL display the language toggle as a segmented control showing "हिंदी" and "English" options with the active selection highlighted in emerald (#10B981) background and white text, and the inactive option displayed with a transparent background and dark text
2. WHEN the user taps the language toggle, THE Localization_Engine SHALL switch all visible text on the current screen to the newly selected language within 200 milliseconds without requiring navigation away from the current screen or app restart
3. THE Localization_Engine SHALL persist the language selection to AsyncStorage after each toggle change and restore the persisted selection on app launch before rendering screen content
4. IF the persisted language preference cannot be read or is corrupted on app launch, THEN THE Localization_Engine SHALL default to Hindi (hi) and display the interface without showing an error to the user
5. IF persisting the language selection to AsyncStorage fails, THEN THE Localization_Engine SHALL still apply the selected language for the current session without interrupting the user
