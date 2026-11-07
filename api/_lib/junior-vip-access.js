import { requireAuthenticatedActor } from './auth.js';
import { buildAccessContext, assertStudentPlannerRead } from './student-access-gate.js';

function studentIdFromQuery(req) {
  const raw = req.query?.student_id;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return String(v || '').trim();
}

/**
 * JWT öğrencisi veya koç/admin taklidinde body/query student_id + plan okuma yetkisi.
 */
export async function resolveJuniorVipStudentId(req, body = {}) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    const err = new Error('Missing token');
    err.status = 401;
    throw err;
  }

  const ctx = await buildAccessContext(actor);
  const hinted = String(body.student_id || studentIdFromQuery(req) || '').trim();
  let sid = String(ctx.actor.student_id || '').trim();

  if (ctx.roleSet.has('student')) {
    if (!sid && hinted) sid = hinted;
    if (sid && hinted && sid !== hinted) {
      const err = new Error('student_scope_mismatch');
      err.status = 403;
      throw err;
    }
  } else if (hinted) {
    sid = hinted;
  }

  if (!sid) {
    const err = new Error('student_only');
    err.status = 403;
    err.hint =
      'Junior VIP yalnızca öğrenci kapsamında çalışır. Öğrenci olarak giriş yapın veya geçerli öğrenci seçin.';
    throw err;
  }

  const access = await assertStudentPlannerRead(ctx, sid);
  if (!access.ok) {
    const err = new Error('student_access_denied');
    err.status = access.status || 403;
    throw err;
  }

  return { studentId: sid, accessCtx: ctx };
}
