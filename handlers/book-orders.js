import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { notifyBooksellerForOrder, processPendingBookOrderNotifications } from '../api/_lib/book-order-notify.js';
import { ensureBooksellerPortalToken, newKitapciPortalToken } from '../api/_lib/kitapci-portal.js';

const ADMIN_ROLES = new Set(['super_admin', 'admin']);
const ORDER_STATUSES = new Set(['pending', 'approved', 'notified', 'confirmed', 'shipped', 'cancelled']);

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
    msg.includes('kitapcilar') ||
    (msg.includes('does not exist') && msg.includes('relation'))
  );
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

function resolveInstitutionId(body, actor) {
  if (actor?.institution_id) return String(actor.institution_id);
  const fromBody = String(body.institution_id || '').trim();
  if (fromBody) return fromBody;
  const envDefault = String(process.env.BOOK_ORDER_INSTITUTION_ID || '').trim();
  return envDefault || null;
}

function normalizeUcretDurumu(body) {
  const direct = String(body.ucret_durumu || body.ucret || '').trim();
  if (direct) return direct;
  const odeme = String(body.odeme || body.odeme_durumu || '').trim().toLowerCase();
  if (odeme === 'odendi' || odeme === 'ödendi') return 'Ödendi';
  if (odeme === 'kapida_odeme' || odeme === 'kapıda ödeme' || odeme === 'kapida') return 'Kapıda Ödeme';
  if (odeme === 'havale_bekleniyor' || odeme === 'havale') return 'Havale Bekleniyor';
  if (body.odendi === true || body.odendi === 'true' || body.odendi === '1') return 'Ödendi';
  if (body.kapida_odeme === true || body.kapida_odeme === 'true' || body.kapida_odeme === '1') return 'Kapıda Ödeme';
  if (body.havale_bekleniyor === true || body.havale_bekleniyor === 'true' || body.havale_bekleniyor === '1') {
    return 'Havale Bekleniyor';
  }
  return null;
}

function kitapciIdFromRequest(req, body) {
  return String(body?.kitapci_id || req.query?.kitapci_id || '').trim() || null;
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
    kitapci_phone: String(body.kitapci_phone || '').trim() || null
  };
}

async function insertBookOrder(payload) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('kitap_siparisleri')
    .insert({
      ...payload,
      created_at: now,
      updated_at: now
    })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  const op = String(req.query?.op || '').trim();
  const scope = String(req.query?.scope || '').trim();
  const id = String(req.query?.id || '').trim();

  if (req.method === 'POST' && op === 'public-submit') {
    if (!verifyPublicFormKey(req)) {
      return res.status(401).json({
        error: 'unauthorized',
        hint: 'Form gönderimi için BOOK_ORDER_FORM_SECRET (X-Book-Order-Key başlığı) gerekli.'
      });
    }
    const body = parseBody(req);
    const institution_id = resolveInstitutionId(body, null);
    const parsed = parsePublicOrderBody(body);
    if (!institution_id) {
      return res.status(400).json({ error: 'institution_required', hint: 'institution_id gerekli.' });
    }
    if (!parsed.ogrenci_ad_soyad) return res.status(400).json({ error: 'ogrenci_ad_soyad_required' });
    if (!parsed.veli_ad_soyad) return res.status(400).json({ error: 'veli_ad_soyad_required' });

    try {
      const order = await insertBookOrder({
        institution_id,
        ...parsed,
        source: 'form',
        form_payload: body,
        status: 'pending',
        whatsapp_status: 'awaiting_approval'
      });
      return res.status(201).json({
        ok: true,
        data: order,
        hint: 'Sipariş kaydedildi. Süper admin onayından sonra kitapçıya WhatsApp gidecek.'
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
    : String(actor.institution_id || '').trim() || null;

  if (req.method === 'GET' && scope === 'booksellers') {
    try {
      let q = supabaseAdmin.from('kitapcilar').select('*').order('name', { ascending: true });
      if (institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      for (const row of rows) {
        if (!String(row.portal_token || '').trim()) {
          try {
            row.portal_token = await ensureBooksellerPortalToken(row.id);
          } catch {
            /* portal_token sütunu yoksa SQL migration gerekir */
          }
        }
      }
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
    if (!institution_id) return res.status(400).json({ error: 'institution_required' });
    if (!name) return res.status(400).json({ error: 'name_required' });
    if (!phone) return res.status(400).json({ error: 'invalid_phone' });
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('kitapcilar')
        .insert({
          institution_id,
          name,
          phone,
          city: String(body.city || '').trim() || null,
          bolge: String(body.bolge || '').trim() || null,
          is_active: body.is_active !== false,
          notes: String(body.notes || '').trim() || null,
          portal_token: newKitapciPortalToken(),
          created_at: now,
          updated_at: now
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
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

  if (req.method === 'DELETE' && op === 'bookseller' && id) {
    try {
      let q = supabaseAdmin.from('kitapcilar').delete().eq('id', id);
      if (!isSuper && institutionFilter) q = q.eq('institution_id', institutionFilter);
      const { error } = await q;
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (e) {
      if (isSchemaError(e)) return schemaHint(res);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'POST' && op === 'approve' && id) {
    try {
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
      if (String(order.status || '') === 'notified' && String(order.whatsapp_status || '') === 'sent') {
        return res.status(400).json({ error: 'already_sent', hint: 'WhatsApp zaten gönderildi.' });
      }
      const now = new Date().toISOString();
      const approvePatch = {
        status: 'approved',
        whatsapp_status: 'pending',
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
      const notify = await notifyBooksellerForOrder(approved || { ...order, ...approvePatch }, {
        kitapciId,
        kitapciName: order.kitapci_adi
      });
      const { data: fresh } = await supabaseAdmin.from('kitap_siparisleri').select('*').eq('id', id).maybeSingle();
      if (!notify.ok) {
        return res.status(400).json({
          ok: false,
          error: notify.error,
          hint: notify.hint || notify.error,
          data: fresh || approved,
          whatsapp: notify
        });
      }
      return res.status(200).json({ ok: true, data: fresh || approved, whatsapp: notify });
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
      const prePatch = { whatsapp_status: 'pending', whatsapp_error: null, updated_at: now };
      if (kitapciId) prePatch.kitapci_id = kitapciId;
      await supabaseAdmin.from('kitap_siparisleri').update(prePatch).eq('id', id);
      const notify = await notifyBooksellerForOrder(
        { ...order, ...prePatch },
        { kitapciId, kitapciName: order.kitapci_adi }
      );
      if (!notify.ok) {
        return res.status(400).json({
          ok: false,
          error: notify.error,
          hint: notify.hint || notify.error,
          whatsapp: notify
        });
      }
      return res.status(200).json({ ok: true, whatsapp: notify });
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

  if (req.method === 'PATCH' && id) {
    const body = parseBody(req);
    const status = String(body.status || '').trim();
    if (status && !ORDER_STATUSES.has(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    const patch = { updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    if (body.siparis_notu != null) patch.siparis_notu = String(body.siparis_notu).trim() || null;
    if (body.ucret_durumu != null) patch.ucret_durumu = String(body.ucret_durumu).trim() || null;
    try {
      let q = supabaseAdmin.from('kitap_siparisleri').update(patch).eq('id', id);
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

  return res.status(405).json({ error: 'method_not_allowed' });
}
