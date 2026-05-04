import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

const canAccessBook = async (actor, row) => {
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'teacher') return false;
  if (actor.role === 'admin') return hasInstitutionAccess(actor, row.institution_id);
  if (actor.role === 'student') return Boolean(actor.student_id && row.student_id === actor.student_id);
  if (actor.role === 'coach') {
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('id,coach_id')
      .eq('id', row.student_id)
      .maybeSingle();
    return Boolean(student && actor.coach_id && student.coach_id === actor.coach_id);
  }
  return false;
};

export default async function handler(req, res) {
  try {
    const actor = requireAuth(req);

    if (req.method === 'GET') {
      let query = supabaseAdmin.from('book_readings').select('*').order('created_at', { ascending: false });
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
      const institutionId = body.institution_id || actor.institution_id || null;
      if (actor.role === 'admin' && !hasInstitutionAccess(actor, institutionId)) {
        return res.status(403).json({ error: 'institution_forbidden' });
      }
      if (actor.role === 'student' && actor.student_id && body.student_id !== actor.student_id) {
        return res.status(403).json({ error: 'student_forbidden' });
      }
      const payload = {
        id: body.id || `book-${Date.now()}`,
        ...body,
        institution_id: institutionId,
        created_at: body.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabaseAdmin.from('book_readings').insert(payload).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('book_readings').select('*').eq('id', id).maybeSingle();
      if (!existing || !(await canAccessBook(actor, existing))) return res.status(403).json({ error: 'forbidden' });
      const { data, error } = await supabaseAdmin
        .from('book_readings')
        .update({ ...(req.body || {}), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('book_readings').select('*').eq('id', id).maybeSingle();
      if (!existing || !(await canAccessBook(actor, existing))) return res.status(403).json({ error: 'forbidden' });
      const { error } = await supabaseAdmin.from('book_readings').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'book_readings_api_failed' });
  }
}


