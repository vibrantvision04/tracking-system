/**
 * Feature: mobile-app-ui-redesign
 * Property 5: Primary Button Height Minimum
 *
 * For any text string (varying lengths, Hindi or English),
 * primary Button height >= 56dp.
 *
 * Validates: Requirements 5.2
 */
import * as fc from 'fast-check';
import React from 'react';

// Mock react-native with components that store style props in the DOM
jest.mock('react-native', () => {
  const React = require('react');

  const StyleSheet = {
    create: (styles: any) => styles,
  };

  const Pressable = React.forwardRef(
    ({ children, style, disabled, accessibilityRole, accessibilityState, accessibilityLabel, onPress, ...rest }: any, ref: any) => {
      // Resolve style function the same way RN does
      const resolvedStyle =
        typeof style === 'function' ? style({ pressed: false }) : style;

      // Flatten array styles
      let flatStyle = resolvedStyle;
      if (Array.isArray(resolvedStyle)) {
        flatStyle = Object.assign({}, ...resolvedStyle.filter(Boolean));
      }

      return React.createElement(
        'div',
        {
          'data-testid': 'pressable',
          'data-height': flatStyle?.height,
          style: flatStyle,
          ref,
        },
        typeof children === 'function' ? children({ pressed: false }) : children
      );
    }
  );

  const Text = ({ children, style, ...props }: any) =>
    React.createElement('span', props, children);

  const ActivityIndicator = (props: any) =>
    React.createElement('span', { 'data-testid': 'activity-indicator' });

  const View = ({ children, ...props }: any) =>
    React.createElement('div', props, children);

  return {
    Pressable,
    Text,
    View,
    ActivityIndicator,
    StyleSheet,
  };
});

// Use ReactDOMServer to render and extract styles without needing a DOM
import ReactDOMServer from 'react-dom/server';
import { Button } from '../../src/components/ui/Button';

/**
 * Renders a Button and extracts the height from the resolved style.
 * We render to static markup and parse the data-height attribute.
 */
function getButtonHeight(title: string): number | undefined {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Button, {
      title,
      onPress: () => {},
      variant: 'primary' as const,
      size: 'default' as const,
    })
  );

  // Extract data-height from rendered HTML
  const match = html.match(/data-height="(\d+)"/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

// Arbitrary for Hindi characters (Devanagari block U+0905 to U+0939)
const hindiChar = fc.integer({ min: 0x0905, max: 0x0939 }).map((code) =>
  String.fromCharCode(code)
);

// Arbitrary for English characters (a-z, A-Z)
const englishChar = fc.oneof(
  fc.integer({ min: 97, max: 122 }).map((c) => String.fromCharCode(c)),
  fc.integer({ min: 65, max: 90 }).map((c) => String.fromCharCode(c))
);

// Arbitrary for mixed Hindi/English strings of varying lengths (1-50)
const mixedTextArb = fc
  .array(fc.oneof(hindiChar, englishChar), { minLength: 1, maxLength: 50 })
  .map((chars) => chars.join(''));

describe('Property 5: Primary Button Height Minimum', () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * For any text string (varying lengths 1-50, containing Hindi Unicode
   * characters or English a-z/A-Z), a primary Button (default size)
   * rendered with that text has height >= 56dp.
   */
  it('primary Button height >= 56dp for any Hindi or English text', () => {
    fc.assert(
      fc.property(mixedTextArb, (text: string) => {
        const height = getButtonHeight(text);
        expect(height).toBeDefined();
        expect(height).toBeGreaterThanOrEqual(56);
      }),
      { numRuns: 150 }
    );
  });
});
