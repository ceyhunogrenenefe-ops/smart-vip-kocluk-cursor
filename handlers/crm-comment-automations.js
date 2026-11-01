import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import { matchKeyword } from '../api/_lib/crm-comment-automation-core.js';

const TABLE = 'crm_comment_automations';
const LOG_TABLE = 'crm_comment_automation_logs';

function canManage(actor, tags) {
  const role = String(actor?.role || '').toLowerCase();
  const list = Array.isArray(tags) ? tags : [];
  return (
    role === 'admin' ||
    role === 'super_admin' ||
    list.includes('admin') ||
    list.includes('super_admin')
  );
}

function readBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
}

/** ig_user_id kolonu henüz yoksa (SQL uygulanmadıysa) */
function igColumnMissing(error) {
  return /ig_user_id/i.test(String(error?.message || '')) && /column|schema cache|PGRST204/i.test(String(error?.message || '') + String(error?.code || ''));
}

/**
 * Ek Instagram hesapları: liste / ekle / güncelle / sil.
 * Sayfa erişim anahtarı yanıtta her zaman maskelidir.
 */
async function handleAccounts(req, res, { institutionId, actor }) {
  const acc = await import('../api/_lib/crm-instagram-accounts.js');
  const table = acc.INSTAGRAM_ACCOUNTS_TABLE;
  const stored = acc.storedInstitutionId(institutionId);
  const scope = (q) => (stored ? q.eq('institution_id', stored) : q.is('institution_id', null));

  if (req.method === 'GET') {
    const { rows, tableMissing } = await acc.listInstagramAccountRows(institutionId);
    let primary = { ig_user_id: null, username: null };
    try {
      const { resolveMetaConnection } = await import('../api/_lib/crm-meta-connection.js');
      const conn = await resolveMetaConnection(institutionId);
      primary = {
        ig_user_id: (await acc.primaryInstagramIgUserId(institutionId)) || null,
        username: conn?.instagram?.username || null
      };
    } catch {
      /* birincil hesap bilgisi opsiyonel */
    }
    return res.status(200).json({
      ok: true,
      table_missing: tableMissing,
      primary,
      items: rows.map(acc.publicAccountRow)
    });
  }

  if (req.method === 'POST') {
    const body = readBody(req);
    const pageId = String(body.page_id || '').trim();
    const pageToken = String(body.page_token || '').trim();
    if (!pageId || !pageToken) {
      return res.status(400).json({ error: 'page_required', message: 'Sayfa ID ve sayfa erişim anahtarı gerekli.' });
    }
    const check = await acc.verifyPageInstagramAccount({ pageId, token: pageToken });
    if (!check.ok) {
      return res.status(400).json({ error: 'verify_failed', message: check.error });
    }
    const primaryId = await acc.primaryInstagramIgUserId(institutionId);
    if (primaryId && primaryId === check.ig_user_id) {
      return res.status(400).json({
        error: 'primary_account',
        message: 'Bu hesap zaten ana Instagram hesabı; ek hesap olarak eklenemez.'
      });
    }
    const existing = await acc.getInstagramAccountRow(check.ig_user_id);
    if (existing && !acc.sameInstitution(existing.institution_id, institutionId)) {
      return res.status(409).json({ error: 'account_taken', message: 'Bu Instagram hesabı başka bir kuruma bağlı.' });
    }

    const subscription = await acc.subscribePageToApp({ pageId, token: pageToken });
    const now = new Date().toISOString();
    const row = {
      institution_id: stored,
      ig_user_id: check.ig_user_id,
      ig_username: check.ig_username,
      page_id: pageId,
      page_token: pageToken,
      is_active: body.is_active !== false,
      last_verified_at: now,
      last_verify_error: subscription.ok ? null : `Webhook aboneliği: ${String(subscription.error || '').slice(0, 300)}`,
      updated_at: now
    };
    if (!existing) row.created_by = actor.sub || null;
    const { data, error } = await supabaseAdmin
      .from(table)
      .upsert(row, { onConflict: 'ig_user_id' })
      .select('*')
      .maybeSingle();
    if (error) {
      if (acc.accountsTableMissing(error)) {
        return res.status(400).json({
          error: 'table_missing',
          message: 'crm_instagram_accounts tablosu yok — önce SQL dosyasını uygulayın.'
        });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({
      ok: true,
      item: acc.publicAccountRow(data),
      page_name: check.page_name || null,
      subscription
    });
  }

  if (req.method === 'PATCH') {
    const body = readBody(req);
    const id = String(body.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id_required' });
    const { data: current, error: readErr } = await scope(
      supabaseAdmin.from(table).select('*').eq('id', id)
    ).maybeSingle();
    if (readErr) return res.status(500).json({ error: readErr.message });
    if (!current) return res.status(404).json({ error: 'not_found' });

    const patch = { updated_at: new Date().toISOString() };
    if (body.is_active !== undefined) patch.is_active = body.is_active === true;

    let subscription;
    const newToken = String(body.page_token || '').trim();
    const newPageId = String(body.page_id || '').trim();
    if (newToken || newPageId) {
      const pageId = newPageId || current.page_id;
      const token = newToken || current.page_token;
      const check = await acc.verifyPageInstagramAccount({ pageId, token });
      if (!check.ok) return res.status(400).json({ error: 'verify_failed', message: check.error });
      if (check.ig_user_id !== current.ig_user_id) {
        return res.status(400).json({
          error: 'account_mismatch',
          message: 'Bu sayfa farklı bir Instagram hesabına bağlı; yeni hesap olarak ekleyin.'
        });
      }
      subscription = await acc.subscribePageToApp({ pageId, token });
      patch.page_id = pageId;
      patch.page_token = token;
      patch.ig_username = check.ig_username || current.ig_username || null;
      patch.last_verified_at = patch.updated_at;
      patch.last_verify_error = subscription.ok
        ? null
        : `Webhook aboneliği: ${String(subscription.error || '').slice(0, 300)}`;
    }

    const { data, error } = await scope(supabaseAdmin.from(table).update(patch).eq('id', id))
      .select('*')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, item: acc.publicAccountRow(data), ...(subscription ? { subscription } : {}) });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id_required' });
    const { data: current, error: readErr } = await scope(
      supabaseAdmin.from(table).select('id, ig_user_id').eq('id', id)
    ).maybeSingle();
    if (readErr) return res.status(500).json({ error: readErr.message });
    if (!current) return res.status(404).json({ error: 'not_found' });

    const { error } = await scope(supabaseAdmin.from(table).delete().eq('id', id));
    if (error) return res.status(500).json({ error: error.message });

    // Bu hesaba bağlı otomasyonlar artık gönderemez: kapat (silme — kayıt kalsın)
    let q = supabaseAdmin
      .from(TABLE)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('ig_user_id', current.ig_user_id);
    q = institutionId ? q.eq('institution_id', institutionId) : q;
    await q.then(() => null, () => null);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * Otomasyonda seçilen hesap geçerli mi? Boş → ana hesap (null).
 * @returns {Promise<{ ok: true, value: string|null } | { ok: false, message: string }>}
 */
async function validateAutomationAccount(raw, institutionId) {
  const ig = String(raw || '').trim();
  if (!ig) return { ok: true, value: null };
  const acc = await import('../api/_lib/crm-instagram-accounts.js');
  const primaryId = await acc.primaryInstagramIgUserId(institutionId);
  // Ana hesap seçildiyse null saklanır: eski otomasyonlarla aynı davranış
  if (primaryId && primaryId === ig) return { ok: true, value: null };
  const row = await acc.getInstagramAccountRow(ig);
  if (!row || !acc.sameInstitution(row.institution_id, institutionId)) {
    return { ok: false, message: 'Seçilen Instagram hesabı bulunamadı.' };
  }
  return { ok: true, value: ig };
}

function sanitizeKeywords(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(/[\n,]/)
        .map((x) => x.trim());
  return [...new Set(arr.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 40);
}

/**
 * Instagram yorum otomasyonları — gönderi seç, anahtar kelime yaz, PDF linkini
 * otomatik DM olarak gönder.
 */
export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  const tags = await normalizedUserRolesFromDb(actor.sub).catch(() => []);
  if (!canManage(actor, tags)) return res.status(403).json({ error: 'forbidden' });

  const institutionId = actor.institution_id || null;
  const op = String(req.query?.op || '').trim();

  try {
    /** Ek Instagram hesapları */
    if (op === 'accounts') {
      return await handleAccounts(req, res, { institutionId, actor });
    }

    /** Otomasyon kurarken gönderi seçim listesi (opsiyonel ig_user_id: ek hesap) */
    if (req.method === 'GET' && op === 'media') {
      const { listInstagramMedia } = await import('../api/_lib/crm-inbox.js');
      let override;
      const mediaIg = String(req.query?.ig_user_id || '').trim();
      if (mediaIg) {
        const acc = await import('../api/_lib/crm-instagram-accounts.js');
        const hesap = await acc.resolveInstagramAccount({ institutionId, igUserId: mediaIg });
        if (hesap === null) {
          return res.status(200).json({
            ok: false,
            items: [],
            error: 'account_inactive',
            hint: 'Seçilen Instagram hesabı pasif ya da erişim anahtarı eksik.'
          });
        }
        override = acc.sendOverrideFor(hesap);
      }
      try {
        const items = await listInstagramMedia({ limit: Number(req.query?.limit) || 25, override });
        return res.status(200).json({ ok: true, items });
      } catch (e) {
        return res.status(200).json({
          ok: false,
          items: [],
          error: errorMessage(e),
          hint:
            'Gönderi listesi alınamadı — META_IG_BUSINESS_ID ve sayfa erişim anahtarı gerekli. Gönderi kimliğini elle de girebilirsiniz.'
        });
      }
    }

    /** Anahtar kelime denemesi — mesaj göndermeden eşleşme kontrolü */
    /**
     * Takip dogrulamasi bu kurulumda calisiyor mu?
     * Hicbir mesaj gondermez; yoneticiye nedenini ve onerilen akisi verir.
     */
    if (req.method === 'GET' && op === 'follow-capability') {
      try {
        const { takipDogrulamaYetenegi } = await import('../api/_lib/ig-takip-dogrula.js');
        const data = await takipDogrulamaYetenegi(institutionId);
        return res.status(200).json({ ok: true, data });
      } catch (e) {
        return res.status(200).json({
          ok: false,
          data: {
            baglanti_var: false,
            neden: e instanceof Error ? e.message : String(e),
            oneri: 'Meta baglantisini kontrol edin.'
          }
        });
      }
    }

    if (req.method === 'POST' && op === 'test') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const keyword = matchKeyword(body.text, sanitizeKeywords(body.keywords), {
        wholeWord: body.match_whole_word !== false
      });
      return res.status(200).json({ ok: true, matched: Boolean(keyword), keyword: keyword || null });
    }

    if (req.method === 'GET') {
      let q = supabaseAdmin.from(TABLE).select('*').order('created_at', { ascending: false }).limit(100);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });

      const ids = (data || []).map((r) => r.id);
      const recent = {};
      if (ids.length) {
        const { data: logs } = await supabaseAdmin
          .from(LOG_TABLE)
          .select('automation_id, dm_status, username, matched_keyword, created_at')
          .in('automation_id', ids)
          .order('created_at', { ascending: false })
          .limit(60);
        for (const l of logs || []) {
          const k = String(l.automation_id);
          if (!recent[k]) recent[k] = [];
          if (recent[k].length < 5) recent[k].push(l);
        }
      }
      return res.status(200).json({ ok: true, items: data || [], recent });
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = readBody(req);
      const id = String(body.id || '').trim();

      const row = {
        institution_id: institutionId,
        name: String(body.name || '').trim().slice(0, 120) || 'Yorum otomasyonu',
        platform: 'instagram',
        media_id: String(body.media_id || '').trim() || null,
        media_caption: String(body.media_caption || '').trim().slice(0, 500) || null,
        media_permalink: String(body.media_permalink || '').trim() || null,
        media_thumbnail_url: String(body.media_thumbnail_url || '').trim() || null,
        keywords: sanitizeKeywords(body.keywords),
        match_whole_word: body.match_whole_word !== false,
        dm_text: String(body.dm_text || '').trim().slice(0, 1000),
        reply_comment_text: String(body.reply_comment_text || '').trim().slice(0, 500) || null,
        once_per_user: body.once_per_user !== false,
        is_active: body.is_active === true,
        // Takip kapisi — kapali birakilirsa otomasyon eskisi gibi calisir
        follow_gate_enabled: body.follow_gate_enabled === true,
        follow_invite_text: String(body.follow_invite_text || '').trim().slice(0, 1000) || null,
        follow_button_text: String(body.follow_button_text || '').trim().slice(0, 20) || null,
        follow_retry_text: String(body.follow_retry_text || '').trim().slice(0, 1000) || null,
        follow_retry_button_text:
          String(body.follow_retry_button_text || '').trim().slice(0, 20) || null,
        updated_at: new Date().toISOString()
      };

      /**
       * Hangi Instagram hesabında çalışacak? Boş / ana hesap → null (eski
       * davranış). Alan hiç gönderilmezse dokunulmaz.
       */
      const hasAccountField = Object.prototype.hasOwnProperty.call(body, 'ig_user_id');
      if (hasAccountField) {
        const v = await validateAutomationAccount(body.ig_user_id, institutionId);
        if (!v.ok) return res.status(400).json({ error: 'account_invalid', message: v.message });
        row.ig_user_id = v.value;
      }

      if (!row.keywords.length) return res.status(400).json({ error: 'keywords_required' });
      if (!row.dm_text) {
        return res.status(400).json({
          error: 'dm_text_required',
          message: row.follow_gate_enabled
            ? 'Takip doğrulandıktan sonra gönderilecek PDF mesajı boş olamaz.'
            : 'DM metni boş olamaz.'
        });
      }

      /**
       * ig_user_id kolonu henüz yoksa (SQL uygulanmadı): ana hesap seçiliyken
       * alan atlanır ve eskisi gibi kaydedilir; ek hesap seçiliyse açıkça uyar.
       */
      const save = async (r) => {
        if (id) {
          let q = supabaseAdmin.from(TABLE).update(r).eq('id', id);
          if (institutionId) q = q.eq('institution_id', institutionId);
          return q.select('*').maybeSingle();
        }
        return supabaseAdmin
          .from(TABLE)
          .insert({ ...r, created_by: actor.sub || null })
          .select('*')
          .maybeSingle();
      };
      let { data, error } = await save(row);
      if (error && 'ig_user_id' in row && igColumnMissing(error)) {
        if (row.ig_user_id) {
          return res.status(400).json({
            error: 'account_column_missing',
            message: 'Ek hesap seçimi için veritabanı güncellemesi (SQL) henüz uygulanmamış.'
          });
        }
        const { ig_user_id: _omit, ...rest } = row;
        ({ data, error } = await save(rest));
      }
      if (error) return res.status(500).json({ error: error.message });
      if (id && !data) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ ok: true, item: data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      let q = supabaseAdmin.from(TABLE).delete().eq('id', id);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: errorMessage(e) });
  }
}
