import crypto from 'crypto';

/** Sınıf metninden (9, "9.", LGS, TYT…) haftalık saat ve ücret önerisi — kurum isterse sonra DB’den okunur. */
export function suggestHoursAndFeeFromSinif(sinifRaw) {
  const t = String(sinifRaw || '')
    .trim()
    .toLowerCase();
  const num = t.match(/(\d{1,2})/);
  const n = num ? parseInt(num[1], 10) : null;
  if (n != null && n >= 3 && n <= 5) return { hours: 4, fee: 18000 };
  if (n != null && n >= 6 && n <= 8) return { hours: 6, fee: 28000 };
  if (n === 9 || t.includes('9.')) return { hours: 8, fee: 42000 };
  if (n === 10) return { hours: 10, fee: 48000 };
  if (n === 11) return { hours: 12, fee: 52000 };
  if (n === 12 || t.includes('tyt') || t.includes('ayt')) return { hours: 14, fee: 58000 };
  if (t.includes('lgs')) return { hours: 10, fee: 45000 };
  return { hours: 6, fee: 25000 };
}

export function institutionCodeFromRow(inst) {
  if (!inst) return 'KRM';
  const slug = String(inst.slug || inst.code || '').trim();
  if (slug) return slug.slice(0, 24).toUpperCase();
  const id = String(inst.id || '').replace(/-/g, '');
  return id ? id.slice(0, 10).toUpperCase() : 'KRM';
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function contractNumber(instCode) {
  const suf = crypto.randomBytes(3).toString('hex').toUpperCase();
  const p = String(instCode || 'SK').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'SK';
  return `${p}-${suf}`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const SOZLESME_TURLARI = ['kullanici_sozlesmesi', 'satis_sozlesmesi', 'diger'];

export function normalizeSozlesmeTuru(raw) {
  const t = String(raw || '').trim();
  return SOZLESME_TURLARI.includes(t) ? t : 'satis_sozlesmesi';
}

/** "Ad Soyad" → veli/öğrenci için basit bölme */
export function splitAdSoyad(full) {
  const t = String(full || '').trim();
  if (!t) return { ad: '', soyad: '' };
  const i = t.indexOf(' ');
  if (i === -1) return { ad: t, soyad: '' };
  return { ad: t.slice(0, i).trim(), soyad: t.slice(i + 1).trim() };
}

export function resolveSozlesmeBasligi(sozlesme_turu, sozlesme_ozel_baslik, explicit_baslik) {
  const ex = String(explicit_baslik || '').trim();
  if (ex) return ex;
  const o = String(sozlesme_ozel_baslik || '').trim();
  const tur = normalizeSozlesmeTuru(sozlesme_turu);
  if (tur === 'diger' && o) return o;
  if (tur === 'kullanici_sozlesmesi') return 'Kullanıcı sözleşmesi';
  if (tur === 'satis_sozlesmesi') return 'Satış sözleşmesi';
  if (o) return o;
  return 'Ön kayıt / bilgilendirme özeti';
}

export function extraDetailHtmlFromPlain(plain) {
  const lines = String(plain || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return '';
  return `<div class="extra"><h2>Ek şartlar ve ayrıntılar</h2>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`;
}

/** @returns {{ ders_adi: string, haftalik_saat: number }[]} */
export function normalizeDersSatirlari(raw) {
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) arr = Object.keys(raw).length ? [raw] : [];
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      arr = Array.isArray(p) ? p : [];
    } catch {
      arr = [];
    }
  }
  const out = [];
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const name = String(x.ders_adi ?? x.name ?? '').trim();
    const h = Number(x.haftalik_saat ?? x.saat ?? x.hours);
    if (!name || !Number.isFinite(h) || h <= 0) continue;
    out.push({
      ders_adi: name.slice(0, 120),
      haftalik_saat: Math.min(40, Math.max(0.25, h))
    });
  }
  return out;
}

export function sumDersHours(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((s, r) => s + Number(r?.haftalik_saat || 0), 0);
}

export function dersProgramTableHtml(rows) {
  const list = normalizeDersSatirlari(rows);
  if (!list.length) return '';
  const total = sumDersHours(list);
  const body = list
    .map(
      (r) =>
        `<tr><td>${esc(r.ders_adi)}</td><td style="text-align:right">${esc(String(r.haftalik_saat))} saat</td></tr>`
    )
    .join('');
  return `<div class="dersprog"><h2>Haftalık ders programı</h2><table class="dersmini"><thead><tr><th>Ders</th><th style="text-align:right">Haftalık saat</th></tr></thead><tbody>${body}<tr><td><strong>Toplam</strong></td><td style="text-align:right"><strong>${esc(String(total))} saat</strong></td></tr></tbody></table></div>`;
}

export function buildParentContractHtml(fields) {
  const {
    ogrenci_ad,
    ogrenci_soyad,
    veli_ad,
    veli_soyad,
    telefon,
    adres,
    sinif,
    program_adi,
    baslangic_tarihi,
    bitis_tarihi,
    haftalik_ders_saati,
    ucret,
    taksit_sayisi,
    kurum_kodu,
    contract_number,
    kurum_adi,
    verify_url,
    document_title,
    extra_detail_plain,
    ders_satirlari
  } = fields;

  const h1 = String(document_title || '').trim() || 'Ön kayıt / bilgilendirme özeti';
  const extraBlock = extraDetailHtmlFromPlain(extra_detail_plain || '');
  const dersBlock = dersProgramTableHtml(ders_satirlari);

  const taksitN = Math.max(1, Math.min(48, Math.round(Number(taksit_sayisi) || 1)));
  const ucretNum = Number(ucret);
  const taksitTutar =
    Number.isFinite(ucretNum) && ucretNum > 0 && taksitN > 0
      ? Math.round(ucretNum / taksitN)
      : null;

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#0f172a;max-width:720px;margin:0 auto;padding:20px}
h1{font-size:1.25rem;color:#1e3a8a}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
td{border:1px solid #e2e8f0;padding:8px}
td:first-child{width:38%;background:#f8fafc;font-weight:600;color:#475569}
.note{font-size:13px;color:#334155;margin-top:20px;padding:12px;background:#fff7ed;border-left:4px solid #ea580c}
.kvkk{font-size:12px;color:#475569;margin-top:16px;padding:12px;background:#f1f5f9;border-radius:8px}
.extra{margin-top:20px;font-size:14px;color:#0f172a}
.extra h2{font-size:1rem;color:#1e3a8a;margin:0 0 8px}
.extra p{margin:6px 0}
.dersprog{margin-top:18px;font-size:14px}
.dersprog h2{font-size:1rem;color:#1e3a8a;margin:0 0 8px}
table.dersmini{width:100%;border-collapse:collapse;margin:8px 0;font-size:13px}
table.dersmini td,table.dersmini th{border:1px solid #e2e8f0;padding:6px 8px}
table.dersmini th{background:#f8fafc;text-align:left}
a{color:#1d4ed8}
</style></head><body>
<h1>${esc(h1)}</h1>
<p style="font-size:13px;color:#64748b">Belge no: <strong>${esc(contract_number)}</strong> · Kurum kodu: <strong>${esc(kurum_kodu)}</strong>${kurum_adi ? ` · ${esc(kurum_adi)}` : ''}</p>
<table>
<tr><td>Öğrenci adı</td><td>${esc(ogrenci_ad)} ${esc(ogrenci_soyad)}</td></tr>
<tr><td>Veli</td><td>${esc(veli_ad)} ${esc(veli_soyad)}</td></tr>
<tr><td>Telefon</td><td>${esc(telefon)}</td></tr>
<tr><td>Adres</td><td>${esc(adres)}</td></tr>
<tr><td>Sınıf / seviye</td><td>${esc(sinif)}</td></tr>
<tr><td>Program</td><td>${esc(program_adi)}</td></tr>
<tr><td>Başlangıç</td><td>${esc(baslangic_tarihi)}</td></tr>
<tr><td>Bitiş</td><td>${esc(bitis_tarihi)}</td></tr>
<tr><td>Haftalık ders saati</td><td>${esc(String(haftalik_ders_saati))} saat</td></tr>
<tr><td>Ücret (TL)</td><td>${esc(String(ucret))}</td></tr>
<tr><td>Taksit sayısı</td><td>${esc(String(taksitN))}</td></tr>
${
  taksitTutar != null
    ? `<tr><td>Ortalama taksit tutarı (TL)</td><td>${esc(String(taksitTutar))} (yaklaşık)</td></tr>`
    : ''
}
</table>
${dersBlock}
${extraBlock}
<div class="note">
  <strong>6698 sayılı KVKK</strong> kapsamında kişisel verileriniz; eğitim hizmetinin sunulması, sözleşmenin kurulması ve ifası amacıyla işlenebilir.
  Veli olarak bu metni okuduğunuzu ve elektronik onayınızın geçerli olduğunu kabul etmiş olursunuz.
</div>
<div class="kvkk">
  Doğrulama bağlantısı: <a href="${esc(verify_url)}">${esc(verify_url)}</a>
</div>
</body></html>`;
}
