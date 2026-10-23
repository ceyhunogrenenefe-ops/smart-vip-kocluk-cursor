/**
 * Veli imzaladıktan sonra taksit planını düzenleme.
 *
 * İmzalı sözleşme metni (merged_html) değişmez; yalnız tahsilat planı
 * (kayit_formu_json.taksit_kartlari) güncellenir ve değişiklik kayda geçer.
 * Ödenmiş taksitler kilitlidir: tutarı, vadesi ve ödeme bilgisi korunur,
 * silinemez. Öğrenci ödemelerine yalnız ödenmiş taksitler aktarıldığından
 * ödenmemiş taksitlerin değişmesi muhasebe kaydını etkilemez.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_TAKSIT = 48;

function para(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : NaN;
}

export function planToplami(kartlar) {
  return para((kartlar || []).reduce((t, k) => t + (Number(k?.tutar_tl) || 0), 0));
}

/**
 * @param {object[]} mevcut kayıttaki taksit_kartlari
 * @param {{tutar_tl:number|string, vade_tarihi:string}[]} istenen yeni plan (sırayla)
 * @returns {{ ok: true, kartlar: object[] } | { ok: false, error: string, index?: number }}
 */
export function imzaSonrasiTaksitPlani(mevcut, istenen) {
  const eski = Array.isArray(mevcut) ? mevcut : [];
  const yeni = Array.isArray(istenen) ? istenen : [];
  if (!yeni.length) return { ok: false, error: 'taksit_plani_bos' };
  if (yeni.length > MAX_TAKSIT) return { ok: false, error: 'taksit_sayisi_fazla' };

  for (let i = yeni.length; i < eski.length; i++) {
    if (eski[i]?.odendi) return { ok: false, error: 'odenmis_taksit_silinemez', index: i };
  }

  const kartlar = [];
  for (let i = 0; i < yeni.length; i++) {
    const once = eski[i] && typeof eski[i] === 'object' ? eski[i] : null;
    if (once?.odendi) {
      kartlar.push({ ...once, no: i + 1 });
      continue;
    }
    const tutar = para(yeni[i]?.tutar_tl);
    if (!(tutar > 0)) return { ok: false, error: 'taksit_tutari_gecersiz', index: i };
    const vade = String(yeni[i]?.vade_tarihi || '').trim().slice(0, 10);
    if (!YMD.test(vade)) return { ok: false, error: 'vade_tarihi_invalid', index: i };
    kartlar.push({
      ...(once || {}),
      no: i + 1,
      tutar_tl: tutar,
      vade_tarihi: vade,
      odendi: false,
      odendi_tarihi: '',
      odeme_notu: String(once?.odeme_notu || '').slice(0, 200),
      odeme_hesap_id: null
    });
  }
  return { ok: true, kartlar };
}
