/**
 * Reklam Videoları — saf iş kuralları (veritabanı / ağ yok, test edilebilir).
 *
 * Tarih kuralları:
 * - Türkiye 2016'dan beri sabit UTC+03:00 (yaz saati yok). Hafta pazartesi 00:00 – pazar 23:59.
 * - Çekim sayısı `actual_shoot_date`, ilk teslim `first_submitted_at`, onay `approved_at`,
 *   planlanan `planned_shoot_at` üzerinden sayılır. Her görev en fazla bir video sayılır;
 *   düzeltme yüklemeleri sayaçları artırmaz.
 */

export const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const STATUSES = ['planned', 'shot', 'submitted', 'revision_requested', 'approved'];

export const STATUS_LABELS = {
  planned: 'Planlandı',
  shot: 'Çekildi',
  submitted: 'Teslim Edildi',
  revision_requested: 'Düzeltme İstendi',
  approved: 'Onaylandı',
  overdue: 'Gecikti'
};

/** Teslim bekleyen (ilk teslimi yapılmamış) durumlar */
const PRE_SUBMIT = new Set(['planned', 'shot']);

export const VIDEO_EXTENSIONS = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime'
};
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

function toMs(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime();
}

/** UTC anını Türkiye takvim gününe çevirir: 'YYYY-MM-DD' */
export function trDateKey(at = new Date()) {
  const ms = toMs(at);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + TR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Türkiye saatiyle 'HH:MM' */
export function trTimeKey(at = new Date()) {
  const ms = toMs(at);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + TR_OFFSET_MS).toISOString().slice(11, 16);
}

/** ISO hafta günü (TR): 1 = Pazartesi … 7 = Pazar */
export function trIsoWeekday(at = new Date()) {
  const d = new Date(toMs(at) + TR_OFFSET_MS).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isDateKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** 'YYYY-MM-DD' (TR günü) başlangıcının UTC ms değeri */
export function trDayStartMs(dateKey) {
  return Date.parse(`${dateKey}T00:00:00Z`) - TR_OFFSET_MS;
}

export function addDaysKey(dateKey, n) {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Verilen günün içinde bulunduğu pazartesi–pazar haftası */
export function trWeekRange(dateKeyOrDate = new Date()) {
  const key = isDateKey(dateKeyOrDate) ? dateKeyOrDate : trDateKey(dateKeyOrDate);
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 pazar
  const back = dow === 0 ? 6 : dow - 1;
  const startKey = addDaysKey(key, -back);
  const endKey = addDaysKey(startKey, 6);
  return {
    startKey,
    endKey,
    startMs: trDayStartMs(startKey),
    endMs: trDayStartMs(addDaysKey(startKey, 7))
  };
}

function inRangeMs(v, startMs, endMs) {
  const ms = toMs(v);
  return Number.isFinite(ms) && ms >= startMs && ms < endMs;
}

function dateKeyInRange(key, startKey, endKey) {
  return isDateKey(key) && key >= startKey && key <= endKey;
}

/** Son teslim geçti ve ilk teslim yapılmadıysa "Gecikti" */
export function isOverdue(task, now = new Date()) {
  if (!task || task.first_submitted_at) return false;
  if (!PRE_SUBMIT.has(task.status)) return false;
  const due = toMs(task.due_at);
  return Number.isFinite(due) && due <= toMs(now);
}

export function decorateTask(task, now = new Date()) {
  const overdue = isOverdue(task, now);
  return {
    ...task,
    is_overdue: overdue,
    status_label: STATUS_LABELS[task.status] || task.status,
    display_status: overdue ? 'overdue' : task.status
  };
}

// ---------------------------------------------------------------- geçişler

export function canMarkShot(task) {
  return Boolean(task) && task.status !== 'approved';
}

export function canSubmit(task) {
  return Boolean(task) && ['planned', 'shot', 'submitted', 'revision_requested'].includes(task.status);
}

export function canReview(task) {
  return Boolean(task) && task.status === 'submitted';
}

/** "Çektim" sonrası yeni durum: teslim öncesiyse 'shot', değilse aynı kalır */
export function statusAfterShot(task) {
  return task.status === 'planned' ? 'shot' : task.status;
}

/**
 * Teslim kaydından sonra görevde güncellenecek alanlar.
 * İlk teslim zamanı yalnız bir kez yazılır; düzeltmeler yalnız son yüklemeyi günceller.
 */
export function taskPatchForSubmission(task, { submissionId, at, actualShootDate }) {
  const iso = new Date(toMs(at)).toISOString();
  const patch = {
    status: 'submitted',
    last_uploaded_at: iso,
    current_submission_id: submissionId,
    updated_at: iso
  };
  if (!task.first_submitted_at) patch.first_submitted_at = iso;
  if (actualShootDate && actualShootDate !== task.actual_shoot_date) {
    patch.actual_shoot_date = actualShootDate;
    patch.actual_shoot_recorded_at = iso;
  }
  return patch;
}

// ---------------------------------------------------------------- doğrulama

function cleanText(v, max) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
}

function cleanIso(v) {
  if (v === null || v === undefined || v === '') return null;
  const ms = toMs(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

export function isHttpsUrl(v) {
  try {
    const u = new URL(String(v || '').trim());
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Görev alanlarını doğrular. `partial` güncellemede yalnız gelen alanları ele alır.
 * Dönüş: { ok, value, errors }
 */
export function validateTaskFields(body = {}, { partial = false } = {}) {
  const errors = [];
  const value = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has('title')) {
    const t = cleanText(body.title, 200);
    if (!t) errors.push('Video başlığı gerekli');
    else value.title = t;
  }
  for (const [k, max] of [
    ['idea', 4000],
    ['theme', 200],
    ['shoot_note', 8000]
  ]) {
    if (!partial || has(k)) value[k] = cleanText(body[k], max);
  }
  if (!partial || has('reference_url')) {
    const u = cleanText(body.reference_url, 2000);
    if (u && !isHttpsUrl(u)) errors.push('Örnek video bağlantısı https:// ile başlamalı');
    else value.reference_url = u;
  }
  for (const k of ['planned_shoot_at', 'due_at']) {
    if (!partial || has(k)) {
      const v = cleanIso(body[k]);
      if (v === undefined) errors.push(`${k === 'due_at' ? 'Son teslim' : 'Planlanan çekim'} tarihi geçersiz`);
      else value[k] = v;
    }
  }
  if (!partial && !value.due_at) errors.push('Son teslim günü ve saati gerekli');
  if (value.planned_shoot_at && value.due_at && toMs(value.planned_shoot_at) > toMs(value.due_at)) {
    errors.push('Planlanan çekim, son teslimden sonra olamaz');
  }
  return { ok: errors.length === 0, value, errors };
}

/** Çekim tarihi: geçerli gün, gelecekte değil (TR) */
export function validateShootDate(dateKey, now = new Date()) {
  if (!isDateKey(dateKey)) return 'Çekim tarihi geçersiz';
  if (dateKey > trDateKey(now)) return 'Çekim tarihi bugünden ileri olamaz';
  return null;
}

/** MP4 / MOV kontrolü; telefonlarda boş gelen MIME uzantıdan türetilir */
export function normalizeVideoFile({ name, mime, size }) {
  const fileName = String(name || '').trim().slice(0, 240);
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const byExt = VIDEO_EXTENSIONS[ext];
  if (!fileName || !byExt) return { ok: false, error: 'Yalnız MP4 veya MOV video yüklenebilir' };
  const m = String(mime || '').toLowerCase().trim();
  const mimeType = m === 'video/mp4' || m === 'video/quicktime' ? m : byExt;
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, error: 'Dosya boyutu okunamadı' };
  if (bytes > MAX_VIDEO_BYTES) return { ok: false, error: 'Dosya 10 GB sınırını aşıyor' };
  return { ok: true, fileName, mimeType, size: Math.floor(bytes) };
}

/** Drive dosya kimliği (file/d/ID, open?id=ID, uc?id=ID) */
export function parseDriveFileId(url) {
  try {
    const u = new URL(String(url || '').trim());
    const host = u.hostname.toLowerCase();
    if (host !== 'drive.google.com' && host !== 'docs.google.com') return null;
    const m = u.pathname.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    const id = u.searchParams.get('id');
    return id && /^[a-zA-Z0-9_-]{10,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Öğretmenin elle eklediği Drive bağlantısı: yalnız Drive dosya bağlantısı */
export function validateDriveLink(url) {
  const s = String(url || '').trim();
  if (!isHttpsUrl(s)) return { ok: false, error: 'Geçerli bir https:// Drive bağlantısı girin' };
  const id = parseDriveFileId(s);
  if (!id) {
    if (/\/folders\//.test(s)) return { ok: false, error: 'Klasör değil, videonun kendi Drive bağlantısını ekleyin' };
    return { ok: false, error: 'Bağlantı bir Google Drive video dosyası olmalı' };
  }
  return { ok: true, url: s, fileId: id };
}

// ---------------------------------------------------------------- yetki

export function roleSetHas(set, ...roles) {
  return roles.some((r) => set.has(r));
}

/**
 * Kullanıcının modüldeki yetkileri.
 * - manager: yönetici / süper yönetici — tüm görevleri yönetir
 * - editor: ayarlardaki kurgu ekibi listesinde — açar, inceler, durum günceller
 * - teacher: yalnız kendisine atanmış görevler
 */
export function moduleAccess(actor, roleSet, settings) {
  const manager = roleSetHas(roleSet, 'super_admin', 'admin');
  const editors = Array.isArray(settings?.editor_user_ids) ? settings.editor_user_ids.map(String) : [];
  const editor = !manager && editors.includes(String(actor?.sub || ''));
  return { manager, editor, reviewer: manager || editor };
}

/** Görev bu kullanıcıya görünür mü? (kurum + rol) */
export function canSeeTask(task, actor, access) {
  if (!task || task.deleted_at) return false;
  if (String(task.teacher_id) === String(actor?.sub)) return true;
  if (!access.reviewer) return false;
  if (String(actor?.role) === 'super_admin' && !actor?.institution_id) return true;
  return String(task.institution_id || '') === String(actor?.institution_id || '');
}

/**
 * Öğretmen kendi görevini görürken başka öğretmen / iç alanlar sızmasın.
 * (Kendi inceleme notları görünür.)
 */
export function teacherSafeTask(task) {
  const { created_by, approved_by, review_note_by, batch_id, ...rest } = task;
  return rest;
}

// ---------------------------------------------------------------- raporlar

/**
 * Öğretmen bazında haftalık özet.
 * tasks: silinmemiş görevler; teachers: Map(id -> {name})
 */
export function computeTeacherStats(tasks, { weekKey, now = new Date(), teachers = new Map(), upcomingDays = 7 } = {}) {
  const wk = trWeekRange(weekKey || now);
  const nowMs = toMs(now);
  const upcomingEnd = nowMs + upcomingDays * DAY_MS;
  const by = new Map();
  const row = (id) => {
    const k = String(id);
    if (!by.has(k)) {
      by.set(k, {
        teacher_id: k,
        teacher_name: teachers.get(k)?.name || 'Öğretmen',
        last_shoot_date: null,
        week: { planned: 0, shot: 0, first_submitted: 0, approved: 0 },
        shot_awaiting_submission: [],
        awaiting_review: [],
        revision_requested: [],
        overdue: [],
        upcoming_shoots: [],
        total_tasks: 0
      });
    }
    return by.get(k);
  };
  for (const id of teachers.keys()) row(id);

  const brief = (t) => ({
    id: t.id,
    title: t.title,
    due_at: t.due_at,
    planned_shoot_at: t.planned_shoot_at,
    actual_shoot_date: t.actual_shoot_date,
    last_uploaded_at: t.last_uploaded_at,
    status: t.status
  });

  for (const t of tasks) {
    if (t.deleted_at) continue;
    const r = row(t.teacher_id);
    r.total_tasks += 1;
    if (t.actual_shoot_date && (!r.last_shoot_date || t.actual_shoot_date > r.last_shoot_date)) {
      r.last_shoot_date = t.actual_shoot_date;
    }
    if (inRangeMs(t.planned_shoot_at, wk.startMs, wk.endMs)) r.week.planned += 1;
    if (dateKeyInRange(t.actual_shoot_date, wk.startKey, wk.endKey)) r.week.shot += 1;
    if (inRangeMs(t.first_submitted_at, wk.startMs, wk.endMs)) r.week.first_submitted += 1;
    if (inRangeMs(t.approved_at, wk.startMs, wk.endMs)) r.week.approved += 1;

    if (t.actual_shoot_date && !t.first_submitted_at && PRE_SUBMIT.has(t.status)) r.shot_awaiting_submission.push(brief(t));
    if (t.status === 'submitted') r.awaiting_review.push(brief(t));
    if (t.status === 'revision_requested') r.revision_requested.push(brief(t));
    if (isOverdue(t, now)) r.overdue.push(brief(t));
    const p = toMs(t.planned_shoot_at);
    if (t.status === 'planned' && !t.actual_shoot_date && Number.isFinite(p) && p >= nowMs && p < upcomingEnd) {
      r.upcoming_shoots.push(brief(t));
    }
  }

  const rows = [...by.values()].sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, 'tr'));
  for (const r of rows) r.upcoming_shoots.sort((a, b) => toMs(a.planned_shoot_at) - toMs(b.planned_shoot_at));
  const totals = rows.reduce(
    (acc, r) => {
      for (const k of Object.keys(acc.week)) acc.week[k] += r.week[k];
      acc.shot_awaiting_submission += r.shot_awaiting_submission.length;
      acc.awaiting_review += r.awaiting_review.length;
      acc.revision_requested += r.revision_requested.length;
      acc.overdue += r.overdue.length;
      acc.upcoming_shoots += r.upcoming_shoots.length;
      acc.videos += r.total_tasks;
      return acc;
    },
    {
      week: { planned: 0, shot: 0, first_submitted: 0, approved: 0 },
      shot_awaiting_submission: 0,
      awaiting_review: 0,
      revision_requested: 0,
      overdue: 0,
      upcoming_shoots: 0,
      videos: 0
    }
  );
  return { week: { start: wk.startKey, end: wk.endKey }, rows, totals };
}

/**
 * Günlük özet: o gün teslim edilenler (ilk teslim veya düzeltme yüklemesi),
 * inceleme bekleyenler, gecikenler, ertesi günün planlanan çekimleri.
 */
export function buildDailySummary(tasks, { dayKey, now = new Date(), teachers = new Map() } = {}) {
  const key = isDateKey(dayKey) ? dayKey : trDateKey(now);
  const s = trDayStartMs(key);
  const e = s + DAY_MS;
  const name = (id) => teachers.get(String(id))?.name || 'Öğretmen';
  const brief = (t) => ({
    id: t.id,
    title: t.title,
    teacher_id: t.teacher_id,
    teacher_name: name(t.teacher_id),
    due_at: t.due_at,
    planned_shoot_at: t.planned_shoot_at,
    last_uploaded_at: t.last_uploaded_at,
    is_revision: Boolean(t.first_submitted_at && !inRangeMs(t.first_submitted_at, s, e))
  });
  const live = tasks.filter((t) => !t.deleted_at);
  const delivered = live.filter((t) => inRangeMs(t.last_uploaded_at, s, e)).map(brief);
  const awaitingReview = live.filter((t) => t.status === 'submitted').map(brief);
  const overdue = live.filter((t) => isOverdue(t, now)).map(brief);
  const tomorrow = live
    .filter((t) => t.status === 'planned' && inRangeMs(t.planned_shoot_at, e, e + DAY_MS))
    .sort((a, b) => toMs(a.planned_shoot_at) - toMs(b.planned_shoot_at))
    .map(brief);
  return { date: key, tomorrow: addDaysKey(key, 1), delivered, awaiting_review: awaitingReview, overdue, tomorrow_shoots: tomorrow };
}

export function formatTrDateTime(v) {
  const ms = toMs(v);
  if (!Number.isFinite(ms)) return '';
  const iso = new Date(ms + TR_OFFSET_MS).toISOString();
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

export function dailySummaryText(sum) {
  const lines = [];
  const list = (arr, fmt) => arr.slice(0, 8).map((t) => `• ${fmt(t)}`).join('\n') + (arr.length > 8 ? `\n… +${arr.length - 8}` : '');
  lines.push(`Bugün teslim edilen: ${sum.delivered.length}`);
  if (sum.delivered.length) lines.push(list(sum.delivered, (t) => `${t.teacher_name} — ${t.title}${t.is_revision ? ' (düzeltme)' : ''}`));
  lines.push(`İnceleme bekleyen: ${sum.awaiting_review.length}`);
  if (sum.awaiting_review.length) lines.push(list(sum.awaiting_review, (t) => `${t.teacher_name} — ${t.title}`));
  lines.push(`Geciken: ${sum.overdue.length}`);
  if (sum.overdue.length) lines.push(list(sum.overdue, (t) => `${t.teacher_name} — ${t.title} (son teslim ${formatTrDateTime(t.due_at)})`));
  lines.push(`Yarın planlanan çekim: ${sum.tomorrow_shoots.length}`);
  if (sum.tomorrow_shoots.length) lines.push(list(sum.tomorrow_shoots, (t) => `${formatTrDateTime(t.planned_shoot_at).slice(11)} ${t.teacher_name} — ${t.title}`));
  return lines.join('\n');
}

// ---------------------------------------------------------------- bildirim zamanlaması

/**
 * Cron'da gönderilecek öğretmen hatırlatmaları. Olay anahtarı son teslim zamanını içerir:
 * tarih değişirse yeni hatırlatma doğar, aynı tarih için ikinci kez gitmez.
 */
export function dueNotificationCandidates(tasks, now = new Date()) {
  const nowMs = toMs(now);
  const out = [];
  for (const t of tasks) {
    if (t.deleted_at || t.first_submitted_at || !PRE_SUBMIT.has(t.status)) continue;
    const due = toMs(t.due_at);
    if (!Number.isFinite(due)) continue;
    const dueIso = new Date(due).toISOString();
    if (due <= nowMs) {
      out.push({ kind: 'overdue', task: t, eventKey: `overdue:${t.id}:${dueIso}` });
    } else if (due - nowMs <= DAY_MS) {
      out.push({ kind: 'due_24h', task: t, eventKey: `due24h:${t.id}:${dueIso}` });
    }
  }
  return out;
}

export const DEFAULT_SETTINGS = {
  editor_user_ids: [],
  drive_upload_enabled: false,
  drive_shared_drive_id: null,
  drive_folder_id: null,
  link_folder_url: null,
  daily_summary_enabled: true,
  daily_summary_time: '18:00',
  daily_summary_days: [1, 2, 3, 4, 5]
};

/** Günlük özet şimdi gönderilmeli mi? (aynı gün tekrarını log engeller) */
export function dailySummaryDue(settings, now = new Date()) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  if (!s.daily_summary_enabled) return { due: false, dayKey: trDateKey(now) };
  const days = Array.isArray(s.daily_summary_days) && s.daily_summary_days.length ? s.daily_summary_days.map(Number) : [1, 2, 3, 4, 5];
  const dayKey = trDateKey(now);
  const due = days.includes(trIsoWeekday(now)) && trTimeKey(now) >= String(s.daily_summary_time || '18:00');
  return { due, dayKey };
}

export function validateSettings(body = {}) {
  const errors = [];
  const v = {};
  if ('editor_user_ids' in body) {
    const ids = Array.isArray(body.editor_user_ids) ? body.editor_user_ids : [];
    v.editor_user_ids = [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 100);
  }
  if ('drive_upload_enabled' in body) v.drive_upload_enabled = Boolean(body.drive_upload_enabled);
  for (const k of ['drive_shared_drive_id', 'drive_folder_id']) {
    if (k in body) {
      const s = String(body[k] || '').trim();
      if (s && !/^[a-zA-Z0-9_-]{5,}$/.test(s)) errors.push(`${k === 'drive_folder_id' ? 'Klasör' : 'Paylaşılan Drive'} kimliği geçersiz`);
      else v[k] = s || null;
    }
  }
  if ('link_folder_url' in body) {
    const s = String(body.link_folder_url || '').trim();
    if (s && !isHttpsUrl(s)) errors.push('Klasör bağlantısı https:// ile başlamalı');
    else v.link_folder_url = s || null;
  }
  if ('daily_summary_enabled' in body) v.daily_summary_enabled = Boolean(body.daily_summary_enabled);
  if ('daily_summary_time' in body) {
    const s = String(body.daily_summary_time || '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) errors.push('Özet saati SS:DD biçiminde olmalı');
    else v.daily_summary_time = s;
  }
  if ('daily_summary_days' in body) {
    const d = (Array.isArray(body.daily_summary_days) ? body.daily_summary_days : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
    v.daily_summary_days = [...new Set(d)].sort();
  }
  return { ok: errors.length === 0, value: v, errors };
}
