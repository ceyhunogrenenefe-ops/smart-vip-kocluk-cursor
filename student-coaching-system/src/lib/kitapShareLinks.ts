/**
 * Veliye WhatsApp ile atılabilen kitap / paket paylaşım linkleri.
 * Giriş gerektirmez; satın alma /odeme/kitap token ile tamamlanır.
 */
export function publicAppOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://www.dersonlinevipkocluk.com';
}

export function kitapPackageSharePath(slug: string): string {
  return `/kitap/paket/${encodeURIComponent(String(slug || '').trim())}`;
}

export function kitapBookSharePath(slug: string): string {
  return `/kitap/urun/${encodeURIComponent(String(slug || '').trim())}`;
}

export function kitapPackageShareUrl(slug: string): string {
  return `${publicAppOrigin()}${kitapPackageSharePath(slug)}`;
}

export function kitapBookShareUrl(slug: string): string {
  return `${publicAppOrigin()}${kitapBookSharePath(slug)}`;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  const value = String(text || '').trim();
  if (!value) throw new Error('Kopyalanacak metin yok');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}
