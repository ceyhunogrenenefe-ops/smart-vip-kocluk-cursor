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

/**
 * Zoom/Meet vb. harici HTTPS link — davet metninde doğrudan paylaşılır (BBB kısa /d/ değil).
 * @param {string} link
 */
export function isDirectExternalMeetingLink(link) {
  const s = String(link || '').trim();
  if (!/^https?:\/\//i.test(s)) return false;
  const lower = s.toLowerCase();
  if (lower === 'bbb:auto' || lower.startsWith('bbb:')) return false;
  if (lower.includes('bigbluebutton') || lower.includes('/bigbluebutton/')) return false;
  if (detectPlatform(s) === 'bbb') return false;
  return true;
}
