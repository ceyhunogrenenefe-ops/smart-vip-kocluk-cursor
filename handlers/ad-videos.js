/**
 * Reklam Videoları — tek uç: /api/ad-videos?op=…
 *
 * Yetki (sunucuda zorlanır):
 *  - Yönetici (admin / super_admin): kurumundaki tüm görevleri oluşturur, düzenler, siler, inceler; ayarlar.
 *  - Kurgu ekibi (ayarlardaki editor_user_ids): kurumdaki görevleri ve videoları görür, onaylar / düzeltme ister.
 *  - Öğretmen: yalnız kendisine atanmış görevler; çekim kaydı ve teslim.
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { actorRoleSet } from '../api/_lib/actor-roles.js';
import {
  STATUSES,
  buildDailySummary,
  canBrowseReviews,
  canCommentOn,
  canMarkShot,
  canOpenStoredFile,
  canReview,
  canSeeTask,
  canSubmit,
  computeTeacherStats,
  decorateTask,
  isDateKey,
  moduleAccess,
  normalizeVideoFile,
  previewPlan,
  publicSubmission,
  signMediaTicket,
  statusAfterShot,
  submissionKind,
  taskPatchForSubmission,
  teacherSafeTask,
  trDateKey,
  trDayStartMs,
  addDaysKey,
  validateSettings,
  validateShootDate,
  validateTaskFields,
  verifyMediaTicket
} from '../api/_lib/ad-videos-core.js';
import {
  UPLOAD_CHUNK_BYTES,
  buildDriveFileName,
  checkDriveAccess,
  createResumableSession,
  driveCredentialsConfigured,
  driveViewUrl,
  effectiveUploadEnabled,
  getDriveFile,
  openDriveMedia,
  querySessionStatus,
  verifyUploadedFile
} from '../api/_lib/ad-videos-drive.js';
import { loadSettings, notifyAssigned, notifyRawDelivered, notifyReviewOpened, notifyRevision, settingsKey } from '../api/_lib/ad-videos-notify.js';

const TASKS = 'ad_video_tasks';
const SUBS = 'ad_video_submissions';
const EVENTS = 'ad_video_events';
const UPLOADS = 'ad_video_upload_sessions';
const SETTINGS = 'ad_video_settings';
const COMMENTS = 'ad_video_comments';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new HttpError(400, m);
const forbidden = (m = 'Bu işlem için yetkiniz yok') => new HttpError(403, m);
const notFound = (m = 'Görev bulunamadı') => new HttpError(404, m);

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

function roleTags(u) {
  return new Set([u?.role, ...(Array.isArray(u?.roles) ? u.roles : [])].map((r) => String(r || '').toLowerCase()));
}

async function usersByIds(ids) {
  const list = [...new Set(ids.map(String))].filter(Boolean);
  if (!list.length) return new Map();
  const { data, error } = await supabaseAdmin.from('users').select('id, name, email, role, roles, institution_id').in('id', list);
  if (error) throw error;
  return new Map((data || []).map((u) => [String(u.id), u]));
}

async function logEvent(taskId, actorId, kind, note = null, meta = null) {
  const { error } = await supabaseAdmin.from(EVENTS).insert({ task_id: taskId, actor_id: actorId, kind, note, meta });
  if (error) console.warn('[ad-videos] event:', error.message);
}

async function loadTask(id) {
  if (!id) throw bad('Görev kimliği gerekli');
  const { data, error } = await supabaseAdmin.from(TASKS).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data || data.deleted_at) throw notFound();
  return data;
}

/** Görev + bu görev için kullanıcının yetkileri */
async function taskForActor(ctx, id) {
  const task = await loadTask(id);
  const settings = await loadSettings(task.institution_id);
  const access = moduleAccess(ctx.actor, ctx.roles, settings);
  if (!canSeeTask(task, ctx.actor, access)) throw notFound();
  const isOwner = String(task.teacher_id) === String(ctx.actor.sub);
  return { task, settings, access, isOwner };
}

function shapeTask(task, { forTeacher, teacherName }) {
  const t = decorateTask(task);
  const out = forTeacher ? teacherSafeTask(t) : t;
  return { ...out, teacher_name: teacherName || 'Öğretmen' };
}

/** Doğrulanmış kurum arşivi kaydı. Ham ve montaj ayrı sürüm dizileri tutar. */
async function recordSubmission(ctx, task, { source, kind = 'raw', driveFileId, driveUrl, fileName, mimeType, sizeBytes, actualShootDate }) {
  const fileKind = kind === 'edit' ? 'edit' : 'raw';
  if (fileKind === 'raw') {
    const shootDate = actualShootDate || task.actual_shoot_date;
    if (!shootDate) throw bad('Gerçekleşen çekim tarihi gerekli');
    const shootErr = validateShootDate(shootDate);
    if (shootErr) throw bad(shootErr);
  }

  const { data: prev, error: pErr } = await supabaseAdmin
    .from(SUBS)
    .select('id, version, review_status, kind')
    .eq('task_id', task.id)
    .eq('kind', fileKind)
    .order('version', { ascending: false })
    .limit(1);
  if (pErr) throw pErr;
  const version = (prev?.[0]?.version || 0) + 1;
  const at = new Date();
  const preview = previewPlan(mimeType, fileName);

  const { data: sub, error } = await supabaseAdmin
    .from(SUBS)
    .insert({
      task_id: task.id,
      teacher_id: task.teacher_id,
      version,
      kind: fileKind,
      source,
      drive_file_id: driveFileId || null,
      drive_url: driveUrl,
      file_name: fileName || null,
      mime_type: mimeType || null,
      size_bytes: sizeBytes || null,
      is_revision: fileKind === 'raw' ? Boolean(task.first_submitted_at) : version > 1,
      uploaded_by: ctx.actor.sub,
      uploaded_at: at.toISOString(),
      review_status: fileKind === 'edit' ? 'pending' : 'pending',
      open_for_comments: false,
      preview_status: preview.status,
      preview_note: preview.note
    })
    .select('*')
    .single();
  if (error) {
    if (/column|schema cache|open_for_comments|preview_status/i.test(String(error.message || ''))) {
      throw bad('Veritabanı güncellemesi eksik. sql/2026-11-28-ad-videos-panel-izleme.sql Supabase SQL Editor’de çalıştırılmalı.');
    }
    throw error;
  }

  // Aynı türdeki incelenmemiş eski sürüm yenisinin yerini alır. Ham video montajla silinmez.
  await supabaseAdmin
    .from(SUBS)
    .update({ review_status: 'superseded' })
    .eq('task_id', task.id)
    .eq('kind', fileKind)
    .eq('review_status', 'pending')
    .lt('version', version);

  const iso = at.toISOString();
  const patch =
    fileKind === 'edit'
      ? { has_edit: true, current_submission_id: sub.id, last_edit_at: iso, updated_at: iso }
      : taskPatchForSubmission(task, { submissionId: sub.id, at, actualShootDate: actualShootDate || task.actual_shoot_date });
  const { data: updated, error: uErr } = await supabaseAdmin.from(TASKS).update(patch).eq('id', task.id).select('*').single();
  if (uErr) throw uErr;
  const eventKind = fileKind === 'edit' ? 'edit_uploaded' : sub.is_revision ? 'resubmitted' : 'submitted';
  await logEvent(task.id, ctx.actor.sub, eventKind, null, { version, source, kind: fileKind });
  return { task: updated, submission: sub };
}

// ------------------------------------------------------------------ handler

async function loadActorContext(userId) {
  const { data: user, error } = await supabaseAdmin.from('users').select('id, role, roles, institution_id, is_active, name').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!user || user.is_active === false) return null;
  const actor = { sub: String(user.id), role: user.role, roles: user.roles, institution_id: user.institution_id, name: user.name };
  const roles = await actorRoleSet(actor);
  return { actor, roles, user };
}

async function streamMedia(req, res) {
  try {
    const ticket = verifyMediaTicket(String(req.query?.ticket || ''));
    if (!ticket) return res.status(401).json({ error: 'Oturum bileti geçersiz veya süresi dolmuş' });
    const { data: sub, error } = await supabaseAdmin.from(SUBS).select('*').eq('id', ticket.submissionId).maybeSingle();
    if (error) throw error;
    if (!sub?.drive_file_id || sub.source === 'drive_link') return res.status(404).json({ error: 'Bu dosya panelde oynatılamaz' });
    const task = await loadTask(sub.task_id);
    const ctx = await loadActorContext(ticket.actorId);
    if (!ctx) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
    const settings = await loadSettings(task.institution_id);
    const access = moduleAccess(ctx.actor, ctx.roles, settings);
    if (!canOpenStoredFile(ctx.actor, ctx.roles, task, sub, access)) return res.status(403).json({ error: 'Bu videoyu açma yetkiniz yok' });
    const driveRes = await openDriveMedia(sub.drive_file_id, req.headers?.range || req.headers?.Range);
    if (!driveRes.ok && driveRes.status !== 206) {
      const t = await driveRes.text().catch(() => '');
      return res.status(502).json({ error: `Video okunamadı (${driveRes.status}) ${t.slice(0, 180)}` });
    }
    const buf = Buffer.from(await driveRes.arrayBuffer());
    const status = driveRes.status === 200 ? 206 : driveRes.status;
    res.status(status);
    res.setHeader('Content-Type', sub.mime_type || driveRes.headers.get('content-type') || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', String(buf.length));
    const cr = driveRes.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);
    if (String(req.query?.dl || '') === '1') {
      const name = String(sub.file_name || 'video.mp4').replace(/[^\w.\- ()]+/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    }
    return res.end(buf);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ ok: false, error: e.message });
    console.error('[ad-videos] media', errorMessage(e));
    return res.status(500).json({ error: 'Video açılamadı' });
  }
}

export default async function handler(req, res) {
  const opEarly = String(req.query?.op || '').trim();
  if (req.method === 'GET' && opEarly === 'media') return streamMedia(req, res);

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  const roles = await actorRoleSet(actor);
  const ctx = { actor, roles };
  const op = String(req.query?.op || '').trim();
  const body = parseBody(req);
  const isGet = req.method === 'GET';
  const isPost = req.method === 'POST';

  try {
    // Kullanıcının kendi kurumundaki modül yetkisi
    const ownSettings = await loadSettings(actor.institution_id);
    const ownAccess = moduleAccess(actor, roles, ownSettings);
    const requireManager = () => {
      if (!ownAccess.manager) throw forbidden();
    };
    const requireReviewer = () => {
      if (!ownAccess.reviewer) throw forbidden();
    };

    /** Kurum filtresi: süper yönetici kurumsuzsa tümü */
    const scopeInstitution = (q) => {
      if (roles.has('super_admin') && !actor.institution_id) return q;
      return actor.institution_id ? q.eq('institution_id', actor.institution_id) : q.is('institution_id', null);
    };

    if (isGet && op === 'me') {
      const { count } = await supabaseAdmin
        .from(TASKS)
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', actor.sub)
        .is('deleted_at', null);
      return res.status(200).json({
        ok: true,
        access: { manager: ownAccess.manager, editor: ownAccess.editor, reviewer: ownAccess.reviewer, has_tasks: Boolean(count) },
        upload: {
          enabled: effectiveUploadEnabled(ownSettings),
          credentials: driveCredentialsConfigured(),
          folder: Boolean(ownSettings.drive_folder_id),
          shared_drive: Boolean(ownSettings.drive_shared_drive_id),
          enabled_flag: Boolean(ownSettings.drive_upload_enabled),
          chunk_bytes: UPLOAD_CHUNK_BYTES
        },
        today: trDateKey(new Date())
      });
    }

    // -------------------------------------------------------------- liste
    if (isGet && op === 'list') {
      const mine = String(req.query?.mine || '') === '1' || !ownAccess.reviewer;
      let q = supabaseAdmin.from(TASKS).select('*').is('deleted_at', null).limit(2000);
      if (mine) q = q.eq('teacher_id', actor.sub);
      else {
        q = scopeInstitution(q);
        const tid = String(req.query?.teacher_id || '').trim();
        if (tid) q = q.eq('teacher_id', tid);
      }
      const status = String(req.query?.status || '').trim();
      if (status && status !== 'overdue') {
        if (!STATUSES.includes(status)) throw bad('Geçersiz durum');
        q = q.eq('status', status);
      }
      const field = ['due_at', 'planned_shoot_at', 'actual_shoot_date', 'first_submitted_at', 'approved_at'].includes(
        String(req.query?.date_field)
      )
        ? String(req.query.date_field)
        : 'due_at';
      const from = String(req.query?.from || '');
      const to = String(req.query?.to || '');
      if (isDateKey(from)) q = q.gte(field, field === 'actual_shoot_date' ? from : new Date(trDayStartMs(from)).toISOString());
      if (isDateKey(to)) {
        q =
          field === 'actual_shoot_date'
            ? q.lte(field, to)
            : q.lt(field, new Date(trDayStartMs(addDaysKey(to, 1))).toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      let rows = data || [];
      if (status === 'overdue') rows = rows.filter((t) => decorateTask(t).is_overdue);
      const names = await usersByIds(rows.map((t) => t.teacher_id));
      rows.sort((a, b) => String(a.due_at || '').localeCompare(String(b.due_at || '')));
      return res.status(200).json({
        ok: true,
        tasks: rows.map((t) =>
          shapeTask(t, {
            forTeacher: String(t.teacher_id) === String(actor.sub) && !ownAccess.reviewer,
            teacherName: names.get(String(t.teacher_id))?.name
          })
        )
      });
    }

    // -------------------------------------------------------------- tek görev
    if (isGet && op === 'get') {
      const { task, access, isOwner } = await taskForActor(ctx, String(req.query?.id || ''));
      const [{ data: subs }, { data: events }, { data: comments }, names] = await Promise.all([
        supabaseAdmin.from(SUBS).select('*').eq('task_id', task.id).order('version', { ascending: false }),
        supabaseAdmin.from(EVENTS).select('*').eq('task_id', task.id).order('created_at', { ascending: false }).limit(200),
        supabaseAdmin.from(COMMENTS).select('*').eq('task_id', task.id).order('created_at', { ascending: true }),
        usersByIds([task.teacher_id])
      ]);
      const visible = (subs || []).filter((s) => s.source === 'drive_link' || canOpenStoredFile(actor, roles, task, s, access) || access.reviewer || isOwner);
      const actorNames = await usersByIds(
        (events || []).map((e) => e.actor_id).concat((visible || []).map((s) => s.reviewed_by)).concat((comments || []).map((c) => c.author_id))
      );
      const forTeacher = isOwner && !access.reviewer;
      const hasRawArchive = (subs || []).some((s) => submissionKind(s) === 'raw' && s.source === 'drive_upload' && s.drive_file_id);
      return res.status(200).json({
        ok: true,
        task: shapeTask(task, { forTeacher, teacherName: names.get(String(task.teacher_id))?.name }),
        submissions: visible.map((s) => {
          const playable = canOpenStoredFile(actor, roles, task, s, access);
          const ownComments = playable || s.source === 'drive_link'
            ? (comments || []).filter((c) => c.submission_id === s.id).map((c) => ({
                id: c.id,
                body: c.body,
                author_name: c.author_name || actorNames.get(String(c.author_id))?.name || 'Kullanıcı',
                created_at: c.created_at
              }))
            : [];
          return {
            ...publicSubmission(s, { playable, comments: ownComments }),
            reviewed_by_name: s.reviewed_by ? actorNames.get(String(s.reviewed_by))?.name || null : null
          };
        }),
        events: (events || []).map((e) => ({ ...e, actor_name: actorNames.get(String(e.actor_id))?.name || null })),
        can: {
          manage: access.manager,
          review: access.reviewer && canReview(task),
          mark_shot: isOwner && canMarkShot(task),
          submit: isOwner && canSubmit(task),
          upload_edit: access.reviewer && hasRawArchive,
          open_review: access.reviewer
        }
      });
    }

    // -------------------------------------------------------------- öğretmen listesi (atama için)
    if (isGet && op === 'teachers') {
      requireManager();
      let q = supabaseAdmin.from('users').select('id, name, email, role, roles, institution_id, is_active').limit(5000);
      q = scopeInstitution(q);
      const { data, error } = await q;
      if (error) throw error;
      const teachers = (data || [])
        .filter((u) => u.is_active !== false)
        .filter((u) => {
          const t = roleTags(u);
          return t.has('teacher') || t.has('coach');
        })
        .map((u) => {
          const t = roleTags(u);
          return { id: String(u.id), name: u.name || u.email || 'Öğretmen', email: u.email || null, is_coach: t.has('coach'), is_teacher: t.has('teacher') };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      return res.status(200).json({ ok: true, teachers });
    }

    // -------------------------------------------------------------- kurgu ekibi adayları (öğrenci hariç personel)
    if (isGet && op === 'staff') {
      requireManager();
      let q = supabaseAdmin.from('users').select('id, name, email, role, roles, institution_id, is_active').limit(5000);
      q = scopeInstitution(q);
      const { data, error } = await q;
      if (error) throw error;
      const staff = (data || [])
        .filter((u) => u.is_active !== false)
        .filter((u) => {
          const t = roleTags(u);
          return !t.has('student');
        })
        .map((u) => ({ id: String(u.id), name: u.name || u.email || 'Kullanıcı', email: u.email || null, role: u.role }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      return res.status(200).json({ ok: true, staff });
    }

    // -------------------------------------------------------------- görev oluştur
    if (isPost && op === 'create') {
      requireManager();
      const ids = [...new Set((Array.isArray(body.teacher_ids) ? body.teacher_ids : []).map((x) => String(x || '').trim()).filter(Boolean))];
      if (!ids.length) throw bad('En az bir öğretmen seçin');
      if (ids.length > 100) throw bad('Tek seferde en fazla 100 öğretmen seçilebilir');
      const v = validateTaskFields(body);
      if (!v.ok) throw bad(v.errors.join(' · '));
      const users = await usersByIds(ids);
      for (const id of ids) {
        const u = users.get(id);
        if (!u) throw bad('Seçilen öğretmen sistemde bulunamadı');
        const t = roleTags(u);
        if (!t.has('teacher') && !t.has('coach')) throw bad(`${u.name || id} öğretmen değil`);
        if (!(roles.has('super_admin') && !actor.institution_id) && settingsKey(u.institution_id) !== settingsKey(actor.institution_id)) {
          throw forbidden('Başka kurumun öğretmenine görev atanamaz');
        }
      }
      const batchId = ids.length > 1 ? crypto.randomUUID() : null;
      const nowIso = new Date().toISOString();
      const rows = ids.map((id) => ({
        ...v.value,
        teacher_id: id,
        institution_id: users.get(id).institution_id || actor.institution_id || null,
        batch_id: batchId,
        status: 'planned',
        created_by: actor.sub,
        created_at: nowIso,
        updated_at: nowIso
      }));
      const { data, error } = await supabaseAdmin.from(TASKS).insert(rows).select('*');
      if (error) throw error;
      for (const t of data || []) {
        await logEvent(t.id, actor.sub, 'created');
        await notifyAssigned(t).catch((e) => console.warn('[ad-videos] assigned notify:', errorMessage(e)));
      }
      return res.status(200).json({ ok: true, tasks: (data || []).map((t) => decorateTask(t)) });
    }

    // -------------------------------------------------------------- görev düzenle / sil
    if (isPost && op === 'update') {
      const { task, access } = await taskForActor(ctx, String(body.id || ''));
      if (!access.manager) throw forbidden();
      const v = validateTaskFields(body, { partial: true });
      if (!v.ok) throw bad(v.errors.join(' · '));
      const merged = { ...task, ...v.value };
      if (!merged.due_at) throw bad('Son teslim günü ve saati gerekli');
      if (merged.planned_shoot_at && new Date(merged.planned_shoot_at) > new Date(merged.due_at)) {
        throw bad('Planlanan çekim, son teslimden sonra olamaz');
      }
      const { data, error } = await supabaseAdmin
        .from(TASKS)
        .update({ ...v.value, updated_at: new Date().toISOString() })
        .eq('id', task.id)
        .select('*')
        .single();
      if (error) throw error;
      await logEvent(task.id, actor.sub, 'updated', null, { fields: Object.keys(v.value) });
      return res.status(200).json({ ok: true, task: decorateTask(data) });
    }

    if (isPost && op === 'delete') {
      const { task, access } = await taskForActor(ctx, String(body.id || ''));
      if (!access.manager) throw forbidden();
      const { error } = await supabaseAdmin.from(TASKS).update({ deleted_at: new Date().toISOString() }).eq('id', task.id);
      if (error) throw error;
      await logEvent(task.id, actor.sub, 'deleted');
      return res.status(200).json({ ok: true });
    }

    // -------------------------------------------------------------- "Çektim"
    if (isPost && op === 'mark_shot') {
      const { task, isOwner } = await taskForActor(ctx, String(body.id || ''));
      if (!isOwner) throw forbidden('Çekim kaydını yalnız görevin öğretmeni girer');
      if (!canMarkShot(task)) throw bad('Onaylanmış görevde çekim tarihi değiştirilemez');
      const date = String(body.date || trDateKey(new Date()));
      const err = validateShootDate(date);
      if (err) throw bad(err);
      const nowIso = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from(TASKS)
        .update({ actual_shoot_date: date, actual_shoot_recorded_at: nowIso, status: statusAfterShot(task), updated_at: nowIso })
        .eq('id', task.id)
        .select('*')
        .single();
      if (error) throw error;
      await logEvent(task.id, actor.sub, 'shot', null, { date });
      return res.status(200).json({ ok: true, task: teacherSafeTask(decorateTask(data)) });
    }

    // Yeni teslim kişisel Drive bağlantısı kabul etmez. Eski kayıtlar geçmişte kalır.
    if (isPost && op === 'submit_link') {
      throw new HttpError(
        409,
        'Yeni teslimler kişisel Drive bağlantısıyla kaydedilmez. Dosyayı panelden yükleyin. Kurum Drive’ı hazır değilse yönetici kurulumu tamamlamalı.'
      );
    }

    // -------------------------------------------------------------- teslim: doğrudan Drive yükleme
    if (isPost && op === 'upload_start') {
      const kind = body.kind === 'edit' ? 'edit' : 'raw';
      const { task, settings, access, isOwner } = await taskForActor(ctx, String(body.id || ''));
      if (kind === 'raw') {
        if (!isOwner) throw forbidden('Ham videoyu yalnız görevin öğretmeni yükler');
        if (!canSubmit(task)) throw bad('Bu görev için teslim yapılamaz');
      } else if (!access.reviewer) {
        throw forbidden('Montajı yalnız yönetici ve kurgu ekibi yükler');
      }
      if (!effectiveUploadEnabled(settings)) {
        throw new HttpError(409, 'Kurumsal Drive yüklemesi henüz hazır değil. Yönetici Paylaşılan Drive, klasör ve hizmet hesabını tanımlamalı. Kişisel bağlantı kabul edilmez.');
      }
      const file = normalizeVideoFile({ name: body.file_name, mime: body.mime_type, size: body.size });
      if (!file.ok) throw bad(file.error);
      const shootDate = body.actual_shoot_date ? String(body.actual_shoot_date) : task.actual_shoot_date;
      if (kind === 'raw') {
        if (!shootDate) throw bad('Gerçekleşen çekim tarihi gerekli');
        const sErr = validateShootDate(shootDate);
        if (sErr) throw bad(sErr);
      } else {
        const { data: raws, error: rawErr } = await supabaseAdmin
          .from(SUBS)
          .select('id')
          .eq('task_id', task.id)
          .eq('kind', 'raw')
          .eq('source', 'drive_upload')
          .limit(1);
        if (rawErr) throw rawErr;
        if (!raws?.length) throw bad('Montajdan önce ham video kurum arşivine kaydedilmeli');
      }

      // Aynı dosya için açık oturum varsa onu döndür (kesintiden sonra devam)
      const { data: open } = await supabaseAdmin
        .from(UPLOADS)
        .select('*')
        .eq('task_id', task.id)
        .eq('teacher_id', actor.sub)
        .is('completed_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(5);
      const same = (open || []).find((s) => s.file_name === file.fileName && Number(s.size_bytes) === file.size && (s.kind || 'raw') === kind);
      if (same) {
        return res.status(200).json({ ok: true, session_id: same.id, session_uri: same.session_uri, chunk_bytes: UPLOAD_CHUNK_BYTES, resumed: true });
      }

      const { data: last } = await supabaseAdmin.from(SUBS).select('version').eq('task_id', task.id).eq('kind', kind).order('version', { ascending: false }).limit(1);
      const names = await usersByIds([task.teacher_id]);
      const name = buildDriveFileName({
        teacherName: names.get(String(task.teacher_id))?.name || 'Ogretmen',
        title: task.title,
        version: (last?.[0]?.version || 0) + 1,
        dateKey: shootDate || trDateKey(new Date()),
        originalName: file.fileName
      });
      const origin = String(req.headers?.origin || '').trim() || null;
      const sessionUri = await createResumableSession({
        folderId: settings.drive_folder_id,
        name,
        mimeType: file.mimeType,
        size: file.size,
        origin,
        description: `Reklam videosu görevi ${task.id}`
      });
      const { data: sess, error } = await supabaseAdmin
        .from(UPLOADS)
        .insert({
          task_id: task.id,
          teacher_id: actor.sub,
          kind,
          session_uri: sessionUri,
          file_name: file.fileName,
          mime_type: file.mimeType,
          size_bytes: file.size,
          // Google resumable oturumları ~1 hafta geçerlidir
          expires_at: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString()
        })
        .select('*')
        .single();
      if (error) throw error;
      if (body.actual_shoot_date && body.actual_shoot_date !== task.actual_shoot_date) {
        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from(TASKS)
          .update({ actual_shoot_date: shootDate, actual_shoot_recorded_at: nowIso, status: statusAfterShot(task), updated_at: nowIso })
          .eq('id', task.id);
        await logEvent(task.id, actor.sub, 'shot', null, { date: shootDate });
      }
      return res.status(200).json({ ok: true, session_id: sess.id, session_uri: sessionUri, chunk_bytes: UPLOAD_CHUNK_BYTES, resumed: false });
    }

    if (isGet && op === 'upload_pending') {
      const kind = req.query?.kind === 'edit' ? 'edit' : 'raw';
      const { task, access, isOwner } = await taskForActor(ctx, String(req.query?.id || ''));
      if (kind === 'raw' && !isOwner) throw forbidden();
      if (kind === 'edit' && !access.reviewer) throw forbidden();
      const { data } = await supabaseAdmin
        .from(UPLOADS)
        .select('id, file_name, size_bytes, mime_type, session_uri, created_at, kind')
        .eq('task_id', task.id)
        .eq('teacher_id', actor.sub)
        .eq('kind', kind)
        .is('completed_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);
      return res.status(200).json({ ok: true, session: data?.[0] || null });
    }

    if (isPost && op === 'upload_finalize') {
      const sid = String(body.session_id || '').trim();
      if (!sid) throw bad('Yükleme oturumu gerekli');
      const { data: sess, error: sErr } = await supabaseAdmin.from(UPLOADS).select('*').eq('id', sid).maybeSingle();
      if (sErr) throw sErr;
      if (!sess || String(sess.teacher_id) !== String(actor.sub)) throw notFound('Yükleme oturumu bulunamadı');
      const { task, settings } = await taskForActor(ctx, sess.task_id);
      if (sess.completed_at && sess.submission_id) {
        return res.status(200).json({ ok: true, already: true, task: teacherSafeTask(decorateTask(task)) });
      }
      if (!canSubmit(task)) throw bad('Bu görev için teslim yapılamaz');
      // Dosyanın Google'da tamamlandığını sunucu kendisi doğrular; istemcinin sözüne güvenilmez
      const st = await querySessionStatus(sess.session_uri, sess.size_bytes);
      if (st.state === 'expired') throw new HttpError(410, 'Yükleme oturumunun süresi doldu; videoyu yeniden seçin');
      if (st.state !== 'complete' || !st.file?.id) {
        return res.status(409).json({ ok: false, error: 'Yükleme henüz tamamlanmadı', received: st.received || 0 });
      }
      const file = (await getDriveFile(st.file.id)) || st.file;
      const vErr = verifyUploadedFile(file, {
        folderId: settings.drive_folder_id,
        size: sess.size_bytes,
        sharedDriveId: settings.drive_shared_drive_id
      });
      if (vErr) throw bad(vErr);
      const kind = sess.kind === 'edit' ? 'edit' : 'raw';
      const r = await recordSubmission(ctx, task, {
        source: 'drive_upload',
        kind,
        driveFileId: file.id,
        driveUrl: file.webViewLink || driveViewUrl(file.id),
        fileName: sess.file_name,
        mimeType: sess.mime_type,
        sizeBytes: sess.size_bytes
      });
      await supabaseAdmin
        .from(UPLOADS)
        .update({ completed_at: new Date().toISOString(), drive_file_id: file.id, submission_id: r.submission.id })
        .eq('id', sess.id);
      if (kind === 'raw') {
        await notifyRawDelivered(r.task).catch((e) => console.warn('[ad-videos] raw notify:', errorMessage(e)));
      }
      const playable = canOpenStoredFile(actor, roles, r.task, r.submission, moduleAccess(actor, roles, settings));
      return res.status(200).json({
        ok: true,
        task: teacherSafeTask(decorateTask(r.task)),
        submission: publicSubmission(r.submission, { playable })
      });
    }

    // -------------------------------------------------------------- inceleme
    if (isPost && op === 'review') {
      const { task, access } = await taskForActor(ctx, String(body.id || ''));
      if (!access.reviewer) throw forbidden();
      if (!canReview(task)) throw bad('Yalnız teslim edilmiş ve inceleme bekleyen video değerlendirilebilir');
      const action = String(body.action || '');
      const note = String(body.note || '').trim().slice(0, 4000);
      if (!['approve', 'revision'].includes(action)) throw bad('Geçersiz işlem');
      if (action === 'revision' && !note) throw bad('Düzeltme için açıklama yazın');
      const wanted = String(body.submission_id || task.current_submission_id || '');
      const { data: sub } = await supabaseAdmin.from(SUBS).select('*').eq('id', wanted).eq('task_id', task.id).maybeSingle();
      if (!sub) throw bad('İncelenecek teslim bulunamadı');
      if (sub.source === 'drive_link') throw bad('Eski kişisel bağlantı onaylanamaz; öğretmen orijinali yeniden yüklemeli');
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from(SUBS)
        .update({
          review_status: action === 'approve' ? 'approved' : 'revision_requested',
          reviewed_by: actor.sub,
          reviewed_at: nowIso,
          review_note: note || null
        })
        .eq('id', sub.id);
      const patch =
        action === 'approve'
          ? {
              status: 'approved',
              approved_at: nowIso,
              approved_by: actor.sub,
              approved_version: sub.version,
              approved_kind: submissionKind(sub),
              current_submission_id: sub.id,
              updated_at: nowIso
            }
          : { status: 'revision_requested', review_note: note, review_note_at: nowIso, review_note_by: actor.sub, updated_at: nowIso };
      if (action === 'approve' && note) Object.assign(patch, { review_note: note, review_note_at: nowIso, review_note_by: actor.sub });
      const { data, error } = await supabaseAdmin.from(TASKS).update(patch).eq('id', task.id).select('*').single();
      if (error) throw error;
      await logEvent(task.id, actor.sub, action === 'approve' ? 'approved' : 'revision_requested', note || null, {
        version: sub.version,
        kind: submissionKind(sub),
        submission_id: sub.id
      });
      if (action === 'revision') await notifyRevision(data, sub, note).catch((e) => console.warn('[ad-videos] revision notify:', errorMessage(e)));
      return res.status(200).json({ ok: true, task: decorateTask(data) });
    }

    // -------------------------------------------------------------- raporlar
    if (isGet && (op === 'stats' || op === 'daily_summary')) {
      requireReviewer();
      let q = supabaseAdmin.from(TASKS).select('*').is('deleted_at', null).limit(5000);
      q = scopeInstitution(q);
      const tid = String(req.query?.teacher_id || '').trim();
      if (tid) q = q.eq('teacher_id', tid);
      const { data, error } = await q;
      if (error) throw error;
      const tasks = data || [];
      const teachers = await usersByIds(tasks.map((t) => t.teacher_id));
      const nameMap = new Map([...teachers].map(([k, u]) => [k, { name: u.name || 'Öğretmen' }]));
      if (op === 'daily_summary') {
        const day = isDateKey(String(req.query?.date || '')) ? String(req.query.date) : trDateKey(new Date());
        return res.status(200).json({ ok: true, summary: buildDailySummary(tasks, { dayKey: day, teachers: nameMap }) });
      }
      const week = isDateKey(String(req.query?.week || '')) ? String(req.query.week) : trDateKey(new Date());
      return res.status(200).json({ ok: true, ...computeTeacherStats(tasks, { weekKey: week, teachers: nameMap }) });
    }

    // -------------------------------------------------------------- ayarlar
    if (isGet && op === 'settings') {
      requireManager();
      const editors = await usersByIds(ownSettings.editor_user_ids || []);
      return res.status(200).json({
        ok: true,
        settings: ownSettings,
        editors: [...editors.values()].map((u) => ({ id: String(u.id), name: u.name || u.email })),
        drive: {
          credentials_configured: driveCredentialsConfigured(),
          upload_effective: effectiveUploadEnabled(ownSettings)
        }
      });
    }

    if (isPost && op === 'settings') {
      requireManager();
      const v = validateSettings(body);
      if (!v.ok) throw bad(v.errors.join(' · '));
      if (v.value.editor_user_ids?.length) {
        const found = await usersByIds(v.value.editor_user_ids);
        if (found.size !== v.value.editor_user_ids.length) throw bad('Kurgu ekibinde sistemde olmayan kullanıcı var');
      }
      const row = { institution_id: settingsKey(actor.institution_id), ...v.value, updated_by: actor.sub, updated_at: new Date().toISOString() };
      const { data, error } = await supabaseAdmin.from(SETTINGS).upsert(row, { onConflict: 'institution_id' }).select('*').single();
      if (error) throw error;
      return res.status(200).json({ ok: true, settings: data });
    }

    if (isPost && op === 'drive_check') {
      requireManager();
      const r = await checkDriveAccess({ folderId: ownSettings.drive_folder_id, sharedDriveId: ownSettings.drive_shared_drive_id });
      return res.status(200).json({ ok: !r.error, ...r });
    }

    // -------------------------------------------------------------- panel bileti (oynatma / indirme)
    if (isPost && op === 'ticket') {
      const sid = String(body.submission_id || '').trim();
      if (!sid) throw bad('Dosya gerekli');
      const { data: sub, error } = await supabaseAdmin.from(SUBS).select('*').eq('id', sid).maybeSingle();
      if (error) throw error;
      if (!sub) throw notFound('Dosya bulunamadı');
      const task = await loadTask(sub.task_id);
      const settings = await loadSettings(task.institution_id);
      const access = moduleAccess(actor, roles, settings);
      if (String(task.institution_id || '') !== String(actor.institution_id || '') && !(roles.has('super_admin') && !actor.institution_id)) {
        throw notFound();
      }
      if (!canOpenStoredFile(actor, roles, task, sub, access)) throw forbidden('Bu videoyu açma yetkiniz yok');
      if (!effectiveUploadEnabled(settings) && !sub.drive_file_id) throw bad('Dosya arşivde değil');
      const signed = signMediaTicket({ submissionId: sub.id, actorId: actor.sub });
      return res.status(200).json({
        ok: true,
        ticket: signed.ticket,
        url: `/api/ad-videos?op=media&ticket=${encodeURIComponent(signed.ticket)}`,
        exp: signed.exp
      });
    }

    // -------------------------------------------------------------- yorumlara açık montajlar
    if (isGet && op === 'reviews') {
      if (!canBrowseReviews(roles, ownAccess)) throw forbidden();
      const { data: subs, error } = await supabaseAdmin.from(SUBS).select('*').eq('kind', 'edit').eq('open_for_comments', true).limit(500);
      if (error) throw error;
      const ids = [...new Set((subs || []).map((s) => s.task_id))];
      if (!ids.length) return res.status(200).json({ ok: true, items: [] });
      let tq = supabaseAdmin.from(TASKS).select('*').in('id', ids).is('deleted_at', null);
      tq = scopeInstitution(tq);
      const { data: tasks, error: tErr } = await tq;
      if (tErr) throw tErr;
      const byId = new Map((tasks || []).map((t) => [t.id, t]));
      const names = await usersByIds((tasks || []).map((t) => t.teacher_id));
      const items = (subs || [])
        .filter((s) => byId.has(s.task_id))
        .map((s) => {
          const task = byId.get(s.task_id);
          return {
            submission_id: s.id,
            task_id: task.id,
            title: task.title,
            teacher_name: names.get(String(task.teacher_id))?.name || 'Öğretmen',
            version: s.version,
            opened_at: s.opened_at,
            preview_status: s.preview_status || null,
            preview_note: s.preview_note || null,
            review_status: s.review_status
          };
        })
        .sort((a, b) => String(b.opened_at || '').localeCompare(String(a.opened_at || '')));
      return res.status(200).json({ ok: true, items });
    }

    if (isGet && op === 'review_get') {
      if (!canBrowseReviews(roles, ownAccess)) throw forbidden();
      const sid = String(req.query?.id || '').trim();
      const { data: sub, error } = await supabaseAdmin.from(SUBS).select('*').eq('id', sid).maybeSingle();
      if (error) throw error;
      if (!sub || submissionKind(sub) !== 'edit' || !sub.open_for_comments) throw notFound('İncelemede montaj yok');
      const task = await loadTask(sub.task_id);
      const settings = await loadSettings(task.institution_id);
      const access = moduleAccess(actor, roles, settings);
      if (!canSeeTask(task, actor, { ...access, reviewer: access.reviewer || canBrowseReviews(roles, access) }) && !canOpenStoredFile(actor, roles, task, sub, access)) {
        throw notFound();
      }
      if (String(task.institution_id || '') !== String(actor.institution_id || '') && !(roles.has('super_admin') && !actor.institution_id)) {
        throw notFound();
      }
      const { data: comments } = await supabaseAdmin.from(COMMENTS).select('*').eq('submission_id', sub.id).order('created_at', { ascending: true });
      return res.status(200).json({
        ok: true,
        item: {
          ...publicSubmission(sub, {
            playable: canOpenStoredFile(actor, roles, task, sub, access),
            comments: (comments || []).map((c) => ({ id: c.id, body: c.body, author_name: c.author_name, created_at: c.created_at }))
          }),
          title: task.title,
          teacher_name: (await usersByIds([task.teacher_id])).get(String(task.teacher_id))?.name || 'Öğretmen'
        }
      });
    }

    if (isPost && op === 'open_review') {
      const sid = String(body.submission_id || '').trim();
      const { data: sub, error } = await supabaseAdmin.from(SUBS).select('*').eq('id', sid).maybeSingle();
      if (error) throw error;
      if (!sub) throw notFound('Montaj bulunamadı');
      const { task, access } = await taskForActor(ctx, sub.task_id);
      if (!access.reviewer) throw forbidden();
      if (submissionKind(sub) !== 'edit' || sub.source !== 'drive_upload') throw bad('Yorumlara yalnız kurum arşivindeki montaj açılır');
      const nowIso = new Date().toISOString();
      const { data: updated, error: uErr } = await supabaseAdmin
        .from(SUBS)
        .update({ open_for_comments: true, opened_at: nowIso, opened_by: actor.sub })
        .eq('id', sub.id)
        .select('*')
        .single();
      if (uErr) throw uErr;
      await supabaseAdmin.from(TASKS).update({ review_open: true, updated_at: nowIso }).eq('id', task.id);
      await logEvent(task.id, actor.sub, 'review_opened', null, { version: sub.version, submission_id: sub.id });
      await notifyReviewOpened(task, updated).catch((e) => console.warn('[ad-videos] review notify:', errorMessage(e)));
      return res.status(200).json({ ok: true, submission: publicSubmission(updated, { playable: true }) });
    }

    if (isPost && op === 'comment') {
      const sid = String(body.submission_id || '').trim();
      const text = String(body.body || '').trim().slice(0, 4000);
      if (!text) throw bad('Yorum yazın');
      const { data: sub, error } = await supabaseAdmin.from(SUBS).select('*').eq('id', sid).maybeSingle();
      if (error) throw error;
      if (!sub) throw notFound('Montaj bulunamadı');
      const task = await loadTask(sub.task_id);
      const settings = await loadSettings(task.institution_id);
      const access = moduleAccess(actor, roles, settings);
      if (!canCommentOn(actor, roles, task, sub, access)) throw forbidden('Bu sürüme yorum yazamazsınız');
      if (String(task.institution_id || '') !== String(actor.institution_id || '') && !(roles.has('super_admin') && !actor.institution_id)) {
        throw forbidden();
      }
      const names = await usersByIds([actor.sub]);
      const { data, error: cErr } = await supabaseAdmin
        .from(COMMENTS)
        .insert({
          submission_id: sub.id,
          task_id: task.id,
          author_id: actor.sub,
          author_name: names.get(String(actor.sub))?.name || 'Kullanıcı',
          body: text
        })
        .select('*')
        .single();
      if (cErr) throw cErr;
      return res.status(200).json({ ok: true, comment: { id: data.id, body: data.body, author_name: data.author_name, created_at: data.created_at } });
    }

    return res.status(404).json({ error: 'unknown_op' });
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ ok: false, error: e.message });
    const msg = errorMessage(e);
    console.error('[ad-videos]', op, msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
