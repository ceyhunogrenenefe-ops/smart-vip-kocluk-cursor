/**
 * CRM Unified Inbox API — /api/crm-inbox?op=...
 */
import { requireAuthenticatedActor, signAuthToken } from '../api/_lib/auth.js';
import { loadMetaWhatsAppSecretsFromDb } from '../api/_lib/meta-whatsapp.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { actorRoleSet, actorIsAdminLike } from '../api/_lib/actor-roles.js';
import {
  getCrmAgentAssignment,
  getCrmInboundInstitutionId,
  sendCrmInstagramDm,
  sendCrmWhatsAppTemplate,
  sendCrmWhatsAppText,
  upsertCrmMessage,
  isFacebookFallbackContact,
  stripFacebookFallbackContact
} from '../api/_lib/crm-inbox.js';
import {
  fillCrmTemplateBody,
  invalidateCrmTemplateCache,
  listApprovedCrmWhatsAppTemplates,
  mapDbTemplateToCrm
} from '../api/_lib/meta-templates-sync.js';
import {
  buildMetaTemplateCreatePayload,
  createOrReuseMetaMessageTemplate
} from '../api/_lib/meta-template-create.js';
import { diagnoseCrmInbox, ensureCrmInboxSchema, probeFacebookChannelSupport, FACEBOOK_CHANNEL_REPAIR_SQL } from '../api/_lib/crm-inbox-schema.js';
import { listRecentMetaWebhookLogs } from '../api/_lib/meta-webhook-logs.js';
import { PAGE_WEBHOOK_FIELDS, INSTAGRAM_APP_WEBHOOK_FIELDS } from '../api/_lib/meta-social-inbound.js';
import { ensureMetaInboundDelivery, publicInboundStatus } from '../api/_lib/meta-inbound-ensure.js';
import {
  bindMetaSocialFromPageToken,
  bindMetaSocialFromUserToken,
  describeSocialTokenEnv,
  ensureMetaSocialInbound,
  publicSocialStatus,
  saveMetaPageSecretsToDb
} from '../api/_lib/meta-social-inbound.js';
import {
  DEFAULT_META_CONFIGURATION_ID,
  describeFacebookLoginWidget
} from '../api/_lib/meta-facebook-login.js';

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
      if (channel === 'whatsapp' || channel === 'instagram') {
        query = query.eq('channel', channel);
        if (channel === 'instagram') {
          // fb: fallback satırlarını Instagram filtresinden çıkar (Facebook olarak gösterilir)
          query = query.not('contact_identifier', 'like', 'fb:%');
        }
      } else if (channel === 'facebook') {
        // Native facebook + CHECK yokken yazılan fb: önekli fallback
        query = query.or('channel.eq.facebook,and(channel.eq.instagram,contact_identifier.like.fb:%)');
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
      const rows = (data || []).map((row) => {
        if (
          isFacebookFallbackContact(row?.contact_identifier) ||
          row?.ad_source_data?.source_platform === 'facebook' ||
          row?.ad_source_data?.original_channel === 'facebook'
        ) {
          return {
            ...row,
            channel: 'facebook',
            contact_identifier: stripFacebookFallbackContact(row.contact_identifier),
            metadata: {
              ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
              facebook_channel_fallback: true,
              stored_contact_identifier: row.contact_identifier
            }
          };
        }
        return row;
      });
      return res.status(200).json({ data: rows, institution_id: institutionId });
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
          website_form: { ok: true, endpoint: '/api/site-leads' },
          real_inbound: diag?.real_inbound || null,
          real_inbound_seen: Boolean(diag?.e2e_ready?.real_inbound_seen),
          last_webhook_at: (diag?.recent_webhook_hits || [])[0]?.received_at || null
        }
      });
    }


    if (op === 'meta_diagnostics') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'forbidden', hint: 'Meta tanılama yalnızca yönetici.' });
      }
      const [diag, social, recentLogs, fbChannel] = await Promise.all([
        diagnoseCrmInbox().catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
        ensureMetaSocialInbound({ apply: false }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) })),
        listRecentMetaWebhookLogs(20).catch(() => []),
        probeFacebookChannelSupport({ force: true }).catch((e) => ({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          repair_sql: FACEBOOK_CHANNEL_REPAIR_SQL
        }))
      ]);
      const convs = Array.isArray(diag?.recent_crm_conversations) ? diag.recent_crm_conversations : [];
      const lastByChannel = (ch) => {
        if (ch === 'facebook') {
          const hit = convs.find(
            (c) =>
              String(c.channel || '') === 'facebook' ||
              isFacebookFallbackContact(c.contact_identifier) ||
              c?.ad_source_data?.source_platform === 'facebook'
          );
          return hit?.last_message_at || null;
        }
        const hit = convs.find((c) => String(c.channel || '') === ch && !isFacebookFallbackContact(c.contact_identifier));
        return hit?.last_message_at || null;
      };
      const logs = Array.isArray(recentLogs) ? recentLogs : [];
      const lastComment = logs.find((l) => /comment/i.test(String(l.event_type || l.field || '')));
      const pub = publicSocialStatus(social);
      const igFields =
        (Array.isArray(pub?.app_instagram_fields) && pub.app_instagram_fields.length
          ? pub.app_instagram_fields
          : null) ||
        (Array.isArray(social?.app_subscriptions?.instagram?.fields)
          ? social.app_subscriptions.instagram.fields
          : null);
      const igSubscribed = Boolean(
        pub?.app_instagram_subscribed ||
          social?.app_subscriptions?.instagram?.subscribed ||
          (igFields && igFields.includes('messages'))
      );
      return res.status(200).json({
        data: {
          facebook_connected: Boolean(pub?.ok || social?.page_id),
          instagram_connected: Boolean(pub?.instagram_business_id_suffix || social?.instagram_business_id),
          page_id: social?.page_id || null,
          page_id_suffix: pub?.page_id_suffix || null,
          instagram_business_id: social?.instagram_business_id || null,
          instagram_business_id_suffix: pub?.instagram_business_id_suffix || null,
          token_present: Boolean(pub?.token_present ?? social?.token_present),
          token_valid: Boolean(social?.ok || pub?.ok),
          token_source: pub?.token_source || social?.token_source || null,
          page_webhook_subscribed: Boolean(
            Array.isArray(social?.subscribed_fields)
              ? social.subscribed_fields.includes('messages')
              : pub?.ok
          ),
          page_subscribed_fields: social?.subscribed_fields || PAGE_WEBHOOK_FIELDS,
          instagram_webhook_subscribed: igSubscribed,
          instagram_subscribed_fields: igFields || INSTAGRAM_APP_WEBHOOK_FIELDS,
          expected_page_fields: PAGE_WEBHOOK_FIELDS,
          expected_instagram_fields: INSTAGRAM_APP_WEBHOOK_FIELDS,
          app_subscriptions_existing: social?.app_subscriptions?.existing || null,
          facebook_channel_db_ok: Boolean(fbChannel?.ok),
          facebook_channel_db_error: fbChannel?.ok ? null : fbChannel?.error || null,
          facebook_channel_repair_sql: fbChannel?.ok ? null : FACEBOOK_CHANNEL_REPAIR_SQL,
          last_webhook_at: logs[0]?.received_at || diag?.recent_webhook_hits?.[0]?.received_at || null,
          last_facebook_message_at: lastByChannel('facebook'),
          last_instagram_message_at: lastByChannel('instagram'),
          last_comment_webhook_at: lastComment?.received_at || null,
          last_error:
            pub?.app_instagram_error ||
            social?.error ||
            social?.app_subscriptions?.error ||
            (!fbChannel?.ok ? fbChannel?.error : null) ||
            diag?.error ||
            null,
          recent_webhook_events: logs,
          permissions_hint: {
            login_for_business_config_scopes: [
              'pages_show_list',
              'pages_messaging',
              'pages_manage_metadata',
              'instagram_basic',
              'instagram_manage_messages',
              'instagram_manage_comments'
            ],
            note: 'pages_messaging / pages_manage_metadata Login for Business config izin listesinde olmalı; OAuth URL scope satırına konmaz.'
          },
          social: pub,
          env: describeSocialTokenEnv()
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
      let igSync = null;
      try {
        const { syncInstagramConversationsFromGraph } = await import('../api/_lib/instagram-conversations-sync.js');
        igSync = await syncInstagramConversationsFromGraph({ apply: true, limit: 20 });
      } catch (e) {
        igSync = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      return res.status(200).json({
        ok: Boolean(inbound?.ok),
        data: {
          ...publicInboundStatus(inbound),
          social: { ...publicSocialStatus(social), env: describeSocialTokenEnv() },
          instagram_conversation_sync: igSync
        },
        steps: inbound?.steps || [],
        social_steps: social?.steps || [],
        error: inbound?.error || social?.error || igSync?.error || null
      });
    }

    if (op === 'sync_instagram_conversations') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'forbidden', hint: 'IG sync yalnızca yönetici.' });
      }
      const { syncInstagramConversationsFromGraph } = await import('../api/_lib/instagram-conversations-sync.js');
      const apply = String(req.query?.apply || body.apply || '1') !== '0';
      const limit = Number(req.query?.limit || body.limit || 20);
      const result = await syncInstagramConversationsFromGraph({ apply, limit });
      return res.status(result.ok ? 200 : 502).json({ ok: result.ok, data: result });
    }

    if (op === 'facebook_login_start') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'forbidden', hint: 'Widget bağlama yalnızca yönetici.' });
      }
      await loadMetaWhatsAppSecretsFromDb();
      const state = signAuthToken({ oauth_purpose: 'facebook_login_widget' });
      return res.status(200).json({ data: describeFacebookLoginWidget(undefined, { state }) });
    }

    if (op === 'save_meta_app_secret' && req.method === 'POST') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'forbidden', hint: 'App secret yalnızca yönetici kaydeder.' });
      }
      const secret = String(body.app_secret || body.meta_app_secret || '').trim();
      if (secret.length < 16) {
        return res.status(400).json({
          error: 'app_secret_invalid',
          hint: 'SmartKocluk Facebook App Secret (Instagram Login secret değil).'
        });
      }
      await saveMetaPageSecretsToDb({ app_secret: secret });
      process.env.META_APP_SECRET = secret;
      return res.status(200).json({ ok: true, data: { saved: true, suffix: secret.slice(-4) } });
    }

    if (op === 'save_meta_configuration_id' && req.method === 'POST') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'forbidden', hint: 'Yapılandırma ID yalnızca yönetici kaydeder.' });
      }
      const configId = String(body.configuration_id || body.config_id || '').trim();
      if (!/^\d{10,22}$/.test(configId)) {
        return res.status(400).json({
          error: 'configuration_id_invalid',
          hint: 'Yeni Login for Business yapılandırma ID’si (yalnızca rakam). Eski 1784538625891317 değil — o iki varlık hâlâ 1349246 verir.'
        });
      }
      if (configId === DEFAULT_META_CONFIGURATION_ID) {
        return res.status(400).json({
          error: 'configuration_id_still_default',
          hint: 'Bu eski yapılandırma hâlâ 52570416778031 ve 23850842047630381 istiyor. Meta’da o iki varlığı silin veya yalnızca Online VIP içeren yeni config oluşturun.'
        });
      }
      await saveMetaPageSecretsToDb({ configuration_id: configId });
      process.env.META_CONFIGURATION_ID = configId;
      return res.status(200).json({
        ok: true,
        data: {
          saved: true,
          configuration_id: configId,
          uses_slim_config: configId !== DEFAULT_META_CONFIGURATION_ID
        }
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

    if (op === 'list_meta_templates') {
      await loadMetaWhatsAppSecretsFromDb();
      const force =
        String(req.query?.refresh || body.refresh || '').trim() === '1' ||
        String(req.query?.force || body.force || '').trim() === '1';
      const live = await listApprovedCrmWhatsAppTemplates({ force });
      if (live.templates?.length || live.pending?.length) {
        return res.status(200).json({
          data: live.templates || [],
          pending: live.pending || [],
          source: live.source,
          hint: live.hint || null
        });
      }

      const { data: rows, error } = await supabaseAdmin
        .from('message_templates')
        .select(
          'id, name, type, content, variables, meta_template_name, meta_template_language, whatsapp_template_status'
        )
        .not('meta_template_name', 'is', null)
        .limit(80);
      if (error && /message_templates|does not exist/i.test(error.message || '')) {
        return res.status(200).json({
          data: [],
          pending: [],
          source: live.source || 'none',
          hint: live.hint || 'Onaylı Meta şablonu bulunamadı.',
          error: live.error || null
        });
      }
      if (error) throw error;
      const fallback = (rows || [])
        .map(mapDbTemplateToCrm)
        .filter((t) => t.name)
        .filter((t) => {
          const s = String(t.status || '').toUpperCase();
          return !s || /APPROV|ACTIVE|ENABLED/.test(s);
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      return res.status(200).json({
        data: fallback,
        pending: [],
        source: fallback.length ? 'db' : live.source || 'none',
        hint: fallback.length
          ? 'Graph listesi boş — kayıtlı onaylı şablonlar gösteriliyor.'
          : live.hint || 'Onaylı Meta şablonu bulunamadı.',
        error: live.error || null
      });
    }

    if (op === 'create_meta_template' && req.method === 'POST') {
      await loadMetaWhatsAppSecretsFromDb();
      const displayName = String(body.name || body.title || '').trim();
      const bodyText = String(body.body || body.content || '').trim();
      const category = String(body.category || 'UTILITY').trim().toUpperCase() || 'UTILITY';
      const language = String(body.language || 'tr').trim() || 'tr';
      const examples =
        body.examples && typeof body.examples === 'object' && !Array.isArray(body.examples) ? body.examples : {};
      if (!displayName) return res.status(400).json({ error: 'name_required', message: 'Şablon adı gerekli.' });
      if (!bodyText) return res.status(400).json({ error: 'body_required', message: 'Şablon metni gerekli.' });
      if (!['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(category)) {
        return res.status(400).json({ error: 'invalid_category', message: 'Kategori UTILITY, MARKETING veya AUTHENTICATION olmalı.' });
      }
      let payload;
      try {
        payload = buildMetaTemplateCreatePayload({
          name: displayName,
          language,
          category,
          bodyText,
          examples
        });
      } catch (e) {
        return res.status(400).json({
          error: 'payload_invalid',
          message: e instanceof Error ? e.message : String(e)
        });
      }
      const submitted = await createOrReuseMetaMessageTemplate(payload);
      invalidateCrmTemplateCache();
      if (submitted.ok) {
        try {
          await supabaseAdmin.from('message_templates').insert({
            name: displayName.slice(0, 120),
            type: `crm_${payload.name}`.slice(0, 80),
            content: bodyText.slice(0, 8000),
            meta_template_name: submitted.name,
            meta_template_language: submitted.language || language,
            whatsapp_template_status: submitted.status,
            meta_named_body_parameters: payload.parameter_format === 'NAMED',
            updated_at: new Date().toISOString()
          });
        } catch {
          /* tablo yok / unique — Graph gönderimi asıl kaynak */
        }
      }
      return res.status(submitted.ok ? 200 : 400).json({
        ok: submitted.ok,
        data: submitted,
        error: submitted.ok ? null : submitted.error,
        message: submitted.ok
          ? submitted.reused
            ? `Şablon zaten var: ${submitted.status}`
            : `Onaya gönderildi: ${submitted.status}`
          : submitted.error || 'Şablon oluşturulamadı'
      });
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
      const templateName = String(body.template_name || body.templateName || '').trim();
      const templateLanguage = String(body.template_language || body.language || 'tr').trim() || 'tr';
      const templateParams = Array.isArray(body.template_params)
        ? body.template_params.map((x) => String(x ?? ''))
        : [];
      const templateParamNames = Array.isArray(body.template_param_names)
        ? body.template_param_names.map((x) => String(x ?? '').trim()).filter(Boolean)
        : null;
      const templateBodyPreview = String(body.template_body || '').trim();
      if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
      if (!templateName && !text) return res.status(400).json({ error: 'body_required' });

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
      let outboundBody = text;
      try {
        if (templateName) {
          outboundBody =
            fillCrmTemplateBody(templateBodyPreview, templateParams, templateParamNames) ||
            templateBodyPreview ||
            `[şablon] ${templateName}`;
          if (conv.channel === 'whatsapp') {
            try {
              const r = await sendCrmWhatsAppTemplate({
                phone: conv.contact_identifier,
                templateName,
                languageCode: templateLanguage,
                bodyParameterTexts: templateParams,
                bodyParameterNames: templateParamNames
              });
              sendResult = {
                ok: true,
                messageId: r.messageId,
                error: null,
                languageUsed: r.languageUsed,
                mode: 'whatsapp_template'
              };
            } catch (tplErr) {
              const r = await sendCrmWhatsAppText({ phone: conv.contact_identifier, text: outboundBody });
              sendResult = {
                ok: true,
                messageId: r.messageId,
                error: null,
                mode: 'whatsapp_text_fallback',
                templateError: tplErr instanceof Error ? tplErr.message : String(tplErr)
              };
            }
          } else {
            const r = await sendCrmInstagramDm({
              igScopedId: conv.contact_identifier,
              text: outboundBody
            });
            sendResult = {
              ok: true,
              messageId: r.messageId,
              error: null,
              mode: 'social_text'
            };
          }
        } else if (conv.channel === 'whatsapp') {
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
        if (templateName && !outboundBody) {
          outboundBody = templateBodyPreview || `[şablon] ${templateName}`;
        }
      }

      const saved = await upsertCrmMessage({
        channel: conv.channel,
        contactIdentifier: conv.contact_identifier,
        contactName: conv.contact_name,
        body: outboundBody,
        messageType: templateName ? 'template' : 'text',
        messageId: sendResult.messageId,
        timestamp: Date.now(),
        direction: 'outbound',
        senderType: 'agent',
        senderId: actor.sub,
        institutionId: conv.institution_id,
        leadId: conv.lead_id,
        payload: {
          send: sendResult,
          template: templateName
            ? {
                name: templateName,
                language: templateLanguage,
                params: templateParams
              }
            : null
        },
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

    if (op === 'delete_message' && req.method === 'POST') {
      const messageId = String(body.message_id || body.id || '').trim();
      if (!messageId) return res.status(400).json({ error: 'message_id_required' });
      const { data: msg, error: mErr } = await supabaseAdmin
        .from('crm_messages')
        .select('id, conversation_id, body, created_at')
        .eq('id', messageId)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!msg) return res.status(404).json({ error: 'message_not_found' });
      const { data: conv } = await supabaseAdmin
        .from('crm_conversations')
        .select('*')
        .eq('id', msg.conversation_id)
        .maybeSingle();
      if (!(await assertConversationAccess(conv, actor, roleSet, assignment))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { error: delErr } = await supabaseAdmin.from('crm_messages').delete().eq('id', messageId);
      if (delErr) throw delErr;

      const { data: last } = await supabaseAdmin
        .from('crm_messages')
        .select('body, created_at')
        .eq('conversation_id', msg.conversation_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const preview = last?.body
        ? String(last.body).replace(/\s+/g, ' ').trim().slice(0, 140)
        : '';
      const { data: updated } = await supabaseAdmin
        .from('crm_conversations')
        .update({
          last_message_at: last?.created_at || conv.last_message_at,
          last_message_preview: preview,
          updated_at: new Date().toISOString()
        })
        .eq('id', msg.conversation_id)
        .select('*')
        .maybeSingle();
      return res.status(200).json({ ok: true, data: { deleted_id: messageId, conversation: updated || conv } });
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

    if (op === 'heartbeat') {
      const { upsertCrmAgentPresence } = await import('../api/_lib/crm-live-ops.js');
      const pagePath = String(body.page_path || req.query?.page_path || '').trim() || null;
      const result = await upsertCrmAgentPresence({
        userId: actor.sub || actor.id,
        institutionId: institutionId || null,
        pagePath,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 240) || null
      });
      if (!result.ok && result.error === 'presence_table_missing') {
        await ensureCrmInboxSchema({ force: true }).catch(() => null);
        const retry = await upsertCrmAgentPresence({
          userId: actor.sub || actor.id,
          institutionId: institutionId || null,
          pagePath,
          userAgent: String(req.headers['user-agent'] || '').slice(0, 240) || null
        });
        return res.status(200).json({ ok: retry.ok, data: retry });
      }
      return res.status(200).json({ ok: result.ok, data: result });
    }

    if (op === 'list_presence') {
      if (!isAdmin) return res.status(403).json({ error: 'forbidden' });
      const { listCrmAgentPresence } = await import('../api/_lib/crm-live-ops.js');
      const onlineOnly = String(req.query?.online_only || body.online_only || '') === '1';
      const result = await listCrmAgentPresence({
        institutionId: institutionId || null,
        onlineOnly
      });
      return res.status(200).json({ data: result });
    }

    return res.status(400).json({ error: 'unknown_op', op });
  } catch (e) {
    console.error('[crm-inbox]', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'server_error' });
  }
}
