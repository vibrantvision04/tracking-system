import { theme } from '../../src/theme/theme';
import type { Theme, ColorToken, SpacingToken, BorderRadiusToken, SizeToken } from '../../src/theme/theme';

/**
 * Calculates the relative luminance of a hex color per WCAG 2.1.
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = parseInt(cleaned.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function linearize(channel: number): number {
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(foreground: string, background: string): number {
  const lum1 = relativeLuminance(foreground);
  const lum2 = relativeLuminance(background);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Theme Token Module', () => {
  describe('Color tokens', () => {
    it('should define primary as #10B981', () => {
      expect(theme.colors.primary).toBe('#10B981');
    });

    it('should define primaryHover as #059669', () => {
      expect(theme.colors.primaryHover).toBe('#059669');
    });

    it('should define primaryLight as #D1FAE5', () => {
      expect(theme.colors.primaryLight).toBe('#D1FAE5');
    });

    it('should define background as #F3F4F6', () => {
      expect(theme.colors.background).toBe('#F3F4F6');
    });

    it('should define surface as #FFFFFF', () => {
      expect(theme.colors.surface).toBe('#FFFFFF');
    });

    it('should define textDark as #1E293B', () => {
      expect(theme.colors.textDark).toBe('#1E293B');
    });

    it('should define textDim as #64748B', () => {
      expect(theme.colors.textDim).toBe('#64748B');
    });

    it('should define border as #E2E8F0', () => {
      expect(theme.colors.border).toBe('#E2E8F0');
    });

    it('should define success as #16A34A', () => {
      expect(theme.colors.success).toBe('#16A34A');
    });

    it('should define warning as #F59E0B', () => {
      expect(theme.colors.warning).toBe('#F59E0B');
    });

    it('should define warningLight as #FEF3C7', () => {
      expect(theme.colors.warningLight).toBe('#FEF3C7');
    });

    it('should define error as #EF4444', () => {
      expect(theme.colors.error).toBe('#EF4444');
    });

    it('should define errorLight as #FEF2F2', () => {
      expect(theme.colors.errorLight).toBe('#FEF2F2');
    });
  });

  describe('Spacing tokens', () => {
    it('should define xs as 4', () => {
      expect(theme.spacing.xs).toBe(4);
    });

    it('should define sm as 8', () => {
      expect(theme.spacing.sm).toBe(8);
    });

    it('should define md as 12', () => {
      expect(theme.spacing.md).toBe(12);
    });

    it('should define base as 16', () => {
      expect(theme.spacing.base).toBe(16);
    });

    it('should define lg as 20', () => {
      expect(theme.spacing.lg).toBe(20);
    });

    it('should define xl as 24', () => {
      expect(theme.spacing.xl).toBe(24);
    });

    it('should define xxl as 32', () => {
      expect(theme.spacing.xxl).toBe(32);
    });
  });

  describe('Border radius tokens', () => {
    it('should define card as 8', () => {
      expect(theme.borderRadius.card).toBe(8);
    });

    it('should define button as 12', () => {
      expect(theme.borderRadius.button).toBe(12);
    });

    it('should define input as 12', () => {
      expect(theme.borderRadius.input).toBe(12);
    });

    it('should define modal as 16', () => {
      expect(theme.borderRadius.modal).toBe(16);
    });
  });

  describe('Size tokens', () => {
    it('should define touchTarget as 48', () => {
      expect(theme.sizes.touchTarget).toBe(48);
    });

    it('should define buttonHeight as 56', () => {
      expect(theme.sizes.buttonHeight).toBe(56);
    });

    it('should define inputHeight as 56', () => {
      expect(theme.sizes.inputHeight).toBe(56);
    });

    it('should define headerHeight as 56', () => {
      expect(theme.sizes.headerHeight).toBe(56);
    });

    it('should define cardMinHeight as 120', () => {
      expect(theme.sizes.cardMinHeight).toBe(120);
    });
  });

  describe('Typography tokens', () => {
    it('should define heading with fontSize 20, fontWeight 600, lineHeight 26', () => {
      expect(theme.typography.heading.fontSize).toBe(20);
      expect(theme.typography.heading.fontWeight).toBe('600');
      expect(theme.typography.heading.lineHeight).toBe(26);
    });

    it('should define body with fontSize 16, fontWeight 400, lineHeight 24', () => {
      expect(theme.typography.body.fontSize).toBe(16);
      expect(theme.typography.body.fontWeight).toBe('400');
      expect(theme.typography.body.lineHeight).toBe(24);
    });

    it('should define secondary with fontSize 14, fontWeight 400, lineHeight 21', () => {
      expect(theme.typography.secondary.fontSize).toBe(14);
      expect(theme.typography.secondary.fontWeight).toBe('400');
      expect(theme.typography.secondary.lineHeight).toBe(21);
    });

    it('should define caption with fontSize 12, fontWeight 400, lineHeight 18', () => {
      expect(theme.typography.caption.fontSize).toBe(12);
      expect(theme.typography.caption.fontWeight).toBe('400');
      expect(theme.typography.caption.lineHeight).toBe(18);
    });

    it('should use system default font family (undefined)', () => {
      expect(theme.typography.fontFamily).toBeUndefined();
    });
  });

  describe('WCAG contrast ratio compliance', () => {
    it('should have textDark on surface with contrast ratio >= 4.5:1', () => {
      const ratio = contrastRatio(theme.colors.textDark, theme.colors.surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('should have textDark on background with contrast ratio >= 4.5:1', () => {
      const ratio = contrastRatio(theme.colors.textDark, theme.colors.background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });
});
