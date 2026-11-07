import { requireAuthenticatedActor } from './auth.js';
import { buildAccessContext, assertStudentPlannerRead } from './student-access-gate.js';
import { roleSetHasAdmin, roleSetHasSuperAdmin } from './actor-roles.js';

export const JUNIOR_VIP_PANELS = ['student', 'coach', 'teacher'];

function studentIdFromQuery(req) {
  const raw = req.query?.student_id;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return String(v || '').trim();
}

function panelFromRequest(req, body) {
  const raw = body?.panel ?? (Array.isArray(req.query?.panel) ? req.query.panel[0] : req.query?.panel);
  const p = String(raw || '').trim().toLowerCase();
  return JUNIOR_VIP_PANELS.includes(p) ? p : '';
}

function httpError(message, status, hint) {
  const err = new Error(message);
  err.status = status;
  if (hint) err.hint = hint;
  return err;
}

function authActor(req) {
  try {
    return requireAuthenticatedActor(req);
  } catch {
    throw httpError('Missing token', 401);
  }
}

/** Öğrenci kapsamı: JWT öğrencisi veya koç/admin taklidinde student_id + plan okuma yetkisi. */
async function resolveStudentScope(req, body, ctx) {
  const hinted = String(body.student_id || studentIdFromQuery(req) || '').trim();
  let sid = String(ctx.actor.student_id || '').trim();

  if (ctx.roleSet.has('student')) {
    if (!sid && hinted) sid = hinted;
    if (sid && hinted && sid !== hinted) throw httpError('student_scope_mismatch', 403);
  } else if (hinted) {
    sid = hinted;
  }

  if (!sid) {
    throw httpError(
      'student_only',
      403,
      'Junior VIP öğrenci panelinde yalnızca öğrenci kapsamında çalışır. Öğrenci olarak giriş yapın veya geçerli öğrenci seçin.'
    );
  }

  const access = await assertStudentPlannerRead(ctx, sid);
  if (!access.ok) throw httpError('student_access_denied', access.status || 403);
  return sid;
}

/** Panel istenmediyse rolden çıkar (geriye uyum: öğrenci). Koç+öğretmen çift rolde koç önceliklidir (menü ile aynı). */
export function defaultJuniorVipPanel(roleSet) {
  const isAdmin = roleSetHasAdmin(roleSet) || roleSetHasSuperAdmin(roleSet);
  if (roleSet.has('student') && !isAdmin && !roleSet.has('coach') && !roleSet.has('teacher')) return 'student';
  if (roleSet.has('coach')) return 'coach';
  if (roleSet.has('teacher')) return 'teacher';
  return 'student';
}

/**
 * Junior VIP kapsamı — panel, sunucuda JWT + DB rolleriyle doğrulanır; istemcinin söylediği panele güvenilmez.
 * @returns {{ panel: 'student'|'coach'|'teacher', studentId?: string, coachId?: string, userId?: string, institutionId?: string|null, displayName?: string, accessCtx: object }}
 */
export async function resolveJuniorVipScope(req, body = {}) {
  const actor = authActor(req);
  const ctx = await buildAccessContext(actor);
  const panel = panelFromRequest(req, body) || defaultJuniorVipPanel(ctx.roleSet);
  const base = {
    panel,
    accessCtx: ctx,
    institutionId: ctx.actor.institution_id ?? null,
    displayName: String(ctx.actor.name || '').trim()
  };

  if (panel === 'student') {
    return { ...base, studentId: await resolveStudentScope(req, body, ctx) };
  }

  if (panel === 'coach') {
    const coachId = String(ctx.actor.coach_id || '').trim();
    if (!ctx.roleSet.has('coach') || !coachId) {
      throw httpError('coach_only', 403, 'Koç asistanı yalnızca koç hesabıyla kullanılabilir.');
    }
    return { ...base, coachId, userId: String(ctx.actor.sub || '').trim() };
  }

  // teacher
  const userId = String(ctx.actor.sub || '').trim();
  if (!ctx.roleSet.has('teacher') || !userId) {
    throw httpError('teacher_only', 403, 'Öğretmen asistanı yalnızca öğretmen hesabıyla kullanılabilir.');
  }
  return { ...base, userId };
}

/** Eski imza (geriye uyum). */
export async function resolveJuniorVipStudentId(req, body = {}) {
  const actor = authActor(req);
  const ctx = await buildAccessContext(actor);
  return { studentId: await resolveStudentScope(req, body, ctx), accessCtx: ctx };
}
