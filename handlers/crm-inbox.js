/**
 * CRM Unified Inbox API — /api/crm-inbox?op=...
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { actorRoleSet, actorIsAdminLike } from '../api/_lib/actor-roles.js';
import {
  getCrmAgentAssignment,
  getCrmInboundInstitutionId,
  sendCrmInstagramDm,
  sendCrmWhatsAppText,
  upsertCrmMessage
} from '../api/_lib/crm-inbox.js';
import { diagnoseCrmInbox, ensureCrmInboxSchema } from '../api/_lib/crm-inbox-schema.js';
import { ensureMetaInboundDelivery, publicInboundStatus } from '../api/_lib/meta-inbound-ensure.js';
import {
  bindMetaSocialFromPageToken,
  bindMetaSocialFromUserToken,
  describeSocialTokenEnv,
  ensureMetaSocialInbound,
  publicSocialStatus
} from '../api/_lib/meta-social-inbound.js';

function userHasRole(user, role) {
  const want = String(role || '').toLowerCase();
  if (!want) return false;
  if (String(user?.role || '').toLowerCase() === want) return true;
  const roles = user?.roles;
  if (Array.isArray(roles)) return roles.some((r) => String(r || '').toLowerCase() === want);
  return false;
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

function isCrmAgent(roleSet) {
  return roleSet.has('crm_agent');
}

function canUseCrm(roleSet) {
  return actorIsAdminLike(null, roleSet) || isCrmAgent(roleSet) || roleSet.has('coach');
}

async function resolveInstitutionId(actor, roleSet, queryInst) {
  const q = String(queryInst || '').trim();
  if (q && (roleSet.has('super_admin') || roleSet.has('admin'))) return q;
  // super_admin: kurum filtresi yok (tüm CRM konuşmaları) — yanlış institution yüzünden WA kaybolmasın
  if (roleSet.has('super_admin') && !q) return null;
  if (actor.institution_id) return String(actor.institution_id);
  const { data: u } = await supabaseAdmin
    .from('users')
    .select('institution_id')
    .eq('id', actor.sub)
    .maybeSingle();
  if (u?.institution_id) return String(u.institution_id);
  // Admin/ajan kurum boşsa gelen WA mesajlarının yazıldığı PRIMARY kurumu kullan
  try {
    return await getCrmInboundInstitutionId();
  } catch {
    return null;
  }
}

function applyAgentScope(query, actor, assignment, isAdmin) {
  if (isAdmin) return query;
  const canPool = !assignment || assignment.can_access_unassigned_pool !== false;
  if (canPool) {
    return query.or(`assigned_user_id.eq.${actor.sub},assigned_user_id.is.null`);
  }
  return query.eq('assigned_user_id', actor.sub);
}

async function assertConversationAccess(conversation, actor, roleSet, assignment) {
  if (!conversation) return false;
  if (actorIsAdminLike(actor, roleSet)) return true;
  if (conversation.assigned_user_id && String(conversation.assigned_user_id) === String(actor.sub)) {
    return true;
  }
  if (!conversation.assigned_user_id && (!assignment || assignment.can_access_unassigned_pool !== false)) {
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const roleSet = await actorRoleSet(actor);
  if (!canUseCrm(roleSet)) {
    return res.status(403).json({ error: 'forbidden', hint: 'CRM erişimi yok' });
  }

  const isAdmin = actorIsAdminLike(actor, roleSet);
  const agentOnly = isCrmAgent(roleSet) && !isAdmin;
  const body = req.method === 'GET' ? {} : parseBody(req);
  const op = String(req.query?.op || body.op || 'list_conversations').trim();
  const institutionId = await resolveInstitutionId(
    actor,
    roleSet,
    req.query?.institution_id || body.institution_id
  );
  const assignment = agentOnly ? await getCrmAgentAssignment(actor.sub, institutionId) : null;

  try {
    if (op === 'list_conversations') {
      const status = String(req.query?.status || body.status || '').trim();
      const channel = String(req.query?.channel || body.channel || '').trim();
      const q = String(req.query?.q || body.q || '').trim();
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit || body.limit || 50) || 50));

      let query = supabaseAdmin
        .from('crm_conversations')
        .select(
          'id, institution_id, contact_identifier, channel, contact_name, assigned_user_id, status, lead_id, ad_source_data, last_message_at, last_message_preview, unread_count, metadata, created_at, updated_at'
        )
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (status) query = query.eq('status', status);
      if (channel === 'whatsapp' || channel === 'instagram' || channel === 'facebook') {
        query = query.eq('channel', channel);
      }
      if (q) {
        query = query.or(
          `contact_name.ilike.%${q}%,contact_identifier.ilike.%${q}%,last_message_preview.ilike.%${q}%`
        );
      }
      query = applyAgentScope(query, actor, assignment, isAdmin);

      const { data, error } = await query;
      if (error) {
        if (/crm_conversations|does not exist|schema cache/i.test(error.message || '')) {
          return res.status(503).json({
            error: 'table_missing',
            message: 'CRM tabloları yok — sql/2026-09-12-crm-inbox-rbac.sql çalıştırın',
            sql_file: 'student-coaching-system/sql/2026-09-12-crm-inbox-rbac.sql'
          });
        }
        throw error;
      }
      return res.status(200).json({ data: data || [], institution_id: institutionId });
    }

    if (op === 'inbound_status') {
      const [diag, inbound, social] = await Promise.all([
        diagnoseCrmInbox().catch(() => null),
        ensureMetaInboundDelivery({ apply: false }).catch(() => null),
        ensureMetaSocialInbound({ apply: false }).catch(() => null)
      ]);
      return res.status(200).json({
        data: {
          ...publicInboundStatus(inbound),
          social: { ...publicSocialStatus(social), env: describeSocialTokenEnv() },
          real_inbound: diag?.real_inbound || null,
          real_inbound_seen: Boolean(diag?.e2e_ready?.real_inbound_seen),
          last_webhook_at: (diag?.recent_webhook_hits || [])[0]?.received_at || null
        }
      });
    }

    if (op === 'ensure_inbound') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'forbidden', hint: 'Meta hattını yalnızca yönetici bağlar.' });
      }
      await ensureCrmInboxSchema({ force: true }).catch(() => null);
      const inbound = await ensureMetaInboundDelivery({ apply: true });
      const social = await ensureMetaSocialInbound({ apply: true });
      return res.status(200).json({
        ok: Boolean(inbound?.ok),
        data: {
          ...publicInboundStatus(inbound),
          social: { ...publicSocialStatus(social), env: describeSocialTokenEnv() }
        },
        steps: inbound?.steps || [],
        social_steps: social?.steps || [],
        error: inbound?.error || social?.error || null
      });
    }

    if (op === 'save_page_token' && req.method === 'POST') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'forbidden', hint: 'Sayfa token’ını yalnızca yönetici kaydeder.' });
      }
      const pageTok = String(body.page_access_token || body.token || '').trim();
      const userTok = String(body.user_access_token || '').trim();
      const pageId = String(body.page_id || '').trim();
      const bound = userTok
        ? await bindMetaSocialFromUserToken(userTok)
        : await bindMetaSocialFromPageToken(pageTok, pageId);
      return res.status(bound.ok ? 200 : 400).json({
        ok: Boolean(bound.ok),
        data: {
          social: publicSocialStatus(bound.social || bound),
          env: describeSocialTokenEnv()
        },
        error: bound.error || null,
        hint: bound.hint || null
      });
    }

    if (op === 'list_notes') {
      const conversationId = String(req.query?.conversation_id || body.conversation_id || '').trim();
      if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
      const { data: conv } = await supabaseAdmin.from('crm_conversations').select('*').eq('id', conversationId).maybeSingle();
      if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data, error } = await supabaseAdmin
        .from('crm_conversation_notes')
        .select('id, conversation_id, author_user_id, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(80);
      if (error && /crm_conversation_notes|does not exist/i.test(error.message || '')) {
        return res.status(200).json({ data: [] });
      }
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (op === 'add_note' && req.method === 'POST') {
      const conversationId = String(body.conversation_id || '').trim();
      const noteBody = String(body.body || body.note || '').trim();
      if (!conversationId || !noteBody) return res.status(400).json({ error: 'conversation_id_and_body_required' });
      const { data: conv } = await supabaseAdmin.from('crm_conversations').select('*').eq('id', conversationId).maybeSingle();
      if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data, error } = await supabaseAdmin
        .from('crm_conversation_notes')
        .insert({
          conversation_id: conversationId,
          author_user_id: actor.sub,
          body: noteBody.slice(0, 4000)
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (op === 'list_canned') {
      const { data, error } = await supabaseAdmin
        .from('crm_canned_replies')
        .select('id, title, body, channel, sort_order')
        .order('sort_order', { ascending: true })
        .limit(50);
      if (error && /crm_canned_replies|does not exist/i.test(error.message || '')) {
        return res.status(200).json({ data: [] });
      }
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (op === 'get_conversation') {
      const id = String(req.query?.id || body.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: conv, error } = await supabaseAdmin.from('crm_conversations').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      return res.status(200).json({ data: conv });
    }

    if (op === 'list_messages') {
      const conversationId = String(req.query?.conversation_id || body.conversation_id || '').trim();
      if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
      const { data: conv } = await supabaseAdmin
        .from('crm_conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const since = String(req.query?.since || body.since || '').trim();
      let mq = supabaseAdmin
        .from('crm_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(500);
      if (since) mq = mq.gt('created_at', since);
      const { data, error } = await mq;
      if (error) throw error;
      return res.status(200).json({ data: data || [], conversation: conv });
    }

    if (op === 'mark_read' && req.method === 'POST') {
      const conversationId = String(body.conversation_id || '').trim();
      if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
      const { data: conv } = await supabaseAdmin
        .from('crm_conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      await supabaseAdmin
        .from('crm_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      return res.status(200).json({ ok: true });
    }

    if (op === 'send_message' && req.method === 'POST') {
      const conversationId = String(body.conversation_id || '').trim();
      const text = String(body.body || body.text || '').trim();
      if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
      if (!text) return res.status(400).json({ error: 'body_required' });

      const { data: conv } = await supabaseAdmin
        .from('crm_conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
        return res.status(403).json({ error: 'forbidden' });
      }

      if (!conv.assigned_user_id && agentOnly) {
        await supabaseAdmin
          .from('crm_conversations')
          .update({ assigned_user_id: actor.sub, updated_at: new Date().toISOString() })
          .eq('id', conversationId);
        conv.assigned_user_id = actor.sub;
      }

      let sendResult = { ok: false, messageId: null, error: null };
      try {
        if (conv.channel === 'whatsapp') {
          const r = await sendCrmWhatsAppText({ phone: conv.contact_identifier, text });
          sendResult = { ok: true, messageId: r.messageId, error: null };
        } else {
          const r = await sendCrmInstagramDm({ igScopedId: conv.contact_identifier, text });
          sendResult = { ok: true, messageId: r.messageId, error: null };
        }
      } catch (e) {
        sendResult = {
          ok: false,
          messageId: null,
          error: e instanceof Error ? e.message : String(e)
        };
      }

      const saved = await upsertCrmMessage({
        channel: conv.channel,
        contactIdentifier: conv.contact_identifier,
        contactName: conv.contact_name,
        body: text,
        messageType: 'text',
        messageId: sendResult.messageId,
        timestamp: Date.now(),
        direction: 'outbound',
        senderType: 'agent',
        senderId: actor.sub,
        institutionId: conv.institution_id,
        leadId: conv.lead_id,
        payload: { send: sendResult },
        deliveryStatus: sendResult.ok ? 'sent' : 'failed'
      });

      if (!sendResult.ok) {
        return res.status(502).json({
          error: 'send_failed',
          message: sendResult.error,
          data: saved?.message || null,
          conversation_id: conversationId
        });
      }
      return res.status(200).json({ ok: true, data: saved?.message || null, send: sendResult });
    }

    if (op === 'take_conversation' && req.method === 'POST') {
      const conversationId = String(body.conversation_id || '').trim();
      if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
      const { data: conv } = await supabaseAdmin
        .from('crm_conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data, error } = await supabaseAdmin
        .from('crm_conversations')
        .update({
          assigned_user_id: actor.sub,
          status: conv.status === 'closed' ? 'open' : conv.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (op === 'set_tags' && req.method === 'POST') {
      const conversationId = String(body.conversation_id || '').trim();
      const tags = Array.isArray(body.tags)
        ? body.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 12)
        : String(body.tags || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 12);
      if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
      const { data: conv } = await supabaseAdmin
        .from('crm_conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const prevMeta = conv.metadata && typeof conv.metadata === 'object' ? conv.metadata : {};
      const { data, error } = await supabaseAdmin
        .from('crm_conversations')
        .update({
          metadata: { ...prevMeta, tags },
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (op === 'assign_conversation' && req.method === 'POST') {
      if (!isAdmin) return res.status(403).json({ error: 'admin_only' });
      const conversationId = String(body.conversation_id || '').trim();
      const assignedUserId =
        body.assigned_user_id === null || body.assigned_user_id === ''
          ? null
          : String(body.assigned_user_id || '').trim();
      if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
      const patch = {
        assigned_user_id: assignedUserId,
        updated_at: new Date().toISOString()
      };
      if (body.status) patch.status = String(body.status);
      const { data, error } = await supabaseAdmin
        .from('crm_conversations')
        .update(patch)
        .eq('id', conversationId)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (op === 'update_status' && req.method === 'POST') {
      const conversationId = String(body.conversation_id || '').trim();
      const status = String(body.status || '').trim();
      if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
      if (!['open', 'pending', 'closed'].includes(status)) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      const { data: conv } = await supabaseAdmin
        .from('crm_conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data, error } = await supabaseAdmin
        .from('crm_conversations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (op === 'list_agents') {
      let agents = [];
      try {
        const { data, error } = await supabaseAdmin
          .from('crm_user_assignments')
          .select(
            'id, user_id, institution_id, can_access_unassigned_pool, is_active, users:user_id(id, name, email, role, roles)'
          )
          .eq('is_active', true)
          .limit(300);
        if (error) throw error;
        agents = (data || []).filter((a) => {
          if (!institutionId) return true;
          const aInst = String(a.institution_id || '').trim();
          return !aInst || aInst === String(institutionId);
        });
      } catch (e) {
        if (!/crm_user_assignments|does not exist/i.test(e?.message || '')) throw e;
      }

      const { data: staffRows } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, roles, institution_id, is_active')
        .in('role', ['crm_agent', 'coach', 'admin', 'super_admin', 'teacher'])
        .limit(500);

      const roleUsersMap = new Map();
      for (const u of staffRows || []) {
        if (u.is_active === false) continue;
        if (!userHasRole(u, 'crm_agent')) continue;
        if (institutionId) {
          const uInst = String(u.institution_id || '').trim();
          if (uInst && uInst !== String(institutionId)) continue;
        }
        roleUsersMap.set(u.id, u);
      }
      for (const a of agents) {
        const u = a.users;
        if (u?.id && !roleUsersMap.has(u.id)) {
          roleUsersMap.set(u.id, {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            roles: u.roles,
            institution_id: a.institution_id
          });
        }
      }

      return res.status(200).json({
        data: { assignments: agents, role_users: [...roleUsersMap.values()] }
      });
    }

    if (op === 'poll') {
      const since = String(req.query?.since || body.since || '').trim();
      const conversationId = String(req.query?.conversation_id || body.conversation_id || '').trim();
      if (!since) return res.status(400).json({ error: 'since_required' });

      if (conversationId) {
        const { data: conv } = await supabaseAdmin
          .from('crm_conversations')
          .select('*')
          .eq('id', conversationId)
          .maybeSingle();
        if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const { data: messages } = await supabaseAdmin
          .from('crm_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .gt('created_at', since)
          .order('created_at', { ascending: true })
          .limit(100);
        return res.status(200).json({
          data: { messages: messages || [], server_time: new Date().toISOString() }
        });
      }

      let cq = supabaseAdmin
        .from('crm_conversations')
        .select(
          'id, last_message_at, last_message_preview, unread_count, assigned_user_id, status, channel, contact_name, contact_identifier, updated_at'
        )
        .gt('updated_at', since)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (institutionId) cq = cq.eq('institution_id', institutionId);
      cq = applyAgentScope(cq, actor, assignment, isAdmin);
      const { data: conversations } = await cq;
      return res.status(200).json({
        data: { conversations: conversations || [], server_time: new Date().toISOString() }
      });
    }

    return res.status(400).json({ error: 'unknown_op', op });
  } catch (e) {
    console.error('[crm-inbox]', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'server_error' });
  }
}
