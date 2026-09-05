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
  const { count, error } = await supabaseAdmin
    .from('teacher_lessons')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', tid)
    .eq('status', 'completed');
  if (error) {
    console.warn('[teacher-reviews] lesson count:', errorMessage(error));
    return 0;
  }
  const n = Number(count) || 0;
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
      return (legacy.data || []).map(mapReviewToApi);
    }
    if (/teacher_reviews|schema cache|does not exist/i.test(error.message || '')) return [];
    throw error;
  }
  return (data || [])
    .filter((r) => {
      const st = String(r.moderation_status || 'approved').toLowerCase();
      return st === 'approved';
    })
    .map(mapReviewToApi);
}

export async function listPendingTeacherReviews({ limit = 100 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const { data, error } = await supabaseAdmin
    .from('teacher_reviews')
    .select(
      'id, teacher_id, student_id, lesson_id, reviewer_type, reviewer_name, rating, comment, is_public, moderation_status, created_at'
    )
    .eq('moderation_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(lim);
  if (error) throw error;
  return (data || []).map(mapReviewToApi);
}

async function resolveDisplayNameForReview(row) {
  const current = String(row.reviewer_name || '').trim();
  const generic = /^(öğrenci|ogrenci|veli)$/i.test(current);
  if (current && !generic) return current.slice(0, 120);

  if (row.reviewer_type === 'PARENT' && row.student_id) {
    const { data: stud } = await supabaseAdmin
      .from('students')
      .select('parent_name, name, full_name')
      .eq('id', row.student_id)
      .maybeSingle();
    const parent = String(stud?.parent_name || '').trim();
    if (parent) return parent.slice(0, 120);
  }
  if (row.student_id) {
    const { data: stud } = await supabaseAdmin
      .from('students')
      .select('full_name, name, first_name, last_name')
      .eq('id', row.student_id)
      .maybeSingle();
    const name =
      String(stud?.full_name || stud?.name || '').trim() ||
      [stud?.first_name, stud?.last_name].filter(Boolean).join(' ').trim();
    if (name) return name.slice(0, 120);
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
