import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { normalizedUserRolesFromDb } from './user-roles-fetch.js';
import {
  STATUS_LABEL,
  buildDigest,
  buildWeeklyReport,
  canComment,
  canEditTask,
  canManageReview,
  canOpenModule,
  canSeeFile,
  canSeeRaw,
  canSetShootDate,
  canUploadEdit,
  canUploadRaw,
  commentsForFile,
  decideStoredResult,
  digestHasContent,
  formatDigestText,
  formatTrDate,
  acceptVideoFile,
  isAdmin,
  isBrowserPlayable,
  isEditor,
  isTaskOwner,
  planPreview,
  reuseUploadRow,
  safeClientId,
  clampChunk,
  signMediaTicket,
  statusAfterEditStored,
  statusAfterRawStored,
  taskActions,
  toClientFile,
  verifyMediaTicket
} from './ad-video-logic.js';
import {
  ffmpegAvailable,
  getDriveAccessToken,
  publicDriveStatus,
  putDriveChunk,
  queryResumeOffset,
  readDriveConfig,
  startResumableUpload,
  verifyDriveFile
} from './ad-video-drive.js';

const MAX_BYTES = 8 * 1024 * 1024 * 1024;
const STREAM_CHUNK = 2 * 1024 * 1024;
const SCHEMA_HINT =
  'sql/2026-11-28-reklam-videolari.sql dosyasını Supabase SQL Editor’de bir kez çalıştırın.';

function schemaMissing(error) {
  const msg = `${error?.code || ''} ${errorMessage(error)}`;
  return /42P01|PGRST205|schema cache|does not exist|Could not find the table/i.test(msg);
}

function mediaSecret() {
  return String(process.env.APP_JWT_SECRET || '').trim() || 'dev-insecure-secret-change-me';
}

function userRoles(user) {
  return [user?.role, ...(Array.isArray(user?.roles) ? user.roles : [])]
    .map((role) => String(role || '').trim().toLowerCase())
    .filter(Boolean);
}

function isTeacherUser(user) {
  return userRoles(user).includes('teacher');
}

function isAdminUser(user) {
  const roles = userRoles(user);
  return roles.includes('admin') || roles.includes('super_admin');
}

function blank(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function asDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}

function asDue(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T23:59:00+03:00`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function driveFileName(task, kind, version, original) {
  const safe = String(original || 'video.mp4')
    .replace(/[^\w.\-ğüşöçıİĞÜŞÖÇ ]+/gi, '')
    .trim()
    .slice(0, 80);
  const prefix = kind === 'edit' ? 'montaj' : 'ham';
  return `${prefix}-v${version}-${String(task.id).slice(0, 8)}-${safe || 'video.mp4'}`;
}

function legacyFile(task) {
  if (!task?.legacy_drive_url) return null;
  return {
    id: `legacy-${task.id}`,
    task_id: task.id,
    kind: 'raw',
    version: 0,
    source: 'legacy_link',
    status: 'stored',
    legacy_url: task.legacy_drive_url,
    original_name: 'Eski kişisel Drive bağlantısı',
    open_for_comments: false,
    preview_status: 'unavailable',
    preview_note: 'Bu bağlantı kişisel Drive kaydıdır. Kurum arşivine kaydedilmiş dosya değildir.'
  };
}

function toComment(row) {
  return {
    id: row.id,
    fileId: row.file_id,
    taskId: row.task_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    createdLabel: formatTrDate(row.created_at, true)
  };
}

async function editorRows(institutionId) {
  const { data, error } = await supabaseAdmin
    .from('ad_video_editors')
    .select('user_id,user_name')
    .eq('institution_id', institutionId);
  if (error) throw error;
  return data || [];
}

async function loadUser(id) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id,name,email,role,roles,institution_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function enrichActor(actor) {
  const dbRoles = await normalizedUserRolesFromDb(actor.sub).catch(() => []);
  const roles = [...new Set([actor.role, ...dbRoles].map((role) => String(role || '').trim()).filter(Boolean))];
  let institutionId = actor.institution_id || null;
  const row = await loadUser(actor.sub).catch(() => null);
  if (!institutionId && row?.institution_id) institutionId = row.institution_id;
  return {
    actor: { ...actor, role: actor.role || row?.role, roles, name: row?.name || '' },
    institutionId: institutionId ? String(institutionId) : '',
    profile: row
  };
}

function sameInstitution(actor, institutionId, rowInstitution) {
  if (actor.role === 'super_admin') return true;
  return String(institutionId || '') && String(institutionId) === String(rowInstitution || '');
}

async function notifyUsers(rows) {
  if (!rows.length) return;
  const { error } = await supabaseAdmin.from('platform_notifications').insert(rows);
  if (error) console.warn('[reklam-videolari] bildirim', errorMessage(error));
}

function note({ title, body, userId, institutionId, link }) {
  return {
    title: String(title).slice(0, 200),
    body: String(body).slice(0, 4000),
    target_type: 'user',
    target_user_id: userId,
    sender_user_id: 'system',
    sender_role: 'admin',
    institution_id: institutionId,
    priority: 'normal',
    link_url: link || '/reklam-videolari'
  };
}

async function recipientIds(institutionId, kind) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id,name,role,roles,institution_id')
    .eq('institution_id', institutionId);
  if (error) throw error;
  const rows = data || [];
  if (kind === 'admin') {
    const { data: supers } = await supabaseAdmin
      .from('users')
      .select('id,name,role,roles,institution_id')
      .eq('role', 'super_admin');
    const all = [...rows, ...(supers || [])];
    return [...new Map(all.filter(isAdminUser).map((user) => [user.id, user])).values()];
  }
  return rows.filter(isTeacherUser);
}

export async function loadBoard(actor, institutionId) {
  const drive = publicDriveStatus(readDriveConfig());
  const editors = await editorRows(institutionId);
  const editorIds = new Set(editors.map((row) => row.user_id));
  if (!canOpenModule(actor, editorIds)) {
    return { status: 403, body: { error: 'forbidden', hint: 'Bu ekran öğretmenler, yöneticiler ve kurgu ekibi içindir.' } };
  }
  const [taskRes, fileRes, commentRes, userRes] = await Promise.all([
    supabaseAdmin.from('ad_video_tasks').select('*').eq('institution_id', institutionId).order('updated_at', { ascending: false }),
    supabaseAdmin.from('ad_video_files').select('*').eq('institution_id', institutionId),
    supabaseAdmin.from('ad_video_comments').select('*').eq('institution_id', institutionId).order('created_at', { ascending: true }),
    supabaseAdmin.from('users').select('id,name,role,roles').eq('institution_id', institutionId)
  ]);
  for (const res of [taskRes, fileRes, commentRes]) {
    if (res.error) {
      if (schemaMissing(res.error)) {
        return {
          status: 200,
          body: { schemaOk: false, hint: SCHEMA_HINT, drive, tasks: [], review: [], report: null, teachers: [], editors: [] }
        };
      }
      throw res.error;
    }
  }
  const tasks = taskRes.data || [];
  const files = (fileRes.data || []).map((file) => {
    const copy = { ...file };
    delete copy.session_uri;
    return copy;
  });
  const comments = commentRes.data || [];
  const staff = isAdmin(actor) || isEditor(actor, editorIds);
  const visibleTasks = tasks.filter((task) => staff || (roleOfTeacher(actor) && isTaskOwner(actor, task)));
  const clientTasks = visibleTasks.map((task) => toClientTask(task, files, comments, actor, editorIds));
  const review = [];
  for (const file of files) {
    if (file.kind !== 'edit' || file.status !== 'stored' || !file.open_for_comments || file.source === 'legacy_link') continue;
    const task = tasks.find((item) => item.id === file.task_id);
    if (!task || !canSeeFile(actor, task, file, editorIds)) continue;
    review.push({
      ...toClientFile(file),
      idea: task.idea,
      theme: task.theme,
      teacherName: task.teacher_name,
      comments: commentsForFile(comments, file.id).map(toComment)
    });
  }
  const teachers = (userRes.data || []).filter(isTeacherUser).map((user) => ({ id: user.id, name: user.name || user.id }));
  const staffOptions = (userRes.data || [])
    .filter((user) => isTeacherUser(user) || userRoles(user).includes('coach') || isAdminUser(user))
    .map((user) => ({ id: user.id, name: user.name || user.id, role: user.role }));
  return {
    status: 200,
    body: {
      schemaOk: true,
      drive,
      me: {
        isAdmin: isAdmin(actor),
        isEditor: isEditor(actor, editorIds),
        canCreate: canEditTask(actor)
      },
      tasks: clientTasks,
      review,
      report: isAdmin(actor) ? buildWeeklyReport({ tasks, files, now: new Date() }) : null,
      digest: isAdmin(actor) ? buildDigest({ tasks, files, now: new Date() }) : null,
      teachers: isAdmin(actor) ? teachers : [],
      staffOptions: isAdmin(actor) ? staffOptions : [],
      editors: isAdmin(actor) ? editors : []
    }
  };
}

function roleOfTeacher(actor) {
  return (actor.roles || []).some((role) => String(role).toLowerCase() === 'teacher') || actor.role === 'teacher';
}

function toClientTask(task, files, comments, actor, editorIds) {
  const related = files.filter((file) => file.task_id === task.id);
  const legacy = legacyFile(task);
  const visible = related.filter((file) => canSeeFile(actor, task, file, editorIds));
  if (legacy && canSeeFile(actor, task, legacy, editorIds)) visible.push(legacy);
  const ids = new Set(visible.map((file) => file.id));
  return {
    id: task.id,
    idea: task.idea,
    theme: task.theme,
    shootNotes: canSeeRaw(actor, task, editorIds) ? task.shoot_notes || '' : '',
    plannedShootDate: task.planned_shoot_date,
    plannedShootTime: task.planned_shoot_time,
    plannedShootLabel: [formatTrDate(task.planned_shoot_date), task.planned_shoot_time].filter(Boolean).join(' · '),
    dueAt: task.due_at,
    dueLabel: formatTrDate(task.due_at, true),
    actualShootDate: task.actual_shoot_date,
    actualShootLabel: formatTrDate(task.actual_shoot_date),
    status: task.status,
    statusLabel: STATUS_LABEL[task.status] || task.status,
    teacherUserId: task.teacher_user_id,
    teacherName: task.teacher_name,
    revisionNote: task.revision_note || '',
    actions: taskActions(actor, task, editorIds),
    files: visible.map(toClientFile),
    comments: comments.filter((row) => ids.has(row.file_id)).map(toComment)
  };
}

async function requireTask(taskId, actor, institutionId) {
  const { data, error } = await supabaseAdmin.from('ad_video_tasks').select('*').eq('id', taskId).maybeSingle();
  if (error) throw error;
  if (!data || !sameInstitution(actor, institutionId, data.institution_id)) return null;
  return data;
}

async function requireFile(fileId) {
  const { data, error } = await supabaseAdmin.from('ad_video_files').select('*').eq('id', fileId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveTask(actor, institutionId, body) {
  if (!canEditTask(actor)) return { status: 403, body: { error: 'forbidden' } };
  const idea = String(body.idea || '').trim();
  if (!idea) return { status: 400, body: { error: 'Video fikri gerekli.' } };
  const teacher = await loadUser(String(body.teacherUserId || '').trim());
  if (!teacher || String(teacher.institution_id || '') !== String(institutionId) || !isTeacherUser(teacher)) {
    return { status: 400, body: { error: 'Öğretmen seçin.' } };
  }
  const row = {
    institution_id: institutionId,
    teacher_user_id: teacher.id,
    teacher_name: teacher.name || teacher.email || 'Öğretmen',
    idea: idea.slice(0, 300),
    theme: String(body.theme || '').trim().slice(0, 200),
    shoot_notes: String(body.shootNotes || '').trim().slice(0, 4000),
    planned_shoot_date: asDate(body.plannedShootDate),
    planned_shoot_time: blank(body.plannedShootTime),
    due_at: asDue(body.dueAt),
    actual_shoot_date: asDate(body.actualShootDate),
    legacy_drive_url: blank(body.legacyDriveUrl),
    revision_note: String(body.revisionNote || '').trim().slice(0, 2000),
    updated_at: new Date().toISOString()
  };
  const id = String(body.id || '').trim();
  if (id) {
    const current = await requireTask(id, actor, institutionId);
    if (!current) return { status: 404, body: { error: 'Görev bulunamadı.' } };
    const { error } = await supabaseAdmin.from('ad_video_tasks').update(row).eq('id', id);
    if (error) throw error;
    return { status: 200, body: { ok: true, id } };
  }
  const { data, error } = await supabaseAdmin
    .from('ad_video_tasks')
    .insert({ ...row, status: 'planlandi', created_by: actor.sub })
    .select('id')
    .single();
  if (error) throw error;
  return { status: 200, body: { ok: true, id: data.id } };
}

export async function setShootDate(actor, institutionId, body, editorIds) {
  const task = await requireTask(body.taskId, actor, institutionId);
  if (!task) return { status: 404, body: { error: 'Görev bulunamadı.' } };
  if (!canSetShootDate(actor, task, editorIds)) return { status: 403, body: { error: 'forbidden' } };
  const actual = asDate(body.actualShootDate);
  const { error } = await supabaseAdmin
    .from('ad_video_tasks')
    .update({ actual_shoot_date: actual, updated_at: new Date().toISOString() })
    .eq('id', task.id);
  if (error) throw error;
  return { status: 200, body: { ok: true, actualShootDate: actual, actualShootLabel: formatTrDate(actual) } };
}

async function nextVersion(taskId, kind) {
  const { data, error } = await supabaseAdmin
    .from('ad_video_files')
    .select('version')
    .eq('task_id', taskId)
    .eq('kind', kind)
    .order('version', { ascending: false })
    .limit(1);
  if (error) throw error;
  return Number(data?.[0]?.version || 0) + 1;
}

export async function startUpload(actor, institutionId, body) {
  const config = readDriveConfig();
  if (!config.ready) {
    return { status: 503, body: { error: 'drive_kurulum_eksik', ...publicDriveStatus(config) } };
  }
  const editors = await editorRows(institutionId);
  const editorIds = new Set(editors.map((row) => row.user_id));
  const task = await requireTask(body.taskId, actor, institutionId);
  if (!task) return { status: 404, body: { error: 'Görev bulunamadı.' } };
  const kind = body.kind === 'edit' ? 'edit' : 'raw';
  if (kind === 'raw' && !canUploadRaw(actor, task, editorIds)) return { status: 403, body: { error: 'forbidden' } };
  if (kind === 'edit' && !canUploadEdit(actor, editorIds)) return { status: 403, body: { error: 'forbidden' } };
  const accepted = acceptVideoFile({ name: body.fileName, mime: body.mime });
  if (!accepted.ok) return { status: 400, body: { error: accepted.error } };
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return { status: 400, body: { error: 'Dosya boyutu geçersiz.' } };
  }
  const clientUploadId = safeClientId(body.clientUploadId);
  if (!clientUploadId) return { status: 400, body: { error: 'Yükleme kimliği geçersiz.' } };
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('ad_video_files')
    .select('*')
    .eq('task_id', task.id)
    .eq('client_upload_id', clientUploadId)
    .maybeSingle();
  if (existingError) throw existingError;
  const mode = reuseUploadRow(existing);
  if (mode === 'already') {
    return { status: 200, body: { alreadyStored: true, file: toClientFile(existing), fileId: existing.id } };
  }
  let row = existing;
  if (mode === 'create') {
    const version = await nextVersion(task.id, kind);
    const { data, error } = await supabaseAdmin
      .from('ad_video_files')
      .insert({
        task_id: task.id,
        institution_id: task.institution_id,
        kind,
        version,
        source: 'archive',
        mime_type: accepted.mime,
        original_name: String(body.fileName || '').slice(0, 180),
        size_bytes: size,
        uploader_user_id: actor.sub,
        status: 'uploading',
        preview_status: 'pending',
        client_upload_id: clientUploadId,
        open_for_comments: false
      })
      .select('*')
      .single();
    if (error) {
      if (String(error.code) === '23505') {
        const again = await supabaseAdmin
          .from('ad_video_files')
          .select('*')
          .eq('task_id', task.id)
          .eq('client_upload_id', clientUploadId)
          .maybeSingle();
        if (again.data?.status === 'stored') {
          return { status: 200, body: { alreadyStored: true, file: toClientFile(again.data), fileId: again.data.id } };
        }
        row = again.data;
      } else throw error;
    } else row = data;
  }
  if (!row) return { status: 500, body: { error: 'Yükleme kaydı açılamadı.' } };
  try {
    const token = await getDriveAccessToken(config.credentials);
    const sessionUrl = await startResumableUpload({
      token,
      name: driveFileName(task, kind, row.version, body.fileName),
      mime: accepted.mime,
      size,
      parentId: kind === 'edit' ? config.editFolderId : config.rawFolderId
    });
    const { error } = await supabaseAdmin
      .from('ad_video_files')
      .update({
        session_uri: sessionUrl,
        status: 'uploading',
        drive_file_id: null,
        mime_type: accepted.mime,
        original_name: String(body.fileName || '').slice(0, 180),
        size_bytes: size
      })
      .eq('id', row.id);
    if (error) throw error;
    const progress = await queryResumeOffset(sessionUrl, size);
    return {
      status: 200,
      body: { fileId: row.id, version: row.version, offset: progress.offset || 0, alreadyStored: false }
    };
  } catch (error) {
    await supabaseAdmin.from('ad_video_files').update({ status: 'failed' }).eq('id', row.id);
    return { status: 502, body: { error: 'Drive oturumu açılamadı.', detail: errorMessage(error) } };
  }
}

async function authorizedUploadRow(actor, institutionId, fileId) {
  const file = await requireFile(fileId);
  if (!file) return { error: { status: 404, body: { error: 'Dosya bulunamadı.' } } };
  const task = await requireTask(file.task_id, actor, institutionId);
  if (!task) return { error: { status: 404, body: { error: 'Görev bulunamadı.' } } };
  const editors = await editorRows(institutionId);
  const editorIds = new Set(editors.map((row) => row.user_id));
  const allowed =
    file.kind === 'edit' ? canUploadEdit(actor, editorIds) : canUploadRaw(actor, task, editorIds);
  if (!allowed || file.uploader_user_id !== actor.sub && !isAdmin(actor) && !isEditor(actor, editorIds)) {
    return { error: { status: 403, body: { error: 'forbidden' } } };
  }
  return { file, task, editorIds };
}

export async function resumeUpload(actor, institutionId, body) {
  const found = await authorizedUploadRow(actor, institutionId, body.fileId);
  if (found.error) return found.error;
  if (found.file.status === 'stored') return { status: 200, body: { done: true, offset: Number(found.file.size_bytes) || 0 } };
  if (!found.file.session_uri) return { status: 409, body: { error: 'Yükleme oturumu yok. Yeniden başlatın.' } };
  const progress = await queryResumeOffset(found.file.session_uri, Number(body.total || found.file.size_bytes));
  if (!progress.ok) return { status: 502, body: { error: progress.error || 'Devam noktası alınamadı.' } };
  if (progress.file?.id && !found.file.drive_file_id) {
    await supabaseAdmin.from('ad_video_files').update({ drive_file_id: progress.file.id }).eq('id', found.file.id);
  }
  return { status: 200, body: { offset: progress.offset, done: progress.done } };
}

export async function relayChunk(actor, institutionId, body) {
  const found = await authorizedUploadRow(actor, institutionId, body.fileId);
  if (found.error) return found.error;
  if (found.file.status === 'stored') {
    return { status: 200, body: { done: true, offset: Number(found.file.size_bytes) || 0, alreadyStored: true } };
  }
  if (!found.file.session_uri) return { status: 409, body: { error: 'Yükleme oturumu yok. Yeniden başlatın.' } };
  const raw = String(body.dataBase64 || '').replace(/^data:[^,]*,/, '');
  const buffer = Buffer.from(raw, 'base64');
  if (!clampChunk(buffer.length)) return { status: 413, body: { error: 'Parça çok büyük.' } };
  const total = Number(body.total || found.file.size_bytes);
  const progress = await queryResumeOffset(found.file.session_uri, total);
  if (!progress.ok) return { status: 502, body: { error: progress.error || 'Drive yanıt vermedi.' } };
  if (progress.done) {
    if (progress.file?.id) {
      await supabaseAdmin.from('ad_video_files').update({ drive_file_id: progress.file.id }).eq('id', found.file.id);
    }
    return { status: 200, body: { done: true, offset: progress.offset, needsComplete: true } };
  }
  if (Number(body.start) !== progress.offset) {
    return { status: 200, body: { mismatch: true, offset: progress.offset } };
  }
  const put = await putDriveChunk({ sessionUrl: found.file.session_uri, start: progress.offset, buffer, total });
  if (!put.ok) {
    await supabaseAdmin.from('ad_video_files').update({ status: 'failed' }).eq('id', found.file.id);
    return { status: 502, body: { error: put.error || 'Parça iletilemedi.' } };
  }
  if (put.file?.id) {
    await supabaseAdmin.from('ad_video_files').update({ drive_file_id: put.file.id }).eq('id', found.file.id);
  }
  return { status: 200, body: { done: put.done, offset: put.offset, needsComplete: put.done } };
}

export async function completeUpload(actor, institutionId, body) {
  const config = readDriveConfig();
  if (!config.ready) return { status: 503, body: { error: 'drive_kurulum_eksik', ...publicDriveStatus(config) } };
  const found = await authorizedUploadRow(actor, institutionId, body.fileId);
  if (found.error) return found.error;
  if (found.file.status === 'stored' && found.file.drive_file_id) {
    return { status: 200, body: { stored: true, already: true, file: toClientFile(found.file) } };
  }
  if (!found.file.drive_file_id) {
    await supabaseAdmin.from('ad_video_files').update({ status: 'failed' }).eq('id', found.file.id);
    return { status: 409, body: { stored: false, error: 'Drive kaydı doğrulanamadı. Yeniden deneyin.' } };
  }
  const token = await getDriveAccessToken(config.credentials);
  const verify = await verifyDriveFile({ token, fileId: found.file.drive_file_id });
  const parentId = found.file.kind === 'edit' ? config.editFolderId : config.rawFolderId;
  const decision = decideStoredResult(verify, config.sharedDriveId, parentId);
  if (!decision.stored) {
    await supabaseAdmin.from('ad_video_files').update({ status: 'failed' }).eq('id', found.file.id);
    return { status: 409, body: { stored: false, error: 'Dosya kurum arşivinde doğrulanamadı.', detail: decision.error } };
  }
  const preview = planPreview({
    mime: decision.mime || found.file.mime_type,
    name: found.file.original_name,
    ffmpegAvailable: ffmpegAvailable()
  });
  const uploadedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('ad_video_files')
    .update({
      status: 'stored',
      source: 'archive',
      drive_file_id: decision.driveFileId,
      size_bytes: decision.size,
      mime_type: decision.mime || found.file.mime_type,
      uploaded_at: uploadedAt,
      preview_status: preview.previewStatus,
      preview_note: preview.previewNote,
      session_uri: null
    })
    .eq('id', found.file.id);
  if (error) throw error;
  const nextStatus =
    found.file.kind === 'raw'
      ? statusAfterRawStored(found.task.status)
      : statusAfterEditStored(found.task.status);
  await supabaseAdmin
    .from('ad_video_tasks')
    .update({ status: nextStatus, updated_at: uploadedAt })
    .eq('id', found.task.id);
  if (found.file.kind === 'raw') {
    const people = await recipientIds(found.task.institution_id, 'admin');
    await notifyUsers(
      people.map((user) =>
        note({
          title: 'Ham video teslim edildi',
          body: `${found.task.teacher_name} — ${found.task.idea}\n${formatTrDate(uploadedAt, true)}`,
          userId: user.id,
          institutionId: found.task.institution_id,
          link: `/reklam-videolari?gorev=${found.task.id}`
        })
      )
    );
  }
  const stored = {
    ...found.file,
    status: 'stored',
    source: 'archive',
    size_bytes: decision.size,
    mime_type: decision.mime || found.file.mime_type,
    uploaded_at: uploadedAt,
    preview_status: preview.previewStatus,
    preview_note: preview.previewNote
  };
  return {
    status: 200,
    body: {
      stored: true,
      taskStatus: nextStatus,
      taskStatusLabel: STATUS_LABEL[nextStatus] || nextStatus,
      file: toClientFile(stored)
    }
  };
}

export async function openReview(actor, institutionId, body) {
  if (!canManageReview(actor)) return { status: 403, body: { error: 'forbidden' } };
  const file = await requireFile(body.fileId);
  if (!file || file.kind !== 'edit' || file.status !== 'stored' || file.source === 'legacy_link') {
    return { status: 400, body: { error: 'Yorumlara yalnız arşivlenmiş montaj açılır.' } };
  }
  const task = await requireTask(file.task_id, actor, institutionId);
  if (!task) return { status: 404, body: { error: 'Görev bulunamadı.' } };
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('ad_video_files')
    .update({ open_for_comments: true, review_opened_at: now, review_opened_by: actor.sub })
    .eq('id', file.id);
  if (error) throw error;
  await supabaseAdmin.from('ad_video_tasks').update({ status: 'incelemede', updated_at: now }).eq('id', task.id);
  const teachers = await recipientIds(task.institution_id, 'teacher');
  await notifyUsers(
    teachers.map((user) =>
      note({
        title: 'Montaj yorumlara açıldı',
        body: `${task.teacher_name} — ${task.idea}\nSürüm ${file.version} · ${formatTrDate(now, true)}`,
        userId: user.id,
        institutionId: task.institution_id,
        link: `/reklam-videolari?inceleme=${file.id}`
      })
    )
  );
  return { status: 200, body: { ok: true } };
}

export async function requestRevision(actor, institutionId, body) {
  if (!canManageReview(actor)) return { status: 403, body: { error: 'forbidden' } };
  const task = await requireTask(body.taskId, actor, institutionId);
  if (!task) return { status: 404, body: { error: 'Görev bulunamadı.' } };
  const noteText = String(body.note || '').trim().slice(0, 2000);
  const { error } = await supabaseAdmin
    .from('ad_video_tasks')
    .update({
      status: 'revizyon_istendi',
      revision_note: noteText,
      updated_at: new Date().toISOString()
    })
    .eq('id', task.id);
  if (error) throw error;
  return { status: 200, body: { ok: true, statusLabel: STATUS_LABEL.revizyon_istendi } };
}

export async function approveFile(actor, institutionId, body) {
  if (!canManageReview(actor)) return { status: 403, body: { error: 'forbidden' } };
  const file = await requireFile(body.fileId);
  if (!file || file.kind !== 'edit' || file.status !== 'stored' || file.source === 'legacy_link') {
    return { status: 400, body: { error: 'Onay yalnız arşivlenmiş montaj içindir.' } };
  }
  const task = await requireTask(file.task_id, actor, institutionId);
  if (!task) return { status: 404, body: { error: 'Görev bulunamadı.' } };
  const now = new Date().toISOString();
  const approver = await loadUser(actor.sub);
  await supabaseAdmin
    .from('ad_video_files')
    .update({ is_current_approval: false })
    .eq('task_id', task.id)
    .eq('is_current_approval', true);
  const { error } = await supabaseAdmin
    .from('ad_video_files')
    .update({
      is_current_approval: true,
      approved_at: now,
      approved_by: actor.sub,
      approved_by_name: approver?.name || actor.name || 'Yönetici'
    })
    .eq('id', file.id);
  if (error) throw error;
  await supabaseAdmin.from('ad_video_tasks').update({ status: 'onaylandi', updated_at: now }).eq('id', task.id);
  return {
    status: 200,
    body: {
      ok: true,
      approvedAt: now,
      approvedLabel: formatTrDate(now, true),
      approvedByName: approver?.name || 'Yönetici',
      version: file.version
    }
  };
}

export async function addComment(actor, institutionId, body) {
  const file = await requireFile(body.fileId);
  if (!file) return { status: 404, body: { error: 'Dosya bulunamadı.' } };
  const task = await requireTask(file.task_id, actor, institutionId);
  if (!task) return { status: 404, body: { error: 'Görev bulunamadı.' } };
  const editors = await editorRows(institutionId);
  const editorIds = new Set(editors.map((row) => row.user_id));
  if (!canComment(actor, task, file, editorIds)) return { status: 403, body: { error: 'forbidden' } };
  const text = String(body.body || '').trim();
  if (!text) return { status: 400, body: { error: 'Yorum yazın.' } };
  const profile = await loadUser(actor.sub);
  const { data, error } = await supabaseAdmin
    .from('ad_video_comments')
    .insert({
      file_id: file.id,
      task_id: task.id,
      institution_id: task.institution_id,
      author_user_id: actor.sub,
      author_name: profile?.name || actor.name || 'Kullanıcı',
      body: text.slice(0, 2000)
    })
    .select('*')
    .single();
  if (error) throw error;
  return { status: 200, body: { comment: toComment(data) } };
}

export async function saveEditor(actor, institutionId, body, remove) {
  if (!isAdmin(actor)) return { status: 403, body: { error: 'forbidden' } };
  const userId = String(body.userId || '').trim();
  if (!userId) return { status: 400, body: { error: 'Kullanıcı seçin.' } };
  if (remove) {
    const { error } = await supabaseAdmin
      .from('ad_video_editors')
      .delete()
      .eq('institution_id', institutionId)
      .eq('user_id', userId);
    if (error) throw error;
    return { status: 200, body: { ok: true } };
  }
  const user = await loadUser(userId);
  if (!user || String(user.institution_id || '') !== String(institutionId)) {
    return { status: 400, body: { error: 'Kurum kullanıcısı seçin.' } };
  }
  const { error } = await supabaseAdmin.from('ad_video_editors').upsert({
    institution_id: institutionId,
    user_id: user.id,
    user_name: user.name || user.email || user.id,
    created_by: actor.sub
  });
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}

export async function issueTicket(actor, institutionId, body) {
  const file = await requireFile(body.fileId);
  if (!file || file.source === 'legacy_link') return { status: 404, body: { error: 'Arşiv dosyası bulunamadı.' } };
  const task = await requireTask(file.task_id, actor, institutionId);
  if (!task) return { status: 404, body: { error: 'Görev bulunamadı.' } };
  const editors = await editorRows(institutionId);
  const editorIds = new Set(editors.map((row) => row.user_id));
  if (!canSeeFile(actor, task, file, editorIds)) return { status: 403, body: { error: 'forbidden' } };
  const purpose = body.purpose === 'download' ? 'download' : 'play';
  if (purpose === 'play' && !isBrowserPlayable(file)) {
    return {
      status: 200,
      body: {
        playable: false,
        previewStatus: file.preview_status,
        previewNote: file.preview_note,
        stored: file.status === 'stored'
      }
    };
  }
  if (file.status !== 'stored' || !file.drive_file_id) {
    return { status: 409, body: { error: 'Dosya henüz arşivde doğrulanmadı.' } };
  }
  const ticket = signMediaTicket({ sub: actor.sub, fileId: file.id, purpose }, mediaSecret());
  const url = `/api/reklam-videolari?op=media&fileId=${encodeURIComponent(file.id)}&ticket=${encodeURIComponent(ticket)}`;
  return {
    status: 200,
    body: {
      playable: purpose === 'play',
      url,
      purpose,
      mimeType: file.mime_type,
      originalName: file.original_name,
      sizeBytes: file.size_bytes,
      previewStatus: file.preview_status,
      previewNote: file.preview_note,
      stored: true
    }
  };
}

function parseRange(header, total) {
  const chunk = STREAM_CHUNK;
  if (!header) return { start: 0, end: Math.min(chunk, total) - 1 };
  const match = /bytes=(\d+)-(\d*)/.exec(String(header));
  if (!match) return { start: 0, end: Math.min(chunk, total) - 1 };
  const start = Number(match[1]);
  const requested = match[2] ? Number(match[2]) : start + chunk - 1;
  const end = Math.min(requested, start + chunk - 1, total - 1);
  return { start, end };
}

export async function streamMedia(req, res) {
  const fileId = String(req.query?.fileId || '').trim();
  const ticket = verifyMediaTicket(req.query?.ticket, mediaSecret());
  if (!ticket || ticket.fileId !== fileId) {
    res.status(401).json({ error: 'Oturum bileti geçersiz.' });
    return;
  }
  const user = await loadUser(ticket.sub);
  if (!user) {
    res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
    return;
  }
  const roles = userRoles(user);
  const actor = { sub: user.id, role: user.role, roles, institution_id: user.institution_id, name: user.name };
  const file = await requireFile(fileId);
  if (!file || file.status !== 'stored' || !file.drive_file_id || file.source === 'legacy_link') {
    res.status(404).json({ error: 'Arşiv dosyası bulunamadı.' });
    return;
  }
  const { data: task, error } = await supabaseAdmin.from('ad_video_tasks').select('*').eq('id', file.task_id).maybeSingle();
  if (error || !task || !sameInstitution(actor, actor.institution_id, task.institution_id)) {
    res.status(404).json({ error: 'Görev bulunamadı.' });
    return;
  }
  const editors = await editorRows(task.institution_id);
  const editorIds = new Set(editors.map((row) => row.user_id));
  if (!canSeeFile(actor, task, file, editorIds)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const config = readDriveConfig();
  if (!config.ready) {
    res.status(503).json({ error: 'drive_kurulum_eksik', ...publicDriveStatus(config) });
    return;
  }
  const total = Number(file.size_bytes) || 0;
  if (!total) {
    res.status(409).json({ error: 'Dosya boyutu doğrulanamadı.' });
    return;
  }
  const { start, end } = parseRange(req.headers.range, total);
  if (start >= total || end < start) {
    res.status(416).setHeader('Content-Range', `bytes */${total}`);
    res.end();
    return;
  }
  const token = await getDriveAccessToken(config.credentials);
  const upstream = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.drive_file_id)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}`, Range: `bytes=${start}-${end}` } }
  );
  if (!upstream.ok && upstream.status !== 206) {
    res.status(502).json({ error: 'Arşiv dosyası açılamadı. Google erişim isteği gösterilmez.' });
    return;
  }
  const advertised = Number(upstream.headers.get('content-length') || 0);
  if (advertised > STREAM_CHUNK + 65536) {
    upstream.body?.cancel?.();
    res.status(502).json({ error: 'Arşiv beklenenden büyük bir parça gönderdi.' });
    return;
  }
  const reader = upstream.body?.getReader();
  if (!reader) {
    res.status(502).json({ error: 'Arşiv yanıtı okunamadı.' });
    return;
  }
  const pieces = [];
  let received = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    received += step.value.byteLength;
    if (received > STREAM_CHUNK + 65536) {
      await reader.cancel();
      res.status(502).json({ error: 'Arşiv beklenenden büyük bir parça gönderdi.' });
      return;
    }
    pieces.push(Buffer.from(step.value));
  }
  const bytes = Buffer.concat(pieces);
  if (!bytes.length) {
    res.status(502).json({ error: 'Arşiv boş yanıt verdi.' });
    return;
  }
  const name = String(file.original_name || 'video.mp4').replace(/["\r\n]/g, '');
  res.statusCode = 206;
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Range', `bytes ${start}-${start + bytes.length - 1}/${total}`);
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader(
    'Content-Disposition',
    ticket.purpose === 'download' ? `attachment; filename="${name}"` : 'inline'
  );
  res.end(bytes);
}

export async function runDailyDigest() {
  const { data, error } = await supabaseAdmin.from('ad_video_tasks').select('institution_id');
  if (error) {
    if (schemaMissing(error)) return { ok: true, skipped: 'schema' };
    throw error;
  }
  const institutions = [...new Set((data || []).map((row) => row.institution_id).filter(Boolean))];
  let sent = 0;
  for (const institutionId of institutions) {
    const [tasksRes, filesRes] = await Promise.all([
      supabaseAdmin.from('ad_video_tasks').select('*').eq('institution_id', institutionId),
      supabaseAdmin.from('ad_video_files').select('*').eq('institution_id', institutionId)
    ]);
    if (tasksRes.error) throw tasksRes.error;
    if (filesRes.error) throw filesRes.error;
    const digest = buildDigest({ tasks: tasksRes.data || [], files: filesRes.data || [], now: new Date() });
    if (!digestHasContent(digest)) continue;
    const title = `Reklam videoları özeti · ${formatTrDate(digest.today)}`;
    const { data: existing } = await supabaseAdmin
      .from('platform_notifications')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('title', title)
      .limit(1);
    if (existing?.length) continue;
    const admins = await recipientIds(institutionId, 'admin');
    await notifyUsers(
      admins.map((user) =>
        note({
          title,
          body: formatDigestText(digest),
          userId: user.id,
          institutionId,
          link: '/reklam-videolari'
        })
      )
    );
    sent += admins.length;
  }
  return { ok: true, institutions: institutions.length, sent };
}

export function setupFailure(error) {
  if (error?.schemaMissing || schemaMissing(error)) {
    return { status: 503, body: { error: 'sema_yok', hint: SCHEMA_HINT } };
  }
  return { status: 500, body: { error: errorMessage(error) } };
}

export async function editorIdsFor(institutionId) {
  const rows = await editorRows(institutionId);
  return new Set(rows.map((row) => row.user_id));
}
