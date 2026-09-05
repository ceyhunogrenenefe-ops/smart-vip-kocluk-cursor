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

export async function refreshTeacherReviewStats(teacherId) {
  const tid = String(teacherId || '').trim();
  if (!tid) return { average_rating: null, total_reviews: 0 };

  const { data, error } = await supabaseAdmin
    .from('teacher_reviews')
    .select('rating')
    .eq('teacher_id', tid)
    .eq('is_public', true);
  if (error) throw error;

  const ratings = (data || []).map((r) => Number(r.rating)).filter((n) => n >= 1 && n <= 5);
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
      'id, teacher_id, student_id, lesson_id, reviewer_type, reviewer_name, rating, comment, is_public, created_at'
    )
    .eq('teacher_id', tid)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(lim);
  if (error) {
    if (/teacher_reviews|schema cache|does not exist/i.test(error.message || '')) return [];
    throw error;
  }
  return (data || []).map(mapReviewToApi);
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
