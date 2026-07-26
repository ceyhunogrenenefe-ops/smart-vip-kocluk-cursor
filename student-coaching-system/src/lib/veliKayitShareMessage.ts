const DEFAULT_PUBLIC_ORIGIN = 'https://www.dersonlinevipkocluk.com';

function resolvePublicOrigin(origin?: string): string {
  const fromArg = String(origin || '').trim().replace(/\/$/, '');
  if (fromArg) return fromArg;
  const fromEnv = String(
    (typeof import.meta !== 'undefined' &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_PUBLIC_APP_URL) ||
      ''
  )
    .trim()
    .replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) {
    const o = window.location.origin.replace(/\/$/, '');
    // Yerel / preview’da kopyalanan link veli telefonunda açılmaz — üretim alan adı kullan.
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0|vercel\.app/i.test(o)) {
      return DEFAULT_PUBLIC_ORIGIN;
    }
    return o;
  }
  return DEFAULT_PUBLIC_ORIGIN;
}

/** Veli kayıt / e-imza sayfasının tam URL’si — giriş gerektirmez (`signing_token` yeter). */
export function buildVeliImzaPublicUrl(signingToken: string, origin?: string): string {
  const token = String(signingToken || '').trim();
  if (!token) return '';
  const path = `/veli-imza/${encodeURIComponent(token)}`;
  return `${resolvePublicOrigin(origin)}${path}`;
}

/** Veliye gönderilecek kayıt / e-imza linki — kurum adı mesajda görünsün. */
export function formatVeliKayitShareMessage(opts: {
  kurumAdi: string;
  url: string;
  kayitFormuMu?: boolean;
  ogrenciAdi?: string;
}): string {
  const kurum = String(opts.kurumAdi || '').trim() || 'Kurum';
  const baslik = opts.kayitFormuMu !== false ? 'Kayıt formu' : 'Veli onay ve e-imza';
  const ogrenci = String(opts.ogrenciAdi || '').trim();
  const lines = [`${kurum}`, ogrenci ? `${baslik} — ${ogrenci}` : baslik, '', opts.url.trim()];
  return lines.filter((l, i) => i < 3 || l.length > 0).join('\n');
}
