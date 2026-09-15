/**
 * Meta webhook ingress diagnostics — token/secret/message body asla loglanmaz.
 * Instagram DM vs comment vs Meta Dashboard “Test” ayrımı + drop reason codes.
 */
import { collectChangeMessagingEvents } from './instagram-messaging-normalize.js';

export const DROP = {
  UNSUPPORTED_OBJECT: 'DROP_UNSUPPORTED_OBJECT',
  UNKNOWN_PAGE: 'DROP_UNKNOWN_PAGE',
  UNKNOWN_IG: 'DROP_UNKNOWN_IG',
  SYNTHETIC_META_TEST: 'DROP_SYNTHETIC_META_TEST',
  NO_MESSAGING: 'DROP_NO_MESSAGING',
  ECHO: 'DROP_ECHO',
  DUPLICATE: 'DROP_DUPLICATE',
  NO_TENANT: 'DROP_NO_TENANT',
  UNKNOWN_SENDER: 'DROP_UNKNOWN_SENDER',
  NO_SENDER: 'DROP_NO_SENDER',
  NO_INBOUND_CONTENT: 'DROP_NO_INBOUND_CONTENT',
  HANDOVER_ONLY: 'DROP_HANDOVER_ONLY',
  READ_ONLY: 'DROP_READ_ONLY',
  ROUTING: 'DROP_ROUTING',
  INVALID_SIGNATURE: 'DROP_INVALID_SIGNATURE'
};

export const ACCEPT = {
  MESSAGING: 'ACCEPT_MESSAGING',
  STANDBY: 'ACCEPT_STANDBY',
  COMMENT: 'ACCEPT_COMMENT',
  WHATSAPP: 'ACCEPT_WHATSAPP',
  PAGE_MESSAGING: 'ACCEPT_PAGE_MESSAGING'
};

function safeHeader(req, name) {
  try {
    const h = req?.headers;
    if (!h) return null;
    const v = h[name] || h[name.toLowerCase()] || h[String(name).toLowerCase()];
    if (v == null) return null;
    const s = Array.isArray(v) ? String(v[0] || '') : String(v);
    // imza / auth değerlerini tam yazma
    if (/signature|authorization|cookie/i.test(name)) {
      return s ? `${s.slice(0, 12)}…(len=${s.length})` : null;
    }
    return s.slice(0, 120) || null;
  } catch {
    return null;
  }
}

function firstMessagingEvent(entry) {
  const messaging = [
    ...(Array.isArray(entry?.messaging) ? entry.messaging : []),
    ...collectChangeMessagingEvents(entry)
  ];
  const standby = Array.isArray(entry?.standby) ? entry.standby : [];
  return {
    messaging,
    standby,
    first: messaging[0] || standby[0] || null,
    fromStandby: !messaging[0] && Boolean(standby[0])
  };
}

/**
 * Entry’nin taşıdığı sinyal gücü.
 * 2 = gerçek gelen içerik (mesaj/ek/reklam referralı/yorum)
 * 1 = gönderen var ama içerik yok (okundu, echo, handover)
 * 0 = boş
 * Çok entry’li POST’ta okundu bildirimi gerçek DM’i gölgelemesin diye gerekli.
 */
function entrySignalStrength(entry) {
  for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
    const f = String(change?.field || '').toLowerCase();
    if (f === 'comments' || f === 'live_comments') return 2;
    if (f === 'feed' && String(change?.value?.item || '') === 'comment') return 2;
  }
  const { messaging, standby } = firstMessagingEvent(entry);
  let best = 0;
  for (const ev of [...messaging, ...standby]) {
    if (!ev?.sender?.id) continue;
    if (best < 1) best = 1;
    if (ev?.message?.is_echo) continue;
    const hasContent = Boolean(
      (ev?.message?.text != null && String(ev.message.text).length > 0) ||
        (Array.isArray(ev?.message?.attachments) && ev.message.attachments.length) ||
        ev?.message?.attachment ||
        ev?.message?.sticker_id ||
        ev?.referral ||
        ev?.message?.referral ||
        ev?.postback
    );
    if (hasContent) return 2;
  }
  return best;
}

/**
 * Payload + request’ten güvenli teşhis özeti (PII/text yok).
 */
export function classifyMetaWebhookIngress(body, req = null) {
  const receivedAt = new Date().toISOString();
  const objectType = String(body?.object || '').toLowerCase() || null;
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  // Meta tek POST’ta birden çok entry yollayabilir (ilki okundu bilgisi, ikincisi
  // gerçek DM gibi). Yalnız entries[0]’a bakmak gerçek mesajı görünmez kılıyordu.
  const entry =
    entries.find((e) => entrySignalStrength(e) === 2) ||
    entries.find((e) => entrySignalStrength(e) === 1) ||
    entries[0] ||
    {};
  const entryId = entry?.id != null ? String(entry.id) : null;

  const { messaging, standby, first, fromStandby } = firstMessagingEvent(entry);
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  const changeFields = changes.map((c) => String(c?.field || '')).filter(Boolean);

  const hasHandover = Boolean(
    first?.pass_thread_control ||
      first?.take_thread_control ||
      first?.request_thread_control ||
      changeFields.includes('messaging_handover')
  );
  const hasRead = Boolean(first?.read);
  const hasPostback = Boolean(first?.postback);
  const hasReferral = Boolean(first?.referral || first?.message?.referral || first?.postback?.referral);
  const hasMessage = Boolean(first?.message);
  const isEcho = Boolean(first?.message?.is_echo);
  const senderId = first?.sender?.id != null ? String(first.sender.id) : null;
  const recipientId = first?.recipient?.id != null ? String(first.recipient.id) : null;
  const messageMid = first?.message?.mid != null ? String(first.message.mid) : null;
  const hasText = first?.message?.text != null && String(first.message.text).length > 0;
  const hasAttachments = Boolean(
    (Array.isArray(first?.message?.attachments) && first.message.attachments.length) ||
      first?.message?.attachment ||
      first?.message?.sticker_id
  );

  const commentChange = changes.find((c) => {
    const f = String(c?.field || '').toLowerCase();
    return f === 'comments' || f === 'live_comments' || (f === 'feed' && String(c?.value?.item || '') === 'comment');
  });
  const hasComment = Boolean(commentChange);
  const commentSender =
    commentChange?.value?.from?.id != null ? String(commentChange.value.from.id) : null;

  // Meta App Dashboard “Send test” payload’u entry.id=0 ve gönderensiz gelir.
  // Gönderen VEYA message mid varsa olay gerçektir — `changes[field=messages]`
  // biçimindeki gerçek IG DM’leri sentetik sayıp düşürmeyelim.
  const isSynthetic =
    entryId === '0' ||
    entryId === '000000000000000' ||
    (objectType === 'instagram' &&
      !senderId &&
      !commentSender &&
      !messageMid &&
      (messaging.length > 0 || changeFields.includes('messages')));

  /** @type {string} */
  let channelClass = 'unknown';
  if (objectType === 'whatsapp_business_account') channelClass = 'whatsapp';
  else if (objectType === 'instagram') channelClass = 'instagram';
  else if (objectType === 'page') channelClass = 'facebook_or_ig_page';
  else if (objectType) channelClass = objectType;

  /** @type {string|null} */
  let verdict = null;
  /** @type {string|null} */
  let dropReason = null;

  if (objectType && !['instagram', 'page', 'whatsapp_business_account'].includes(objectType)) {
    verdict = DROP.UNSUPPORTED_OBJECT;
    dropReason = DROP.UNSUPPORTED_OBJECT;
  } else if (isSynthetic && objectType === 'instagram' && !hasComment) {
    verdict = DROP.SYNTHETIC_META_TEST;
    dropReason = DROP.SYNTHETIC_META_TEST;
  } else if (objectType === 'whatsapp_business_account') {
    verdict = ACCEPT.WHATSAPP;
  } else if (hasComment && !hasMessage && messaging.length === 0 && standby.length === 0) {
    verdict = ACCEPT.COMMENT;
  } else if (fromStandby && (hasMessage || hasReferral || hasPostback)) {
    verdict = ACCEPT.STANDBY;
  } else if (messaging.length && isEcho) {
    verdict = DROP.ECHO;
    dropReason = DROP.ECHO;
  } else if (messaging.length && !senderId && !hasHandover && !hasRead) {
    verdict = DROP.NO_SENDER;
    dropReason = DROP.NO_SENDER;
  } else if (messaging.length && senderId && !hasText && !hasAttachments && !hasReferral && !hasPostback && !hasHandover) {
    if (hasRead) {
      verdict = DROP.READ_ONLY;
      dropReason = DROP.READ_ONLY;
    } else {
      verdict = DROP.NO_INBOUND_CONTENT;
      dropReason = DROP.NO_INBOUND_CONTENT;
    }
  } else if (hasHandover && !hasMessage && !hasReferral && !hasPostback) {
    verdict = DROP.HANDOVER_ONLY;
    dropReason = DROP.HANDOVER_ONLY;
  } else if (messaging.length && (hasMessage || hasReferral || hasPostback)) {
    verdict = objectType === 'page' ? ACCEPT.PAGE_MESSAGING : ACCEPT.MESSAGING;
  } else if (standby.length === 0 && messaging.length === 0 && !hasComment) {
    verdict = DROP.NO_MESSAGING;
    dropReason = DROP.NO_MESSAGING;
  } else {
    verdict = ACCEPT.MESSAGING;
  }

  return {
    received_at: receivedAt,
    method: req?.method || 'POST',
    object: objectType,
    entry_id: entryId,
    entry_count: entries.length,
    channel_class: channelClass,
    has_messaging: messaging.length > 0,
    messaging_count: messaging.length,
    has_standby: standby.length > 0,
    standby_count: standby.length,
    has_handover: hasHandover,
    has_read: hasRead,
    has_postback: hasPostback,
    has_referral: hasReferral,
    has_message: hasMessage,
    has_text: hasText,
    has_attachments: hasAttachments,
    has_comment: hasComment,
    is_echo: isEcho,
    is_synthetic_meta_test: isSynthetic,
    sender_id: senderId || commentSender,
    recipient_id: recipientId,
    message_mid_suffix: messageMid ? messageMid.slice(-12) : null,
    change_fields: changeFields.slice(0, 8),
    verdict,
    drop_reason: dropReason,
    meta_headers: req
      ? {
          'user-agent': safeHeader(req, 'user-agent'),
          'x-hub-signature-256': safeHeader(req, 'x-hub-signature-256'),
          'content-type': safeHeader(req, 'content-type')
        }
      : null
  };
}

/**
 * Son webhook loglarından IG DM teslimat boşluğunu hesapla.
 * Yorumlar geliyor + WA geliyor ama gerçek IG DM (sender’lı messaging) yok → META_DID_NOT_DELIVER.
 */
export function analyzeInstagramDmDelivery(logs = [], { nowMs = Date.now(), windowMs = 24 * 60 * 60 * 1000 } = {}) {
  const since = nowMs - windowMs;
  const rows = Array.isArray(logs) ? logs : [];
  const inWindow = rows.filter((l) => {
    const at = l?.received_at ? new Date(l.received_at).getTime() : 0;
    return at >= since;
  });

  const isIg = (l) => {
    const p = String(l.platform || l.object_type || '').toLowerCase();
    return p === 'instagram' || p.includes('instagram');
  };

  const igRows = inWindow.filter(isIg);
  const commentRows = igRows.filter((l) => /comment/i.test(String(l.event_type || l.field || '')));
  const syntheticRows = igRows.filter((l) => {
    const igAccount = String(l.instagram_account_id || l.sample?.instagram_account_id || '');
    const sender = l.sender_id || l.sample?.sender_id;
    const err = String(l.processing_error || '');
    return igAccount === '0' || err.includes('DROP_SYNTHETIC_META_TEST') || (!sender && /messages/i.test(String(l.event_type || l.field || '')));
  });
  const realDmRows = igRows.filter((l) => {
    const sender = l.sender_id || l.sample?.sender_id;
    const evt = String(l.event_type || l.field || '').toLowerCase();
    const mid = l.message_id || l.sample?.message_id;
    if (!sender) return false;
    if (/comment/i.test(evt)) return false;
    if (String(l.instagram_account_id || '') === '0') return false;
    return Boolean(mid) || evt.includes('message') || evt.includes('messaging') || evt.includes('referral');
  });

  const lastComment = commentRows[0] || null;
  const lastRealDm = realDmRows[0] || null;
  const lastSynthetic = syntheticRows[0] || null;
  const lastIgAny = igRows[0] || null;

  const commentsRecent = commentRows.length > 0;
  const realDmRecent = realDmRows.length > 0;
  const metaDidNotDeliver = Boolean(commentsRecent && !realDmRecent);

  let verdict = 'OK';
  if (metaDidNotDeliver) verdict = 'META_DID_NOT_DELIVER';
  else if (!realDmRecent && syntheticRows.length > 0) verdict = 'ONLY_SYNTHETIC_META_TESTS';
  else if (!igRows.length) verdict = 'NO_IG_WEBHOOKS';

  return {
    verdict,
    meta_did_not_deliver: metaDidNotDeliver,
    window_hours: Math.round(windowMs / 3600000),
    ig_webhook_hits: igRows.length,
    ig_comment_hits: commentRows.length,
    ig_real_dm_hits: realDmRows.length,
    ig_synthetic_hits: syntheticRows.length,
    last_instagram_event: lastIgAny
      ? (() => {
          const dropReason = lastIgAny.processing_error || lastIgAny.sample?.drop_reason || null;
          const evt = String(lastIgAny.event_type || lastIgAny.field || '').toLowerCase();
          const channel =
            /comment/i.test(evt) ? 'instagram_comment'
            : String(lastIgAny.instagram_account_id || '') === '0' ? 'instagram_synthetic'
            : 'instagram_dm';
          const dropped = Boolean(dropReason && String(dropReason).startsWith('DROP_'));
          return {
            received_at: lastIgAny.received_at || null,
            object: lastIgAny.object_type || lastIgAny.platform || null,
            entry_id: lastIgAny.instagram_account_id || lastIgAny.page_id || null,
            event_type: lastIgAny.event_type || lastIgAny.field || null,
            channel,
            accepted: !dropped,
            dropped,
            drop_reason: dropReason,
            sender_id: lastIgAny.sender_id || lastIgAny.sample?.sender_id || null,
            message_id: lastIgAny.message_id || lastIgAny.sample?.message_id || null,
            processing_status: lastIgAny.processing_status || null
          };
        })()
      : null,
    last_instagram_comment_at: lastComment?.received_at || null,
    last_instagram_real_dm_at: lastRealDm?.received_at || null,
    last_instagram_synthetic_at: lastSynthetic?.received_at || null,
    hint:
      verdict === 'META_DID_NOT_DELIVER'
        ? 'Yorum webhook’ları SmartKocluk’a geliyor; gerçek IG DM POST’u gelmiyor. Meta Conversation Routing / Kommo hâlâ DM birincil alıcısı — Kommo Instagram’ı tamamen kesilmeli. Kod filtresi değil, META_DID_NOT_DELIVER.'
        : verdict === 'ONLY_SYNTHETIC_META_TESTS'
          ? 'Meta App Dashboard “Test” butonu boş payload (entry.id=0) gönderiyor; bu CRM konuşması oluşturmaz. Gerçek Instagram hesabından DM gönderin.'
          : null
  };
}
