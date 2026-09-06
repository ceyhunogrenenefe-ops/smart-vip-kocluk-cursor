/**
 * Öğretmen değerlendirme — ortak yardımcılar
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

export function snippetComment(raw, max = 2000) {
  const s = String(raw || '').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function clampRating(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > 5) return null;
  return r;
}


/**
 * Sitede görünen isim: "Ad Soyad" → "Ad S."
 * Tek kelimeyse olduğu gibi bırakır.
 */
export function formatPublicReviewerName(parts = {}, fallback = 'Öğrenci') {
  const first = String(parts.first_name || parts.firstName || '').trim();
  const last = String(parts.last_name || parts.lastName || '').trim();
  if (first && last) {
    const initial = last.charAt(0).toLocaleUpperCase('tr-TR');
    return `${first} ${initial}.`.slice(0, 120);
  }

  const raw = String(parts.full_name || parts.fullName || parts.name || '').trim();
  if (!raw) return fallback;
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return tokens[0].slice(0, 120);
  const lastTok = tokens[tokens.length - 1];
  const firstToks = tokens.slice(0, -1).join(' ');
  const initial = lastTok.charAt(0).toLocaleUpperCase('tr-TR');
  if (!initial) return firstToks.slice(0, 120);
  return `${firstToks} ${initial}.`.slice(0, 120);
}


function isGenericReviewerLabel(value) {
  return /^(öğrenci|ogrenci|veli)$/i.test(String(value || '').trim());
}

async function enrichGenericReviewerNames(mapped) {
  const list = Array.isArray(mapped) ? mapped : [];
  const need = list.filter(
    (m) => m && m.student_id && isGenericReviewerLabel(m.reviewer_name)
  );
  if (!need.length) return list;

  const ids = [...new Set(need.map((m) => String(m.student_id)))];
  const nameById = new Map();
  const { data: studs } = await supabaseAdmin
    .from('students')
    .select('id, name')
    .in('id', ids);
  for (const s of studs || []) {
    const raw = String(s.name || '').trim();
    if (!raw || isGenericReviewerLabel(raw)) continue;
    nameById.set(
      String(s.id),
      formatPublicReviewerName({ name: raw, full_name: raw }, 'Öğrenci')
    );
  }
  for (const m of list) {
    if (!m || !isGenericReviewerLabel(m.reviewer_name)) continue;
    const fixed = nameById.get(String(m.student_id || ''));
    if (fixed) m.reviewer_name = fixed;
  }
  return list;
}

/**
 * students tablosunda asıl alan genelde `name`.
 * full_name / first_name / last_name olmayabilir — kolon hatasında sessizce name'e düş.
 * Önemli: olmayan kolonları aynı select'te istemek tüm sorguyu düşürür → "Öğrenci" fallback.
 */
export async function loadStudentPublicName(studentId, fallback = 'Öğrenci') {
  const sid = String(studentId || '').trim();
  if (!sid) return fallback;

  let name = '';
  let userId = null;

  // 1) En güvenli: yalnızca `name`
  {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('name')
      .eq('id', sid)
      .maybeSingle();
    if (!error && data) {
      name = String(data.name || '').trim();
    }
  }
  if (isGenericReviewerLabel(name)) name = '';

  // 2) Opsiyonel zengin kolonlar (yoksa hata yutulur)
  if (!name) {
    for (const cols of ['full_name, first_name, last_name', 'full_name']) {
      const { data, error } = await supabaseAdmin
        .from('students')
        .select(cols)
        .eq('id', sid)
        .maybeSingle();
      if (error || !data) continue;
      name =
        String(data.full_name || '').trim() ||
        [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
      if (name && !isGenericReviewerLabel(name)) {
        return formatPublicReviewerName(
          {
            full_name: data.full_name,
            first_name: data.first_name,
            last_name: data.last_name,
            name
          },
          fallback
        );
      }
      name = '';
    }
  }

  // 3) users.name yedek — user_id / platform_user_id ayrı denemeler
  if (!name) {
    for (const cols of ['user_id, platform_user_id', 'user_id']) {
      const { data, error } = await supabaseAdmin
        .from('students')
        .select(cols)
        .eq('id', sid)
        .maybeSingle();
      if (error || !data) continue;
      userId = data.user_id || data.platform_user_id || null;
      if (userId) break;
    }
    if (userId) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('name')
        .eq('id', String(userId))
        .maybeSingle();
      name = String(user?.name || '').trim();
      if (isGenericReviewerLabel(name)) name = '';
    }
  }

  return formatPublicReviewerName({ name, full_name: name }, fallback);
}



function isApprovedPublicFilter() {
  // PostgREST: is_public + (approved OR legacy null status)
  return {
    is_public: true
  };
}

export async function refreshTeacherReviewStats(teacherId) {
  const tid = String(teacherId || '').trim();
  if (!tid) return { average_rating: null, total_reviews: 0 };

  let q = supabaseAdmin
    .from('teacher_reviews')
    .select('rating, moderation_status')
    .eq('teacher_id', tid)
    .eq('is_public', true);

  const { data, error } = await q;
  if (error) {
    if (/moderation_status|column/i.test(error.message || '')) {
      const legacy = await supabaseAdmin
        .from('teacher_reviews')
        .select('rating')
        .eq('teacher_id', tid)
        .eq('is_public', true);
      if (legacy.error) throw legacy.error;
      const ratings = (legacy.data || []).map((r) => Number(r.rating)).filter((n) => n >= 1 && n <= 5);
      const total = ratings.length;
      const average = total
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / total) * 100) / 100
        : null;
      await supabaseAdmin
        .from('teacher_profiles')
        .update({
          average_rating: average,
          total_reviews: total,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', tid);
      return { average_rating: average, total_reviews: total };
    }
    throw error;
  }

  const ratings = (data || [])
    .filter((r) => {
      const st = String(r.moderation_status || 'approved').toLowerCase();
      return st === 'approved' || !r.moderation_status;
    })
    .map((r) => Number(r.rating))
    .filter((n) => n >= 1 && n <= 5);
  const total = ratings.length;
  const average = total
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / total) * 100) / 100
    : null;

  const { error: upErr } = await supabaseAdmin
    .from('teacher_profiles')
    .update({
      average_rating: average,
      total_reviews: total,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', tid);
  if (upErr && !/average_rating|total_reviews|column/i.test(upErr.message || '')) {
    console.warn('[teacher-reviews] stats update:', errorMessage(upErr));
  }

  return { average_rating: average, total_reviews: total };
}

export async function refreshTeacherCompletedLessonCount(teacherId) {
  const tid = String(teacherId || '').trim();
  if (!tid) return 0;

  // Özel ders (1:1) + grup canlı ders (class_sessions) tamamlananlar
  let privateCount = 0;
  {
    const { count, error } = await supabaseAdmin
      .from('teacher_lessons')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', tid)
      .eq('status', 'completed');
    if (error) {
      console.warn('[teacher-reviews] private lesson count:', errorMessage(error));
    } else {
      privateCount = Number(count) || 0;
    }
  }

  let groupCount = 0;
  {
    const { count, error } = await supabaseAdmin
      .from('class_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', tid)
      .eq('status', 'completed');
    if (error) {
      // tablo/kolon yoksa yut — özel ders sayısı yine yazılsın
      if (!/class_sessions|schema cache|does not exist|column/i.test(error.message || '')) {
        console.warn('[teacher-reviews] group lesson count:', errorMessage(error));
      }
    } else {
      groupCount = Number(count) || 0;
    }
  }

  const n = privateCount + groupCount;
  const { error: upErr } = await supabaseAdmin
    .from('teacher_profiles')
    .update({
      completed_lessons_count: n,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', tid);
  if (upErr && !/completed_lessons_count|column/i.test(upErr.message || '')) {
    console.warn('[teacher-reviews] lesson count update:', errorMessage(upErr));
  }
  return n;
}

export function mapReviewToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    teacher_id: row.teacher_id,
    student_id: row.student_id || null,
    lesson_id: row.lesson_id || null,
    class_session_id: row.class_session_id || null,
    reviewer_type: row.reviewer_type,
    reviewer_name: row.reviewer_name,
    rating: row.rating,
    comment: row.comment || null,
    is_public: row.is_public !== false,
    moderation_status: row.moderation_status || (row.is_public ? 'approved' : 'pending'),
    approved_at: row.approved_at || null,
    created_at: row.created_at
  };
}

export async function listPublicTeacherReviews(teacherId, { limit = 50 } = {}) {
  const tid = String(teacherId || '').trim();
  if (!tid) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const { data, error } = await supabaseAdmin
    .from('teacher_reviews')
    .select(
      'id, teacher_id, student_id, lesson_id, reviewer_type, reviewer_name, rating, comment, is_public, moderation_status, approved_at, created_at'
    )
    .eq('teacher_id', tid)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(lim);
  if (error) {
    if (/moderation_status|column/i.test(error.message || '')) {
      const legacy = await supabaseAdmin
        .from('teacher_reviews')
        .select(
          'id, teacher_id, student_id, lesson_id, reviewer_type, reviewer_name, rating, comment, is_public, created_at'
        )
        .eq('teacher_id', tid)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(lim);
      if (legacy.error) {
        if (/teacher_reviews|schema cache|does not exist/i.test(legacy.error.message || '')) return [];
        throw legacy.error;
      }
      return await enrichGenericReviewerNames((legacy.data || []).map(mapReviewToApi));
    }
    if (/teacher_reviews|schema cache|does not exist/i.test(error.message || '')) return [];
    throw error;
  }
  const mapped = (data || [])
    .filter((r) => {
      const st = String(r.moderation_status || 'approved').toLowerCase();
      return st === 'approved';
    })
    .map(mapReviewToApi);

  return enrichGenericReviewerNames(mapped);
}

export async function listPendingTeacherReviews({ limit = 100 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const { data, error } = await supabaseAdmin
    .from('teacher_reviews')
    .select(
      'id, teacher_id, student_id, lesson_id, class_session_id, reviewer_type, reviewer_name, rating, comment, is_public, moderation_status, created_at'
    )
    .eq('moderation_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(lim);
  if (error) throw error;
  const rows = data || [];
  const out = [];
  for (const row of rows) {
    const mapped = mapReviewToApi(row);
    const generic = isGenericReviewerLabel(mapped?.reviewer_name);
    if (mapped && (generic || String(row.reviewer_type || '').toUpperCase() === 'STUDENT')) {
      mapped.reviewer_name = await resolveDisplayNameForReview(row);
    }
    out.push(mapped);
  }
  return out;
}

async function resolveDisplayNameForReview(row) {
  if (row.reviewer_type === 'PARENT' && row.student_id) {
    const { data: stud } = await supabaseAdmin
      .from('students')
      .select('parent_name, name')
      .eq('id', row.student_id)
      .maybeSingle();
    const parent = String(stud?.parent_name || '').trim();
    if (parent) return parent.slice(0, 120);
  }
  if (row.student_id) {
    return loadStudentPublicName(
      row.student_id,
      row.reviewer_type === 'PARENT' ? 'Veli' : 'Öğrenci'
    );
  }
  const current = String(row.reviewer_name || '').trim();
  const generic = isGenericReviewerLabel(current);
  if (current && !generic) {
    if (String(row.reviewer_type || '').toUpperCase() === 'STUDENT') {
      return formatPublicReviewerName({ full_name: current, name: current }, 'Öğrenci');
    }
    return current.slice(0, 120);
  }
  return current || (row.reviewer_type === 'PARENT' ? 'Veli' : 'Öğrenci');
}

export async function approveTeacherReview(reviewId, actorId) {
  const id = String(reviewId || '').trim();
  if (!id) throw new Error('review_id_required');

  const { data: row, error } = await supabaseAdmin
    .from('teacher_reviews')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('not_found');

  const reviewerName = await resolveDisplayNameForReview(row);
  const { data: saved, error: upErr } = await supabaseAdmin
    .from('teacher_reviews')
    .update({
      moderation_status: 'approved',
      is_public: true,
      reviewer_name: reviewerName,
      approved_at: new Date().toISOString(),
      approved_by: actorId || null
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (upErr) throw upErr;

  const stats = await refreshTeacherReviewStats(row.teacher_id);
  try {
    await refreshTeacherCompletedLessonCount(row.teacher_id);
  } catch (e) {
    console.warn('[teacher-reviews] lesson count on approve:', errorMessage(e));
  }
  return { review: mapReviewToApi(saved), stats };
}

export async function rejectTeacherReview(reviewId, actorId) {
  const id = String(reviewId || '').trim();
  if (!id) throw new Error('review_id_required');

  const { data: row, error } = await supabaseAdmin
    .from('teacher_reviews')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('not_found');

  const { data: saved, error: upErr } = await supabaseAdmin
    .from('teacher_reviews')
    .update({
      moderation_status: 'rejected',
      is_public: false,
      approved_at: null,
      approved_by: actorId || null
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (upErr) throw upErr;

  const stats = await refreshTeacherReviewStats(row.teacher_id);
  return { review: mapReviewToApi(saved), stats };
}

export async function resolveTeacherUserId({ teacherId, profileId, slug }) {
  if (teacherId) {
    const tid = String(teacherId).trim();
    if (tid) return tid;
  }
  if (profileId) {
    const { data } = await supabaseAdmin
      .from('teacher_profiles')
      .select('user_id')
      .eq('id', String(profileId).trim())
      .maybeSingle();
    if (data?.user_id) return String(data.user_id);
  }
  if (slug) {
    const { data } = await supabaseAdmin
      .from('teacher_profiles')
      .select('user_id')
      .eq('slug', String(slug).trim())
      .maybeSingle();
    if (data?.user_id) return String(data.user_id);
  }
  return null;
}

// silence unused until callers migrate
void isApprovedPublicFilter;
