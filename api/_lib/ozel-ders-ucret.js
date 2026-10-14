/**
 * Öğretmen bazlı özel ders ücreti çözümleyicisi.
 *
 * Ücret TEK YERDE hesaplanır: hem yönetim paneli, hem siteye açılan
 * genel API, hem de rezervasyon/ödeme aynı bu işlevi kullanır. Fiyat
 * yalnız ön yüzde hesaplanırsa istemciden gelen tutara güvenmek
 * gerekirdi; sunucu her durumda kendi hesabını yazar.
 *
 * NULL ücret "girilmedi" demektir, "ücretsiz" demek DEĞİLDİR. Ücreti
 * girilmemiş öğretmen kurum varsayılanını kullanır; varsayılan da yoksa
 * fiyat gösterilmez (sitede "ücret için iletişime geçin").
 */

/** Varsayılan ders süresi — kurum ayarı yoksa */
export const VARSAYILAN_SURE_DK = 40;

/** Kuruşa yuvarlar; parayı kayan noktada biriktirmemek için */
export function paraYuvarla(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

/**
 * Girilen ücreti doğrular.
 * '' ve null "ücreti kaldır" demektir (öğretmen varsayılana döner).
 */
export function ucretiTemizle(ham) {
  if (ham === null || ham === undefined) return { value: null };
  const s = String(ham).trim();
  if (!s) return { value: null };
  // "1.500,50" ve "1500.50" biçimlerini birlikte kabul et
  const normal = s.replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(normal);
  if (!Number.isFinite(n)) return { error: 'Ücret sayı olmalı.' };
  if (n < 0) return { error: 'Ücret negatif olamaz.' };
  if (n > 1000000) return { error: 'Ücret çok yüksek görünüyor.' };
  return { value: paraYuvarla(n) };
}

/** Ders süresini doğrular */
export function sureyiTemizle(ham) {
  if (ham === null || ham === undefined || String(ham).trim() === '') return { value: null };
  const n = Math.round(Number(ham));
  if (!Number.isFinite(n)) return { error: 'Süre sayı olmalı.' };
  if (n < 5 || n > 300) return { error: 'Süre 5 ile 300 dakika arasında olmalı.' };
  return { value: n };
}

/**
 * Bir öğretmenin geçerli özel ders ücreti.
 *
 * @param {object} profil teacher_profiles satırı
 * @param {object} ayar   private_lesson_pricing_settings satırı (olmayabilir)
 * @returns {{fee: number|null, duration: number, source: 'teacher'|'default'|'none', enabled: boolean}}
 */
export function ogretmenUcreti(profil, ayar) {
  const enabled = profil?.private_lesson_enabled !== false;

  const ogretmenUcret = profil?.private_lesson_fee_tl;
  const ogretmenVar =
    ogretmenUcret !== null && ogretmenUcret !== undefined && Number.isFinite(Number(ogretmenUcret));

  const varsayilanUcret = ayar?.default_fee_tl;
  const varsayilanVar =
    varsayilanUcret !== null &&
    varsayilanUcret !== undefined &&
    Number.isFinite(Number(varsayilanUcret)) &&
    Number(varsayilanUcret) > 0;

  const sure =
    Number(profil?.lesson_duration_min) > 0
      ? Math.round(Number(profil.lesson_duration_min))
      : Number(ayar?.default_duration_min) > 0
        ? Math.round(Number(ayar.default_duration_min))
        : VARSAYILAN_SURE_DK;

  if (ogretmenVar) {
    return { fee: paraYuvarla(ogretmenUcret), duration: sure, source: 'teacher', enabled };
  }
  if (varsayilanVar) {
    return { fee: paraYuvarla(varsayilanUcret), duration: sure, source: 'default', enabled };
  }
  return { fee: null, duration: sure, source: 'none', enabled };
}

/**
 * Birden fazla ders için toplam. Tutar SUNUCUDA hesaplanır; istemciden
 * gelen toplam hiçbir zaman doğrudan kullanılmaz.
 */
export function toplamTutar(birimUcret, adet) {
  const b = Number(birimUcret);
  const n = Math.round(Number(adet));
  if (!Number.isFinite(b) || b < 0) return null;
  if (!Number.isFinite(n) || n < 1 || n > 500) return null;
  return paraYuvarla(b * n);
}

/** Sitede gösterilecek metin — "1.500 TL / Ders" */
export function ucretEtiketi(fee, duration) {
  if (fee === null || fee === undefined) return 'Ücret için iletişime geçin';
  const tam = Number(fee);
  const bicim = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: Number.isInteger(tam) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(tam);
  const dk = Number(duration) > 0 ? `${Math.round(Number(duration))} dakikalık ` : '';
  return `${dk}birebir özel ders · ${bicim} TL / Ders`;
}
