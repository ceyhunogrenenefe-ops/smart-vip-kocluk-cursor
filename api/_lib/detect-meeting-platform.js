/**
 * Toplantı bağlantısından platform tahmini (Smart Koçluk canlı ders).
 * @param {string} link
 * @returns {'zoom'|'meet'|'bbb'|'other'}
 */
export function detectPlatform(link) {
  const s = String(link || '').toLowerCase();
  if (s.includes('zoom.us')) return 'zoom';
  if (s.includes('meet.google.com')) return 'meet';
  if (s.includes('bbb') || s.includes('bigbluebutton')) return 'bbb';
  return 'other';
}
