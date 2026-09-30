/**
 * Şablon GÖNDERİMİ için `template.components` üretir.
 *
 * Şablon oluşturma (meta-template-payload.js) ile karıştırılmamalı: orada
 * bileşenlerin *tanımı*, burada gönderim anındaki *değerleri* var. Meta ikisini
 * ayrı biçimde ister — örneğin medya başlığı tanımda `example.header_handle`,
 * gönderimde `image.link` olarak geçer.
 *
 * Eski davranış korunur: yalnız gövde metinleri verildiğinde çıktı, daha önce
 * meta-whatsapp.js içinde elle kurulan `[{ type:'body', parameters:[…] }]`
 * dizisiyle birebir aynıdır.
 */

const MEDIA_KEY = { IMAGE: 'image', VIDEO: 'video', DOCUMENT: 'document' };

/** Gövde parametreleri — sıralı ya da adlandırılmış. */
export function buildBodyParameters(texts, names = null) {
  const list = Array.isArray(texts) ? texts : [];
  if (!list.length) return null;
  const nameList = Array.isArray(names) ? names : null;
  const useNamed =
    nameList != null &&
    nameList.length === list.length &&
    nameList.every((n) => String(n || '').trim().length > 0);
  return list.map((t, i) => {
    const text = String(t ?? '').slice(0, 4096);
    if (!useNamed) return { type: 'text', text };
    const parameter_name = String(nameList[i] || '')
      .trim()
      .replace(/^\{\{|\}\}$/g, '')
      .slice(0, 256);
    return { type: 'text', parameter_name, text };
  });
}

/**
 * Başlık bileşeni.
 * TEXT başlıkta yalnız şablonda `{{1}}` varsa parametre gerekir; metin yoksa
 * bileşen hiç eklenmez (Meta boş parametre dizisini reddeder).
 */
export function buildSendHeaderComponent({
  headerType = 'NONE',
  headerText = '',
  mediaUrl = '',
  mediaId = '',
  documentFilename = ''
} = {}) {
  const type = String(headerType || 'NONE').toUpperCase();
  if (type === 'TEXT') {
    const text = String(headerText || '').trim();
    if (!text) return null;
    return { type: 'header', parameters: [{ type: 'text', text: text.slice(0, 60) }] };
  }
  const key = MEDIA_KEY[type];
  if (!key) return null;
  const id = String(mediaId || '').trim();
  const link = String(mediaUrl || '').trim();
  if (!id && !/^https?:\/\//i.test(link)) return null;
  /** @type {Record<string, string>} */
  const media = id ? { id } : { link };
  if (key === 'document') {
    const fn = String(documentFilename || '').trim();
    if (fn) media.filename = fn.slice(0, 240);
  }
  return { type: 'header', parameters: [{ type: key, [key]: media }] };
}

/**
 * Buton bileşenleri.
 * Yalnız dinamik butonlar parametre alır: URL butonunda `{{1}}` varsa eklenecek
 * yol parçası, hızlı yanıtta geri dönecek payload. Sabit butonlar (düz URL,
 * telefon) gönderimde parametre istemez — listede yer almazlar.
 *
 * @param {Array<{ index?: number, type?: string, text?: string }>} buttons
 */
export function buildSendButtonComponents(buttons) {
  const list = Array.isArray(buttons) ? buttons : [];
  const out = [];
  for (const b of list) {
    const text = String(b?.text ?? '').trim();
    if (!text) continue;
    const kind = String(b?.type || 'URL').toUpperCase();
    const index = Number.isInteger(b?.index) ? Number(b.index) : out.length;
    if (index < 0 || index > 9) continue;
    if (kind === 'QUICK_REPLY') {
      out.push({
        type: 'button',
        sub_type: 'quick_reply',
        index: String(index),
        parameters: [{ type: 'payload', payload: text.slice(0, 256) }]
      });
      continue;
    }
    if (kind === 'URL') {
      out.push({
        type: 'button',
        sub_type: 'url',
        index: String(index),
        parameters: [{ type: 'text', text: text.slice(0, 2000) }]
      });
    }
  }
  return out.length ? out : null;
}

/**
 * Tüm bileşenleri Meta'nın beklediği sırayla döner: header → body → buttons.
 * Hiçbiri yoksa `null` — çağıran `components` alanını hiç eklemez.
 */
export function buildTemplateSendComponents({
  bodyParameterTexts = [],
  bodyParameterNames = null,
  headerType = 'NONE',
  headerText = '',
  headerMediaUrl = '',
  headerMediaId = '',
  documentFilename = '',
  buttonParameters = []
} = {}) {
  const components = [];
  const header = buildSendHeaderComponent({
    headerType,
    headerText,
    mediaUrl: headerMediaUrl,
    mediaId: headerMediaId,
    documentFilename
  });
  if (header) components.push(header);

  const bodyParams = buildBodyParameters(bodyParameterTexts, bodyParameterNames);
  if (bodyParams) components.push({ type: 'body', parameters: bodyParams });

  const btns = buildSendButtonComponents(buttonParameters);
  if (btns) components.push(...btns);

  return components.length ? components : null;
}
