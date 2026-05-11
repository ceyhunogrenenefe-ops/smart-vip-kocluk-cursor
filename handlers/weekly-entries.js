import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getTeacherGroupClassStudentScope } from '../api/_lib/teacher-class-scope.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { syncWeeklyEntryPlannerRow } from '../api/_lib/sync-weekly-entry-planner.js';

const canAccessEntry = async (actor, entry) => {
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'teacher') return false;
  if (actor.role === 'admin') return hasInstitutionAccess(actor, entry.institution_id);
  if (actor.role === 'coach') {
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('id,coach_id')
      .eq('id', entry.student_id)
      .maybeSingle();
    return Boolean(student && actor.coach_id && student.coach_id === actor.coach_id);
  }
  if (actor.role === 'student') return Boolean(actor.student_id && entry.student_id === actor.student_id);
  return false;
};

export default async function handler(req, res) {
  try {
    const actor = requireAuth(req);

    if (req.method === 'GET') {
      if (actor.role === 'student' && !actor.student_id) {
        return res.status(200).json({ data: [] });
      }
      let query = supabaseAdmin.from('weekly_entries').select('*').order('date', { ascending: false });
      if (actor.role === 'admin') {
        query = query.eq('institution_id', actor.institution_id);
      }
      if (actor.role === 'teacher') {
        if (!actor.institution_id) return res.status(200).json({ data: [] });
        const { ids } = await getTeacherGroupClassStudentScope(actor.sub);
        if (!ids.length) return res.status(200).json({ data: [] });
        query = query.eq('institution_id', actor.institution_id).in('student_id', ids);
      }
      if (actor.role === 'student') query = query.eq('student_id', actor.student_id);
      if (actor.role === 'coach') {
        const { data: students } = await supabaseAdmin
          .from('students')
          .select('id')
          .eq('coach_id', actor.coach_id);
        const ids = (students || []).map((s) => s.id);
        if (ids.length === 0) return res.status(200).json({ data: [] });
        query = query.in('student_id', ids);
      }
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
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
          return res.status(403).json({ error: 'forbidden' });
        }
        const { data: stu, error: stuErr } = await supabaseAdmin
          .from('students')
          .select('id, institution_id')
          .eq('id', actor.student_id)
          .maybeSingle();
        if (stuErr) throw stuErr;
        if (!stu) return res.status(403).json({ error: 'student_profile_missing' });
        const institutionId = stu.institution_id || null;
        const payload = {
          id: body.id || `entry-${Date.now()}`,
          student_id: actor.student_id,
          date: body.date,
          subject: body.subject,
          topic: body.topic,
          target_questions: body.target_questions,
          solved_questions: body.solved_questions,
          correct: body.correct,
          wrong: body.wrong,
          blank: body.blank,
          notes: body.notes ?? null,
          reading_minutes: body.reading_minutes ?? null,
          pages_read: body.pages_read ?? body.pagesRead ?? null,
          screen_time_minutes: body.screen_time_minutes ?? body.screenTimeMinutes ?? null,
          book_id: body.book_id ?? null,
          book_title: body.book_title ?? null,
          institution_id: institutionId,
          created_at: body.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        const { data, error } = await supabaseAdmin.from('weekly_entries').insert(payload).select().single();
        if (error) throw error;
        return res.status(200).json({ data });
      }

      if (!['super_admin', 'admin', 'coach'].includes(actor.role)) return res.status(403).json({ error: 'forbidden' });
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
      const payload = {
        id: body.id || `entry-${Date.now()}`,
        student_id: sidRaw,
        date: body.date,
        subject: body.subject,
        topic: body.topic,
        target_questions: body.target_questions,
        solved_questions: body.solved_questions,
        correct: body.correct,
        wrong: body.wrong,
        blank: body.blank,
        notes: body.notes ?? null,
        reading_minutes: body.reading_minutes ?? null,
        book_id: body.book_id ?? null,
        book_title: body.book_title ?? null,
        institution_id: institutionId,
        created_at: body.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabaseAdmin.from('weekly_entries').insert(payload).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('weekly_entries').select('*').eq('id', id).maybeSingle();
      if (!existing || !(await canAccessEntry(actor, existing))) return res.status(403).json({ error: 'forbidden' });
      const { data, error } = await supabaseAdmin
        .from('weekly_entries')
        .update({ ...(req.body || {}), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      try {
        if (data) await syncWeeklyEntryPlannerRow(data);
      } catch (se) {
        console.error('[weekly-entries] syncWeeklyEntryPlannerRow', se);
      }
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('weekly_entries').select('*').eq('id', id).maybeSingle();
      if (!existing || !(await canAccessEntry(actor, existing))) return res.status(403).json({ error: 'forbidden' });
      const { error } = await supabaseAdmin.from('weekly_entries').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[weekly-entries]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}


