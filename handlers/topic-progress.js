import { createHash } from 'node:crypto';
import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

const TOPIC_PROGRESS_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

function uuidStringToBytes(uuid) {
  const hex = String(uuid).replace(/-/g, '');
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function stableTopicProgressTopicId(studentId, subject, topic) {
  const sub = String(subject ?? '').trim();
  const top = String(topic ?? '').trim();
  const ns = uuidStringToBytes(TOPIC_PROGRESS_NAMESPACE);
  const name = Buffer.from(`${studentId}\n${sub}\n${top}`, 'utf8');
  const hash = createHash('sha1')
    .update(Buffer.concat([ns, name]))
    .digest()
    .subarray(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function encodeNotes(subject, topic, entryId) {
  const payload = { v: 1, s: subject, t: topic };
  if (entryId) payload.e = entryId;
  return JSON.stringify(payload);
}

function decodeNotes(notes) {
  if (!notes || !String(notes).trim()) return null;
  try {
    const o = JSON.parse(notes);
    if (o?.v === 1 && typeof o.s === 'string' && typeof o.t === 'string') {
      return { subject: o.s.trim(), topic: o.t.trim(), entryId: typeof o.e === 'string' ? o.e : undefined };
    }
  } catch {
    /* ignore */
  }
  return null;
}

const fetchStudentMinimal = async (studentId) => {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id,coach_id,institution_id')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const assertCanAccessStudent = async (actor, studentId) => {
  const st = await fetchStudentMinimal(studentId);
  if (!st) return { ok: false, status: 404, student: null };
  if (actor.role === 'super_admin') return { ok: true, student: st };
  if (actor.role === 'admin' || actor.role === 'teacher') {
    if (!hasInstitutionAccess(actor, st.institution_id)) return { ok: false, status: 403, student: st };
    return { ok: true, student: st };
  }
  if (actor.role === 'coach') {
    if (!actor.coach_id || st.coach_id !== actor.coach_id) return { ok: false, status: 403, student: st };
    return { ok: true, student: st };
  }
  if (actor.role === 'student' && actor.student_id === studentId) return { ok: true, student: st };
  return { ok: false, status: 403, student: st };
};

/** Kurum/rol için erişilebilir öğrenci id listesi (topic_progress.institution_id gerekmez) */
const studentIdsForActor = async (actor) => {
  if (actor.role === 'student' && actor.student_id) return [actor.student_id];
  if (actor.role === 'coach' && actor.coach_id) {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('coach_id', actor.coach_id);
    if (error) throw error;
    return (data || []).map((s) => s.id);
  }
  if ((actor.role === 'admin' || actor.role === 'teacher') && actor.institution_id) {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('institution_id', actor.institution_id);
    if (error) throw error;
    return (data || []).map((s) => s.id);
  }
  return null;
};

const fetchTopicProgressByStudentIds = async (studentIds) => {
  if (!studentIds?.length) return [];
  const { data, error } = await supabaseAdmin
    .from('topic_progress')
    .select('*')
    .in('student_id', studentIds)
    .eq('status', 'completed');
  if (error) throw error;
  return data || [];
};

export default async function handler(req, res) {
  try {
    const actor = requireAuth(req);

    if (req.method === 'GET') {
      let studentIds = await studentIdsForActor(actor);
      if (studentIds === null) {
        const raw = String(req.query.student_ids || req.query.student_id || '').trim();
        if (raw) studentIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
        else if (actor.role === 'super_admin') {
          const { data, error } = await supabaseAdmin
            .from('topic_progress')
            .select('*')
            .eq('status', 'completed');
          if (error) throw error;
          return res.status(200).json({ data: data || [] });
        }
      }
      if (!studentIds?.length) {
        if (['student', 'coach', 'admin', 'teacher'].includes(actor.role)) {
          return res.status(200).json({ data: [] });
        }
        return res.status(400).json({ error: 'student_ids_required' });
      }
      const data = await fetchTopicProgressByStudentIds(studentIds);
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const studentId = String(body.student_id || body.studentId || '').trim();
      if (!studentId) return res.status(400).json({ error: 'student_id_required' });

      const chk = await assertCanAccessStudent(actor, studentId);
      if (!chk.ok) return res.status(chk.status).json({ error: 'forbidden' });

      let subject = String(body.subject ?? '').trim();
      let topic = String(body.topic ?? '').trim();
      if (!subject || !topic) {
        const meta = decodeNotes(body.notes);
        if (meta) {
          subject = subject || meta.subject;
          topic = topic || meta.topic;
        }
      }
      if (!subject || !topic) return res.status(400).json({ error: 'subject_topic_required' });

      const status = String(body.status || 'completed').trim();
      const topic_id =
        String(body.topic_id || '').trim() ||
        stableTopicProgressTopicId(studentId, subject, topic);
      const now = new Date().toISOString();
      const notes = body.notes ?? encodeNotes(subject, topic, body.entry_id ?? body.entryId);
      const completion_date = body.completion_date || now;

      const { data: existing } = await supabaseAdmin
        .from('topic_progress')
        .select('id')
        .eq('student_id', studentId)
        .eq('topic_id', topic_id)
        .maybeSingle();

      const row = {
        student_id: studentId,
        topic_id,
        status,
        completion_date,
        notes,
        updated_at: now
      };

      if (existing?.id) {
        const { data, error } = await supabaseAdmin
          .from('topic_progress')
          .update(row)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
      }

      const { data, error } = await supabaseAdmin
        .from('topic_progress')
        .insert({
          id: body.id || `progress-${Date.now()}`,
          ...row,
          created_at: now
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const studentId = String(req.query.student_id || '').trim();
      const topicId = String(req.query.topic_id || '').trim();
      if (!studentId || !topicId) {
        return res.status(400).json({ error: 'student_id_and_topic_id_required' });
      }
      const chk = await assertCanAccessStudent(actor, studentId);
      if (!chk.ok) return res.status(chk.status).json({ error: 'forbidden' });
      const { error } = await supabaseAdmin
        .from('topic_progress')
        .delete()
        .eq('student_id', studentId)
        .eq('topic_id', topicId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[topic-progress]', errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) });
  }
}
