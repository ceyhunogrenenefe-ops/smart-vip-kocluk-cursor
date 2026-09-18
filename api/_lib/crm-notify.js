/**
 * FAZ 4 — CRM bildirimleri: CRM içi (platform_notifications + okundu), Web Push (tarayıcı / PWA).
 * Yeni lead / mesaj → sorumlu temsilci; atanmamışsa kurum yöneticileri.
 * Aynı sohbet için 10 dk içinde okunmamış bildirim varsa yenisi açılmaz (yığılma olmasın).
 */
import webpush from 'web-push';
import { supabaseAdmin } from './supabase-admin.js';
import { GRADE_PROGRAM_LABELS } from './registration-tracking-utils.js';

const THROTTLE_MS = 10 * 60 * 1000;
let vapidCache = null;

export function conversationLink(conversationId) {
  return `/crm/inbox?c=${encodeURIComponent(conversationId)}`;
}

/** Saf: bildirim başlık / gövdesi */
export function buildInboundNotification({ isNew, channel, contactName, gradeProgram, interestedPackage, snippet }) {
  const ch = channel === 'instagram' ? 'Instagram' : channel === 'facebook' ? 'Facebook' : 'WhatsApp';
  const grade = gradeProgram && gradeProgram !== 'unspecified' ? GRADE_PROGRAM_LABELS[gradeProgram] || gradeProgram : '';
  const detail = [ch, [grade, interestedPackage].filter(Boolean).join(' / ')].filter(Boolean).join(' · ');
  const name = String(contactName || '').trim() || 'Yeni kişi';
  const text = String(snippet || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    title: isNew ? 'Yeni potansiyel müşteri' : `Yeni mesaj · ${name}`,
    body: [isNew ? `${detail}\n${name}` : detail, text].filter(Boolean).join('\n')
  };
}

async function getVapid() {
  if (vapidCache) return vapidCache;
  let { data } = await supabaseAdmin.from('crm_push_config').select('*').eq('id', 1).maybeSingle();
  if (!data) {
    const keys = webpush.generateVAPIDKeys();
    const { error: upErr } = await supabaseAdmin
      .from('crm_push_config')
      .upsert({ id: 1, vapid_public_key: keys.publicKey, vapid_private_key: keys.privateKey }, { onConflict: 'id', ignoreDuplicates: true });
    if (upErr) console.error('[crm-push] vapid save failed', upErr.message);
    ({ data } = await supabaseAdmin.from('crm_push_config').select('*').eq('id', 1).maybeSingle());
  }
  if (!data) throw new Error('push_config_unavailable');
  vapidCache = { publicKey: data.vapid_public_key, privateKey: data.vapid_private_key, subject: data.subject };
  return vapidCache;
}

export async function getVapidPublicKey() {
  return (await getVapid()).publicKey;
}

export async function saveSubscription(userId, sub, userAgent = null) {
  const endpoint = String(sub?.endpoint || '').trim();
  const p256dh = String(sub?.keys?.p256dh || '').trim();
  const auth = String(sub?.keys?.auth || '').trim();
  if (!endpoint.startsWith('https://') || !p256dh || !auth) throw new Error('invalid_subscription');
  const { error } = await supabaseAdmin.from('crm_push_subscriptions').upsert(
    { user_id: String(userId), endpoint, p256dh, auth, user_agent: userAgent ? String(userAgent).slice(0, 300) : null, failure_count: 0 },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
}

export async function removeSubscription(userId, endpoint) {
  await supabaseAdmin.from('crm_push_subscriptions').delete().eq('user_id', String(userId)).eq('endpoint', String(endpoint || ''));
}

/** Kullanıcının tüm cihazlarına push; süresi dolan abonelik (404/410) silinir */
export async function sendPushToUser(userId, payload) {
  const { data: subs } = await supabaseAdmin
    .from('crm_push_subscriptions')
    .select('id, endpoint, p256dh, auth, failure_count')
    .eq('user_id', String(userId))
    .limit(10);
  if (!subs?.length) return { sent: 0 };
  const vapid = await getVapid();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          {
            vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
            TTL: 3600,
            urgency: 'high',
            timeout: 8000
          }
        );
        sent += 1;
        await supabaseAdmin.from('crm_push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', s.id);
      } catch (e) {
        const code = Number(e?.statusCode || 0);
        if (code === 404 || code === 410) {
          await supabaseAdmin.from('crm_push_subscriptions').delete().eq('id', s.id);
        } else {
          await supabaseAdmin.from('crm_push_subscriptions').update({ failure_count: (s.failure_count || 0) + 1 }).eq('id', s.id);
        }
      }
    })
  );
  return { sent };
}

/** CRM içi bildirim + push (hata olursa akışı bozmaz) */
export async function createCrmNotification({ userId, title, body, link, priority = 'normal', institutionId = null, tag = null }) {
  if (!userId) return null;
  const { data, error } = await supabaseAdmin
    .from('platform_notifications')
    .insert({
      title: String(title).slice(0, 200),
      body: String(body || '').slice(0, 4000),
      target_type: 'user',
      target_user_id: String(userId),
      sender_user_id: 'system',
      sender_role: 'admin',
      sender_name: 'Online VIP CRM',
      institution_id: institutionId,
      priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
      link_url: link
    })
    .select('id')
    .maybeSingle();
  if (error) {
    console.warn('[crm-notify] insert:', error.message);
    return null;
  }
  await sendPushToUser(userId, { title, body, url: link, tag: tag || data?.id, id: data?.id }).catch((e) =>
    console.warn('[crm-notify] push:', e instanceof Error ? e.message : e)
  );
  return data?.id || null;
}

async function recipientsFor(conversation) {
  if (conversation.assigned_user_id) return [String(conversation.assigned_user_id)];
  // Atanmamış: kurum yöneticileri (süper admin dahil)
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, role, roles, institution_id, is_active')
    .or(`institution_id.eq.${conversation.institution_id},role.eq.super_admin`)
    .limit(200);
  return (data || [])
    .filter((u) => u.is_active !== false)
    .filter((u) => {
      const roles = Array.isArray(u.roles) && u.roles.length ? u.roles : [u.role];
      return roles.some((r) => ['admin', 'super_admin'].includes(String(r)));
    })
    .map((u) => String(u.id));
}

/** Gelen mesaj sonrası (atama yapıldıktan sonra çağrılır) */
export async function notifyInboundMessage({ conversation, isNewConversation, snippet }) {
  if (!conversation?.id) return { notified: 0 };
  const link = conversationLink(conversation.id);
  let lead = null;
  if (conversation.lead_id) {
    const { data } = await supabaseAdmin
      .from('registration_leads')
      .select('grade_program, interested_package, parent_full_name, full_name')
      .eq('id', conversation.lead_id)
      .maybeSingle();
    lead = data;
  }
  const { title, body } = buildInboundNotification({
    isNew: isNewConversation,
    channel: conversation.channel,
    contactName: conversation.contact_name || lead?.parent_full_name || lead?.full_name || conversation.contact_username,
    gradeProgram: lead?.grade_program,
    interestedPackage: lead?.interested_package,
    snippet
  });
  const since = new Date(Date.now() - THROTTLE_MS).toISOString();
  let notified = 0;
  for (const userId of await recipientsFor(conversation)) {
    if (!isNewConversation) {
      const { data: recent } = await supabaseAdmin
        .from('platform_notifications')
        .select('id, platform_notification_reads(user_id)')
        .eq('target_user_id', userId)
        .eq('link_url', link)
        .gte('created_at', since)
        .limit(3);
      const unreadRecent = (recent || []).some((n) => !(n.platform_notification_reads || []).length);
      if (unreadRecent) continue;
    }
    const id = await createCrmNotification({
      userId,
      title,
      body,
      link,
      priority: isNewConversation ? 'high' : 'normal',
      institutionId: conversation.institution_id || null,
      tag: `conv-${conversation.id}`
    });
    if (id) notified += 1;
  }
  return { notified };
}

/** Zil: kullanıcının CRM bildirimleri + okundu durumu */
export async function listCrmNotifications(userId, { limit = 30 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('platform_notifications')
    .select('id, title, body, link_url, priority, created_at, platform_notification_reads(user_id, read_at)')
    .eq('target_user_id', String(userId))
    .like('link_url', '/crm%')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 30, 1), 100));
  if (error) throw error;
  const items = (data || []).map((n) => {
    const read = (n.platform_notification_reads || []).find((r) => String(r.user_id) === String(userId));
    return { id: n.id, title: n.title, body: n.body, link_url: n.link_url, priority: n.priority, created_at: n.created_at, read_at: read?.read_at || null };
  });
  // Okunmamış sayısı: son 200 bildirim içinde okundu kaydı olmayanlar (zil rozeti için yeterli)
  const { data: recent } = await supabaseAdmin
    .from('platform_notifications')
    .select('id, platform_notification_reads(user_id)')
    .eq('target_user_id', String(userId))
    .like('link_url', '/crm%')
    .order('created_at', { ascending: false })
    .limit(200);
  const unread = (recent || []).filter((n) => !(n.platform_notification_reads || []).length).length;
  return { items, unread };
}

export async function markCrmNotificationsRead(userId, ids) {
  let list = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  if (!list.length) {
    const { data } = await supabaseAdmin
      .from('platform_notifications')
      .select('id')
      .eq('target_user_id', String(userId))
      .like('link_url', '/crm%')
      .order('created_at', { ascending: false })
      .limit(500);
    list = (data || []).map((n) => n.id);
  }
  if (!list.length) return 0;
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('platform_notification_reads')
    .upsert(
      list.map((id) => ({ notification_id: id, user_id: String(userId), read_at: now })),
      { onConflict: 'notification_id,user_id', ignoreDuplicates: true }
    );
  if (error) throw error;
  return list.length;
}
