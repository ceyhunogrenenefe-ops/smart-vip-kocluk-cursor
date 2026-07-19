/**
 * Öğretmen vitrin profili — tek kaynak (users.teacher → teacher_profiles).
 */
import { createHash, createHmac, randomUUID } from 'crypto';
import { supabaseAdmin } from './supabase-admin.js';

export const TEACHER_PROFILE_STATUSES = [
  'draft',
  'incomplete',
  'pending_approval',
  'published',
  'update_pending',
  'changes_pending', // legacy alias
  'rejected',
  'passive',
  'deleted'
];

/** Yayin sonrasi guncelleme kuyrugu (eski: changes_pending) */
export function isUpdatePendingStatus(status) {
  return status === 'update_pending' || status === 'changes_pending';
}

export function normalizeProfileStatus(status) {
  if (status === 'changes_pending') return 'update_pending';
  return status;
}

export const REQUIRED_PROFILE_KEYS = [
  'display_name',
  'photo',
  'branch',
  'short_bio',
  'full_bio',
  'education',
  'experience',
  'grade_levels',
  'video'
];

const EDITABLE_FIELDS = [
  'first_name',
  'last_name',
  'display_name',
  'title',
  'branch',
  'subjects',
  'short_bio',
  'full_bio',
  'city',
  'online_lessons',
  'university',
  'department',
  'graduation_year',
  'experience_years',
  'institutions_worked',
  'specialties',
  'grade_levels',
  'exam_areas',
  'teaching_approach',
  'educations',
  'experiences',
  'photo_path',
  'photo_url',
  'video_url',
  'video_path',
  'lesson_duration_min',
  'lesson_format',
  'availability_note',
  'availability_link',
  'accepting_students',
  'private_lesson_enabled'
];

export function slugifyTeacherName(name) {
  const map = {
    ç: 'c',
    ğ: 'g',
    ı: 'i',
    İ: 'i',
    ö: 'o',
    ş: 's',
    ü: 'u',
    Ç: 'c',
    Ğ: 'g',
    Ö: 'o',
    Ş: 's',
    Ü: 'u'
  };
  let s = String(name || '')
    .trim()
    .split('')
    .map((ch) => map[ch] || ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) s = 'ogretmen';
  return s.slice(0, 80);
}

export function splitDisplayName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
}

export function workingPayloadFromRow(row) {
  if (!row) return {};
  const out = {};
  for (const k of EDITABLE_FIELDS) {
    if (row[k] !== undefined) out[k] = row[k];
  }
  out.display_name =
    row.display_name ||
    [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
    null;
  return out;
}

export function missingRequiredFields(payload) {
  const p = payload || {};
  const missing = [];
  const display =
    String(p.display_name || '').trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  if (!display) missing.push('display_name');
  if (!String(p.photo_url || p.photo_path || '').trim()) missing.push('photo');
  if (!String(p.branch || '').trim()) missing.push('branch');
  if (!String(p.short_bio || '').trim()) missing.push('short_bio');
  if (!String(p.full_bio || '').trim()) missing.push('full_bio');
  const hasEdu =
    String(p.university || '').trim() ||
    (Array.isArray(p.educations) && p.educations.length > 0);
  if (!hasEdu) missing.push('education');
  const hasExp =
    (p.experience_years != null && Number(p.experience_years) >= 0 && String(p.experience_years) !== '') ||
    String(p.institutions_worked || '').trim() ||
    (Array.isArray(p.experiences) && p.experiences.length > 0);
  if (!hasExp) missing.push('experience');
  if (!Array.isArray(p.grade_levels) || !p.grade_levels.length) missing.push('grade_levels');
  if (!String(p.video_url || p.video_path || '').trim()) missing.push('video');
  return missing;
}

export function completionPercent(payload) {
  const missing = missingRequiredFields(payload);
  const done = REQUIRED_PROFILE_KEYS.length - missing.length;
  return Math.max(0, Math.min(100, Math.round((done / REQUIRED_PROFILE_KEYS.length) * 100)));
}

export function deriveStatusAfterEdit(row, pct) {
  if (!row) return 'incomplete';
  if (row.status === 'pending_approval') return 'pending_approval';
  if (row.status === 'published' || isUpdatePendingStatus(row.status)) return 'update_pending';
  if (row.status === 'rejected') return pct >= 100 ? 'draft' : 'incomplete';
  if (pct >= 100) return 'draft';
  return 'incomplete';
}

async function uniqueSlug(base, excludeUserId) {
  let candidate = base;
  for (let i = 0; i < 40; i++) {
    let q = supabaseAdmin
      .from('teacher_profiles')
      .select('id, user_id')
      .eq('slug', candidate)
      .is('deleted_at', null)
      .maybeSingle();
    const { data } = await q;
    if (!data || (excludeUserId && String(data.user_id) === String(excludeUserId))) {
      return candidate;
    }
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function ensureTeacherProfileForUser(user, { actorId } = {}) {
  if (!user?.id) throw new Error('user_required');
  const roles = Array.isArray(user.roles) ? user.roles : [];
  const role = String(user.role || '');
  const canHaveVitrine =
    role === 'teacher' ||
    role === 'coach' ||
    roles.includes('teacher') ||
    roles.includes('coach');
  if (!canHaveVitrine) return null;

  const { data: existing } = await supabaseAdmin
    .from('teacher_profiles')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return existing;

  const names = splitDisplayName(user.name);
  const baseSlug = slugifyTeacherName(user.name || user.email || 'ogretmen');
  const slug = await uniqueSlug(baseSlug, user.id);
  const payload = {
    user_id: user.id,
    slug,
    status: 'incomplete',
    first_name: names.first_name || null,
    last_name: names.last_name || null,
    display_name: String(user.name || '').trim() || null,
    completion_pct: 0,
    sync_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from('teacher_profiles')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    // race: unique user_id
    if (String(error.code) === '23505' || String(error.message || '').includes('duplicate')) {
      const { data: again } = await supabaseAdmin
        .from('teacher_profiles')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (again) return again;
    }
    throw error;
  }

  await writeAuditLog({
    profileId: data.id,
    actorUserId: actorId || user.id,
    action: 'profile_auto_created',
    previousValue: null,
    newValue: { user_id: user.id, slug, status: 'incomplete' }
  });

  return data;
}

export async function writeAuditLog({
  profileId,
  actorUserId,
  action,
  previousValue,
  newValue,
  ip
}) {
  try {
    await supabaseAdmin.from('teacher_profile_audit_logs').insert({
      profile_id: profileId || null,
      actor_user_id: actorUserId || null,
      action,
      previous_value: previousValue ?? null,
      new_value: newValue ?? null,
      ip: ip || null,
      created_at: new Date().toISOString()
    });
  } catch {
    /* audit best-effort */
  }
}

export function publicCardFromSnapshot(row) {
  const snap = row?.published_snapshot && typeof row.published_snapshot === 'object'
    ? row.published_snapshot
    : workingPayloadFromRow(row);
  return {
    integration_uuid: row.integration_uuid,
    slug: row.slug,
    name: snap.display_name || [snap.first_name, snap.last_name].filter(Boolean).join(' '),
    title: snap.title || null,
    branch: snap.branch || null,
    experience_years: snap.experience_years ?? null,
    grade_levels: snap.grade_levels || [],
    exam_areas: snap.exam_areas || [],
    specialties: snap.specialties || [],
    short_bio: snap.short_bio || null,
    photo_url: snap.photo_url || null,
    university: snap.university || null,
    online_lessons: snap.online_lessons !== false,
    accepting_students: snap.accepting_students !== false,
    private_lesson_enabled: row.private_lesson_enabled !== false
  };
}

export function publicDetailFromSnapshot(row) {
  const snap = row?.published_snapshot && typeof row.published_snapshot === 'object'
    ? row.published_snapshot
    : workingPayloadFromRow(row);
  return {
    ...publicCardFromSnapshot(row),
    full_bio: snap.full_bio || null,
    city: snap.city || null,
    department: snap.department || null,
    graduation_year: snap.graduation_year ?? null,
    institutions_worked: snap.institutions_worked || null,
    teaching_approach: snap.teaching_approach || null,
    educations: snap.educations || [],
    experiences: snap.experiences || [],
    subjects: snap.subjects || [],
    video_url: snap.video_url || null,
    lesson_duration_min: snap.lesson_duration_min ?? null,
    lesson_format: snap.lesson_format || 'online',
    availability_note: snap.availability_note || null,
    availability_link: snap.availability_link || null,
    approved_at: row.approved_at || null
  };
}

export function applyPatchToWorking(row, body) {
  const next = { ...workingPayloadFromRow(row) };
  for (const k of EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    let v = body[k];
    if (['subjects', 'specialties', 'grade_levels', 'exam_areas'].includes(k)) {
      v = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
    } else if (k === 'educations' || k === 'experiences') {
      v = Array.isArray(v) ? v : [];
    } else if (k === 'online_lessons' || k === 'accepting_students' || k === 'private_lesson_enabled') {
      v = Boolean(v);
    } else if (k === 'graduation_year' || k === 'experience_years' || k === 'lesson_duration_min') {
      v = v === '' || v == null ? null : Number(v);
      if (Number.isNaN(v)) v = null;
    } else if (typeof v === 'string') {
      v = v.trim();
    }
    next[k] = v;
  }
  if (!next.display_name) {
    next.display_name = [next.first_name, next.last_name].filter(Boolean).join(' ').trim() || null;
  }
  return next;
}

export async function pushSiteSync(profileRow, event = 'teacher_profile_upsert') {
  const url = String(process.env.SITE_TEACHERS_WEBHOOK_URL || '').trim();
  const secret = String(process.env.SITE_TEACHERS_WEBHOOK_SECRET || '').trim();
  if (!url || !secret) {
    await supabaseAdmin
      .from('teacher_profiles')
      .update({
        sync_status: 'pending',
        sync_error: 'SITE_TEACHERS_WEBHOOK_URL veya SECRET tanımlı değil',
        updated_at: new Date().toISOString()
      })
      .eq('id', profileRow.id);
    return { ok: false, skipped: true };
  }

  const requestId = randomUUID();
  const bodyObj = {
    event,
    request_id: requestId,
    integration_uuid: profileRow.integration_uuid,
    slug: profileRow.slug,
    status: profileRow.status,
    is_active: profileRow.is_active,
    private_lesson_enabled: profileRow.private_lesson_enabled,
    teacher: profileRow.status === 'published' && profileRow.is_active
      ? publicDetailFromSnapshot(profileRow)
      : null,
    timestamp: Date.now()
  };
  const raw = JSON.stringify(bodyObj);
  const signature = createHmac('sha256', secret).update(raw).digest('hex');

  let httpStatus = 0;
  let responseBody = '';
  let errMsg = null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret,
        'x-signature': signature,
        'x-request-id': requestId
      },
      body: raw
    });
    httpStatus = res.status;
    responseBody = (await res.text()).slice(0, 2000);
    if (!res.ok) throw new Error(`http_${res.status}`);
    await supabaseAdmin
      .from('teacher_profiles')
      .update({
        sync_status: 'synced',
        sync_error: null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', profileRow.id);
    await supabaseAdmin.from('teacher_sync_logs').insert({
      profile_id: profileRow.id,
      event,
      request_id: requestId,
      status: 'success',
      http_status: httpStatus,
      response_body: responseBody,
      created_at: new Date().toISOString()
    });
    return { ok: true };
  } catch (e) {
    errMsg = String(e?.message || e);
    await supabaseAdmin
      .from('teacher_profiles')
      .update({
        sync_status: 'failed',
        sync_error: errMsg.slice(0, 500),
        updated_at: new Date().toISOString()
      })
      .eq('id', profileRow.id);
    await supabaseAdmin.from('teacher_sync_logs').insert({
      profile_id: profileRow.id,
      event,
      request_id: requestId,
      status: 'failed',
      http_status: httpStatus || null,
      response_body: responseBody || null,
      error: errMsg.slice(0, 1000),
      created_at: new Date().toISOString()
    });
    return { ok: false, error: errMsg };
  }
}

export { EDITABLE_FIELDS };

export function hashIdempotency(key) {
  return createHash('sha256').update(String(key)).digest('hex').slice(0, 32);
}
