/**
 * Normalize an email address: trim + lowercase.
 * Returns null for empty/invalid-looking values.
 */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Minimal structural check — not full RFC validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}
