/**
 * AI Satış Asistanı API — /api/crm-ai-assistant?op=...
 *
 * Yönetici: settings, save_settings, kb_pages, kb_refresh, tone_sources,
 *           tone_upload, tone_delete, tone_rebuild, consultants, slots_preview,
 *           test_chat, logs
 * CRM kullanıcısı (temsilci / koç / yönetici): state, handover, resume
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { actorRoleSet, actorIsAdminLike } from '../api/_lib/actor-roles.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from '../api/_lib/quota-enforce.js';

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

function canUseCrm(roleSet) {
  return actorIsAdminLike(null, roleSet) || roleSet.has('crm_agent') || roleSet.has('coach');
}

async function resolveInstitutionId(actor, roleSet, queryInst) {
  const q = String(queryInst || '').trim();
  if (q && (roleSet.has('super_admin') || roleSet.has('admin'))) return q;
  if (actor.institution_id) return String(actor.institution_id);
  const { data: u } = await supabaseAdmin.from('users').select('institution_id').eq('id', actor.sub).maybeSingle();
  return u?.institution_id ? String(u.institution_id) : PLATFORM_PRIMARY_INSTITUTION_ID;
}

async function loadConversation(id, actor, roleSet, institutionId) {
  const { data } = await supabaseAdmin.from('crm_conversations').select('id, institution_id, channel, lead_id').eq('id', id).maybeSingle();
  if (!data) return { error: 404 };
  if (!actorIsAdminLike(actor, roleSet) && String(data.institution_id || '') !== String(institutionId || '')) return { error: 403 };
  return { conversation: data };
}

const ADMIN_OPS = new Set([
  'settings',
  'save_settings',
  'kb_pages',
  'kb_refresh',
  'tone_sources',
  'tone_upload',
  'tone_delete',
  'tone_rebuild',
  'consultants',
  'slots_preview',
  'test_chat',
  'logs'
]);

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const roleSet = await actorRoleSet(actor);
  if (!canUseCrm(roleSet)) return res.status(403).json({ error: 'forbidden' });
  const isAdmin = actorIsAdminLike(actor, roleSet);
  const body = req.method === 'GET' ? {} : parseBody(req);
  const op = String(req.query?.op || body.op || 'settings').trim();
  if (ADMIN_OPS.has(op) && !isAdmin) {
    return res.status(403).json({ error: 'forbidden', hint: 'Bu ekranı yalnızca yönetici kullanır.' });
  }
  const institutionId = await resolveInstitutionId(actor, roleSet, req.query?.institution_id || body.institution_id);
  const ai = await import('../api/_lib/crm-ai-assistant.js');
  const inst = ai.instKey(institutionId);
  const isPost = req.method === 'POST';

  try {
    if (op === 'settings') {
      const core = await import('../api/_lib/crm-ai-assistant-core.js');
      const data = await ai.getSettings(inst);
      return res.status(200).json({
        data,
        claude_configured: ai.isClaudeConfigured(),
        defaults: {
          site_urls: core.DEFAULT_SITE_URLS,
          kvkk_url: core.DEFAULT_KVKK_URL,
          schedule: core.DEFAULT_SCHEDULE,
          models: core.ALLOWED_MODELS,
          efforts: core.ALLOWED_EFFORTS,
          kvkk_notice: core.buildKvkkNotice(data.kvkk_url)
        }
      });
    }

    if (op === 'save_settings' && isPost) {
      try {
        const data = await ai.saveSettings(inst, body.settings || body, actor.sub);
        return res.status(200).json({ ok: true, data });
      } catch (e) {
        return res.status(400).json({ error: 'save_failed', message: errorMessage(e) });
      }
    }

    if (op === 'kb_pages') {
      const { data, error } = await supabaseAdmin
        .from(ai.KB_TABLE)
        .select('id, url, title, status, error, fetched_at, content')
        .eq('institution_id', inst)
        .order('url');
      if (error) {
        if (ai.tableMissing(error)) return res.status(200).json({ data: [], table_missing: true });
        throw error;
      }
      return res.status(200).json({
        data: (data || []).map(({ content, ...r }) => ({ ...r, chars: content?.length || 0, preview: String(content || '').slice(0, 400) }))
      });
    }

    if (op === 'kb_refresh' && isPost) {
      const data = await ai.refreshKnowledgeBase(inst);
      return res.status(200).json({ ok: true, data });
    }

    if (op === 'tone_sources') {
      const { data, error } = await supabaseAdmin
        .from(ai.TONE_TABLE)
        .select('id, file_name, source_kind, message_count, excerpt, created_at')
        .eq('institution_id', inst)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        if (ai.tableMissing(error)) return res.status(200).json({ data: [], table_missing: true });
        throw error;
      }
      return res.status(200).json({ data: data || [] });
    }

    if (op === 'tone_upload' && isPost) {
      const content = String(body.content || '');
      if (!content.trim()) return res.status(400).json({ error: 'empty_file' });
      if (content.length > 5_000_000) return res.status(413).json({ error: 'file_too_large', message: 'En fazla 5 MB' });
      try {
        const data = await ai.addToneSource(inst, { fileName: body.file_name, content, businessAuthor: body.business_author }, actor.sub);
        return res.status(200).json({ ok: true, data });
      } catch (e) {
        return res.status(400).json({ error: 'upload_failed', message: errorMessage(e) });
      }
    }

    if (op === 'tone_delete' && isPost) {
      const id = String(body.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { error } = await supabaseAdmin.from(ai.TONE_TABLE).delete().eq('id', id).eq('institution_id', inst);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (op === 'tone_rebuild' && isPost) {
      try {
        const guide = await ai.rebuildToneGuide(inst, actor.sub);
        return res.status(200).json({ ok: true, data: { tone_guide: guide } });
      } catch (e) {
        return res.status(400).json({ error: 'rebuild_failed', message: errorMessage(e) });
      }
    }

    if (op === 'consultants') {
      const { data: shifts } = await supabaseAdmin
        .from('crm_agent_shifts')
        .select('user_id, day_of_week, start_time, end_time, is_active')
        .or(`institution_id.eq.${inst},institution_id.is.null`)
        .eq('is_active', true);
      const ids = [...new Set((shifts || []).map((s) => String(s.user_id)))];
      const { data: users } = ids.length
        ? await supabaseAdmin.from('users').select('id, name').in('id', ids)
        : { data: [] };
      const names = new Map((users || []).map((u) => [String(u.id), u.name]));
      return res.status(200).json({
        data: ids.map((id) => ({
          user_id: id,
          name: names.get(id) || id,
          shifts: (shifts || []).filter((s) => String(s.user_id) === id)
        }))
      });
    }

    if (op === 'slots_preview') {
      const settings = await ai.getSettings(inst);
      const { slots } = await ai.freeSlotsFor(settings);
      return res.status(200).json({ data: slots });
    }

    if (op === 'test_chat' && isPost) {
      if (!ai.isClaudeConfigured()) {
        return res.status(400).json({ error: 'claude_not_configured', message: 'Vercel ortamına ANTHROPIC_API_KEY ekleyin.' });
      }
      try {
        const data = await ai.testChat(inst, body.turns);
        return res.status(200).json({ ok: true, data });
      } catch (e) {
        return res.status(502).json({ error: 'test_failed', message: errorMessage(e) });
      }
    }

    if (op === 'logs') {
      const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 60) || 60));
      const { data, error } = await supabaseAdmin
        .from(ai.LOG_TABLE)
        .select('id, conversation_id, lead_id, event, detail, input_tokens, output_tokens, created_at')
        .eq('institution_id', inst)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (ai.tableMissing(error)) return res.status(200).json({ data: [] });
        throw error;
      }
      return res.status(200).json({ data: data || [] });
    }

    /* Konuşma düzeyi (temsilci de kullanır) */
    const conversationId = String(req.query?.conversation_id || body.conversation_id || '').trim();
    if (['state', 'handover', 'resume'].includes(op)) {
      if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
      const { conversation, error: accessErr } = await loadConversation(conversationId, actor, roleSet, institutionId);
      if (accessErr) return res.status(accessErr).json({ error: accessErr === 404 ? 'conversation_not_found' : 'forbidden' });

      if (op === 'state') {
        const session = await ai.getSession(conversation.id);
        const settings = await ai.getSettings(conversation.institution_id);
        return res.status(200).json({
          data: session
            ? {
                state: session.state,
                summary: session.summary,
                collected: session.collected,
                bot_reply_count: session.bot_reply_count,
                appointment_at: session.appointment_at,
                handover_at: session.handover_at,
                handover_reason: session.handover_reason
              }
            : null,
          module_active: settings.is_active === true
        });
      }
      if (op === 'handover' && isPost) {
        const r = await ai.handoverConversation(conversation.id, { actorId: actor.sub, reason: String(body.reason || 'manual').slice(0, 200) });
        return res.status(r.ok ? 200 : 400).json(r);
      }
      if (op === 'resume' && isPost) {
        const r = await ai.resumeConversation(conversation.id, { actorId: actor.sub });
        return res.status(r.ok ? 200 : 400).json(r);
      }
    }

    return res.status(400).json({ error: 'unknown_op', op });
  } catch (e) {
    console.error('[crm-ai-assistant]', op, errorMessage(e));
    return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
  }
}
