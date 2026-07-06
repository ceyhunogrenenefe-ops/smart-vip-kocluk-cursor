import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import {
  notifyBooksellerForOrder,
  processPendingBookOrderNotifications,
  activateBookOrderMetaTemplate,
  BOOK_ORDER_META_NAME
} from '../api/_lib/book-order-notify.js';
import { getMetaWhatsAppEnvStatus, getMetaWebhookEnvStatus } from '../api/_lib/meta-whatsapp.js';
import { fetchMetaTemplatesFromPhoneWaba } from '../api/_lib/meta-templates-sync.js';
import { getGatewaySendEnvStatus, getGatewaySessionStatus, bookOrderGatewaySessionId, resolveBookOrderGatewaySessionId, listConnectedGatewaySessionIds, probeGatewayHealth } from '../api/_lib/whatsapp-gateway-send.js';
import { ensureBooksellerPortalToken } from '../api/_lib/kitapci-portal.js';

const ADMIN_ROLES = new Set(['super_admin', 'admin']);
const ORDER_STATUSES = new Set(['pending', 'approved', 'notified', 'confirmed', 'shipped', 'cancelled']);

function actorGatewaySessionId(actor) {
  return resolveBookOrderGatewaySessionId(String(actor?.sub || actor?.id || '').trim());
}

async function safeNotifyBooksellerForOrder(order, opts) {
  try {
    return await notifyBooksellerForOrder(order, opts);
  } catch (e) {
    const msg = errorMessage(e);
    console.error('[book-orders] WhatsApp notify exception', order?.id, msg);
    try {
      await supabaseAdmin
        .from('kitap_siparisleri')
        .update({
          whatsapp_status: 'failed',
          whatsapp_error: msg.slice(0, 500),
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
    } catch {
      /* ignore secondary failure */
    }
    return { ok: false, error: 'notify_exception', hint: msg };
  }
}

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function isSchemaError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('kitap_siparisleri') ||
    msg.includes('kitap_siparis_setleri') ||
    msg.includes('kitapcilar') ||
    (msg.includes('does not exist') && msg.includes('relation'))
  );
}

function isKitapSetIdsColumnMissingError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    (code === '42703' || code === 'PGRST204' || code === 'PGRST205') &&
    msg.includes('kitap_set_ids')
  );
}

function parseSiniflarInput(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  const s = String(raw || '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  return s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeKitapSetBody(body) {
  const name = String(body.name || '').trim();
  const kitap_icerigi = String(body.kitap_icerigi || body.aciklama || body.kitaplar || '').trim();
  const siniflar = parseSiniflarInput(body.siniflar);
  const sort_order = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  const is_active = body.is_active !== false;
  const product_url = trimOrNull(body.product_url);
  return { name, kitap_icerigi, siniflar, sort_order, is_active, product_url };
}

function schemaHint(res) {
  return res.status(400).json({
    error: 'schema_missing',
    hint: "Supabase'de sql/2026-06-18-kitap-siparisleri.sql dosyasını çalıştırın."
  });
}

function verifyPublicFormKey(req) {
  const expected = String(process.env.BOOK_ORDER_FORM_SECRET || '').trim();
  if (!expected) return false;
  const header = String(req.headers['x-book-order-key'] || req.headers['x-form-secret'] || '').trim();
  const query = String(req.query?.key || '').trim();
  return header === expected || query === expected;
}

const PLATFORM_BOOK_ORDER_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

/** Veli formu — gizli anahtar veya izinli kurum kimliği */
function verifyPublicFormSubmit(req, body) {
  if (verifyPublicFormKey(req)) return true;
  const allowed = new Set(
    [PLATFORM_BOOK_ORDER_INSTITUTION_ID, String(process.env.BOOK_ORDER_INSTITUTION_ID || '').trim()].filter(Boolean)
  );
  return allowed.has(String(body?.institution_id || '').trim());
}

function resolveInstitutionId(body, actor) {
  if (actor?.institution_id) return String(actor.institution_id);
  const fromBody = String(body.institution_id || '').trim();
  if (fromBody) return fromBody;
  const envDefault = String(process.env.BOOK_ORDER_INSTITUTION_ID || '').trim();
  return envDefault || null;
}

function normalizeUcretDurumu(body) {
  const direct = String(body.ucret_durumu || body.ucret || '').trim();
  if (direct === 'Ödendi' || direct === 'Ödenmedi') return direct;
  if (direct) {
    const low = direct.toLowerCase();
    if (low === 'ödendi' || low === 'odendi') return 'Ödendi';
    if (low === 'ödenmedi' || low === 'odenmedi') return 'Ödenmedi';
  }
  const odeme = String(body.odeme || body.odeme_durumu || '').trim().toLowerCase();
  if (odeme === 'odendi' || odeme === 'ödendi') return 'Ödendi';
  if (odeme === 'odenmedi' || odeme === 'ödenmedi') return 'Ödenmedi';
  if (body.odendi === true || body.odendi === 'true' || body.odendi === '1') return 'Ödendi';
  if (body.odenmedi === true || body.odenmedi === 'true' || body.odenmedi === '1') return 'Ödenmedi';
  return direct || null;
}

function kitapciIdFromRequest(req, body) {
  return String(body?.kitapci_id || req.query?.kitapci_id || '').trim() || null;
}

function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function normalizeIdArray(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  const one = String(raw || '').trim();
  return one ? [one] : [];
}

/** Admin sipariş düzenleme — form alanları */
function buildOrderAdminPatch(body) {
  /** @type {Record<string, unknown>} */
  const patch = {};
  if (body.veli_ad_soyad != null) {
    const v = trimOrNull(body.veli_ad_soyad);
    if (!v) throw Object.assign(new Error('veli_ad_soyad_required'), { code: 'VALIDATION' });
    patch.veli_ad_soyad = v;
  }
  if (body.ogrenci_ad_soyad != null) {
    const v = trimOrNull(body.ogrenci_ad_soyad);
    if (!v) throw Object.assign(new Error('ogrenci_ad_soyad_required'), { code: 'VALIDATION' });
    patch.ogrenci_ad_soyad = v;
  }
  if (body.telefon != null) patch.telefon = trimOrNull(body.telefon) || 'Belirtilmedi';
  if (body.sinif != null) patch.sinif = trimOrNull(body.sinif);
  if (body.adres != null) patch.adres = trimOrNull(body.adres);
  if (body.ilce != null) patch.ilce = trimOrNull(body.ilce);
  if (body.il != null) patch.il = trimOrNull(body.il);
  if (body.ucret_durumu != null) patch.ucret_durumu = trimOrNull(body.ucret_durumu);
  if (body.siparis_notu != null) patch.siparis_notu = trimOrNull(body.siparis_notu);
  if (body.kitap_set_id != null) {
    patch.kitap_set_id = trimOrNull(body.kitap_set_id);
  }
  if (body.kitap_set_ids != null) {
    patch.kitap_set_ids = normalizeIdArray(body.kitap_set_ids);
  }
  if (body.kitaplar != null) patch.kitaplar = trimOrNull(body.kitaplar);
  if (body.status != null) {
    const status = String(body.status || '').trim();
    if (status && !ORDER_STATUSES.has(status)) {
      throw Object.assign(new Error('invalid_status'), { code: 'VALIDATION' });
    }
    if (status) patch.status = status;
  }
  return patch;
}

async function resolveKitaplarFromSetId(setId) {
  const id = String(setId || '').trim();
  if (!id) return null;
  const { data: setRow } = await supabaseAdmin
    .from('kitap_siparis_setleri')
    .select('name, kitap_icerigi')
    .eq('id', id)
    .maybeSingle();
  if (!setRow?.name) return null;
  const detail = String(setRow.kitap_icerigi || '').trim();
  return detail ? `${setRow.name} — ${detail}` : setRow.name;
}

async function resolveKitaplarFromSetIds(setIds) {
  const ids = normalizeIdArray(setIds);
  if (!ids.length) return null;
  const { data: rows } = await supabaseAdmin
    .from('kitap_siparis_setleri')
    .select('id,name,kitap_icerigi')
    .in('id', ids);
  if (!Array.isArray(rows) || !rows.length) return null;
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);
  const parts = ordered.map((row) => {
    const detail = String(row.kitap_icerigi || '').trim();
    return detail ? `${row.name} — ${detail}` : String(row.name || '').trim();
  }).filter(Boolean);
  return parts.length ? parts.join(' | ') : null;
}

function parsePublicOrderBody(body) {
  const veli_ad_soyad = String(
    body.veli_ad_soyad || body.veli_adi || body.veli || body.parent_name || ''
  ).trim();
  const ogrenci_ad_soyad = String(
    body.ogrenci_ad_soyad || body.ogrenci_adi || body.ogrenci || body.student_name || ''
  ).trim();
  const telefon = String(body.telefon || body.phone || '').trim();
  return {
    veli_ad_soyad,
    ogrenci_ad_soyad,
    telefon,
    sinif: String(body.sinif || body.class_level || body.sinif_seviyesi || '').trim() || null,
    ucret_durumu: normalizeUcretDurumu(body),
    adres: String(body.adres || body.address || '').trim() || null,
    ilce: String(body.ilce || body.district || '').trim() || null,
    il: String(body.il || body.city || body.sehir || '').trim() || null,
    siparis_notu: String(body.siparis_notu || body.notlar || body.note || body.notes || '').trim() || null,
    kitapci_id: String(body.kitapci_id || '').trim() || null,
    kitapci_adi: String(body.kitapci_adi || '').trim() || null,
    kitapci_phone: String(body.kitapci_phone || '').trim() || null,
    kitap_set_ids: normalizeIdArray(body.kitap_set_ids),
    kitap_set_id: String(body.kitap_set_id || '').trim() || null,
    kitaplar: String(body.kitaplar || '').trim() || null
  };
}

async function insertBookOrder(payload) {
  const now = new Date().toISOString();
  const insertPayload = {
    ...payload,
    created_at: now,
    updated_at: now
  };
  let { data, error } = await supabaseAdmin
    .from('kitap_siparisleri')
    .insert(insertPayload)
    .select('*')
    .maybeSingle();
  if (error && isKitapSetIdsColumnMissingError(error)) {
    const { kitap_set_ids, ...legacyPayload } = insertPayload;
    ({ data, error } = await supabaseAdmin
      .from('kitap_siparisleri')
      .insert(legacyPayload)
      .select('*')
      .maybeSingle());
  }
  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  const op = String(req.query?.op || '').trim();
  const scope = String(req.query?.scope || '').trim();
  const id = String(req.query?.id || '').trim();

  if (req.method === 'GET' && scope === 'public-kitap-sets') {
    const institution_id = String(req.query?.institution_id || '').trim();
    if (!institution_id) {
      return res.status(400).json({ error: 'institution_required', hint: 'institution_id gerekli.' });
    }
    try {
      const { data, error } = await supabaseAdmin
        .from('kitap_siparis_setleri')
        .select('id,name,kitap_icerigi,siniflar,sort_order')
        .eq('institution_id', institution_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    } catch (e) {
      if (isSchemaError(e)) {
        return res.status(400).json({
          error: 'schema_missing',
          hint: "Supabase'de sql/2026-06-25-kitap-siparis-setleri.sql dosyasını çalıştırın."
        });
      }
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'POST' && op === 'public-submit') {
    const body = parseBody(req);
    if (!verifyPublicFormSubmit(req, body)) {
      return res.status(401).json({
        error: 'unauthorized',
        hint: 'Form gönderimi için geçerli institution_id veya BOOK_ORDER_FORM_SECRET gerekli.'
      });
    }
    const institution_id = resolveInstitutionId(body, null);
    const parsed = parsePublicOrderBody(body);
    if (!institution_id) {
      return res.status(400).json({ error: 'institution_required', hint: 'institution_id gerekli.' });
    }
    if (!parsed.ogrenci_ad_soyad) return res.status(400).json({ error: 'ogrenci_ad_soyad_required' });
    if (!parsed.veli_ad_soyad) return res.status(400).json({ error: 'veli_ad_soyad_required' });
    const telefonRaw = String(parsed.telefon || '').trim();
    if (!telefonRaw || /^belirtilmedi$/i.test(telefonRaw)) {
      return res.status(400).json({
        error: 'telefon_required',
        hint: 'Geçerli veli telefonu gerekli (05xx xxx xx xx).'
      });
    }
    const telefonE164 = normalizePhoneToE164(telefonRaw);
    if (!telefonE164) {
      return res.status(400).json({
        error: 'invalid_telefon',
        hint: 'Geçerli bir Türkiye cep telefonu girin (05xx xxx xx xx).'
      });
    }
    parsed.telefon = telefonE164;
    if (!parsed.kitap_set_ids.length && parsed.kitap_set_id) {
      parsed.kitap_set_ids = [parsed.kitap_set_id];
    }
    if (!parsed.kitap_set_id && parsed.kitap_set_ids.length) {
      parsed.kitap_set_id = parsed.kitap_set_ids[0];
    }

    try {
      let kitaplar = parsed.kitaplar;
      if (!kitaplar && parsed.kitap_set_ids.length) {
        kitaplar = await resolveKitaplarFromSetIds(parsed.kitap_set_ids);
      }
      if (!kitaplar && parsed.kitap_set_id) {
        kitaplar = await resolveKitaplarFromSetId(parsed.kitap_set_id);
      }
      const order = await insertBookOrder({
        institution_id,
        ...parsed,
        kitaplar: kitaplar || parsed.kitaplar || 'Kitap siparişi',
        source: 'form',
        form_payload: body,
        status: 'pending',
        whatsapp_status: 'awaiting_approval'
      });
      return res.status(201).json({
        ok: true,
        data: order,
        hint: 'Sipariş kaydedildi. Admin onayından sonra kitapçıya WhatsApp gidecek.'
      });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) || 'insert_failed' });
    }
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const isSuper = actor.role === 'super_admin';
  const isAdmin = ADMIN_ROLES.has(actor.role);
  if (!isAdmin) return res.status(403).json({ error: 'forbidden' });

  const institutionFilter = isSuper
    ? String(req.query?.institution_id || '').trim() || null
    : String(req.query?.institution_id || actor.institution_id || PLATFORM_BOOK_ORDER_INSTITUTION_ID || '').trim() ||
      null;

  if (req.method === 'POST' && op === 'create') {
    const body = parseBody(req);
    const institution_id = isSuper
      ? String(body.institution_id || institutionFilter || '').trim()
      : String(actor.institution_id || '').trim();
    if (!institution_id) {
      return res.status(400).json({
        error: 'institution_required',
        hint: 'Kurum seçili değil — üstten kurum seçin veya institution_id gönderin.'
      });
    }
    const parsed = parsePublicOrderBody(body);
    if (!parsed.ogrenci_ad_soyad) return res.status(400).json({ error: 'ogrenci_ad_soyad_required' });
    if (!parsed.veli_ad_soyad) return res.status(400).json({ error: 'veli_ad_soyad_required' });
    const telefonRaw = String(parsed.telefon || '').trim();
    if (!telefonRaw || /^belirtilmedi$/i.test(telefonRaw)) {
      return res.status(400).json({
        error: 'telefon_required',
        hint: 'Geçerli veli telefonu gerekli (05xx xxx xx xx).'
      });
    }
    const telefonE164 = normalizePhoneToE164(telefonRaw);
    if (!telefonE164) {
      return res.status(400).json({
        error: 'invalid_telefon',
        hint: 'Geçerli bir Türkiye cep telefonu girin (05xx xxx xx xx).'
      });
    }
    parsed.telefon = telefonE164;
    if (!parsed.kitap_set_ids.length && parsed.kitap_set_id) {
      parsed.kitap_set_ids = [parsed.kitap_set_id];
    }
    if (!parsed.kitap_set_id && parsed.kitap_set_ids.length) {
      parsed.kitap_set_id = parsed.kitap_set_ids[0];
    }

    try {
      let kitaplar = parsed.kitaplar;
      if (!kitaplar && parsed.kitap_set_ids.length) {
        kitaplar = await resolveKitaplarFromSetIds(parsed.kitap_set_ids);
      }
      if (!kitaplar && parsed.kitap_set_id) {
        kitaplar = await resolveKitaplarFromSetId(parsed.kitap_set_id);
      }
      const order = await insertBookOrder({
        institution_id,
        ...parsed,
        kitaplar: kitaplar || parsed.kitaplar || 'Kitap siparişi',
        source: 'admin',
        status: 'pending',
        whatsapp_status: 'awaiting_approval'
      });
      return res.status(201).json({
        ok: true,
        data: order,
        hint: 'Sipariş kaydedildi. Admin onayından sonra kitapçıya WhatsApp gidecek.'
      });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) || 'insert_failed' });
    }
  }

  if (req.method === 'GET' && scope === 'stats' && isSuper) {
    try {
      const [booksellers, orders, sets] = await Promise.all([
        supabaseAdmin.from('kitapcilar').select('institution_id'),
        supabaseAdmin.from('kitap_siparisleri').select('institution_id'),
        supabaseAdmin.from('kitap_siparis_setleri').select('institution_id')
      ]);
      if (booksellers.error) throw booksellers.error;
      if (orders.error) throw orders.error;
      if (sets.error && !isSchemaError(sets.error)) throw sets.error;

      const byInst = new Map();
      const bump = (instId, field) => {
        const id = String(instId || '').trim() || '(boş)';
        const row = byInst.get(id) || { institution_id: id, booksellers: 0, orders: 0, sets: 0 };
        row[field] += 1;
        byInst.set(id, row);
      };
      for (const r of booksellers.data || []) bump(r.institution_id, 'booksellers');
      for (const r of orders.data || []) bump(r.institution_id, 'orders');
      for (const r of sets.data || []) bump(r.institution_id, 'sets');

      const totals = {
        booksellers: (booksellers.data || []).length,
        orders: (orders.data || []).length,
        sets: (sets.data || []).length
      };
      return res.status(200).json({
        data: {
          totals,
          by_institution: [...byInst.values()].sort((a, b) => b.orders - a.orders)
        }
      });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'GET' && scope === 'gateway-config') {
    try {
      const gateway = getGatewaySendEnvStatus();
      const gatewayHealth = await probeGatewayHealth();
      let gatewayLive = null;
      const actorId = String(actor.sub || actor.id || '').trim();
      const uiSessionId = actorId;
      const sendSessionId = actorId;
      const envSendSessionId = bookOrderGatewaySessionId();
      const connectedLive = await listConnectedGatewaySessionIds();
      if (gateway.upstream_ready || sendSessionId || connectedLive.length) {
        try {
          gatewayLive = await getGatewaySessionStatus(sendSessionId);
        } catch {
          gatewayLive = { ok: false, status: 'check_failed' };
        }
      }
      return res.status(200).json({
        data: {
          session_id: uiSessionId || null,
          send_session_id: sendSessionId || null,
          env_session_id: envSendSessionId || null,
          env_configured: Boolean(envSendSessionId),
          gateway,
          gateway_health: gatewayHealth,
          gateway_session: gatewayLive,
          webhook: getMetaWebhookEnvStatus(),
          connected_live_session_ids: connectedLive.length ? connectedLive.map((x) => `…${x.slice(-8)}`) : [],
          hint: !gatewayHealth.ok
            ? `VPS erişilemiyor (${gatewayHealth.error || 'fetch_failed'}) — pm2 restart whatsapp-gateway`
            : !gatewayLive?.ok
              ? `Sizin WhatsApp oturumunuz bağlı değil — aşağıdan kendi numaranızı QR ile bağlayın.`
              : envSendSessionId && envSendSessionId !== actorId
                ? `Sizin hattınız bağlı. Cron otomasyonu env oturumunu (…${envSendSessionId.slice(-8)}) kullanabilir — farklıysa env güncelleyin.`
                : 'Kitap siparişi WhatsApp gateway — sizin hesabınız bağlı.'
        }
      });
    } catch (e) {
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'GET' && scope === 'whatsapp-template') {
    try {
      const activated = await activateBookOrderMetaTemplate({
        gatewaySessionId: actorGatewaySessionId(actor)
      });
      const env = getMetaWhatsAppEnvStatus();
      const webhook = getMetaWebhookEnvStatus();
      const gateway = getGatewaySendEnvStatus();
      const gatewayHealth = await probeGatewayHealth();
      const plan = activated.send_plan || {};
      let gatewayLive = null;
      if (gateway.upstream_ready || plan.gwReady) {
        try {
          gatewayLive = await getGatewaySessionStatus(
            bookOrderGatewaySessionId() || actorGatewaySessionId(actor)
          );
        } catch {
          gatewayLive = { ok: false, status: 'check_failed' };
        }
      }
      let templateMeta = null;
      try {
        const live = await fetchMetaTemplatesFromPhoneWaba(BOOK_ORDER_META_NAME);
        const hit = (live?.matches || []).find(
          (r) => String(r?.name || '').trim() === BOOK_ORDER_META_NAME
        );
        if (hit) {
          templateMeta = {
            category: String(hit.category || '').trim() || null,
            status: String(hit.status || '').trim() || null,
            language: String(hit.language || '').trim() || null
          };
        }
      } catch {
        /* opsiyonel */
      }
      return res.status(200).json({
        ok: plan.tryGateway ? gatewayLive?.ok === true : env.configured,
        template_name: BOOK_ORDER_META_NAME,
        language: 'tr',
        phone_number_id_suffix: env.phone_number_id_suffix,
        waba_id_suffix: env.waba_id_suffix,
        meta_configured: env.configured,
        activated: activated.ok,
        channel: activated.send_via || 'meta_cloud_api',
        send_via: activated.send_via || 'meta_cloud_api',
        send_plan: plan,
        meta_fallback: plan.metaFallback !== false,
        gateway,
        gateway_health: gatewayHealth,
        gateway_session: gatewayLive,
        webhook,
        template_meta: templateMeta,
        hint: !gatewayHealth.ok && plan.tryMeta
          ? `VPS erişilemiyor (${gatewayHealth.error || 'fetch_failed'}) — kitap siparişleri Meta şablonu ile gider.`
          : !gatewayHealth.ok
            ? `VPS erişilemiyor (${gatewayHealth.error || 'fetch_failed'}) — kitap siparişleri Meta ile gider (gateway opsiyonel).`
            : gatewayLive?.error && plan.tryMeta
              ? `${gatewayLive.error} Gönderim Meta şablonu ile yapılır.`
              : gatewayLive?.error
                ? gatewayLive.error
                : plan.tryMeta
                  ? 'Kitap siparişleri kurumsal Meta şablonu (kitap_siparisi1) ile gider.'
                  : plan.tryGateway && gatewayLive?.ok
                    ? 'Kitap siparişleri BOOK_ORDER_WHATSAPP_CHANNEL=gateway — Baileys oturumu üzerinden.'
                    : gateway.hint
      });
    } catch (e) {
      return res.status(200).json({
        ok: false,
        template_name: BOOK_ORDER_META_NAME,
        error: errorMessage(e),
        channel: 'gateway'
      });
    }
  }

  if (req.method === 'GET' && scope === 'kitap-sets') {
    try {
      let q = supabaseAdmin
        .from('kitap_siparis_setleri')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    } catch (e) {
      if (isSchemaError(e)) {
        return res.status(400).json({
          error: 'schema_missing',
          hint: "Supabase'de sql/2026-06-25-kitap-siparis-setleri.sql dosyasını çalıştırın."
        });
      }
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'GET' && scope === 'booksellers') {
    try {
      let q = supabaseAdmin.from('kitapcilar').select('*').order('name', { ascending: true });
      if (institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      await Promise.all(
        rows.map(async (row) => {
          if (String(row.portal_token || '').trim()) return;
          try {
            const token = await ensureBooksellerPortalToken(row.id);
            if (token) row.portal_token = token;
          } catch {
            /* portal_token yoksa listeyi yine döndür */
          }
        })
      );
      return res.status(200).json({ data: rows });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'GET') {
    try {
      let q = supabaseAdmin.from('kitap_siparisleri').select('*').order('created_at', { ascending: false }).limit(500);
      if (institutionFilter) q = q.eq('institution_id', institutionFilter);
      const status = String(req.query?.status || '').trim();
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'POST' && op === 'bookseller') {
    const body = parseBody(req);
    const institution_id = isSuper
      ? String(body.institution_id || institutionFilter || '').trim()
      : String(actor.institution_id || '').trim();
    const name = String(body.name || '').trim();
    const phone = normalizePhoneToE164(body.phone);
    if (!institution_id) {
      return res.status(400).json({
        error: 'institution_required',
        hint: 'Kurum seçili değil — üstten kurum seçin veya institution_id gönderin.'
      });
    }
    if (!name) return res.status(400).json({ error: 'name_required', hint: 'Kitapçı adı gerekli.' });
    if (!phone) {
      return res.status(400).json({
        error: 'invalid_phone',
        hint: 'Geçerli bir telefon girin (ör. 0532 000 00 00).'
      });
    }
    try {
      const now = new Date().toISOString();
      const row = {
        institution_id,
        name,
        phone,
        city: String(body.city || '').trim() || null,
        bolge: String(body.bolge || '').trim() || null,
        is_active: body.is_active !== false,
        notes: String(body.notes || '').trim() || null,
        created_at: now,
        updated_at: now
      };
      let { data, error } = await supabaseAdmin.from('kitapcilar').insert(row).select('*').maybeSingle();
      if (error) throw error;
      if (data?.id) {
        try {
          await ensureBooksellerPortalToken(data.id);
          const { data: fresh } = await supabaseAdmin.from('kitapcilar').select('*').eq('id', data.id).maybeSingle();
          if (fresh) data = fresh;
        } catch {
          /* portal_token sütunu yoksa kitapçı yine kaydedilir */
        }
      }
      return res.status(201).json({ data });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'PATCH' && op === 'bookseller' && id) {
    const body = parseBody(req);
    const patch = { updated_at: new Date().toISOString() };
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.phone != null) {
      const p = normalizePhoneToE164(body.phone);
      if (!p) return res.status(400).json({ error: 'invalid_phone' });
      patch.phone = p;
    }
    if (body.city != null) patch.city = String(body.city).trim() || null;
    if (body.bolge != null) patch.bolge = String(body.bolge).trim() || null;
    if (body.notes != null) patch.notes = String(body.notes).trim() || null;
    if (body.is_active != null) patch.is_active = body.is_active !== false;
    try {
      let q = supabaseAdmin.from('kitapcilar').update(patch).eq('id', id);
      if (!isSuper && institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { data, error } = await q.select('*').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ data });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'POST' && op === 'bookseller-portal-token' && id) {
    try {
      let q = supabaseAdmin.from('kitapcilar').select('id').eq('id', id);
      if (!isSuper && institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { data: row, error } = await q.maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ error: 'not_found' });
      const token = await ensureBooksellerPortalToken(id);
      const { data: fresh } = await supabaseAdmin.from('kitapcilar').select('*').eq('id', id).maybeSingle();
      return res.status(200).json({ ok: true, portal_token: token, data: fresh });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'POST' && op === 'kitap-set') {
    const body = parseBody(req);
    const institution_id = isSuper
      ? String(body.institution_id || institutionFilter || '').trim()
      : String(actor.institution_id || '').trim();
    const normalized = normalizeKitapSetBody(body);
    if (!institution_id) return res.status(400).json({ error: 'institution_required' });
    if (!normalized.name) return res.status(400).json({ error: 'name_required' });
    if (!normalized.kitap_icerigi) return res.status(400).json({ error: 'kitap_icerigi_required' });
    if (!normalized.siniflar.length) return res.status(400).json({ error: 'siniflar_required' });
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('kitap_siparis_setleri')
        .insert({
          institution_id,
          ...normalized,
          created_at: now,
          updated_at: now
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return res.status(201).json({ data });
    } catch (e) {
      if (isSchemaError(e)) {
        return res.status(400).json({
          error: 'schema_missing',
          hint: "Supabase'de sql/2026-06-25-kitap-siparis-setleri.sql dosyasını çalıştırın."
        });
      }
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'PATCH' && op === 'kitap-set' && id) {
    const body = parseBody(req);
    const patch = { updated_at: new Date().toISOString() };
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.kitap_icerigi != null || body.aciklama != null) {
      patch.kitap_icerigi = String(body.kitap_icerigi || body.aciklama || '').trim();
    }
    if (body.siniflar != null) patch.siniflar = parseSiniflarInput(body.siniflar);
    if (body.sort_order != null) patch.sort_order = Number(body.sort_order) || 0;
    if (body.is_active != null) patch.is_active = body.is_active !== false;
    if (body.product_url != null) patch.product_url = trimOrNull(body.product_url);
    try {
      let q = supabaseAdmin.from('kitap_siparis_setleri').update(patch).eq('id', id);
      if (!isSuper && institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { data, error } = await q.select('*').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ data });
    } catch (e) {
      if (isSchemaError(e)) {
        return res.status(400).json({
          error: 'schema_missing',
          hint: "Supabase'de sql/2026-06-25-kitap-siparis-setleri.sql dosyasını çalıştırın."
        });
      }
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'DELETE' && op === 'kitap-set' && id) {
    try {
      let q = supabaseAdmin.from('kitap_siparis_setleri').delete().eq('id', id);
      if (!isSuper && institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { error } = await q;
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (e) {
      if (isSchemaError(e)) {
        return res.status(400).json({
          error: 'schema_missing',
          hint: "Supabase'de sql/2026-06-25-kitap-siparis-setleri.sql dosyasını çalıştırın."
        });
      }
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'DELETE' && op === 'bookseller' && id) {
    try {
      let fetchQ = supabaseAdmin.from('kitapcilar').select('id, institution_id, name').eq('id', id);
      if (!isSuper && institutionFilter) fetchQ = fetchQ.eq('institution_id', institutionFilter);
      const { data: seller, error: fetchErr } = await fetchQ.maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!seller) return res.status(404).json({ error: 'not_found' });

      const { count, error: countErr } = await supabaseAdmin
        .from('kitap_siparisleri')
        .select('id', { count: 'exact', head: true })
        .eq('kitapci_id', id);
      if (countErr) throw countErr;
      if ((count || 0) > 0) {
        return res.status(400).json({
          error: 'has_orders',
          hint: 'Bu kitapçıya bağlı sipariş var — silmek yerine «Pasifleştir» kullanın.'
        });
      }

      const { error } = await supabaseAdmin.from('kitapcilar').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'POST' && op === 'sync-meta-template') {
    try {
      const result = await activateBookOrderMetaTemplate();
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: errorMessage(e) });
    }
  }

  if (req.method === 'POST' && op === 'approve' && id) {
    try {
      await activateBookOrderMetaTemplate();
      const body = parseBody(req);
      const kitapciId = kitapciIdFromRequest(req, body);
      let q = supabaseAdmin.from('kitap_siparisleri').select('*').eq('id', id);
      if (!isSuper && institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { data: order, error } = await q.maybeSingle();
      if (error) throw error;
      if (!order) return res.status(404).json({ error: 'not_found' });
      if (String(order.status || '') === 'cancelled') {
        return res.status(400).json({ error: 'order_cancelled', hint: 'İptal edilmiş sipariş onaylanamaz.' });
      }
      const wa = String(order.whatsapp_status || '').toLowerCase();
      if (wa === 'delivered' || wa === 'read') {
        return res.status(400).json({
          error: 'already_delivered',
          hint: 'WhatsApp kitapçıya teslim edildi — yeniden onay gerekmez.'
        });
      }
      const now = new Date().toISOString();
      const approvePatch = {
        status: 'approved',
        whatsapp_status: 'sending',
        whatsapp_error: null,
        updated_at: now
      };
      if (kitapciId) approvePatch.kitapci_id = kitapciId;
      const { data: approved, error: upErr } = await supabaseAdmin
        .from('kitap_siparisleri')
        .update(approvePatch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (upErr) throw upErr;
      const notify = await safeNotifyBooksellerForOrder(approved || { ...order, ...approvePatch }, {
        kitapciId,
        kitapciName: order.kitapci_adi,
        gatewaySessionId: actorGatewaySessionId(actor)
      });
      const { data: fresh } = await supabaseAdmin.from('kitap_siparisleri').select('*').eq('id', id).maybeSingle();
      if (!notify.ok) {
        return res.status(200).json({
          ok: true,
          approved: true,
          whatsapp_ok: false,
          error: notify.error,
          hint:
            notify.hint ||
            notify.error ||
            'Sipariş onaylandı ancak kitapçıya WhatsApp gönderilemedi.',
          data: fresh || approved,
          whatsapp: notify
        });
      }
      return res.status(200).json({
        ok: true,
        approved: true,
        whatsapp_ok: true,
        data: fresh || approved,
        whatsapp: notify
      });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'DELETE' && op === 'order' && id) {
    try {
      let fetchQ = supabaseAdmin.from('kitap_siparisleri').select('id, institution_id').eq('id', id);
      if (!isSuper && institutionFilter) fetchQ = fetchQ.eq('institution_id', institutionFilter);
      const { data: row, error: fetchErr } = await fetchQ.maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!row) return res.status(404).json({ error: 'not_found' });

      await supabaseAdmin
        .from('message_logs')
        .delete()
        .eq('related_id', id)
        .eq('kind', 'kitap_siparis_bildirim')
        .then(() => {})
        .catch(() => {});

      const { error } = await supabaseAdmin.from('kitap_siparisleri').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true, deleted_id: id });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'POST' && op === 'cancel' && id) {
    try {
      let q = supabaseAdmin
        .from('kitap_siparisleri')
        .update({
          status: 'cancelled',
          whatsapp_status: 'skipped',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      if (!isSuper && institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { data, error } = await q.select('*').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ data });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'POST' && op === 'resend' && id) {
    try {
      const body = parseBody(req);
      const kitapciId = kitapciIdFromRequest(req, body);
      let q = supabaseAdmin.from('kitap_siparisleri').select('*').eq('id', id);
      if (!isSuper && institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { data: order, error } = await q.maybeSingle();
      if (error) throw error;
      if (!order) return res.status(404).json({ error: 'not_found' });
      const now = new Date().toISOString();
      const prePatch = { whatsapp_status: 'sending', whatsapp_error: null, updated_at: now };
      if (kitapciId) prePatch.kitapci_id = kitapciId;
      await supabaseAdmin.from('kitap_siparisleri').update(prePatch).eq('id', id);
      const notify = await safeNotifyBooksellerForOrder(
        { ...order, ...prePatch },
        {
          kitapciId,
          kitapciName: order.kitapci_adi,
          gatewaySessionId: actorGatewaySessionId(actor)
        }
      );
      const { data: freshResend } = await supabaseAdmin.from('kitap_siparisleri').select('*').eq('id', id).maybeSingle();
      if (!notify.ok) {
        return res.status(200).json({
          ok: true,
          whatsapp_ok: false,
          error: notify.error,
          hint:
            notify.hint ||
            notify.error ||
            'WhatsApp gönderilemedi — gateway QR veya Meta yapılandırmasını kontrol edin.',
          data: freshResend,
          whatsapp: notify
        });
      }
      return res.status(200).json({ ok: true, whatsapp_ok: true, data: freshResend, whatsapp: notify });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'POST' && op === 'process-pending') {
    if (!isSuper) return res.status(403).json({ error: 'forbidden' });
    try {
      const out = await processPendingBookOrderNotifications({ limit: 100 });
      return res.status(200).json(out);
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'PATCH' && id && !op) {
    const body = parseBody(req);
    try {
      let fetchQ = supabaseAdmin.from('kitap_siparisleri').select('*').eq('id', id);
      if (!isSuper && institutionFilter) fetchQ = fetchQ.eq('institution_id', institutionFilter);
      const { data: existing, error: fetchErr } = await fetchQ.maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (String(existing.status || '') === 'cancelled') {
        return res.status(400).json({ error: 'order_cancelled', hint: 'İptal edilmiş sipariş düzenlenemez.' });
      }
      if (String(existing.status || '') === 'shipped') {
        return res.status(400).json({ error: 'order_shipped', hint: 'Kargoya verilmiş sipariş düzenlenemez.' });
      }

      const patch = buildOrderAdminPatch(body);
      if (patch.kitap_set_ids == null && patch.kitap_set_id != null) {
        patch.kitap_set_ids = patch.kitap_set_id ? [patch.kitap_set_id] : [];
      }
      if (patch.kitap_set_id == null && Array.isArray(patch.kitap_set_ids) && patch.kitap_set_ids.length) {
        patch.kitap_set_id = patch.kitap_set_ids[0];
      }
      if (patch.kitap_set_id === null && patch.kitap_set_ids == null) {
        patch.kitap_set_ids = [];
      }
      if (body.kitap_set_id != null && body.kitaplar == null) {
        const fromSet = Array.isArray(patch.kitap_set_ids)
          ? await resolveKitaplarFromSetIds(patch.kitap_set_ids)
          : await resolveKitaplarFromSetId(patch.kitap_set_id);
        if (fromSet) patch.kitaplar = fromSet;
        else if (patch.kitap_set_id === null) patch.kitaplar = null;
      }
      if (!Object.keys(patch).length) {
        return res.status(400).json({ error: 'no_fields', hint: 'Güncellenecek alan yok.' });
      }
      patch.updated_at = new Date().toISOString();

      let q = supabaseAdmin.from('kitap_siparisleri').update(patch).eq('id', id);
      if (!isSuper && institutionFilter) q = q.eq('institution_id', institutionFilter);
      let { data, error } = await q.select('*').maybeSingle();
      let schemaWarning = null;
      if (error && isKitapSetIdsColumnMissingError(error) && Object.prototype.hasOwnProperty.call(patch, 'kitap_set_ids')) {
        const fallbackPatch = { ...patch };
        delete fallbackPatch.kitap_set_ids;
        if (!Object.prototype.hasOwnProperty.call(fallbackPatch, 'kitap_set_id')) {
          fallbackPatch.kitap_set_id = Array.isArray(patch.kitap_set_ids) && patch.kitap_set_ids.length
            ? String(patch.kitap_set_ids[0])
            : null;
        }
        let retryQ = supabaseAdmin.from('kitap_siparisleri').update(fallbackPatch).eq('id', id);
        if (!isSuper && institutionFilter) retryQ = retryQ.eq('institution_id', institutionFilter);
        ({ data, error } = await retryQ.select('*').maybeSingle());
        schemaWarning = 'kitap_set_ids_missing';
      }
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({
        data,
        warning: schemaWarning,
        hint: schemaWarning
          ? "Veritabanında çoklu set kolonu yok; şimdilik ilk set kaydedildi. Kalıcı çözüm: sql/2026-06-30-kitap-siparisleri-multi-set-ids.sql çalıştırın."
          : undefined
      });
    } catch (e) {
      if (e?.code === 'VALIDATION') {
        return res.status(400).json({ error: errorMessage(e), hint: 'Zorunlu alanları kontrol edin.' });
      }
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
