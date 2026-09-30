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

export function extractPositionalTemplateCount(content) {
  const nums = [...String(content || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.reduce((max, n) => Math.max(max, n), 0);
}

/** Meta şablon limitleri — UI ve sunucu aynı sayıyı kullansın diye tek yerde. */
export const TEMPLATE_LIMITS = {
  nameMax: 512,
  headerTextMax: 60,
  bodyMax: 1024,
  footerMax: 60,
  quickReplyMax: 3,
  /** Meta: en çok 1 telefon + 2 URL butonu */
  phoneButtonMax: 1,
  urlButtonMax: 2,
  buttonTextMax: 25,
  totalButtonMax: 10
};

export const HEADER_TYPES = ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'];

/**
 * HEADER bileşeni.
 *
 * Medya başlığında Meta, incelemede kullanacağı ÖRNEK medyayı ister; bu örnek
 * Resumable Upload ile alınan `header_handle` olarak gönderilir. Elimizde
 * handle yoksa bileşeni hiç üretmeyiz — eksik örnekle gönderim Meta'da
 * "media example required" hatasıyla döner ve kullanıcı sebebini anlamaz.
 */
export function buildHeaderComponent({ headerType, headerText, headerHandle, headerExample } = {}) {
  const type = String(headerType || 'NONE').toUpperCase();
  if (type === 'NONE' || !HEADER_TYPES.includes(type)) return null;

  if (type === 'TEXT') {
    const text = String(headerText || '').trim().slice(0, TEMPLATE_LIMITS.headerTextMax);
    if (!text) return null;
    const comp = { type: 'HEADER', format: 'TEXT', text };
    // Başlıkta değişken kullanıldıysa Meta örnek ister
    const count = extractPositionalTemplateCount(text);
    const named = extractNamedTemplateParams(text);
    if (named.length) {
      comp.example = {
        header_text_named_params: named.map((param_name) => ({
          param_name,
          example: String(headerExample || exampleForNamedParam(param_name)).slice(0, 60)
        }))
      };
    } else if (count > 0) {
      comp.example = { header_text: [String(headerExample || 'ornek').slice(0, 60)] };
    }
    return comp;
  }

  const handle = String(headerHandle || '').trim();
  if (!handle) return null;
  return { type: 'HEADER', format: type, example: { header_handle: [handle] } };
}

/** FOOTER bileşeni — değişken kabul etmez. */
export function buildFooterComponent(footerText) {
  const text = String(footerText || '').trim().slice(0, TEMPLATE_LIMITS.footerMax);
  return text ? { type: 'FOOTER', text } : null;
}

/**
 * BUTTONS bileşeni.
 *
 * Meta karışık kullanıma izin verir ama sayılar sınırlı: en çok 3 hızlı yanıt,
 * 1 telefon, 2 URL. Sınırı aşanlar sessizce kırpılır — gönderim tamamen
 * reddedilmektense butonun fazlası düşsün.
 */
export function buildButtonsComponent(buttons) {
  const list = Array.isArray(buttons) ? buttons : [];
  const out = [];
  let quick = 0;
  let phone = 0;
  let url = 0;

  for (const b of list) {
    const kind = String(b?.type || '').toUpperCase();
    const text = String(b?.text || '').trim().slice(0, TEMPLATE_LIMITS.buttonTextMax);
    if (!text) continue;

    if (kind === 'QUICK_REPLY') {
      if (quick >= TEMPLATE_LIMITS.quickReplyMax) continue;
      quick += 1;
      out.push({ type: 'QUICK_REPLY', text });
      continue;
    }
    if (kind === 'PHONE_NUMBER') {
      if (phone >= TEMPLATE_LIMITS.phoneButtonMax) continue;
      const num = String(b?.phone_number || '').replace(/[^\d+]/g, '');
      if (!num) continue;
      phone += 1;
      out.push({ type: 'PHONE_NUMBER', text, phone_number: num });
      continue;
    }
    if (kind === 'URL') {
      if (url >= TEMPLATE_LIMITS.urlButtonMax) continue;
      const link = String(b?.url || '').trim();
      if (!/^https?:\/\//i.test(link)) continue;
      url += 1;
      const comp = { type: 'URL', text, url: link };
      // Dinamik URL: sonunda {{1}} varsa Meta örnek ister
      if (/\{\{\s*1\s*\}\}/.test(link)) {
        comp.example = [String(b?.url_example || link.replace(/\{\{\s*1\s*\}\}/, 'ornek'))];
      }
      out.push(comp);
    }
  }
  return out.length ? { type: 'BUTTONS', buttons: out } : null;
}

export function buildMetaTemplateCreatePayload({
  name,
  language = 'tr',
  category = 'UTILITY',
  bodyText,
  examples = {},
  headerType = 'NONE',
  headerText = '',
  headerHandle = '',
  headerExample = '',
  footerText = '',
  buttons = []
} = {}) {
  const templateName = normalizeMetaTemplateName(name);
  if (!templateName) throw new Error('meta_template_name_required');
  const text = String(bodyText || '').trim();
  if (!text) throw new Error('template_body_empty');
  const params = extractNamedTemplateParams(text);
  const positionalCount = extractPositionalTemplateCount(text);
  const body = { type: 'BODY', text };
  let parameter_format = 'NAMED';
  if (params.length) {
    body.example = {
      body_text_named_params: params.map((param_name) => ({
        param_name,
        example: String(examples[param_name] || exampleForNamedParam(param_name)).slice(0, 80) || 'ornek',
      })),
    };
  } else if (positionalCount > 0) {
    parameter_format = 'POSITIONAL';
    body.example = {
      body_text: [
        Array.from({ length: positionalCount }, (_, i) => {
          const key = String(i + 1);
          return String(examples[key] || examples[i] || `ornek${i + 1}`).slice(0, 80) || `ornek${i + 1}`;
        }),
      ],
    };
  }
  /**
   * Bileşen sırası Meta'da anlamlı: HEADER → BODY → FOOTER → BUTTONS.
   * Header/footer/buton yoksa hiç eklenmez, yani eski davranış birebir korunur.
   */
  const header = buildHeaderComponent({ headerType, headerText, headerHandle, headerExample });
  const footer = buildFooterComponent(footerText);
  const buttonComp = buildButtonsComponent(buttons);

  return {
    name: templateName,
    language: String(language || 'tr').trim() || 'tr',
    category: String(category || 'UTILITY').trim().toUpperCase() || 'UTILITY',
    parameter_format,
    allow_category_change: true,
    components: [header, body, footer, buttonComp].filter(Boolean),
  };
}
