/**
 * Meta şablon oluşturma gövdesi — Graph bağımlılığı yok (birim test).
 */

const EXAMPLE_BY_PARAM = {
  veli_ad_soyad: 'Ayse Yilmaz',
  ogrenci_ad_soyad: 'Safiye',
  sinif: '8. Sinif',
  kitap_seti: 'VIP Fen Bilimleri',
  telefon: '05551234567',
  adres: 'Bagdat Cad 10',
  ilce: 'Kadikoy',
  il: 'Istanbul',
  siparis_notu: 'Kapi sifresi 12',
  ucret_durumu: '-',
};

/** Gövdedeki {{named_param}} sırası — yalnızca küçük harf / alt çizgi. */
export function extractNamedTemplateParams(content) {
  const re = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;
  const out = [];
  const seen = new Set();
  let m;
  const text = String(content || '');
  while ((m = re.exec(text))) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** Meta şablon adı: küçük harf, rakam, alt çizgi. */
export function normalizeMetaTemplateName(raw) {
  const tr = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (ch) => tr[ch] || ch)
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s.slice(0, 512);
}

export function exampleForNamedParam(name) {
  const key = String(name || '').trim();
  return EXAMPLE_BY_PARAM[key] || 'ornek';
}

export function buildMetaTemplateCreatePayload({
  name,
  language = 'tr',
  category = 'UTILITY',
  bodyText,
  examples = {},
} = {}) {
  const templateName = normalizeMetaTemplateName(name);
  if (!templateName) throw new Error('meta_template_name_required');
  const text = String(bodyText || '').trim();
  if (!text) throw new Error('template_body_empty');
  const params = extractNamedTemplateParams(text);
  const body = { type: 'BODY', text };
  if (params.length) {
    body.example = {
      body_text_named_params: params.map((param_name) => ({
        param_name,
        example: String(examples[param_name] || exampleForNamedParam(param_name)).slice(0, 80) || 'ornek',
      })),
    };
  }
  return {
    name: templateName,
    language: String(language || 'tr').trim() || 'tr',
    category: String(category || 'UTILITY').trim().toUpperCase() || 'UTILITY',
    parameter_format: 'NAMED',
    allow_category_change: true,
    components: [body],
  };
}
