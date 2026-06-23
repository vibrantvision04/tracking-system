export const typography = {
  pageTitle:    { fontSize: '2rem',     lineHeight: '1.2', fontWeight: '800' }, // 32px
  sectionTitle: { fontSize: '1.5rem',   lineHeight: '1.3', fontWeight: '700' }, // 24px
  cardTitle:    { fontSize: '1.125rem', lineHeight: '1.4', fontWeight: '600' }, // 18px
  body:         { fontSize: '0.875rem', lineHeight: '1.5', fontWeight: '400' }, // 14px
  label:        { fontSize: '0.75rem',  lineHeight: '1.4', fontWeight: '500' }, // 12px
} as const;

export type TypographyToken = {
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
};

export type TypographyScale = typeof typography;
