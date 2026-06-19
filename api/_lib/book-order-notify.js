import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { getIstanbulDateString } from './istanbul-time.js';
import { insertWhatsAppAutomationLog } from './message-log.js';
import {
  BOOK_ORDER_TEMPLATE_TYPE,
  BOOK_ORDER_META_NAME,
  BOOK_ORDER_META_BINDINGS,
  buildBookOrderTemplateVars,
  activateBookOrderMetaTemplate,
  sendBookOrderWhatsApp
} from './book-order-meta-send.js';

export {
  BOOK_ORDER_TEMPLATE_TYPE,
  BOOK_ORDER_META_NAME,
  BOOK_ORDER_META_BINDINGS,
  buildBookOrderTemplateVars,
  activateBookOrderMetaTemplate
};

function normBooksellerName(name) {
  return String(name || '').trim().toLocaleLowerCase('tr');
}

async function enrichOrderForNotify(order) {
  const enriched = { ...order };
  const ids = Array.isArray(enriched.kitap_set_ids)
    ? enriched.kitap_set_ids.map((x) => String(x || '').trim()).filter(Boolean)
    : String(enriched.kitap_set_id || '').trim()
      ? [String(enriched.kitap_set_id).trim()]
      : [];
  if (!Array.isArray(enriched.kitap_set_ids)) {
    enriched.kitap_set_ids = ids;
  }
  if (!String(enriched.kitap_set_id || '').trim() && ids.length) {
    enriched.kitap_set_id = ids[0];
  }
  if (!String(enriched.kitaplar || '').trim() && ids.length) {
    const { data: setRows } = await supabaseAdmin
      .from('kitap_siparis_setleri')
      .select('id,name,kitap_icerigi')
      .in('id', ids);
    if (Array.isArray(setRows) && setRows.length) {
      const byId = new Map(setRows.map((r) => [String(r.id), r]));
      const parts = ids
        .map((id) => byId.get(String(id)))
        .filter(Boolean)
        .map((row) => {
          const detail = String(row.kitap_icerigi || '').trim();
          return detail ? `${row.name} — ${detail}` : String(row.name || '').trim();
        })
        .filter(Boolean);
      if (parts.length) {
        enriched.kitaplar = parts.join(' | ');
      }
    }
  }
  if (!String(enriched.kitaplar || '').trim() && enriched.kitap_set_id) {
    const { data: setRow } = await supabaseAdmin
      .from('kitap_siparis_setleri')
      .select('name, kitap_icerigi')
      .eq('id', enriched.kitap_set_id)
      .maybeSingle();
    if (setRow?.name) {
      const detail = String(setRow.kitap_icerigi || '').trim();
      enriched.kitaplar = detail ? `${setRow.name} — ${detail}` : setRow.name;
      enriched.kitap_seti = enriched.kitap_seti || enriched.kitaplar;
    }
  }
  if (!String(enriched.kitap_seti || '').trim() && String(enriched.kitaplar || '').trim()) {
    enriched.kitap_seti = enriched.kitaplar;
  }
  return enriched;
}

async function logBookOrderMessage(order, phone, sent, preview) {
  const warn = sent.delivery_warning || null;
  await insertWhatsAppAutomationLog({
    studentId: null,
    relatedId: order.id,
    kind: 'kitap_siparis_bildirim',
    message: preview || `[${BOOK_ORDER_TEMPLATE_TYPE}] ${order.ogrenci_ad_soyad || order.ogrenci_adi}`,
    status: sent.ok ? 'sent' : 'failed',
    logCode: sent.ok ? null : sent.errorCode || 'meta_send_failed',
    error: sent.ok ? warn : sent.error || null,
    phone,
    logDate: getIstanbulDateString(),
    twilio_error_code: sent.errorCode != null ? String(sent.errorCode) : null,
    meta_message_id: sent.sid || sent.meta_message_id || null,
    meta_template_name: sent.meta_template_name || BOOK_ORDER_META_NAME
  });
}

function isValidBooksellerRow(row) {
  return Boolean(row && row.is_active !== false && normalizePhoneToE164(row.phone));
}

async function listActiveBooksellers(instId) {
  const { data: rows } = await supabaseAdmin
    .from('kitapcilar')
    .select('*')
    .eq('institution_id', instId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  return (rows || []).filter((r) => isValidBooksellerRow(r));
}

async function fetchBooksellerById(id) {
  const booksellerId = String(id || '').trim();
  if (!booksellerId) return { row: null };
  const { data: row } = await supabaseAdmin.from('kitapcilar').select('*').eq('id', booksellerId).maybeSingle();
  if (!row) return { row: null };
  if (row.is_active === false) return { row, reason: 'inactive' };
  if (!normalizePhoneToE164(row.phone)) return { row, reason: 'invalid_phone' };
  return { row };
}

async function fetchBooksellerByName(instId, name) {
  const want = normBooksellerName(name);
  if (!want) return null;
  const active = await listActiveBooksellers(instId);
  return active.find((r) => normBooksellerName(r.name) === want) || null;
}

export async function resolveBooksellerForOrder(order, opts = {}) {
  const instId = String(order.institution_id || '').trim();
  if (!instId) {
    return { error: 'institution_required', hint: 'Kurum bilgisi eksik.' };
  }

  const overrideId = String(opts.kitapciId || '').trim();
  if (overrideId) {
    const fetched = await fetchBooksellerById(overrideId);
    if (fetched.row && isValidBooksellerRow(fetched.row)) return { bookseller: fetched.row };
    if (fetched.reason === 'invalid_phone') {
      return {
        error: 'invalid_bookseller_phone',
        hint: `Kitapçı telefonu geçersiz (${String(fetched.row?.phone || '').trim() || 'boş'}). Kitapçılar bölümünden 05xx formatında güncelleyin.`
      };
    }
    if (fetched.reason === 'inactive') {
      return {
        error: 'bookseller_inactive',
        hint: 'Seçilen kitapçı pasif. Aktifleştirin veya başka kitapçı seçin.'
      };
    }
    const byName = await fetchBooksellerByName(instId, opts.kitapciName || order.kitapci_adi || '');
    if (byName) return { bookseller: byName };
    return {
      error: 'bookseller_not_found',
      hint: 'Seçilen kitapçı bulunamadı veya pasif. Listeden tekrar seçip deneyin.'
    };
  }

  const overrideName = String(opts.kitapciName || order.kitapci_adi || '').trim();
  if (overrideName) {
    const byName = await fetchBooksellerByName(instId, overrideName);
    if (byName) return { bookseller: byName };
  }

  const directPhone = normalizePhoneToE164(order.kitapci_phone);
  if (directPhone && !order.kitapci_id) {
    return {
      bookseller: {
        id: null,
        name: String(order.kitapci_adi || 'Kitapçı').trim(),
        phone: directPhone
      }
    };
  }

  const savedId = String(order.kitapci_id || '').trim();
  if (savedId) {
    const fetched = await fetchBooksellerById(savedId);
    if (fetched.row && isValidBooksellerRow(fetched.row)) return { bookseller: fetched.row };
  }

  const active = await listActiveBooksellers(instId);
  if (!active.length) {
    return {
      error: 'no_active_bookseller',
      hint: 'Aktif kitapçı yok. Kitapçılar bölümünden en az bir aktif kitapçı ekleyin.'
    };
  }
  if (active.length === 1) return { bookseller: active[0] };

  return {
    error: 'bookseller_selection_required',
    hint: 'Birden fazla kitapçı var — gönderim öncesi listeden seçin.'
  };
}

function booksellerFailureStatus(errorCode) {
  if (errorCode === 'no_active_bookseller') return 'skipped';
  return 'failed';
}

export async function notifyBooksellerForOrder(order, opts = {}) {
  const resolved = await resolveBooksellerForOrder(order, opts);
  if (!resolved.bookseller) {
    const errCode = resolved.error || 'no_bookseller';
    await supabaseAdmin
      .from('kitap_siparisleri')
      .update({
        whatsapp_status: booksellerFailureStatus(errCode),
        whatsapp_error: String(resolved.hint || errCode).slice(0, 500),
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id);
    return {
      ok: false,
      skipped: errCode === 'no_active_bookseller',
      error: errCode,
      hint: resolved.hint
    };
  }

  const phone = normalizePhoneToE164(resolved.bookseller.phone);
  if (!phone) {
    await supabaseAdmin
      .from('kitap_siparisleri')
      .update({
        whatsapp_status: 'failed',
        whatsapp_error: 'Kitapçı telefonu geçersiz',
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id);
    return { ok: false, error: 'invalid_bookseller_phone', hint: 'Kitapçı telefonu geçersiz.' };
  }

  const enrichedOrder = await enrichOrderForNotify(order);
  const sent = await sendBookOrderWhatsApp(phone, enrichedOrder);
  const isGateway = sent.channel === 'gateway';

  const now = new Date().toISOString();
  const metaStatus = String(sent.meta_message_status || 'accepted').trim().toLowerCase();
  const waStatus = sent.ok
    ? isGateway
      ? 'sent'
      : metaStatus === 'delivered' || metaStatus === 'read'
        ? 'delivered'
        : 'accepted'
    : 'failed';
  const deliveredNow = isGateway ? sent.ok : metaStatus === 'delivered' || metaStatus === 'read';
  const prevStatus = String(order.status || '');
  const patch = {
    kitapci_id: resolved.bookseller.id || order.kitapci_id || null,
    kitapci_adi: resolved.bookseller.name || order.kitapci_adi,
    kitapci_phone: phone,
    whatsapp_status: waStatus,
    whatsapp_sent_at: sent.ok ? now : order.whatsapp_sent_at || null,
    whatsapp_error: sent.ok
      ? sent.delivery_warning
        ? String(sent.delivery_warning).slice(0, 500)
        : null
      : String(sent.error || 'send_failed').slice(0, 500),
    meta_message_id: sent.ok
      ? isGateway
        ? sent.gateway_message_id || sent.sid || null
        : sent.sid || sent.meta_message_id || null
      : order.meta_message_id,
    /** Meta kabul ≠ teslim: notified yalnızca gerçek delivered/read */
    status: sent.ok
      ? deliveredNow
        ? ['confirmed', 'shipped'].includes(prevStatus)
          ? prevStatus
          : 'notified'
        : prevStatus === 'pending' || prevStatus === 'notified'
          ? 'approved'
          : prevStatus || 'approved'
      : prevStatus || 'pending',
    updated_at: now
  };
  if (sent.ok) patch.meta_delivery_status = isGateway ? 'gateway_sent' : metaStatus || 'accepted';
  let updateErr = null;
  const up1 = await supabaseAdmin.from('kitap_siparisleri').update(patch).eq('id', order.id);
  if (up1.error && String(up1.error.message || '').includes('meta_delivery_status')) {
    const { meta_delivery_status: _drop, ...fallback } = patch;
    const up2 = await supabaseAdmin.from('kitap_siparisleri').update(fallback).eq('id', order.id);
    updateErr = up2.error;
  } else {
    updateErr = up1.error;
  }
  if (updateErr) throw updateErr;
  await logBookOrderMessage(order, phone, sent, sent.bodyPreview);

  const wamid = sent.sid || sent.meta_message_id || sent.gateway_message_id || null;
  if (sent.ok && !wamid && !isGateway) {
    const err = 'Meta yanıtı alındı ancak mesaj kimliği yok — kitapçı telefonunu ve Meta token’ını kontrol edin.';
    await supabaseAdmin
      .from('kitap_siparisleri')
      .update({
        whatsapp_status: 'failed',
        whatsapp_error: err.slice(0, 500),
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id);
    return { ok: false, error: 'meta_no_wamid', hint: err, phone, bookseller_name: resolved.bookseller.name };
  }

  const deliveryHint =
    sent.ok && isGateway
      ? 'Kitapçıya WhatsApp gateway üzerinden gönderildi.'
      : sent.ok && waStatus === 'accepted'
        ? sent.delivery_warning ||
          (sent.meta_contact_wa_id
            ? `Meta kabul etti (wa_id: ${sent.meta_contact_wa_id}) — teslim webhook ile doğrulanır.`
            : 'Meta kabul etti ancak alıcı wa_id dönmedi — numara WhatsApp’ta kayıtlı mı kontrol edin.')
        : null;

  return {
    ok: sent.ok,
    error: sent.ok ? null : sent.error,
    hint: sent.ok ? deliveryHint : sent.error,
    phone,
    bookseller_name: resolved.bookseller.name || null,
    meta_message_id: wamid,
    meta_language_used: sent.meta_language_used || null,
    meta_contact_wa_id: sent.meta_contact_wa_id || null,
    whatsapp_status: waStatus
  };
}

/**
 * Cron yalnızca başarısız gönderimleri yeniden dener.
 * Yeni siparişler süper admin onayında anında gider — pending cron kuyruğu yok.
 */
export async function retryFailedBookOrderNotifications({ limit = 30 } = {}) {
  const { data: rows, error } = await supabaseAdmin
    .from('kitap_siparisleri')
    .select('*')
    .in('status', ['approved', 'notified'])
    .eq('whatsapp_status', 'failed')
    .order('updated_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results = [];
  for (const row of rows || []) {
    const out = await notifyBooksellerForOrder(row);
    results.push({ order_id: row.id, ...out });
  }
  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  return { processed: results.length, sent, failed, results, mode: 'retry_failed_only' };
}

/** @deprecated Cron — yalnızca failed retry; onay anında gönderim yapar. */
export async function processPendingBookOrderNotifications(opts = {}) {
  return retryFailedBookOrderNotifications(opts);
}
