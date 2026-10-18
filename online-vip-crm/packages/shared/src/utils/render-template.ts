/**
 * Render a simple mustache-like template with `{{var}}` placeholders.
 * Unknown variables are left as-is (or replaced with empty string if missing mode is empty).
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
  options: { missing?: 'keep' | 'empty' } = {},
): string {
  const missing = options.missing ?? 'keep';

  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const value = vars[key];
      if (value == null) return missing === 'empty' ? '' : `{{${key}}}`;
      return String(value);
    }
    return missing === 'empty' ? '' : `{{${key}}}`;
  });
}
