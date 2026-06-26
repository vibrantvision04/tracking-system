/**
 * Unit tests for OfflineBanner, OfflineContext, NetworkDependentView, and useOffline hook.
 * Validates: Requirements 13.1, 13.2, 13.3
 */
import React from 'react';

// Track the mock connectivity state
let mockIsConnected = true;

// Mock useNetwork to return current connectivity directly (no effects needed)
jest.mock('../../src/hooks/useNetwork', () => ({
  useNetwork: () => mockIsConnected,
}));

jest.mock('react-native', () => {
  const React = require('react');
  return {
    StyleSheet: { create: (s: any) => s },
    Text: ({ children, style, ...props }: any) =>
      React.createElement('span', { ...props, 'data-style': JSON.stringify(style) }, children),
    View: ({ children, style, pointerEvents, accessibilityRole, accessibilityLiveRegion, accessibilityState, ...props }: any) =>
      React.createElement('div', {
        ...props,
        'data-style': JSON.stringify(style),
        'data-pointer-events': pointerEvents,
        'data-accessibility-role': accessibilityRole,
        'data-accessibility-state': accessibilityState ? JSON.stringify(accessibilityState) : undefined,
      }, children),
    Platform: { OS: 'android' },
    StatusBar: { currentHeight: 24 },
  };
});

jest.mock('../../src/i18n/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key === 'offline.banner' ? 'You are offline' : key,
    language: 'en',
    setLanguage: jest.fn(),
  }),
}));

// Must import after mocks are set up
import ReactDOMServer from 'react-dom/server';
import OfflineBanner, { useOfflineStatus, NetworkDependentView } from '../../src/components/OfflineBanner';
import { OfflineProvider, useOffline } from '../../src/context/OfflineContext';

/**
 * Helper component that uses useOffline and renders the context values
 */
function OfflineConsumer() {
  const { isOffline, networkDependentOpacity } = useOffline();
  return React.createElement('div', {
    'data-is-offline': String(isOffline),
    'data-opacity': String(networkDependentOpacity),
  });
}

/**
 * Helper component that renders useOfflineStatus for testing
 */
function OfflineStatusConsumer() {
  const isOffline = useOfflineStatus();
  return React.createElement('span', { 'data-offline': String(isOffline) });
}

beforeEach(() => {
  mockIsConnected = true;
});

describe('OfflineBanner', () => {
  it('renders nothing when online', () => {
    mockIsConnected = true;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(OfflineBanner)
    );
    expect(html).toBe('');
  });

  it('renders banner with localized text when offline', () => {
    mockIsConnected = false;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(OfflineBanner)
    );
    expect(html).toContain('You are offline');
  });

  it('uses amber/warning background color from theme', () => {
    mockIsConnected = false;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(OfflineBanner)
    );
    // The style should contain the warning color (#F59E0B)
    expect(html).toContain('#F59E0B');
  });

  it('has accessibility role alert', () => {
    mockIsConnected = false;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(OfflineBanner)
    );
    expect(html).toContain('data-accessibility-role="alert"');
  });
});

describe('useOfflineStatus', () => {
  it('returns true when network is disconnected', () => {
    mockIsConnected = false;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(OfflineStatusConsumer)
    );
    expect(html).toContain('data-offline="true"');
  });

  it('returns false when network is connected', () => {
    mockIsConnected = true;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(OfflineStatusConsumer)
    );
    expect(html).toContain('data-offline="false"');
  });
});

describe('NetworkDependentView', () => {
  it('renders children at full opacity when online', () => {
    mockIsConnected = true;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NetworkDependentView, { children: React.createElement('span', null, 'Submit') })
    );
    expect(html).toContain('Submit');
    // opacity:1 is in the serialized style (HTML-escaped quotes)
    expect(html).toContain('opacity');
    expect(html).toMatch(/opacity.*:.*1/);
  });

  it('dims children (0.5 opacity) when offline', () => {
    mockIsConnected = false;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NetworkDependentView, { children: React.createElement('span', null, 'Submit') })
    );
    expect(html).toContain('Submit');
    expect(html).toContain('opacity');
    expect(html).toMatch(/opacity.*:.*0\.5/);
  });

  it('disables pointer events when offline', () => {
    mockIsConnected = false;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NetworkDependentView, { children: React.createElement('span', null, 'Submit') })
    );
    expect(html).toContain('data-pointer-events="none"');
  });

  it('sets accessibilityState disabled when offline', () => {
    mockIsConnected = false;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NetworkDependentView, { children: React.createElement('span', null, 'Action') })
    );
    // HTML-escaped JSON: &quot;disabled&quot;:true
    expect(html).toMatch(/disabled.*true/);
  });

  it('allows interaction when disableInteraction is false even while offline', () => {
    mockIsConnected = false;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NetworkDependentView, { disableInteraction: false, children: React.createElement('span', null, 'Action') })
    );
    expect(html).toContain('data-pointer-events="auto"');
  });

  it('allows interaction when online', () => {
    mockIsConnected = true;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NetworkDependentView, { children: React.createElement('span', null, 'Action') })
    );
    expect(html).toContain('data-pointer-events="auto"');
  });
});

describe('OfflineContext (useOffline)', () => {
  it('provides isOffline=false and opacity=1 when online', () => {
    mockIsConnected = true;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(OfflineProvider, { children: React.createElement(OfflineConsumer) })
    );
    expect(html).toContain('data-is-offline="false"');
    expect(html).toContain('data-opacity="1"');
  });

  it('provides isOffline=true and opacity=0.5 when offline', () => {
    mockIsConnected = false;
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(OfflineProvider, { children: React.createElement(OfflineConsumer) })
    );
    expect(html).toContain('data-is-offline="true"');
    expect(html).toContain('data-opacity="0.5"');
  });

  it('returns default context values when used outside OfflineProvider', () => {
    // Without OfflineProvider, defaults are isOffline=false, opacity=1
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(OfflineConsumer)
    );
    expect(html).toContain('data-is-offline="false"');
    expect(html).toContain('data-opacity="1"');
  });
});
