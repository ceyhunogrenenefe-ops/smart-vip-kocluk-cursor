import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

const canAccessExam = async (actor, exam) => {
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'teacher') return false;
  if (actor.role === 'admin') return hasInstitutionAccess(actor, exam.institution_id);
  if (actor.role === 'student') return Boolean(actor.student_id && exam.student_id === actor.student_id);
  if (actor.role === 'coach') {
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('id,coach_id')
      .eq('id', exam.student_id)
      .maybeSingle();
    return Boolean(student && actor.coach_id && student.coach_id === actor.coach_id);
  }
  return false;
};

export default async function handler(req, res) {
  try {
    const actor = requireAuth(req);

    if (req.method === 'GET') {
      if (actor.role === 'student' && !actor.student_id) {
        return res.status(200).json({ data: [] });
      }
      let query = supabaseAdmin.from('written_exams').select('*').order('date', { ascending: false });
      if (actor.role === 'admin' || actor.role === 'teacher') {
        query = query.eq('institution_id', actor.institution_id);
      }
      if (actor.role === 'student') query = query.eq('student_id', actor.student_id);
      if (actor.role === 'coach') {
        const { data: students } = await supabaseAdmin.from('students').select('id').eq('coach_id', actor.coach_id);
        const ids = (students || []).map((s) => s.id);
        if (ids.length === 0) return res.status(200).json({ data: [] });
        query = query.in('student_id', ids);
      }
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      if (!['super_admin', 'admin', 'coach', 'student'].includes(actor.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const body = req.body || {};

      if (actor.role === 'student') {
        if (!actor.student_id) return res.status(403).json({ error: 'student_profile_missing' });
        const stated =
          body.student_id != null && String(body.student_id).trim()
            ? String(body.student_id).trim()
            : body.studentId != null && String(body.studentId).trim()
              ? String(body.studentId).trim()
              : '';
        if (stated && stated !== String(actor.student_id)) {
          return res.status(403).json({ error: 'student_forbidden' });
        }
        const { data: stu, error: stuErr } = await supabaseAdmin
          .from('students')
          .select('id, institution_id')
          .eq('id', actor.student_id)
          .maybeSingle();
        if (stuErr) throw stuErr;
        if (!stu) return res.status(403).json({ error: 'student_profile_missing' });
        const institutionId =
          stu.institution_id || body.institution_id || actor.institution_id || null;
        const semester = typeof body.semester === 'number' ? body.semester : Number(body.semester);
        const payload = {
          id: body.id || `exam-${Date.now()}`,
          student_id: actor.student_id,
          subject: String(body.subject ?? ''),
          semester: semester === 1 || semester === 2 ? semester : 1,
          exam_type: String(body.exam_type ?? body.examType ?? ''),
          score: typeof body.score === 'number' ? body.score : Number(body.score),
          date: body.date ?? null,
          notes: body.notes ?? null,
          institution_id: institutionId,
          created_at: body.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        if (!payload.subject.trim()) {
          return res.status(400).json({ error: 'subject_required' });
        }
        if (!payload.exam_type.trim()) {
          return res.status(400).json({ error: 'exam_type_required' });
        }
        if (!Number.isFinite(payload.score)) {
          return res.status(400).json({ error: 'score_required' });
        }
        const { data, error } = await supabaseAdmin.from('written_exams').insert(payload).select().single();
        if (error) throw error;
        return res.status(200).json({ data });
      }

      const institutionId = body.institution_id || actor.institution_id || null;
      if (actor.role === 'admin' && !hasInstitutionAccess(actor, institutionId)) {
        return res.status(403).json({ error: 'institution_forbidden' });
      }

      const sidRaw =
        body.student_id != null && String(body.student_id).trim()
          ? String(body.student_id).trim()
          : body.studentId != null && String(body.studentId).trim()
            ? String(body.studentId).trim()
            : '';
      if (!sidRaw) {
        return res.status(400).json({ error: 'student_id_required' });
      }

      const semRaw = typeof body.semester === 'number' ? body.semester : Number(body.semester);
      const semesterStaff = semRaw === 1 || semRaw === 2 ? semRaw : 1;
      const examTypeStaff = String(body.exam_type ?? body.examType ?? '');
      const scoreStaff =
        typeof body.score === 'number' && Number.isFinite(body.score) ? body.score : Number(body.score);
      if (!examTypeStaff.trim()) {
        return res.status(400).json({ error: 'exam_type_required' });
      }
      if (!Number.isFinite(scoreStaff)) {
        return res.status(400).json({ error: 'score_required' });
      }

      const payload = {
        id: body.id || `exam-${Date.now()}`,
        student_id: sidRaw,
        subject: String(body.subject ?? '').trim(),
        semester: semesterStaff,
        exam_type: examTypeStaff,
        score: scoreStaff,
        date: body.date ?? null,
        notes: body.notes ?? null,
        institution_id: institutionId,
        created_at: body.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (!payload.subject) {
        return res.status(400).json({ error: 'subject_required' });
      }

      const { data, error } = await supabaseAdmin.from('written_exams').insert(payload).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('written_exams').select('*').eq('id', id).maybeSingle();
      if (!existing || !(await canAccessExam(actor, existing))) return res.status(403).json({ error: 'forbidden' });
      const { data, error } = await supabaseAdmin
        .from('written_exams')
        .update({ ...(req.body || {}), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('written_exams').select('*').eq('id', id).maybeSingle();
      if (!existing || !(await canAccessExam(actor, existing))) return res.status(403).json({ error: 'forbidden' });
      const { error } = await supabaseAdmin.from('written_exams').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[written-exams]', errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) });
  }
}


