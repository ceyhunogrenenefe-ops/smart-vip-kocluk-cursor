import crypto from 'crypto';

/**
 * Reklam videoları — yetki, sürüm, haftalık sayım, önizleme kararı.
 * Veritabanı ve Google çağrısı yok; her istek sunucuda bu kurallarla doğrulanır.
 */

const ADMIN_ROLES = new Set(['super_admin', 'admin']);
const EDITOR_ROLE_TAGS = new Set(['kurgu', 'video_editor']);

export const TASK_STATUSES = [
  'planlandi',
  'ham_teslim',
  'montaj_taslak',
  'incelemede',
  'revizyon_istendi',
  'onaylandi'
];

export const STATUS_LABEL = {
  planlandi: 'Planlandı',
  ham_teslim: 'Ham Video Teslim Edildi',
  montaj_taslak: 'Montaj taslak',
  incelemede: 'Yorumlara açık',
  revizyon_istendi: 'Yeni sürüm istendi',
  onaylandi: 'Onaylandı'
};

const TR_OFFSET = '+03:00';

export function roleSet(actor) {
  const set = new Set();
  const add = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (v) set.add(v);
  };
  add(actor?.role);
  if (Array.isArray(actor?.roles)) actor.roles.forEach(add);
  return set;
}

export function isAdmin(actor) {
  const roles = roleSet(actor);
  for (const r of ADMIN_ROLES) if (roles.has(r)) return true;
  return false;
}

export function editorIdSet(editorIds) {
  if (editorIds instanceof Set) return editorIds;
  return new Set((editorIds || []).map((id) => String(id || '').trim()).filter(Boolean));
}

export function isEditor(actor, editorIds) {
  const roles = roleSet(actor);
  for (const tag of EDITOR_ROLE_TAGS) if (roles.has(tag)) return true;
  const id = String(actor?.sub || actor?.id || '').trim();
  return Boolean(id) && editorIdSet(editorIds).has(id);
}

/** Öğrenci, veli ve oturumsuz ziyaretçi giremez. Öğretmen, yönetici ve kurgu ekibi girer. */
export function canOpenModule(actor, editorIds) {
  const sub = String(actor?.sub || '').trim();
  if (!sub || sub === 'anonymous') return false;
  if (isAdmin(actor) || isEditor(actor, editorIds)) return true;
  const roles = roleSet(actor);
  if (roles.has('teacher')) return true;
  return false;
}

export function isTaskOwner(actor, task) {
  return Boolean(task) && String(task.teacher_user_id || '') === String(actor?.sub || '');
}

export function canSeeRaw(actor, task, editorIds) {
  if (!canOpenModule(actor, editorIds) || !task) return false;
  if (isAdmin(actor) || isEditor(actor, editorIds)) return true;
  return roleSet(actor).has('teacher') && isTaskOwner(actor, task);
}

export function canSeeFile(actor, task, file, editorIds) {
  if (!file || !task) return false;
  if (file.source === 'legacy_link') return canSeeRaw(actor, task, editorIds);
  if (file.kind === 'raw') return canSeeRaw(actor, task, editorIds);
  if (file.kind !== 'edit') return false;
  if (!canOpenModule(actor, editorIds)) return false;
  if (isAdmin(actor) || isEditor(actor, editorIds)) return true;
  if (roleSet(actor).has('teacher') && isTaskOwner(actor, task)) return true;
  if (!roleSet(actor).has('teacher')) return false;
  return Boolean(file.open_for_comments) && file.status === 'stored' && file.source !== 'legacy_link';
}

export function canComment(actor, task, file, editorIds) {
  if (!file || file.kind !== 'edit' || file.status !== 'stored' || file.source === 'legacy_link') return false;
  return canSeeFile(actor, task, file, editorIds);
}

export function canUploadRaw(actor, task, editorIds) {
  if (!task) return false;
  if (isAdmin(actor)) return true;
  return roleSet(actor).has('teacher') && isTaskOwner(actor, task) && canOpenModule(actor, editorIds);
}

export function canUploadEdit(actor, editorIds) {
  return isAdmin(actor) || isEditor(actor, editorIds);
}

export function canManageReview(actor) {
  return isAdmin(actor);
}

export function canEditTask(actor) {
  return isAdmin(actor);
}

export function canSetShootDate(actor, task, editorIds) {
  if (!task) return false;
  if (isAdmin(actor)) return true;
  return roleSet(actor).has('teacher') && isTaskOwner(actor, task) && canOpenModule(actor, editorIds);
}

export function taskActions(actor, task, editorIds) {
  return {
    uploadRaw: canUploadRaw(actor, task, editorIds),
    uploadEdit: canUploadEdit(actor, editorIds),
    openReview: canManageReview(actor),
    approve: canManageReview(actor),
    revise: canManageReview(actor),
    editTask: canEditTask(actor),
    setShootDate: canSetShootDate(actor, task, editorIds),
    seeRaw: canSeeRaw(actor, task, editorIds)
  };
}

export function statusAfterRawStored(current) {
  if (!current || current === 'planlandi' || current === 'ham_teslim') return 'ham_teslim';
  return current;
}

export function statusAfterEditStored(current) {
  if (current === 'onaylandi' || current === 'incelemede') return current;
  return 'montaj_taslak';
}

export function acceptVideoFile({ name, mime }) {
  const n = String(name || '').trim().toLowerCase();
  const m = String(mime || '').trim().toLowerCase();
  const extOk = n.endsWith('.mp4') || n.endsWith('.mov');
  if (!extOk) return { ok: false, error: 'Yalnız MP4 veya MOV seçilebilir.' };
  const mimeOk =
    !m ||
    m === 'video/mp4' ||
    m === 'video/quicktime' ||
    m === 'video/x-quicktime' ||
    m === 'application/octet-stream';
  if (!mimeOk) return { ok: false, error: 'Dosya türü desteklenmiyor. MP4 veya MOV yükleyin.' };
  const normalized = m.startsWith('video/') ? m : n.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
  return { ok: true, mime: normalized };
}

/** MOV/HEVC tarayıcıda oynatılamaz. ffmpeg yoksa orijinal arşivde kalır, önizleme ayrı durumdadır. */
export function planPreview({ mime, name, ffmpegAvailable = false }) {
  const mov = /quicktime|hevc|h265/i.test(String(mime || '')) || /\.mov$/i.test(String(name || ''));
  if (!mov) {
    return {
      previewStatus: 'not_needed',
      previewNote: 'Orijinal dosya tarayıcıda oynatılabilir.'
    };
  }
  if (ffmpegAvailable) {
    return {
      previewStatus: 'pending',
      previewNote: 'Orijinal arşivde. Tarayıcı önizlemesi hazırlanıyor.'
    };
  }
  return {
    previewStatus: 'unavailable',
    previewNote:
      'Telefon MOV/HEVC kaydı kurum arşivinde duruyor. Bu sunucuda ffmpeg olmadığı için tarayıcı önizlemesi üretilemedi. Yetkili kişiler orijinali indirebilir.'
  };
}

export function isBrowserPlayable(file) {
  if (!file || file.source === 'legacy_link' || file.status !== 'stored') return false;
  if (file.preview_status === 'ready') return true;
  if (file.preview_status === 'unavailable') return false;
  return /^video\/mp4$/i.test(file.mime_type || '') || /\.mp4$/i.test(file.original_name || '');
}

export function toClientFile(file) {
  if (!file) return null;
  const legacy = file.source === 'legacy_link';
  return {
    id: file.id,
    taskId: file.task_id,
    kind: file.kind,
    version: file.version,
    source: file.source,
    archive: !legacy && file.source === 'archive' && file.status === 'stored',
    legacy,
    legacyUrl: legacy ? file.legacy_url || file.legacyUrl || null : null,
    mimeType: file.mime_type || null,
    originalName: file.original_name || (legacy ? 'Eski kişisel Drive bağlantısı' : null),
    sizeBytes: file.size_bytes || null,
    uploaderUserId: file.uploader_user_id || null,
    uploadedAt: file.uploaded_at || null,
    status: file.status,
    previewStatus: file.preview_status || null,
    previewNote: file.preview_note || null,
    openForComments: Boolean(file.open_for_comments),
    reviewOpenedAt: file.review_opened_at || null,
    approvedAt: file.approved_at || null,
    approvedBy: file.approved_by || null,
    approvedByName: file.approved_by_name || null,
    currentApproval: Boolean(file.is_current_approval),
    playable: isBrowserPlayable(file)
  };
}

export function reuseUploadRow(existing) {
  if (!existing) return 'create';
  if (existing.status === 'stored' && existing.source !== 'legacy_link') return 'already';
  return 'resume';
}

export function decideStoredResult(verify, expectedDriveId, expectedParentId) {
  if (!verify?.ok || !verify.file?.id) {
    return { stored: false, error: verify?.error || 'drive_dogrulanamadi' };
  }
  if (verify.file.trashed) return { stored: false, error: 'dosya_copte' };
  const size = Number(verify.file.size || 0);
  if (!Number.isFinite(size) || size <= 0) return { stored: false, error: 'boyut_dogrulanamadi' };
  if (expectedDriveId && verify.file.driveId && verify.file.driveId !== expectedDriveId) {
    return { stored: false, error: 'yanlis_drive' };
  }
  if (
    expectedParentId &&
    Array.isArray(verify.file.parents) &&
    verify.file.parents.length &&
    !verify.file.parents.includes(expectedParentId)
  ) {
    return { stored: false, error: 'yanlis_klasor' };
  }
  return {
    stored: true,
    driveFileId: verify.file.id,
    size,
    mime: verify.file.mimeType || null,
    name: verify.file.name || null
  };
}

export function istanbulYmd(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date instanceof Date ? date : new Date(date));
}

export function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function weekStartYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const delta = dow === 0 ? 6 : dow - 1;
  dt.setUTCDate(dt.getUTCDate() - delta);
  return dt.toISOString().slice(0, 10);
}

export function inYmdRange(ymd, start, end) {
  if (!ymd) return false;
  return ymd >= start && ymd <= end;
}

export function istanbulDayStart(ymd) {
  return new Date(`${ymd}T00:00:00${TR_OFFSET}`);
}

export function formatTrDate(value, withTime = false) {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-');
    return `${d}.${m}.${y}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(date);
}

export function ymdOf(value) {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return istanbulYmd(date);
}

/** İlk başarılı ham arşiv kaydı. Yeniden yükleme haftalık teslim sayısını artırmaz. Eski bağlantı sayılmaz. */
export function firstArchivedRawByTask(files) {
  const map = new Map();
  for (const file of files || []) {
    if (file.kind !== 'raw' || file.status !== 'stored' || file.source === 'legacy_link') continue;
    if (!file.uploaded_at) continue;
    const prev = map.get(file.task_id);
    if (!prev || String(file.uploaded_at) < String(prev.uploaded_at)) map.set(file.task_id, file);
  }
  return map;
}

export function buildWeeklyReport({ tasks, files, now = new Date() }) {
  const today = istanbulYmd(now);
  const weekStart = weekStartYmd(today);
  const weekEnd = addDaysYmd(weekStart, 6);
  const firstRaw = firstArchivedRawByTask(files);
  const teachers = new Map();

  const ensure = (task) => {
    const id = String(task.teacher_user_id || '');
    if (!teachers.has(id)) {
      teachers.set(id, {
        teacherUserId: id,
        teacherName: task.teacher_name || 'Öğretmen',
        lastShootDate: null,
        weeklyShoots: 0,
        weeklyDeliveries: 0
      });
    }
    return teachers.get(id);
  };

  let shoots = 0;
  let deliveries = 0;
  for (const task of tasks || []) {
    const row = ensure(task);
    const shoot = ymdOf(task.actual_shoot_date);
    if (shoot && (!row.lastShootDate || shoot > row.lastShootDate)) row.lastShootDate = shoot;
    if (inYmdRange(shoot, weekStart, weekEnd)) {
      shoots += 1;
      row.weeklyShoots += 1;
    }
    const raw = firstRaw.get(task.id);
    if (raw && inYmdRange(ymdOf(raw.uploaded_at), weekStart, weekEnd)) {
      deliveries += 1;
      row.weeklyDeliveries += 1;
    }
  }

  const storedEdits = (files || []).filter(
    (f) => f.kind === 'edit' && f.status === 'stored' && f.source !== 'legacy_link'
  );
  const waitingEdits = storedEdits.filter((f) => !f.open_for_comments && !f.is_current_approval);
  const openReviews = storedEdits.filter((f) => f.open_for_comments);
  const approved = storedEdits.filter((f) => f.is_current_approval);
  const overdue = (tasks || []).filter((task) => {
    if (task.status === 'onaylandi' || !task.due_at) return false;
    return new Date(task.due_at).getTime() < now.getTime();
  });

  return {
    weekStart,
    weekEnd,
    weekLabel: `${formatTrDate(weekStart)} – ${formatTrDate(weekEnd)}`,
    shoots,
    deliveries,
    waitingEdits: waitingEdits.length,
    openReviews: openReviews.length,
    approved: approved.length,
    overdue: overdue.length,
    teachers: [...teachers.values()].map((row) => ({
      ...row,
      lastShootLabel: formatTrDate(row.lastShootDate)
    }))
  };
}

export function buildDigest({ tasks, files, now = new Date() }) {
  const today = istanbulYmd(now);
  const since = istanbulDayStart(addDaysYmd(today, -1));
  const firstRaw = firstArchivedRawByTask(files);
  const taskById = new Map((tasks || []).map((task) => [task.id, task]));
  const newRaws = [];
  for (const file of files || []) {
    if (file.kind !== 'raw' || file.status !== 'stored' || file.source === 'legacy_link') continue;
    if (!file.uploaded_at || new Date(file.uploaded_at).getTime() < since.getTime()) continue;
    const task = taskById.get(file.task_id);
    const first = firstRaw.get(file.task_id);
    newRaws.push({
      taskId: file.task_id,
      fileId: file.id,
      version: file.version,
      idea: task?.idea || '',
      teacherName: task?.teacher_name || '',
      uploadedAt: file.uploaded_at,
      uploadedLabel: formatTrDate(file.uploaded_at, true),
      reupload: Boolean(first && first.id !== file.id)
    });
  }
  const waitingEdits = [];
  for (const file of files || []) {
    if (file.kind !== 'edit' || file.status !== 'stored' || file.source === 'legacy_link') continue;
    if (file.open_for_comments || file.is_current_approval) continue;
    const task = taskById.get(file.task_id);
    waitingEdits.push({
      taskId: file.task_id,
      fileId: file.id,
      version: file.version,
      idea: task?.idea || '',
      teacherName: task?.teacher_name || ''
    });
  }
  const overdue = (tasks || [])
    .filter((task) => task.status !== 'onaylandi' && task.due_at && new Date(task.due_at).getTime() < now.getTime())
    .map((task) => ({
      taskId: task.id,
      idea: task.idea || '',
      teacherName: task.teacher_name || '',
      dueLabel: formatTrDate(task.due_at, true),
      statusLabel: STATUS_LABEL[task.status] || task.status
    }));
  return { since: since.toISOString(), today, newRaws, waitingEdits, overdue };
}

export function digestHasContent(digest) {
  return Boolean(digest?.newRaws?.length || digest?.waitingEdits?.length || digest?.overdue?.length);
}

export function formatDigestText(digest) {
  const lines = [
    `Yeni ham teslim: ${digest.newRaws.length}`,
    ...digest.newRaws.map(
      (row) =>
        `· ${row.teacherName || 'Öğretmen'} — ${row.idea || 'Görev'} (${row.uploadedLabel})${row.reupload ? ' · yeniden yükleme' : ''}`
    ),
    `İnceleme bekleyen montaj: ${digest.waitingEdits.length}`,
    ...digest.waitingEdits.map(
      (row) => `· ${row.teacherName || 'Öğretmen'} — ${row.idea || 'Görev'} · sürüm ${row.version}`
    ),
    `Geciken iş: ${digest.overdue.length}`,
    ...digest.overdue.map(
      (row) => `· ${row.teacherName || 'Öğretmen'} — ${row.idea || 'Görev'} · son teslim ${row.dueLabel} · ${row.statusLabel}`
    )
  ];
  return lines.join('\n');
}

export function commentsForFile(comments, fileId) {
  return (comments || []).filter((row) => row.file_id === fileId || row.fileId === fileId);
}

export function safeClientId(value) {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) return '';
  return id;
}

export function clampChunk(bufferLength) {
  const n = Number(bufferLength) || 0;
  return n > 0 && n <= 2.5 * 1024 * 1024;
}

const TICKET_MS = 2 * 60 * 60 * 1000;

export function signMediaTicket(payload, secret) {
  const body = Buffer.from(
    JSON.stringify({
      sub: payload.sub,
      fileId: payload.fileId,
      purpose: payload.purpose || 'play',
      exp: Date.now() + TICKET_MS
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', String(secret || '')).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyMediaTicket(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', String(secret || '')).update(body).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.sub || !payload?.fileId || !payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
