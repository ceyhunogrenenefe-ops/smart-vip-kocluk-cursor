/** Online VIP Dershane brand tokens for CRM surfaces. */
export const brandTokens = {
  primary: '#e8232a',
  secondary: '#1a3fad',
  accent: '#e8232a',
  background: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
} as const;

export type BrandTokenKey = keyof typeof brandTokens;

/** CSS custom properties matching `@online-vip-crm/shared` BRAND_CSS_VARIABLES. */
export const brandCssVariables = {
  '--brand-primary': brandTokens.primary,
  '--brand-secondary': brandTokens.secondary,
  '--brand-accent': brandTokens.accent,
  '--brand-background': brandTokens.background,
  '--brand-text': brandTokens.text,
} as const;

export function brandCssVariablesAsString(): string {
  return Object.entries(brandCssVariables)
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ');
}
