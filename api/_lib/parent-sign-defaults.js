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
  if (t.includes('maarif') || t === 'tyt-maarif') return { hours: 14, fee: 58000 };
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
export const PARA_BIRIMLERI = ['TRY', 'EUR', 'USD', 'GBP'];

export function normalizeParaBirimi(raw) {
  const u = String(raw || 'TRY')
    .trim()
    .toUpperCase();
  return PARA_BIRIMLERI.includes(u) ? u : 'TRY';
}

/** Sözleşme satırından para birimi — kolon, kayıt JSON veya belge metninden */
export function resolveRowParaBirimi(row) {
  const rawCol = row?.para_birimi;
  if (rawCol != null && String(rawCol).trim()) {
    const n = normalizeParaBirimi(rawCol);
    if (n !== 'TRY' || String(rawCol).trim().toUpperCase() === 'TRY') return n;
  }
  const kj = row?.kayit_formu_json;
  if (kj && typeof kj === 'object' && !Array.isArray(kj)) {
    const jpb = kj.para_birimi;
    if (jpb != null && String(jpb).trim()) return normalizeParaBirimi(jpb);
    const ozet = String(kj.muhasebe_ozet || '');
    if (/\bEUR\b/.test(ozet)) return 'EUR';
    if (/\bUSD\b/.test(ozet)) return 'USD';
    if (/\bGBP\b/.test(ozet)) return 'GBP';
  }
  const html = String(row?.merged_html || '');
  if (/\d[\d.,\s]*\s*EUR\b/i.test(html) || /\bEUR\s*€/.test(html)) return 'EUR';
  if (/\d[\d.,\s]*\s*USD\b/i.test(html) || /\bUSD\s*\$/.test(html)) return 'USD';
  if (/\d[\d.,\s]*\s*GBP\b/i.test(html) || /\bGBP\s*£/.test(html)) return 'GBP';
  if (rawCol != null && String(rawCol).trim()) return normalizeParaBirimi(rawCol);
  return 'TRY';
}

export function paraBirimiLabel(code) {
  const c = normalizeParaBirimi(code);
  if (c === 'EUR') return 'EUR';
  if (c === 'USD') return 'USD';
  if (c === 'GBP') return 'GBP';
  return 'TL';
}

export function paraBirimiSymbol(code) {
  const c = normalizeParaBirimi(code);
  if (c === 'EUR') return '€';
  if (c === 'USD') return '$';
  if (c === 'GBP') return '£';
  return '₺';
}

function plainTextToHtmlParagraphs(plain) {
  const lines = String(plain || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return '';
  return lines.map((l) => `<p>${esc(l)}</p>`).join('');
}

/** Kurumda bir kez kaydedilen sözleşme / gizlilik / KVKK metinleri */
export function institutionLegalSectionsHtml(legal, sozlesme_turu) {
  if (!legal || typeof legal !== 'object') return '';
  const tur = normalizeSozlesmeTuru(sozlesme_turu);
  const parts = [];
  const push = (title, plain) => {
    const body = plainTextToHtmlParagraphs(plain);
    if (!body) return;
    parts.push(`<div class="legal-block"><h2>${esc(title)}</h2>${body}</div>`);
  };
  if (tur === 'satis_sozlesmesi') push('Satış sözleşmesi', legal.satis_sozlesmesi);
  if (tur === 'kullanici_sozlesmesi') push('Kullanıcı sözleşmesi', legal.kullanici_sozlesmesi);
  if (tur === 'diger') {
    push('Sözleşme metni', legal.satis_sozlesmesi || legal.kullanici_sozlesmesi);
  }
  push('Gizlilik politikası', legal.gizlilik_politikasi);
  push('KVKK aydınlatma metni', legal.kvkk_aydinlatma);
  return parts.join('');
}

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

const KAYIT_FORM_KEYS = ['tc_kimlik', 'dogum_tarihi', 'okul_adi', 'eposta', 'il', 'ilce', 'ogrenci_tel', 'veli_tel'];

/** DB kayit_formu_json → sözleşme tablosunda gösterilecek düz alanlar */
export function kayitDetayForHtml(j) {
  if (!j || typeof j !== 'object') return {};
  const o = {};
  for (const k of KAYIT_FORM_KEYS) {
    const v = String(j[k] ?? '').trim();
    if (v) o[k] = v;
  }
  return o;
}

/** Kayıt formundan gelen ek alanlar (TC, okul, e-posta, il/ilçe, telefonlar) — sözleşme tablosuna eklenir */
export function kayitFormuTableRowsHtml(detay) {
  if (!detay || typeof detay !== 'object') return '';
  const pairs = [
    ['T.C. Kimlik No', 'tc_kimlik'],
    ['Doğum tarihi', 'dogum_tarihi'],
    ['Okul', 'okul_adi'],
    ['E-posta', 'eposta'],
    ['İl', 'il'],
    ['İlçe', 'ilce'],
    ['Öğrenci telefon', 'ogrenci_tel'],
    ['Veli telefon', 'veli_tel']
  ];
  const rows = [];
  for (const [label, key] of pairs) {
    const v = String(detay[key] ?? '').trim();
    if (v) rows.push(`<tr><td>${esc(label)}</td><td>${esc(v)}</td></tr>`);
  }
  if (!rows.length) return '';
  return `<h2 style="font-size:1rem;color:#1e3a8a;margin:20px 0 8px">Kayıt formu bilgileri</h2><table>${rows.join('')}</table>`;
}

/** Veli linki açıldığında form henüz doldurulmadıysa gösterilen kısa bilgilendirme (tam sözleşme form sonrası üretilir) */
export function buildRegistrationPlaceholderHtml(opts) {
  const {
    kurum_adi,
    contract_number,
    program_adi,
    sinif,
    baslangic_tarihi,
    bitis_tarihi,
    ucret,
    taksit_sayisi,
    para_birimi
  } = opts;
  const pb = paraBirimiLabel(para_birimi);
  const sym = paraBirimiSymbol(para_birimi);
  const taksitN = Math.max(1, Math.min(48, Math.round(Number(taksit_sayisi) || 1)));
  const ucretNum = Number(ucret);
  const taksitTutar =
    Number.isFinite(ucretNum) && ucretNum > 0 && taksitN > 0 ? Math.round(ucretNum / taksitN) : null;
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{font-family:system-ui,sans-serif;line-height:1.55;color:#0f172a;max-width:720px;margin:0 auto;padding:20px}h1{font-size:1.15rem;color:#1e3a8a}</style></head><body>
<h1>Ön kayıt formu</h1>
<p style="font-size:13px;color:#64748b">Belge no: <strong>${esc(contract_number)}</strong>${kurum_adi ? ` · ${esc(kurum_adi)}` : ''}</p>
<p>Aşağıdaki ekranda <strong>kayıt bilgilerinizi</strong> gireceksiniz; KVKK ve satış sözleşmesi bilgilendirmesini onayladıktan sonra kayıt kuruma iletilecek. <strong>Ücret ve taksit</strong> kurum tarafından girildikten sonra bu sayfada tam sözleşme ve e-imza adımı açılacaktır.</p>
<table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">
<tr><td style="border:1px solid #e2e8f0;padding:8px;width:38%;background:#f8fafc;font-weight:600">Program</td><td style="border:1px solid #e2e8f0;padding:8px">${esc(program_adi)}</td></tr>
<tr><td style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;font-weight:600">Sınıf</td><td style="border:1px solid #e2e8f0;padding:8px">${esc(sinif)}</td></tr>
<tr><td style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;font-weight:600">Dönem</td><td style="border:1px solid #e2e8f0;padding:8px">${esc(String(baslangic_tarihi))} – ${esc(String(bitis_tarihi))}</td></tr>
<tr><td style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;font-weight:600">Ücret (${esc(pb)})</td><td style="border:1px solid #e2e8f0;padding:8px">${
    Number(ucret) > 0 ? `${esc(String(ucret))} ${esc(sym)}` : 'Kurum tarafından girilecek'
  }</td></tr>
<tr><td style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;font-weight:600">Taksit</td><td style="border:1px solid #e2e8f0;padding:8px">${esc(String(taksitN))}${
    taksitTutar != null ? ` · Yaklaşık ${esc(String(taksitTutar))} ${esc(pb)}/taksit` : ''
  }</td></tr>
</table>
</body></html>`;
}

/** Veli kayıt gönderildi; kurum henüz ücret girmedi */
export function buildAwaitingAdminPriceHtml(opts) {
  const { kurum_adi, contract_number, ogrenci_label, program_adi, sinif } = opts;
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{font-family:system-ui,sans-serif;line-height:1.55;color:#0f172a;max-width:720px;margin:0 auto;padding:20px}h1{font-size:1.15rem;color:#1e3a8a}</style></head><body>
<h1>Kayıt bilgileri alındı</h1>
<p style="font-size:13px;color:#64748b">Belge no: <strong>${esc(contract_number)}</strong>${kurum_adi ? ` · ${esc(kurum_adi)}` : ''}</p>
<p>Kayıt bilgileriniz kuruma iletildi. <strong>Ücret ve taksit</strong> kurum tarafından sisteme girildikten sonra bu sayfada <strong>satış sözleşmesi</strong> görünecek ve e-imza adımına geçebileceksiniz. Lütfen bir süre sonra sayfayı yenileyin.</p>
${ogrenci_label ? `<p style="font-size:14px"><strong>Öğrenci:</strong> ${esc(ogrenci_label)}</p>` : ''}
${program_adi ? `<p style="font-size:14px"><strong>Program:</strong> ${esc(program_adi)} · <strong>Sınıf:</strong> ${esc(sinif || '—')}</p>` : ''}
</body></html>`;
}

/** YYYY-MM-DD + ay (yerel; ay sonu gün taşması güvenli) */
export function shiftYmdByMonths(ymd, deltaMonths) {
  const m = String(ymd || '')
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m)) return null;
  const [y, mo, d] = m.split('-').map((x) => parseInt(x, 10));
  const t = new Date(y, mo - 1 + deltaMonths, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  const day = Math.min(d, last);
  const r = new Date(t.getFullYear(), t.getMonth(), day);
  const yy = r.getFullYear();
  const mm = String(r.getMonth() + 1).padStart(2, '0');
  const dd = String(r.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function todayYmdLocal() {
  const n = new Date();
  const yy = n.getFullYear();
  const mm = String(n.getMonth() + 1).padStart(2, '0');
  const dd = String(n.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** İstenen vade listesini doğrular; eksikse başlangıçtan aylık üretir */
export function normalizeTaksitVadeleri(rawVadeler, taksitN, baslangicYmd) {
  const n = Math.max(1, Math.min(48, Math.round(Number(taksitN) || 1)));
  const rawStart = String(baslangicYmd || '')
    .trim()
    .slice(0, 10);
  const start = YMD_RE.test(rawStart) ? rawStart : todayYmdLocal();
  const fromBody = Array.isArray(rawVadeler)
    ? rawVadeler.map((v) => String(v || '').trim().slice(0, 10)).filter((v) => YMD_RE.test(v))
    : [];
  const out = [];
  for (let i = 0; i < n; i++) {
    if (fromBody[i] && YMD_RE.test(fromBody[i])) {
      out.push(fromBody[i]);
      continue;
    }
    out.push(shiftYmdByMonths(start, i) || start);
  }
  return out;
}

function autoSplitTutarlar(ucret, n) {
  const u = Number(ucret);
  if (!Number.isFinite(u) || u <= 0 || n <= 0) return [];
  const base = Math.floor(u / n);
  let rem = u - base * n;
  const out = [];
  for (let i = 0; i < n; i++) {
    let t = base;
    if (rem > 0) {
      t++;
      rem--;
    }
    out.push(t);
  }
  return out;
}

/** İstenen taksit tutarları; eksikse ücretten eşit bölünür */
export function normalizeTaksitTutarlari(rawTutarlar, ucret, taksitN) {
  const n = Math.max(1, Math.min(48, Math.round(Number(taksitN) || 1)));
  const fromBody = Array.isArray(rawTutarlar)
    ? rawTutarlar.slice(0, n).map((t) => {
        const x = Math.round(Number(t));
        return Number.isFinite(x) && x >= 0 ? x : null;
      })
    : [];
  if (fromBody.length === n && fromBody.every((t) => t != null)) return fromBody;
  return autoSplitTutarlar(ucret, n);
}

/** Elden / taksitli ödeme takibi — vade ve tutar listesi verilirse kullanılır */
export function buildTaksitPlan(ucret, taksitN, baslangicYmd, vadeDates, tutarlar) {
  const u = Number(ucret);
  const n = Math.max(1, Math.min(48, Math.round(Number(taksitN) || 1)));
  if (!Number.isFinite(u) || u <= 0 || n <= 0) return [];
  const vadeler = normalizeTaksitVadeleri(vadeDates, n, baslangicYmd);
  const tutarList = normalizeTaksitTutarlari(tutarlar, u, n);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      no: i + 1,
      tutar_tl: tutarList[i],
      odendi: false,
      odeme_notu: '',
      vade_tarihi: vadeler[i],
      odendi_tarihi: ''
    });
  }
  return out;
}

/** Ücret/taksit güncellenince ödenmiş taksit durumunu korur */
export function mergeTaksitPlans(oldCards, newCards) {
  const old = Array.isArray(oldCards) ? oldCards : [];
  const neu = Array.isArray(newCards) ? newCards : [];
  return neu.map((card, i) => {
    const prev = old[i] && typeof old[i] === 'object' ? old[i] : null;
    if (!prev) return card;
    return {
      ...card,
      odendi: Boolean(prev.odendi),
      odeme_notu: String(prev.odeme_notu || card.odeme_notu || '').slice(0, 200),
      odendi_tarihi: prev.odendi ? String(prev.odendi_tarihi || card.odendi_tarihi || '').slice(0, 10) : ''
    };
  });
}

export function taksitPlanTableHtml(cards, para_birimi) {
  const list = Array.isArray(cards) ? cards : [];
  if (!list.length) return '';
  const pb = paraBirimiLabel(para_birimi);
  const sym = paraBirimiSymbol(para_birimi);
  const rows = list
    .map((c, i) => {
      const no = c?.no ?? i + 1;
      const tutar = Number(c?.tutar_tl);
      const vade = String(c?.vade_tarihi || '').slice(0, 10);
      const tutarStr = Number.isFinite(tutar) ? `${tutar} ${pb}${sym && pb !== 'TL' ? ` ${sym}` : ''}` : '—';
      return `<tr><td>${esc(String(no))}</td><td>${esc(tutarStr)}</td><td>${esc(vade || '—')}</td></tr>`;
    })
    .join('');
  return `<div class="taksitprog"><h2>Ödeme planı (taksit vadeleri)</h2><table class="dersmini"><thead><tr><th>Taksit</th><th>Tutar</th><th>Vade</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
    ders_satirlari,
    kayit_formu_detay,
    para_birimi,
    institution_legal_html,
    taksit_kartlari
  } = fields;

  const h1 = String(document_title || '').trim() || 'Ön kayıt / bilgilendirme özeti';
  const extraBlock = extraDetailHtmlFromPlain(extra_detail_plain || '');
  const dersBlock = dersProgramTableHtml(ders_satirlari);
  const kayitBlock = kayitFormuTableRowsHtml(kayitDetayForHtml(kayit_formu_detay || {}));
  const legalBlock = String(institution_legal_html || '').trim();
  const taksitBlock = taksitPlanTableHtml(
    taksit_kartlari || (kayit_formu_detay && kayit_formu_detay.taksit_kartlari),
    para_birimi
  );
  const pb = paraBirimiLabel(para_birimi);
  const sym = paraBirimiSymbol(para_birimi);

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
.legal-block{margin-top:20px;font-size:13px;color:#0f172a;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}
.legal-block h2{font-size:1rem;color:#1e3a8a;margin:0 0 8px}
.legal-block p{margin:6px 0}
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
<tr><td>Ücret (${esc(pb)})</td><td>${esc(String(ucret))} ${esc(sym)}</td></tr>
<tr><td>Taksit sayısı</td><td>${esc(String(taksitN))}</td></tr>
${
  taksitTutar != null
    ? `<tr><td>Ortalama taksit tutarı (${esc(pb)})</td><td>${esc(String(taksitTutar))} ${esc(sym)} (yaklaşık)</td></tr>`
    : ''
}
</table>
${kayitBlock}
${dersBlock}
${taksitBlock}
${extraBlock}
${legalBlock}
<div class="note">
  <strong>6698 sayılı KVKK</strong> kapsamında kişisel verileriniz; eğitim hizmetinin sunulması, sözleşmenin kurulması ve ifası amacıyla işlenebilir.
  Veli olarak bu metni okuduğunuzu ve elektronik onayınızın geçerli olduğunu kabul etmiş olursunuz.
</div>
<div class="kvkk">
  Doğrulama bağlantısı: <a href="${esc(verify_url)}">${esc(verify_url)}</a>
</div>
</body></html>`;
}
