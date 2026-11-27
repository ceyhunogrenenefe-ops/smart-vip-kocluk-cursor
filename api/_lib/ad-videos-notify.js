/**
 * Reklam Videoları — bildirimler (mevcut altyapı).
 *
 * Kanal: uygulama içi bildirim (`platform_notifications`, üst menüdeki zil + /notifications)
 * ve aboneliği olan cihazlara Web Push (`crm_push_subscriptions`, crm-notify.sendPushToUser).
 * Her bildirimin link_url'i ilgili görevi açar.
 *
 * Tekrar önleme: `ad_video_notification_log (event_key, recipient_id)` tekildir; önce log satırı
 * yazılır, çakışırsa (23505) bildirim atlanır. Bildirim yazılamazsa log geri alınır ki sonraki
 * cron turunda yeniden denensin.
 */
import { supabaseAdmin } from './supabase-admin.js';
import {
  DEFAULT_SETTINGS,
  buildDailySummary,
  dailySummaryDue,
  dailySummaryText,
  dueNotificationCandidates,
  formatTrDateTime
} from './ad-videos-core.js';

export const TASKS = 'ad_video_tasks';
export const LOG = 'ad_video_notification_log';
export const SETTINGS = 'ad_video_settings';

export function taskLink(taskId) {
  return `/reklam-videolari?gorev=${encodeURIComponent(taskId)}`;
}

export function settingsKey(institutionId) {
  return String(institutionId || '');
}

export async function loadSettings(institutionId) {
  const { data, error } = await supabaseAdmin
    .from(SETTINGS)
    .select('*')
    .eq('institution_id', settingsKey(institutionId))
    .maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_SETTINGS, institution_id: settingsKey(institutionId), ...(data || {}) };
}

let pushImpl = null;
async function sendPush(userId, payload) {
  try {
    if (!pushImpl) pushImpl = (await import('./crm-notify.js')).sendPushToUser;
    return await pushImpl(userId, payload);
  } catch (e) {
    console.warn('[ad-videos-notify] push:', e instanceof Error ? e.message : e);
    return { sent: 0 };
  }
}

/** Testler için push'u değiştir */
export function __setPushImpl(fn) {
  pushImpl = fn;
}

/**
 * Tek seferlik bildirim. Dönüş: 'sent' | 'duplicate' | 'failed'
 */
export async function notifyOnce({ eventKey, recipientId, taskId = null, kind, title, body, link, institutionId = null, priority = 'normal' }) {
  if (!recipientId || !eventKey) return 'failed';
  const { data: logRow, error: logErr } = await supabaseAdmin
    .from(LOG)
    .insert({ event_key: eventKey, recipient_id: String(recipientId), task_id: taskId, kind })
    .select('id')
    .maybeSingle();
  if (logErr) {
    if (String(logErr.code) === '23505' || /duplicate key/i.test(String(logErr.message))) return 'duplicate';
    console.warn('[ad-videos-notify] log:', logErr.message);
    return 'failed';
  }
  const { error } = await supabaseAdmin.from('platform_notifications').insert({
    title: String(title).slice(0, 200),
    body: String(body || '').slice(0, 4000),
    target_type: 'user',
    target_user_id: String(recipientId),
    target_role: null,
    target_institution_id: null,
    sender_user_id: 'system',
    sender_role: 'admin',
    sender_name: 'Reklam Videoları',
    institution_id: institutionId,
    priority,
    link_url: link
  });
  if (error) {
    console.warn('[ad-videos-notify] notification:', error.message);
    if (logRow?.id) await supabaseAdmin.from(LOG).delete().eq('id', logRow.id);
    return 'failed';
  }
  await sendPush(recipientId, { title, body: String(body || '').slice(0, 300), url: link, tag: eventKey });
  return 'sent';
}

// ------------------------------------------------------------ olay bildirimleri

export function notifyAssigned(task) {
  const when = task.planned_shoot_at ? `Planlanan çekim: ${formatTrDateTime(task.planned_shoot_at)}\n` : '';
  return notifyOnce({
    eventKey: `assigned:${task.id}`,
    recipientId: task.teacher_id,
    taskId: task.id,
    kind: 'assigned',
    title: 'Yeni reklam videosu görevi',
    body: `${task.title}\n${when}Son teslim: ${formatTrDateTime(task.due_at)}`,
    link: taskLink(task.id),
    institutionId: task.institution_id,
    priority: 'high'
  });
}

export function notifyRevision(task, submission, note) {
  return notifyOnce({
    eventKey: `revision:${submission.id}`,
    recipientId: task.teacher_id,
    taskId: task.id,
    kind: 'revision',
    title: 'Reklam videosu için düzeltme istendi',
    body: `${task.title}\n${String(note || '').slice(0, 600)}`,
    link: taskLink(task.id),
    institutionId: task.institution_id,
    priority: 'high'
  });
}

function dueMessage(kind, task) {
  if (kind === 'due_24h') {
    return {
      title: 'Reklam videosu teslimine 24 saatten az kaldı',
      body: `${task.title}\nSon teslim: ${formatTrDateTime(task.due_at)}`
    };
  }
  return {
    title: 'Reklam videosu teslimi gecikti',
    body: `${task.title}\nSon teslim ${formatTrDateTime(task.due_at)} idi. Videoyu en kısa sürede yükleyin.`
  };
}

/** Kurum yöneticileri + kurgu ekibi (günlük özet alıcıları) */
export async function summaryRecipients(institutionId, settings) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, role, roles, institution_id, is_active')
    .limit(5000);
  if (error) throw error;
  const inst = settingsKey(institutionId);
  const ids = new Set();
  for (const u of data || []) {
    if (u.is_active === false) continue;
    const tags = new Set([u.role, ...(Array.isArray(u.roles) ? u.roles : [])].map((r) => String(r || '').toLowerCase()));
    const uInst = settingsKey(u.institution_id);
    if (tags.has('admin') && uInst === inst && inst) ids.add(String(u.id));
    if (tags.has('super_admin') && (!uInst || uInst === inst)) ids.add(String(u.id));
  }
  for (const id of settings?.editor_user_ids || []) ids.add(String(id));
  return [...ids];
}

async function teacherNames(ids) {
  const list = [...new Set(ids.map(String))].filter(Boolean);
  if (!list.length) return new Map();
  const { data } = await supabaseAdmin.from('users').select('id, name').in('id', list);
  return new Map((data || []).map((u) => [String(u.id), { name: u.name || 'Öğretmen' }]));
}

/**
 * Cron işi (15 dk'da bir):
 *  - teslime 24 saat kala hatırlatma, gecikme bildirimi (teslim edilmişse gitmez)
 *  - ayarlı saatte günlük özet (kurum başına günde bir)
 */
export async function runAdVideoNotifyJob({ now = new Date() } = {}) {
  const result = { due_24h: 0, overdue: 0, daily_summary: 0, duplicates: 0, failed: 0, institutions: 0 };

  const { data: tasks, error } = await supabaseAdmin.from(TASKS).select('*').is('deleted_at', null).limit(5000);
  if (error) throw error;
  const live = tasks || [];

  for (const c of dueNotificationCandidates(live, now)) {
    const msg = dueMessage(c.kind, c.task);
    const r = await notifyOnce({
      eventKey: c.eventKey,
      recipientId: c.task.teacher_id,
      taskId: c.task.id,
      kind: c.kind,
      title: msg.title,
      body: msg.body,
      link: taskLink(c.task.id),
      institutionId: c.task.institution_id,
      priority: 'high'
    });
    if (r === 'sent') result[c.kind] += 1;
    else if (r === 'duplicate') result.duplicates += 1;
    else result.failed += 1;
  }

  // Günlük özet: görevi olan kurumlar
  const byInst = new Map();
  for (const t of live) {
    const k = settingsKey(t.institution_id);
    if (!byInst.has(k)) byInst.set(k, []);
    byInst.get(k).push(t);
  }
  for (const [inst, instTasks] of byInst) {
    const settings = await loadSettings(inst);
    const due = dailySummaryDue(settings, now);
    if (!due.due) continue;
    result.institutions += 1;
    const names = await teacherNames(instTasks.map((t) => t.teacher_id));
    const sum = buildDailySummary(instTasks, { dayKey: due.dayKey, now, teachers: names });
    const recipients = await summaryRecipients(inst || null, settings);
    for (const rid of recipients) {
      const r = await notifyOnce({
        eventKey: `daily:${inst || '-'}:${due.dayKey}`,
        recipientId: rid,
        kind: 'daily_summary',
        title: `Reklam videoları günlük özet · ${due.dayKey.split('-').reverse().join('.')}`,
        body: dailySummaryText(sum),
        link: `/reklam-videolari?sekme=gunluk&tarih=${due.dayKey}`,
        institutionId: inst || null
      });
      if (r === 'sent') result.daily_summary += 1;
      else if (r === 'duplicate') result.duplicates += 1;
      else result.failed += 1;
    }
  }
  return { ok: true, ...result };
}
