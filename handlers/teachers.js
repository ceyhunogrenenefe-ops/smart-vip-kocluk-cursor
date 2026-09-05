/**
 * GET /api/teachers/:id/reviews
 * GET /api/teachers/reviews?teacher_id= | ?slug=
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  listPublicTeacherReviews,
  resolveTeacherUserId
} from '../api/_lib/teacher-reviews.js';

function applyCors(req, res) {
  const allowed = String(
    process.env.PUBLIC_TEACHERS_CORS_ORIGIN ||
      'https://onlinevipdershane.com,https://www.onlinevipdershane.com,https://www.dersonlinevipkocluk.com'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = String(req.headers.origin || '');
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', allowed[0] || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const extras = Array.isArray(req.apiExtraSegments) ? req.apiExtraSegments : [];
    let teacherKey = '';
    if (extras.length >= 2 && String(extras[1]).toLowerCase() === 'reviews') {
      teacherKey = String(extras[0] || '').trim();
    } else if (extras.length === 1) {
      teacherKey = String(extras[0] || '').trim();
    }

    const qTeacherId = String(req.query?.teacher_id || req.query?.id || '').trim();
    const qSlug = String(req.query?.slug || '').trim();
    const qProfileId = String(req.query?.profile_id || '').trim();

    const teacherId = await resolveTeacherUserId({
      teacherId: teacherKey || qTeacherId,
      profileId: qProfileId,
      slug: qSlug
    });

    if (!teacherId) {
      return res.status(400).json({ error: 'teacher_id_required' });
    }

    const limit = Number(req.query?.limit) || 50;
    const reviews = await listPublicTeacherReviews(teacherId, { limit });

    const { data: profile } = await supabaseAdmin
      .from('teacher_profiles')
      .select('average_rating, total_reviews, display_name, slug, user_id')
      .eq('user_id', teacherId)
      .maybeSingle();

    let average = profile?.average_rating != null ? Number(profile.average_rating) : null;
    let total = profile?.total_reviews != null ? Number(profile.total_reviews) : null;
    if (average == null || total == null) {
      const ratings = reviews.map((r) => Number(r.rating)).filter((n) => n >= 1 && n <= 5);
      total = ratings.length;
      average = total ? Math.round((ratings.reduce((a, b) => a + b, 0) / total) * 100) / 100 : null;
    }

    return res.status(200).json({
      teacher_id: teacherId,
      slug: profile?.slug || null,
      display_name: profile?.display_name || null,
      average_rating: average,
      total_reviews: total || 0,
      reviews
    });
  } catch (e) {
    console.error('[teachers/reviews]', errorMessage(e));
    return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
  }
}
