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
    /** Otomasyon kurarken gönderi seçim listesi */
    if (req.method === 'GET' && op === 'media') {
      const { listInstagramMedia } = await import('../api/_lib/crm-inbox.js');
      try {
        const items = await listInstagramMedia({ limit: Number(req.query?.limit) || 25 });
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
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
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
        updated_at: new Date().toISOString()
      };

      if (!row.keywords.length) return res.status(400).json({ error: 'keywords_required' });
      if (!row.dm_text) return res.status(400).json({ error: 'dm_text_required' });

      if (id) {
        let q = supabaseAdmin.from(TABLE).update(row).eq('id', id);
        if (institutionId) q = q.eq('institution_id', institutionId);
        const { data, error } = await q.select('*').maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'not_found' });
        return res.status(200).json({ ok: true, item: data });
      }

      row.created_by = actor.sub || null;
      const { data, error } = await supabaseAdmin.from(TABLE).insert(row).select('*').maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
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
