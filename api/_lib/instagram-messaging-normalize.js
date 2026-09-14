/**
 * Instagram / Facebook Messaging webhook olaylarını normalize eder.
 * Reklam (Click-to-Message / ADS referral), postback, standby ve boş metinli
 * ilk temas olaylarını CRM / kayıt takibine yazılabilir hale getirir.
 */

export function getMessagingReferral(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const top = ev.referral && typeof ev.referral === 'object' ? ev.referral : null;
  if (top) return top;
  const nested =
    ev.message?.referral && typeof ev.message.referral === 'object' ? ev.message.referral : null;
  if (nested) return nested;
  const postbackRef =
    ev.postback?.referral && typeof ev.postback.referral === 'object' ? ev.postback.referral : null;
  if (postbackRef) return postbackRef;
  return null;
}

export function isAdsReferral(ref) {
  if (!ref || typeof ref !== 'object') return false;
  const source = String(ref.source || '').toUpperCase();
  if (source === 'ADS' || source === 'AD') return true;
  if (ref.ad_id || ref.ads_context_data) return true;
  const type = String(ref.type || '').toUpperCase();
  if (type === 'OPEN_THREAD' && (ref.ad_id || ref.ads_context_data)) return true;
  return false;
}

function adReferralSnippet(ref) {
  const ctx = ref?.ads_context_data || {};
  const title = String(ctx.ad_title || ref?.headline || '').trim();
  const bits = ['[Instagram reklamından sohbet]'];
  if (title) bits.push(title);
  if (ref?.ad_id) bits.push(`ad:${ref.ad_id}`);
  return bits.join(' — ');
}

/**
 * @returns {{
 *   senderId: string|null,
 *   text: string|null,
 *   messageId: string|null,
 *   messageType: string,
 *   hasInboundContent: boolean,
 *   isEcho: boolean,
 *   referral: object|null,
 *   isAd: boolean
 * }}
 */
export function normalizeInstagramMessagingEvent(ev) {
  const referral = getMessagingReferral(ev);
  const isEcho = Boolean(ev?.message?.is_echo);
  const senderId = ev?.sender?.id ? String(ev.sender.id) : null;
  const messageId = ev?.message?.mid
    ? String(ev.message.mid)
    : ev?.postback?.mid
      ? String(ev.postback.mid)
      : referral?.ad_id && senderId
        ? `igref:${senderId}:${referral.ad_id}:${ev?.timestamp || ''}`
        : referral && senderId
          ? `igref:${senderId}:${ev?.timestamp || '0'}`
          : null;

  let text = ev?.message?.text != null ? String(ev.message.text) : null;
  const hasAttachments = Boolean(
    (Array.isArray(ev?.message?.attachments) && ev.message.attachments.length) ||
      ev?.message?.attachment ||
      ev?.message?.sticker_id
  );

  if (!text && ev?.postback) {
    const title = ev.postback.title != null ? String(ev.postback.title).trim() : '';
    const payload = ev.postback.payload != null ? String(ev.postback.payload).trim() : '';
    text = title || payload || '[Instagram postback]';
  }

  if (!text && !hasAttachments && referral && isAdsReferral(referral)) {
    text = adReferralSnippet(referral);
  } else if (!text && !hasAttachments && referral) {
    text = '[Instagram sohbet başladı]';
  }

  const hasInboundContent = Boolean(text || hasAttachments);
  return {
    senderId,
    text,
    messageId,
    messageType: text && !hasAttachments ? 'text' : hasAttachments ? 'attachment' : 'text',
    hasInboundContent,
    isEcho,
    referral,
    isAd: isAdsReferral(referral)
  };
}

/** entry.messaging + entry.standby (Handover / reklam inbox) */
export function collectEntryMessagingEvents(entry) {
  const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
  const standby = Array.isArray(entry?.standby) ? entry.standby : [];
  return [...messaging, ...standby];
}

/**
 * Page webhook'unda IG business id ile Instagram kanalını ayır.
 * Reklam CTM çoğu zaman object=page üzerinden gelir.
 */
export function resolveSocialChannelFromWebhook({ objectType, event, igBusinessId } = {}) {
  const obj = String(objectType || '').toLowerCase();
  if (obj === 'instagram') return 'instagram';
  if (obj !== 'page') return obj === 'facebook' ? 'facebook' : 'instagram';

  const igBiz = String(
    igBusinessId || process.env.META_IG_BUSINESS_ID || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || ''
  ).trim();
  const recipientId = String(event?.recipient?.id || '').trim();
  if (igBiz && recipientId && recipientId === igBiz) return 'instagram';

  const ref = getMessagingReferral(event);
  if (isAdsReferral(ref)) return 'instagram';

  return 'facebook';
}
