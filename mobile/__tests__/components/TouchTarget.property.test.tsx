/**
 * Feature: mobile-app-ui-redesign
 * Property 4: Touch Target Minimum Size
 *
 * For any interactive UI component (Button, Card with onPress, LanguageToggle segment,
 * Header action) rendered with default props, the computed touchable area
 * (width × height) SHALL both be >= 48 density-independent pixels.
 *
 * Validates: Requirements 5.1
 */
import * as fc from 'fast-check';
import React from 'react';

// Mock LanguageContext before importing components that use it
jest.mock('../../src/i18n/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: jest.fn() }),
}));

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
          'data-min-height': flatStyle?.minHeight,
          'data-width': flatStyle?.width,
          'data-min-width': flatStyle?.minWidth,
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

  const View = ({ children, style, ...props }: any) =>
    React.createElement('div', { ...props, style }, children);

  return {
    Pressable,
    Text,
    View,
    ActivityIndicator,
    StyleSheet,
  };
});

import ReactDOMServer from 'react-dom/server';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { LanguageToggle } from '../../src/components/ui/LanguageToggle';
import { Header } from '../../src/components/ui/Header';

const MINIMUM_TOUCH_TARGET = 48;

// --- Helper functions ---

/**
 * Extracts all pressable elements' size attributes from rendered HTML.
 * Returns array of { height, minHeight, width, minWidth } for each pressable.
 */
function extractPressableSizes(html: string): Array<{
  height?: number;
  minHeight?: number;
  width?: number;
  minWidth?: number;
}> {
  const results: Array<{
    height?: number;
    minHeight?: number;
    width?: number;
    minWidth?: number;
  }> = [];

  // Match all pressable divs
  const pressableRegex = /data-testid="pressable"[^>]*/g;
  let match;
  while ((match = pressableRegex.exec(html)) !== null) {
    const fragment = match[0];
    const height = fragment.match(/data-height="(\d+)"/);
    const minHeight = fragment.match(/data-min-height="(\d+)"/);
    const width = fragment.match(/data-width="(\d+)"/);
    const minWidth = fragment.match(/data-min-width="(\d+)"/);

    results.push({
      height: height ? parseInt(height[1], 10) : undefined,
      minHeight: minHeight ? parseInt(minHeight[1], 10) : undefined,
      width: width ? parseInt(width[1], 10) : undefined,
      minWidth: minWidth ? parseInt(minWidth[1], 10) : undefined,
    });
  }

  return results;
}

/**
 * Gets the effective vertical size (height or minHeight) of a pressable.
 */
function getEffectiveHeight(size: { height?: number; minHeight?: number }): number | undefined {
  return size.height ?? size.minHeight;
}

/**
 * Gets the effective horizontal size (width or minWidth) of a pressable.
 */
function getEffectiveWidth(size: { width?: number; minWidth?: number }): number | undefined {
  return size.width ?? size.minWidth;
}

// --- Arbitraries ---

// Button size variants
const buttonSizeArb = fc.constantFrom('default' as const, 'small' as const);

// Button variant
const buttonVariantArb = fc.constantFrom('primary' as const, 'secondary' as const, 'danger' as const);

// Text arbitrary for button titles
const textArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

// Number of header actions (0-2)
const headerActionsCountArb = fc.integer({ min: 1, max: 2 });

describe('Property 4: Touch Target Minimum Size', () => {
  /**
   * **Validates: Requirements 5.1**
   *
   * Button touch target height >= 48dp for any size variant.
   */
  it('Button touchable height >= 48dp for all size variants', () => {
    fc.assert(
      fc.property(
        buttonSizeArb,
        buttonVariantArb,
        textArb,
        (size, variant, title) => {
          const html = ReactDOMServer.renderToStaticMarkup(
            React.createElement(Button, {
              title,
              onPress: () => {},
              variant,
              size,
            })
          );

          const pressables = extractPressableSizes(html);
          expect(pressables.length).toBeGreaterThanOrEqual(1);

          const effectiveHeight = getEffectiveHeight(pressables[0]);
          expect(effectiveHeight).toBeDefined();
          expect(effectiveHeight).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.1**
   *
   * Card with onPress has touchable minHeight >= 48dp.
   */
  it('Card with onPress has touchable minHeight >= 48dp', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // highlighted
        (highlighted) => {
          const html = ReactDOMServer.renderToStaticMarkup(
            React.createElement(
              Card,
              {
                onPress: () => {},
                highlighted,
                children: React.createElement('span', null, 'Content'),
              } as any
            )
          );

          const pressables = extractPressableSizes(html);
          expect(pressables.length).toBeGreaterThanOrEqual(1);

          const effectiveHeight = getEffectiveHeight(pressables[0]);
          expect(effectiveHeight).toBeDefined();
          expect(effectiveHeight).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.1**
   *
   * LanguageToggle segments (non-compact) have touch target >= 48dp in both dimensions.
   */
  it('LanguageToggle segments have minWidth and minHeight >= 48dp', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          React.createElement(LanguageToggle, { compact: false })
        );

        const pressables = extractPressableSizes(html);
        // LanguageToggle has 2 segments (Hindi and English)
        expect(pressables.length).toBe(2);

        for (const pressable of pressables) {
          const effectiveHeight = getEffectiveHeight(pressable);
          const effectiveWidth = getEffectiveWidth(pressable);

          expect(effectiveHeight).toBeDefined();
          expect(effectiveHeight).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);

          expect(effectiveWidth).toBeDefined();
          expect(effectiveWidth).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.1**
   *
   * Header action buttons have width and height >= 48dp.
   */
  it('Header action buttons have width and height >= 48dp', () => {
    fc.assert(
      fc.property(headerActionsCountArb, (numActions) => {
        const actions = Array.from({ length: numActions }, (_, i) => ({
          icon: '⚙',
          onPress: () => {},
          accessibilityLabel: `Action ${i}`,
        }));

        const html = ReactDOMServer.renderToStaticMarkup(
          React.createElement(Header, {
            title: 'Test',
            rightActions: actions,
          })
        );

        const pressables = extractPressableSizes(html);
        // Each action should have a pressable with >= 48dp
        // Filter to those that have explicit width/height (action buttons)
        const actionPressables = pressables.filter(
          (p) => p.width !== undefined && p.height !== undefined
        );

        expect(actionPressables.length).toBe(numActions);

        for (const pressable of actionPressables) {
          expect(pressable.height).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
          expect(pressable.width).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.1**
   *
   * Header back button has width and height >= 48dp.
   */
  it('Header back button has width and height >= 48dp', () => {
    fc.assert(
      fc.property(textArb, (title) => {
        const html = ReactDOMServer.renderToStaticMarkup(
          React.createElement(Header, {
            title,
            showBack: true,
            onBack: () => {},
          })
        );

        const pressables = extractPressableSizes(html);
        // The back button should be a pressable with explicit width and height
        const backButton = pressables.find(
          (p) => p.width !== undefined && p.height !== undefined
        );

        expect(backButton).toBeDefined();
        expect(backButton!.height).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
        expect(backButton!.width).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
      }),
      { numRuns: 100 }
    );
  });
});
