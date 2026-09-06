/**
 * Admin: öğretmen yorumları onay / red
 * GET  /api/reviews/admin
 * POST /api/reviews/admin { op: 'approve'|'reject', review_id }
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  approveTeacherReview,
  listPendingTeacherReviews,
  rejectTeacherReview
} from '../api/_lib/teacher-reviews.js';

function requireAdmin(actor) {
  const role = String(actor?.role || '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!requireAdmin(actor)) {
    return res.status(403).json({ error: 'forbidden', hint: 'Yalnızca admin / süper admin.' });
  }

  if (req.method === 'GET') {
    try {
      const reviews = await listPendingTeacherReviews({
        limit: Number(req.query?.limit) || 100
      });
      return res.status(200).json({ reviews, pending_count: reviews.length });
    } catch (e) {
      console.error('[reviews/admin GET]', errorMessage(e));
      return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const op = String(body.op || req.query?.op || '').trim().toLowerCase();
  const reviewId = String(body.review_id || body.id || '').trim();
  if (!reviewId) return res.status(400).json({ error: 'review_id_required' });

  try {
    if (op === 'approve') {
      const result = await approveTeacherReview(reviewId, actor.sub);
      return res.status(200).json({ ok: true, ...result });
    }
    if (op === 'reject') {
      const result = await rejectTeacherReview(reviewId, actor.sub);
      return res.status(200).json({ ok: true, ...result });
    }
    return res.status(400).json({ error: 'op_invalid', hint: 'approve | reject' });
  } catch (e) {
    const msg = errorMessage(e);
    if (/not_found/i.test(msg)) return res.status(404).json({ error: 'not_found' });
    console.error('[reviews/admin POST]', msg);
    return res.status(500).json({ error: 'server_error', message: msg });
  }
}
