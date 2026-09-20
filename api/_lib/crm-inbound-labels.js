/**
 * Gelen mesajların gelen kutusunda okunur görünmesi için gövde metni ve ek bağlantısı.
 * Meta bazı mesajları içeriğiyle göndermez (type: "unsupported", hata 131060) —
 * temsilci "[unsupported]" yerine ne olduğunu ve ne yapacağını görmeli.
 */

export const WA_TYPE_LABELS = {
  image: 'Fotoğraf',
  audio: 'Sesli mesaj',
  voice: 'Sesli mesaj',
  video: 'Video',
  document: 'Belge',
  sticker: 'Çıkartma',
  location: 'Konum',
  contacts: 'Kişi kartı',
  order: 'Sipariş',
  system: 'Sistem mesajı'
};

/** Meta'nın "bu mesaj kullanılamıyor" hatası (ör. anlık görüntü, desteklenmeyen tür) */
export function unsupportedLabel(message) {
  const err = Array.isArray(message?.errors) ? message.errors[0] : null;
  const code = err?.code ? ` (kod ${err.code})` : '';
  return `⚠️ Mesaj alınamadı${code} — WhatsApp içeriği iletmedi. Müşteriden tekrar göndermesini isteyin.`;
}

/**
 * WhatsApp gelen mesajı → { body, mediaUrl }
 * @param {Record<string, any>} m Cloud API mesaj nesnesi
 */
export function whatsappInboundBody(m) {
  const type = String(m?.type || 'text').toLowerCase();
  const media = m?.[type];

  if (type === 'text') return { body: m?.text?.body != null ? String(m.text.body) : null, mediaUrl: null };
  if (type === 'button') return { body: m?.button?.text != null ? String(m.button.text) : '[button]', mediaUrl: null };
  if (type === 'interactive') {
    return {
      body: m?.interactive?.button_reply?.title || m?.interactive?.list_reply?.title || '[interactive]',
      mediaUrl: null
    };
  }
  if (type === 'reaction') {
    const emoji = String(m?.reaction?.emoji || '').trim();
    return { body: emoji ? `Tepki verdi: ${emoji}` : 'Mesaja tepki verdi', mediaUrl: null };
  }
  if (type === 'unsupported') return { body: unsupportedLabel(m), mediaUrl: null };
  if (type === 'revoke' || m?.revoke) return { body: 'Müşteri bu mesajı sildi', mediaUrl: null };
  if (type === 'edit') {
    const edited = m?.edit?.text?.body || m?.text?.body;
    return { body: edited ? `Mesajını düzenledi: ${edited}` : 'Müşteri mesajını düzenledi', mediaUrl: null };
  }
  if (type === 'location') {
    const name = String(m?.location?.name || '').trim();
    return { body: name ? `[Konum] ${name}` : '[Konum]', mediaUrl: null };
  }

  const label = WA_TYPE_LABELS[type];
  if (label) {
    const caption = media?.caption ? String(media.caption) : '';
    return {
      body: caption || `[${label}]`,
      mediaUrl: media?.id ? `meta-media:${media.id}` : null
    };
  }
  return { body: `[${type}]`, mediaUrl: null };
}

const IG_ATTACHMENT_LABELS = {
  image: 'Fotoğraf',
  video: 'Video',
  audio: 'Sesli mesaj',
  file: 'Dosya',
  share: 'Paylaşım',
  ig_post: 'Instagram gönderisi',
  ig_reel: 'Instagram reels',
  story_mention: 'Hikâyede bahsetti',
  story_reply: 'Hikâye yanıtı',
  template: 'Şablon'
};

/**
 * Instagram / Facebook DM eki → { body, mediaUrl }
 * Ek bağlantısı saklanır; temsilci gelen kutusunda açabilsin.
 */
export function instagramAttachmentSummary(message) {
  const list = Array.isArray(message?.attachments)
    ? message.attachments
    : message?.attachment
      ? [message.attachment]
      : [];
  if (!list.length) {
    return message?.sticker_id ? { body: '[Çıkartma]', mediaUrl: null } : { body: null, mediaUrl: null };
  }
  const first = list[0] || {};
  const type = String(first.type || '').toLowerCase();
  const url = String(first?.payload?.url || first?.url || '').trim();
  const label = IG_ATTACHMENT_LABELS[type] || 'Medya / ek';
  const extra = list.length > 1 ? ` (+${list.length - 1})` : '';
  return { body: `[${label}]${extra}`, mediaUrl: /^https?:\/\//i.test(url) ? url : null };
}
