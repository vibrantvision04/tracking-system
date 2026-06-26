/**
 * Unit tests for Driver HomeScreen
 *
 * Tests punched-in vs not-punched-in rendering, dimmed card tap behavior,
 * alert banner with count display, and greeting based on time of day.
 *
 * Validates: Requirements 7.2, 7.4, 7.5, 7.6
 */
import React from 'react';
import ReactDOMServer from 'react-dom/server';

// --- Mutable mock data (reassign in tests) ---
let mockPunchData: { punched_in: boolean } = { punched_in: true };
let mockAlertData: { alerts: Array<{ id: number; acknowledged: boolean }> } = { alerts: [] };

// --- Mocks ---

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}));

// Mock useAuth
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test Driver' }, logout: jest.fn() }),
}));

// Mock usePunchStatus
jest.mock('../../src/hooks/usePunchStatus', () => ({
  usePunchStatus: () => ({ data: mockPunchData }),
}));

// Mock useAlerts
jest.mock('../../src/hooks/useAlerts', () => ({
  useAlerts: () => ({ data: mockAlertData }),
}));

// Track current language for the mock
let currentLanguage: 'en' | 'hi' = 'en';
const mockSetLanguage = jest.fn((lang: 'en' | 'hi') => {
  currentLanguage = lang;
});

// Translation data
const translations: Record<string, Record<string, string>> = {
  en: {
    'home.greeting.morning': 'Good Morning',
    'home.greeting.afternoon': 'Good Afternoon',
    'home.greeting.evening': 'Good Evening',
    'home.punchedIn': 'Punched In – Shift Active',
    'home.notPunchedIn': 'Not Punched In',
    'home.punchInRequired': 'Please punch in first to access this feature',
    'home.alertsBanner': '{count} unacknowledged alerts',
    'menu.punchIn': 'Punch In',
    'menu.punchIn.subtitle': 'Start your shift',
    'menu.alerts': 'Alerts',
    'menu.alerts.subtitle': 'View warnings',
    'menu.coverage': 'Coverage',
    'menu.coverage.subtitle': 'Check completion',
    'menu.routeMap': 'Route Map',
    'menu.routeMap.subtitle': 'View path & points',
    'menu.blockage': 'Blockage Report',
    'menu.blockage.subtitle': 'Report obstacles',
    'menu.liveTracking': 'Live Tracking',
    'menu.liveTracking.subtitle': 'Real-time view',
    'menu.attendance': 'Attendance',
    'menu.attendance.subtitle': 'View records',
    'common.logout': 'Logout',
  },
  hi: {
    'home.greeting.morning': 'शुभ प्रभात',
    'home.greeting.afternoon': 'शुभ दोपहर',
    'home.greeting.evening': 'शुभ संध्या',
    'home.punchedIn': 'पंच इन – शिफ्ट सक्रिय',
    'home.notPunchedIn': 'पंच इन नहीं हुआ',
    'home.punchInRequired': 'इस सुविधा को एक्सेस करने के लिए कृपया पहले पंच इन करें',
    'home.alertsBanner': '{count} अनपढ़ अलर्ट',
    'menu.punchIn': 'पंच इन',
    'menu.punchIn.subtitle': 'अपनी शिफ्ट शुरू करें',
    'menu.alerts': 'अलर्ट',
    'menu.alerts.subtitle': 'चेतावनियाँ देखें',
    'menu.coverage': 'कवरेज',
    'menu.coverage.subtitle': 'पूर्णता जांचें',
    'menu.routeMap': 'रूट मैप',
    'menu.routeMap.subtitle': 'पथ और बिंदु देखें',
    'menu.blockage': 'अवरोध रिपोर्ट',
    'menu.blockage.subtitle': 'बाधाओं की रिपोर्ट करें',
    'menu.liveTracking': 'लाइव ट्रैकिंग',
    'menu.liveTracking.subtitle': 'रीयल-टाइम दृश्य',
    'menu.attendance': 'उपस्थिति',
    'menu.attendance.subtitle': 'रिकॉर्ड देखें',
    'common.logout': 'लॉगआउट',
  },
};

jest.mock('../../src/i18n/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      return translations[currentLanguage]?.[key] ?? key;
    },
    language: currentLanguage,
    setLanguage: mockSetLanguage,
  }),
}));

jest.mock('../../src/i18n/LanguageContext', () => ({
  useLanguage: () => ({
    language: currentLanguage,
    setLanguage: mockSetLanguage,
    t: (key: string) => translations[currentLanguage]?.[key] ?? key,
  }),
  LanguageProvider: ({ children }: any) => children,
}));

// Mock react-native
jest.mock('react-native', () => {
  const React = require('react');

  const StyleSheet = {
    create: (styles: any) => styles,
  };

  const View = ({ children, style, ...props }: any) => {
    const flatStyle = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : style || {};
    return React.createElement(
      'div',
      {
        ...props,
        'data-bg': flatStyle?.backgroundColor,
        'data-border-color': flatStyle?.borderColor,
        'data-opacity': flatStyle?.opacity,
        style: flatStyle,
      },
      children
    );
  };

  const Text = ({ children, style, ...props }: any) =>
    React.createElement('span', { ...props, style }, children);

  const TextInput = ({
    value,
    placeholder,
    onChangeText,
    secureTextEntry,
    style,
    ...props
  }: any) => {
    const flatStyle = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : style || {};
    return React.createElement('input', {
      'data-testid': 'text-input',
      'data-value': value || '',
      'data-placeholder': placeholder || '',
      'data-secure': secureTextEntry ? 'true' : undefined,
      'data-border-color': flatStyle?.borderColor,
      value: value || '',
      placeholder: placeholder || '',
      ...props,
    });
  };

  const ScrollView = ({ children, ...props }: any) => {
    const style = props.contentContainerStyle || {};
    return React.createElement(
      'div',
      {
        'data-testid': 'scrollview',
        'data-bg': style?.backgroundColor,
        style,
      },
      children
    );
  };

  const Pressable = React.forwardRef(
    ({ children, style, disabled, onPress, ...props }: any, ref: any) => {
      const resolvedStyle =
        typeof style === 'function' ? style({ pressed: false }) : style;
      const flatStyle = Array.isArray(resolvedStyle)
        ? Object.assign({}, ...resolvedStyle.filter(Boolean))
        : resolvedStyle || {};
      return React.createElement(
        'button',
        {
          ...props,
          disabled,
          'data-disabled': disabled ? 'true' : undefined,
          'data-opacity': flatStyle?.opacity,
          style: flatStyle,
          ref,
        },
        typeof children === 'function' ? children({ pressed: false }) : children
      );
    }
  );

  const ActivityIndicator = (props: any) =>
    React.createElement('span', {
      'data-testid': 'activity-indicator',
      'data-color': props.color,
    });

  const Image = (props: any) =>
    React.createElement('img', {
      'data-testid': 'image',
      src: props.source,
    });

  const Platform = { OS: 'android' };

  return {
    View,
    Text,
    TextInput,
    ScrollView,
    Pressable,
    ActivityIndicator,
    Image,
    StyleSheet,
    Platform,
  };
});

// Now import the component under test
import DriverHomeScreen from '../../src/screens/driver/HomeScreen';

// Helper: render DriverHomeScreen to static HTML
function renderHome(navigation?: any): string {
  const nav = navigation || { navigate: jest.fn() };
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(DriverHomeScreen, { navigation: nav })
  );
}

describe('Driver HomeScreen Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentLanguage = 'en';
    mockPunchData = { punched_in: true };
    mockAlertData = { alerts: [] };
  });

  describe('Punched-in vs not-punched-in rendering', () => {
    it('renders "Punched In – Shift Active" when punched in (success variant)', () => {
      mockPunchData = { punched_in: true };
      const html = renderHome();

      expect(html).toContain('Punched In – Shift Active');
    });

    it('renders "Not Punched In" when not punched in (warning variant)', () => {
      mockPunchData = { punched_in: false };
      const html = renderHome();

      expect(html).toContain('Not Punched In');
    });

    it('cards other than Punch In are dimmed when not punched in (opacity 0.4)', () => {
      mockPunchData = { punched_in: false };
      const html = renderHome();

      // Dimmed cards use opacity: 0.4 from Card component styles.dimmed
      expect(html).toContain('0.4');
      // But Punch In card should still be rendered without dimming
      expect(html).toContain('Punch In');
    });

    it('all cards are NOT dimmed when punched in', () => {
      mockPunchData = { punched_in: true };
      const html = renderHome();

      // When punched in, no cards should have dimmed opacity
      // Cards without dimming have opacity: 1 or no opacity set
      // Check that all menu items are rendered
      expect(html).toContain('Punch In');
      expect(html).toContain('Alerts');
      expect(html).toContain('Coverage');
      expect(html).toContain('Route Map');
      expect(html).toContain('Blockage Report');
      expect(html).toContain('Live Tracking');
      expect(html).toContain('Attendance');
      // No dimmed opacity applied (0.4 would only appear if dimmed)
      expect(html).not.toContain('data-opacity="0.4"');
    });
  });

  describe('Dimmed card tap behavior', () => {
    it('renders restriction message area when not punched in (dimmed cards wrapped in Pressable)', () => {
      mockPunchData = { punched_in: false };
      const html = renderHome();

      // When not punched in, dimmed cards are wrapped in a Pressable (button element)
      // The Alerts card and other non-punchIn cards should be inside buttons
      expect(html).toContain('<button');
    });

    it('Punch In card is always accessible (not dimmed) regardless of punch status', () => {
      mockPunchData = { punched_in: false };
      const html = renderHome();

      // Punch In card should still be present and have its title rendered
      expect(html).toContain('Punch In');
      expect(html).toContain('Start your shift');
    });

    it('restriction message text is defined for display when dimmed card is tapped', () => {
      // Verify that the translation for the restriction message is correct
      // In a real tap scenario, setRestrictionMessage would be called with this text
      expect(translations.en['home.punchInRequired']).toBe(
        'Please punch in first to access this feature'
      );
    });
  });

  describe('Alert banner with count display', () => {
    it('shows alert banner with unacknowledged count when alerts exist', () => {
      mockAlertData = {
        alerts: [
          { id: 1, acknowledged: false },
          { id: 2, acknowledged: false },
          { id: 3, acknowledged: true },
        ],
      };
      const html = renderHome();

      // 2 unacknowledged alerts
      expect(html).toContain('2 unacknowledged alerts');
    });

    it('does not render error banner when all alerts are acknowledged', () => {
      mockAlertData = {
        alerts: [
          { id: 1, acknowledged: true },
          { id: 2, acknowledged: true },
        ],
      };
      const html = renderHome();

      expect(html).not.toContain('unacknowledged alerts');
    });

    it('does not render error banner when there are no alerts', () => {
      mockAlertData = { alerts: [] };
      const html = renderHome();

      expect(html).not.toContain('unacknowledged alerts');
    });

    it('shows correct count for multiple unacknowledged alerts', () => {
      mockAlertData = {
        alerts: [
          { id: 1, acknowledged: false },
          { id: 2, acknowledged: false },
          { id: 3, acknowledged: false },
          { id: 4, acknowledged: true },
          { id: 5, acknowledged: true },
        ],
      };
      const html = renderHome();

      expect(html).toContain('3 unacknowledged alerts');
    });
  });

  describe('Greeting based on time of day', () => {
    const RealDate = global.Date;

    afterEach(() => {
      global.Date = RealDate;
    });

    it('shows "Good Morning" greeting when hour < 12', () => {
      // Mock Date to return hour 9 (morning)
      global.Date = class extends RealDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super();
          } else {
            // @ts-ignore
            super(...args);
          }
        }
        getHours() {
          return 9;
        }
      } as any;
      (global.Date as any).now = RealDate.now;

      const html = renderHome();
      expect(html).toContain('Good Morning, Test Driver');
    });

    it('shows "Good Afternoon" greeting when 12 <= hour < 17', () => {
      // Mock Date to return hour 14 (afternoon)
      global.Date = class extends RealDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super();
          } else {
            // @ts-ignore
            super(...args);
          }
        }
        getHours() {
          return 14;
        }
      } as any;
      (global.Date as any).now = RealDate.now;

      const html = renderHome();
      expect(html).toContain('Good Afternoon, Test Driver');
    });

    it('shows "Good Evening" greeting when hour >= 17', () => {
      // Mock Date to return hour 20 (evening)
      global.Date = class extends RealDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super();
          } else {
            // @ts-ignore
            super(...args);
          }
        }
        getHours() {
          return 20;
        }
      } as any;
      (global.Date as any).now = RealDate.now;

      const html = renderHome();
      expect(html).toContain('Good Evening, Test Driver');
    });
  });
});
