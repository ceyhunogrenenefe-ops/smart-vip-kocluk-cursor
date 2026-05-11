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
    kurum_kodu,
    contract_number,
    kurum_adi,
    verify_url
  } = fields;

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#0f172a;max-width:720px;margin:0 auto;padding:20px}
h1{font-size:1.25rem;color:#1e3a8a}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
td{border:1px solid #e2e8f0;padding:8px}
td:first-child{width:38%;background:#f8fafc;font-weight:600;color:#475569}
.note{font-size:13px;color:#334155;margin-top:20px;padding:12px;background:#fff7ed;border-left:4px solid #ea580c}
.kvkk{font-size:12px;color:#475569;margin-top:16px;padding:12px;background:#f1f5f9;border-radius:8px}
a{color:#1d4ed8}
</style></head><body>
<h1>Ön kayıt / bilgilendirme özeti</h1>
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
<tr><td>Haftalık ders saati (öneri)</td><td>${esc(String(haftalik_ders_saati))} saat</td></tr>
<tr><td>Ücret (öneri, TL)</td><td>${esc(String(ucret))}</td></tr>
</table>
<div class="note">
  <strong>6698 sayılı KVKK</strong> kapsamında kişisel verileriniz; eğitim hizmetinin sunulması, sözleşmenin kurulması ve ifası amacıyla işlenebilir.
  Veli olarak bu metni okuduğunuzu ve elektronik onayınızın geçerli olduğunu kabul etmiş olursunuz.
</div>
<div class="kvkk">
  Doğrulama bağlantısı: <a href="${esc(verify_url)}">${esc(verify_url)}</a>
</div>
</body></html>`;
}
