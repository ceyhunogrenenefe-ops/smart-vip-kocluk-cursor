import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  actorIsTeacherForPanelScope,
  getTeacherPanelStudentScope,
  getTeacherPanelClassIds
} from '../api/_lib/teacher-class-scope.js';
import { STUDENT_LIST_COLUMNS } from '../api/_lib/list-query-columns.js';
import { actorRoleSet } from '../api/_lib/actor-roles.js';
import { resolveViewAsActorIfAllowed } from '../api/_lib/view-as-actor.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  const viewAsUserId = req.query.view_as_user_id
    ? String(req.query.view_as_user_id).trim()
    : '';
  let scopeActor = actor;
  if (viewAsUserId) {
    try {
      const rs = await actorRoleSet(actor);
      scopeActor = await resolveViewAsActorIfAllowed(actor, rs, viewAsUserId);
    } catch (e) {
      const status = Number(e?.status) || 500;
      return res.status(status).json({ error: e?.code || e?.message || 'view_as_failed' });
    }
  }

  const roleTags = await normalizedUserRolesFromDb(scopeActor.sub);
  if (!actorIsTeacherForPanelScope(scopeActor, roleTags)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const inst = scopeActor.institution_id || null;
  const classIds = await getTeacherPanelClassIds(scopeActor.sub);
  const { ids: studentIds } = await getTeacherPanelStudentScope(scopeActor.sub, inst);

  let classes = [];
  if (classIds.length) {
    let cq = supabaseAdmin.from('classes').select('*').in('id', classIds).order('name', { ascending: true });
    if (inst) cq = cq.eq('institution_id', inst);
    const { data, error } = await cq;
    if (error) return res.status(500).json({ error: error.message });
    classes = data || [];
  }

  let students = [];
  if (studentIds.length) {
    // Kurum filtresi YOK: özel ders ataması institution_id null/farklı olsa bile
    // studentIdsForTeacher zaten kapsamı hesapladı; burada tekrar elersek liste boş kalır.
    const { data, error } = await supabaseAdmin
      .from('students')
      .select(STUDENT_LIST_COLUMNS)
      .in('id', studentIds)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    students = data || [];
  }

  return res.status(200).json({
    data: {
      classIds,
      studentIds,
      classes,
      students
    },
    ...(viewAsUserId ? { view_as_user_id: viewAsUserId } : {})
  });
}
