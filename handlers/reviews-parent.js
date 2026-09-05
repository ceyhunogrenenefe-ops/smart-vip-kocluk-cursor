/**
 * Veli değerlendirme
 * GET  /api/reviews/parent?token=...
 * POST /api/reviews/parent            { token, rating, comment?, reviewer_name?, is_public? }
 * POST /api/reviews/parent?op=invite  { lesson_id, parent_name?, expires_hours? }
 */
import crypto from 'crypto';
import { requireAuthenticatedActor, signAuthToken } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  clampRating,
  mapReviewToApi,
  refreshTeacherReviewStats,
  snippetComment
} from '../api/_lib/teacher-reviews.js';

function newInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function loadInvite(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  const { data, error } = await supabaseAdmin
    .from('teacher_review_invite_tokens')
    .select('*')
    .eq('token', t)
    .maybeSingle();
  if (error) {
    if (/teacher_review_invite|does not exist|schema cache/i.test(error.message || '')) {
      const err = new Error('table_missing');
      err.code = 'table_missing';
      throw err;
    }
    throw error;
  }
  return data || null;
}

export default async function handler(req, res) {
  const op = String(req.query?.op || '').trim().toLowerCase();

  if (req.method === 'POST' && op === 'invite') {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const role = String(actor.role || '').toLowerCase();
    if (!['teacher', 'coach', 'admin', 'super_admin', 'institution_admin'].includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const lessonId = String(body.lesson_id || '').trim();
    if (!lessonId) return res.status(400).json({ error: 'lesson_id_required' });

    try {
      const { data: lesson, error } = await supabaseAdmin
        .from('teacher_lessons')
        .select('id, teacher_id, student_id, status, title')
        .eq('id', lessonId)
        .maybeSingle();
      if (error) throw error;
      if (!lesson) return res.status(404).json({ error: 'lesson_not_found' });
      if (role === 'teacher' && String(lesson.teacher_id) !== String(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const hours = Math.min(Math.max(Number(body.expires_hours) || 168, 1), 720);
      const token = newInviteToken();
      const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      const parentName = String(body.parent_name || '').trim() || null;

      const { data: invite, error: insErr } = await supabaseAdmin
        .from('teacher_review_invite_tokens')
        .insert({
          token,
          teacher_id: lesson.teacher_id,
          student_id: lesson.student_id,
          lesson_id: lesson.id,
          parent_name: parentName,
          expires_at: expiresAt,
          created_by: actor.sub
        })
        .select('*')
        .maybeSingle();
      if (insErr) {
        if (/teacher_review_invite|does not exist/i.test(insErr.message || '')) {
          return res.status(503).json({
            error: 'table_missing',
            hint: 'Supabase SQL: student-coaching-system/sql/2026-09-05-teacher-reviews.sql'
          });
        }
        throw insErr;
      }

      const jwt = signAuthToken({
        role: 'parent_review',
        invite_token: token,
        teacher_id: lesson.teacher_id,
        lesson_id: lesson.id,
        student_id: lesson.student_id
      });

      const path = `/review/public?token=${encodeURIComponent(token)}`;
      return res.status(201).json({
        data: { token: invite.token, expires_at: invite.expires_at, path, jwt }
      });
    } catch (e) {
      console.error('[reviews/parent invite]', errorMessage(e));
      return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
    }
  }

  if (req.method === 'GET') {
    const token = String(req.query?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'token_required' });
    try {
      const invite = await loadInvite(token);
      if (!invite) return res.status(404).json({ error: 'invalid_token' });
      if (invite.used_at) return res.status(410).json({ error: 'token_used' });
      if (new Date(invite.expires_at).getTime() < Date.now()) {
        return res.status(410).json({ error: 'token_expired' });
      }

      const { data: teacher } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .eq('id', invite.teacher_id)
        .maybeSingle();
      const { data: profile } = await supabaseAdmin
        .from('teacher_profiles')
        .select('display_name, slug, photo_url, average_rating, total_reviews')
        .eq('user_id', invite.teacher_id)
        .maybeSingle();

      return res.status(200).json({
        data: {
          token: invite.token,
          teacher_id: invite.teacher_id,
          teacher_name: profile?.display_name || teacher?.name || 'Öğretmen',
          teacher_slug: profile?.slug || null,
          teacher_photo_url: profile?.photo_url || null,
          lesson_id: invite.lesson_id,
          parent_name: invite.parent_name,
          expires_at: invite.expires_at,
          average_rating: profile?.average_rating ?? null,
          total_reviews: profile?.total_reviews ?? 0
        }
      });
    } catch (e) {
      if (e?.code === 'table_missing' || /table_missing/.test(e?.message || '')) {
        return res.status(503).json({
          error: 'table_missing',
          hint: 'Supabase SQL: student-coaching-system/sql/2026-09-05-teacher-reviews.sql'
        });
      }
      console.error('[reviews/parent GET]', errorMessage(e));
      return res.status(500).json({ error: 'server_error' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const token = String(body.token || req.query?.token || '').trim();
  const rating = clampRating(body.rating);
  const comment = snippetComment(body.comment ?? body.review);
  const isPublic = body.is_public === false || body.isPublic === false ? false : true;

  if (!token) return res.status(400).json({ error: 'token_required' });
  if (!rating) {
    return res.status(400).json({ error: 'rating_invalid', hint: 'Puan 1-5 arası olmalı.' });
  }

  try {
    const invite = await loadInvite(token);
    if (!invite) return res.status(404).json({ error: 'invalid_token' });
    if (invite.used_at) return res.status(410).json({ error: 'token_used' });
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'token_expired' });
    }

    const reviewerName =
      String(body.reviewer_name || body.reviewerName || invite.parent_name || '')
        .trim()
        .slice(0, 120) || 'Veli';

    const insertRow = {
      teacher_id: invite.teacher_id,
      student_id: invite.student_id || null,
      lesson_id: invite.lesson_id || null,
      reviewer_type: 'PARENT',
      reviewer_name: reviewerName,
      rating,
      comment,
      is_public: isPublic
    };

    const { data: saved, error: insErr } = await supabaseAdmin
      .from('teacher_reviews')
      .insert(insertRow)
      .select('*')
      .maybeSingle();
    if (insErr) {
      if (/teacher_reviews|does not exist/i.test(insErr.message || '')) {
        return res.status(503).json({
          error: 'table_missing',
          hint: 'Supabase SQL: student-coaching-system/sql/2026-09-05-teacher-reviews.sql'
        });
      }
      throw insErr;
    }

    await supabaseAdmin
      .from('teacher_review_invite_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id);

    const stats = await refreshTeacherReviewStats(invite.teacher_id);
    return res.status(201).json({ data: mapReviewToApi(saved), stats });
  } catch (e) {
    console.error('[reviews/parent POST]', errorMessage(e));
    return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
  }
}
