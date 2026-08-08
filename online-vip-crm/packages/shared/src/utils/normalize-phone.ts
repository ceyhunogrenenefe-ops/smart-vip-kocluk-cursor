/**
 * Normalize a phone number to E.164 when possible.
 * Accepts numbers already in +E.164, Turkish local formats (05xx, 5xx),
 * and common separators.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Keep leading + then strip non-digits from the rest
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Turkish local mobile: 05xxxxxxxxx → +905xxxxxxxxx
  if (!hasPlus && digits.startsWith('0') && digits.length === 11) {
    digits = `90${digits.slice(1)}`;
  }

  // Turkish mobile without leading 0: 5xxxxxxxxx → +905xxxxxxxxx
  if (!hasPlus && digits.length === 10 && digits.startsWith('5')) {
    digits = `90${digits}`;
  }

  // Already has country code without +
  const e164 = `+${digits}`;

  // Basic E.164 validation: + followed by 8–15 digits
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    return null;
  }

  return e164;
}
