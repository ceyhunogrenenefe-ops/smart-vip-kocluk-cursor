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
  canMarkShot,
  canReview,
  canSeeTask,
  canSubmit,
  computeTeacherStats,
  decorateTask,
  isDateKey,
  moduleAccess,
  normalizeVideoFile,
  statusAfterShot,
  taskPatchForSubmission,
  teacherSafeTask,
  trDateKey,
  trDayStartMs,
  addDaysKey,
  validateDriveLink,
  validateSettings,
  validateShootDate,
  validateTaskFields
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
  querySessionStatus,
  verifyUploadedFile
} from '../api/_lib/ad-videos-drive.js';
import { loadSettings, notifyAssigned, notifyRevision, settingsKey } from '../api/_lib/ad-videos-notify.js';

const TASKS = 'ad_video_tasks';
const SUBS = 'ad_video_submissions';
const EVENTS = 'ad_video_events';
const UPLOADS = 'ad_video_upload_sessions';
const SETTINGS = 'ad_video_settings';

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

/** Teslim (yükleme ya da bağlantı) kaydı — tek yer */
async function recordSubmission(ctx, task, { source, driveFileId, driveUrl, fileName, mimeType, sizeBytes, actualShootDate }) {
  const shootDate = actualShootDate || task.actual_shoot_date;
  if (!shootDate) throw bad('Gerçekleşen çekim tarihi gerekli');
  const shootErr = validateShootDate(shootDate);
  if (shootErr) throw bad(shootErr);

  const { data: prev, error: pErr } = await supabaseAdmin
    .from(SUBS)
    .select('id, version, review_status')
    .eq('task_id', task.id)
    .order('version', { ascending: false })
    .limit(1);
  if (pErr) throw pErr;
  const version = (prev?.[0]?.version || 0) + 1;
  const at = new Date();

  const { data: sub, error } = await supabaseAdmin
    .from(SUBS)
    .insert({
      task_id: task.id,
      teacher_id: task.teacher_id,
      version,
      source,
      drive_file_id: driveFileId || null,
      drive_url: driveUrl,
      file_name: fileName || null,
      mime_type: mimeType || null,
      size_bytes: sizeBytes || null,
      is_revision: Boolean(task.first_submitted_at),
      uploaded_by: ctx.actor.sub,
      uploaded_at: at.toISOString()
    })
    .select('*')
    .single();
  if (error) throw error;

  // İncelenmemiş eski sürüm varsa yenisi onun yerini alır
  await supabaseAdmin.from(SUBS).update({ review_status: 'superseded' }).eq('task_id', task.id).eq('review_status', 'pending').lt('version', version);

  const patch = taskPatchForSubmission(task, { submissionId: sub.id, at, actualShootDate: shootDate });
  const { data: updated, error: uErr } = await supabaseAdmin.from(TASKS).update(patch).eq('id', task.id).select('*').single();
  if (uErr) throw uErr;
  await logEvent(task.id, ctx.actor.sub, sub.is_revision ? 'resubmitted' : 'submitted', null, { version, source });
  return { task: updated, submission: sub };
}

// ------------------------------------------------------------------ handler

export default async function handler(req, res) {
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
          link_folder_url: ownSettings.link_folder_url || null,
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
      const [{ data: subs }, { data: events }, names] = await Promise.all([
        supabaseAdmin.from(SUBS).select('*').eq('task_id', task.id).order('version', { ascending: false }),
        supabaseAdmin.from(EVENTS).select('*').eq('task_id', task.id).order('created_at', { ascending: false }).limit(200),
        usersByIds([task.teacher_id])
      ]);
      const actorNames = await usersByIds((events || []).map((e) => e.actor_id).concat((subs || []).map((s) => s.reviewed_by)));
      const forTeacher = isOwner && !access.reviewer;
      return res.status(200).json({
        ok: true,
        task: shapeTask(task, { forTeacher, teacherName: names.get(String(task.teacher_id))?.name }),
        submissions: (subs || []).map((s) => ({
          ...s,
          reviewed_by_name: s.reviewed_by ? actorNames.get(String(s.reviewed_by))?.name || null : null
        })),
        events: (events || []).map((e) => ({ ...e, actor_name: actorNames.get(String(e.actor_id))?.name || null })),
        can: {
          manage: access.manager,
          review: access.reviewer && canReview(task),
          mark_shot: isOwner && canMarkShot(task),
          submit: isOwner && canSubmit(task)
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

    // -------------------------------------------------------------- teslim: Drive bağlantısı
    if (isPost && op === 'submit_link') {
      const { task, isOwner } = await taskForActor(ctx, String(body.id || ''));
      if (!isOwner) throw forbidden('Teslimi yalnız görevin öğretmeni yapar');
      if (!canSubmit(task)) throw bad('Bu görev için teslim yapılamaz');
      const link = validateDriveLink(body.url);
      if (!link.ok) throw bad(link.error);
      const r = await recordSubmission(ctx, task, {
        source: 'drive_link',
        driveFileId: link.fileId,
        driveUrl: link.url,
        actualShootDate: body.actual_shoot_date ? String(body.actual_shoot_date) : null
      });
      return res.status(200).json({ ok: true, task: teacherSafeTask(decorateTask(r.task)), submission: r.submission });
    }

    // -------------------------------------------------------------- teslim: doğrudan Drive yükleme
    if (isPost && op === 'upload_start') {
      const { task, settings, isOwner } = await taskForActor(ctx, String(body.id || ''));
      if (!isOwner) throw forbidden('Teslimi yalnız görevin öğretmeni yapar');
      if (!canSubmit(task)) throw bad('Bu görev için teslim yapılamaz');
      if (!effectiveUploadEnabled(settings)) throw new HttpError(409, 'Doğrudan Drive yükleme etkin değil; Drive bağlantısı ile teslim edin');
      const file = normalizeVideoFile({ name: body.file_name, mime: body.mime_type, size: body.size });
      if (!file.ok) throw bad(file.error);
      const shootDate = body.actual_shoot_date ? String(body.actual_shoot_date) : task.actual_shoot_date;
      if (!shootDate) throw bad('Gerçekleşen çekim tarihi gerekli');
      const sErr = validateShootDate(shootDate);
      if (sErr) throw bad(sErr);

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
      const same = (open || []).find((s) => s.file_name === file.fileName && Number(s.size_bytes) === file.size);
      if (same) {
        return res.status(200).json({ ok: true, session_id: same.id, session_uri: same.session_uri, chunk_bytes: UPLOAD_CHUNK_BYTES, resumed: true });
      }

      const { data: last } = await supabaseAdmin.from(SUBS).select('version').eq('task_id', task.id).order('version', { ascending: false }).limit(1);
      const names = await usersByIds([task.teacher_id]);
      const name = buildDriveFileName({
        teacherName: names.get(String(task.teacher_id))?.name || 'Ogretmen',
        title: task.title,
        version: (last?.[0]?.version || 0) + 1,
        dateKey: shootDate,
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
      const { task, isOwner } = await taskForActor(ctx, String(req.query?.id || ''));
      if (!isOwner) throw forbidden();
      const { data } = await supabaseAdmin
        .from(UPLOADS)
        .select('id, file_name, size_bytes, mime_type, session_uri, created_at')
        .eq('task_id', task.id)
        .eq('teacher_id', actor.sub)
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
      const r = await recordSubmission(ctx, task, {
        source: 'drive_upload',
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
      return res.status(200).json({ ok: true, task: teacherSafeTask(decorateTask(r.task)), submission: r.submission });
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
      const { data: sub } = await supabaseAdmin.from(SUBS).select('*').eq('id', task.current_submission_id).maybeSingle();
      if (!sub) throw bad('İncelenecek teslim bulunamadı');
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
          ? { status: 'approved', approved_at: nowIso, approved_by: actor.sub, updated_at: nowIso }
          : { status: 'revision_requested', review_note: note, review_note_at: nowIso, review_note_by: actor.sub, updated_at: nowIso };
      if (action === 'approve' && note) Object.assign(patch, { review_note: note, review_note_at: nowIso, review_note_by: actor.sub });
      const { data, error } = await supabaseAdmin.from(TASKS).update(patch).eq('id', task.id).select('*').single();
      if (error) throw error;
      await logEvent(task.id, actor.sub, action === 'approve' ? 'approved' : 'revision_requested', note || null, { version: sub.version });
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

    return res.status(404).json({ error: 'unknown_op' });
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ ok: false, error: e.message });
    const msg = errorMessage(e);
    console.error('[ad-videos]', op, msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
