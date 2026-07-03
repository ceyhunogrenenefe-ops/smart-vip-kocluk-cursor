import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  actorIsTeacherForPanelScope,
  getTeacherGroupClassStudentScope,
  getTeacherPanelClassIds
} from '../api/_lib/teacher-class-scope.js';
import { STUDENT_LIST_COLUMNS } from '../api/_lib/list-query-columns.js';

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

  const roleTags = await normalizedUserRolesFromDb(actor.sub);
  if (!actorIsTeacherForPanelScope(actor, roleTags)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const classIds = await getTeacherPanelClassIds(actor.sub);
  const { ids: studentIds } = await getTeacherGroupClassStudentScope(actor.sub);
  const inst = actor.institution_id || null;

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
    let sq = supabaseAdmin
      .from('students')
      .select(STUDENT_LIST_COLUMNS)
      .in('id', studentIds)
      .order('created_at', { ascending: false });
    if (inst) sq = sq.eq('institution_id', inst);
    const { data, error } = await sq;
    if (error) return res.status(500).json({ error: error.message });
    students = data || [];
  }

  return res.status(200).json({
    data: {
      classIds,
      studentIds,
      classes,
      students
    }
  });
}
