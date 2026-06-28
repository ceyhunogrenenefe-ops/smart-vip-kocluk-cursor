/** Dokunmatik telefon ve tablet (≤1023px veya coarse pointer). */
export function isMobileOrTabletViewport(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(max-width: 1023px)').matches) return true;
    if (window.matchMedia('(pointer: coarse)').matches) return true;
  } catch {
    return window.innerWidth < 1024;
  }
  return false;
}
