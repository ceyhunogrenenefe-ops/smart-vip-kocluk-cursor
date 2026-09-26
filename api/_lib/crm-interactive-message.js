/**
 * Seçmeli (butonlu) mesaj gövdeleri — saf kurgu, ağ yok.
 *
 * Numaralı "1) 2) 3)" listesi müşteriye amatör görünüyordu. Resmî API'lerin
 * kendi seçim bileşenleri kullanılır:
 *   WhatsApp Cloud API → interactive button (≤3) veya list (≤10 satır)
 *   Instagram / Messenger → quick replies (≤13)
 *
 * Kanal limitleri aşılırsa buildXxx null döner; çağıran taraf numaralı metne
 * düşer, yani hiçbir durumda mesaj gönderilemeden kalmaz.
 */

/** WhatsApp interactive limitleri (Cloud API) */
export const WA_MAX_BUTTONS = 3;
export const WA_MAX_LIST_ROWS = 10;
export const WA_BUTTON_TITLE_MAX = 20;
export const WA_ROW_TITLE_MAX = 24;
export const WA_BODY_MAX = 1024;

/** Instagram / Messenger quick reply limitleri */
export const IG_MAX_QUICK_REPLIES = 13;
export const IG_QUICK_REPLY_TITLE_MAX = 20;
export const IG_TEXT_MAX = 1000;

function normOptions(options) {
  return (options || [])
    .map((o) => (typeof o === 'string' ? { key: o, label: o } : o))
    .filter((o) => o && String(o.label || '').trim())
    .map((o) => ({
      key: String(o.key ?? o.label).trim().slice(0, 200),
      label: String(o.label).trim(),
      description: o.description ? String(o.description).trim() : ''
    }));
}

function fits(options, max) {
  return options.every((o) => o.label.length <= max);
}

/**
 * WhatsApp interactive gövdesi.
 * @returns {object|null} null → limit aşıldı, numaralı metne düşülmeli
 */
export function buildWhatsAppInteractive({ text, options, listButtonLabel = 'Seçenekler', sectionTitle = '' }) {
  const body = String(text || '').trim().slice(0, WA_BODY_MAX);
  const opts = normOptions(options);
  if (!body || !opts.length) return null;

  if (opts.length <= WA_MAX_BUTTONS && fits(opts, WA_BUTTON_TITLE_MAX)) {
    return {
      type: 'button',
      body: { text: body },
      action: {
        buttons: opts.map((o) => ({
          type: 'reply',
          reply: { id: o.key, title: o.label }
        }))
      }
    };
  }

  if (opts.length <= WA_MAX_LIST_ROWS && fits(opts, WA_ROW_TITLE_MAX)) {
    return {
      type: 'list',
      body: { text: body },
      action: {
        button: String(listButtonLabel || 'Seçenekler').slice(0, 20),
        sections: [
          {
            title: String(sectionTitle || '').slice(0, 24) || undefined,
            rows: opts.map((o) => ({
              id: o.key,
              title: o.label,
              ...(o.description ? { description: o.description.slice(0, 72) } : {})
            }))
          }
        ]
      }
    };
  }

  return null;
}

/**
 * Instagram / Messenger quick reply gövdesi.
 * @returns {object|null} null → limit aşıldı, numaralı metne düşülmeli
 */
export function buildInstagramQuickReplies({ text, options }) {
  const body = String(text || '').trim().slice(0, IG_TEXT_MAX);
  const opts = normOptions(options);
  if (!body || !opts.length) return null;
  if (opts.length > IG_MAX_QUICK_REPLIES) return null;
  if (!fits(opts, IG_QUICK_REPLY_TITLE_MAX)) return null;
  return {
    text: body,
    quick_replies: opts.map((o) => ({
      content_type: 'text',
      title: o.label,
      payload: o.key
    }))
  };
}

/**
 * Seçenekler bu kanalda butona sığıyor mu?
 * Sığmıyorsa çağıran taraf numaralı metin gönderir.
 */
export function interactiveSupported(channel, options) {
  const ch = String(channel || '').toLowerCase();
  if (ch === 'whatsapp') return buildWhatsAppInteractive({ text: '.', options }) !== null;
  if (ch === 'instagram' || ch === 'facebook') {
    return buildInstagramQuickReplies({ text: '.', options }) !== null;
  }
  return false;
}
