import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

const padDate = (v) => String(v || '').trim().slice(0, 10);

const fetchStudentMinimal = async (studentId) => {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id,coach_id,institution_id')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

/** weekly-entries ile aynı erişim modeli */
const assertPlannerDailyMutate = async (actor, studentId) => {
  const st = await fetchStudentMinimal(studentId);
  if (!st) return { ok: false, status: 404, student: null };
  if (actor.role === 'super_admin') return { ok: true, student: st };
  if (actor.role === 'admin') {
    if (!hasInstitutionAccess(actor, st.institution_id)) return { ok: false, status: 403, student: st };
    return { ok: true, student: st };
  }
  if (actor.role === 'coach') {
    if (!actor.coach_id || st.coach_id !== actor.coach_id) return { ok: false, status: 403, student: st };
    return { ok: true, student: st };
  }
  if (actor.role === 'student') {
    if (!actor.student_id || actor.student_id !== studentId) return { ok: false, status: 403, student: null };
    return { ok: true, student: st };
  }
  return { ok: false, status: 403, student: null };
};

function plannerTitleFromTopic(subject, topic) {
  const sub = String(subject || '').trim() || 'Genel';
  const t = String(topic || '').trim();
  return t ? `Günlük kayıt: ${t}` : `Günlük kayıt: ${sub}`;
}

function derivePlannerStatus(target, solved) {
  const plannedQty = target > 0 ? Math.max(target, solved) : Math.max(solved, 1);
  const completedQty = solved;
  let status = 'planned';
  if (completedQty > 0 && target > 0 && completedQty >= target) status = 'completed';
  else if (completedQty > 0) status = 'partial';
  return { plannedQty, completedQty, status };
}

/**
 * Takvimde yer alan ama henüz weekly_entries bağlantısı olmayan blok için günlük kayıt oluşturur ve bağlar.
 * syncWeeklyEntryPlannerRow çağrılmaz (çift blok oluşmasın).
 */
export default async function handler(req, res) {
  try {
    const actor = requireAuth(req);

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const plannerId = String(req.query.planner_entry_id || req.body?.planner_entry_id || '').trim();
    if (!plannerId) return res.status(400).json({ error: 'planner_entry_id_required' });

    const { data: planner, error: pErr } = await supabaseAdmin
      .from('weekly_planner_entries')
      .select('*')
      .eq('id', plannerId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!planner) return res.status(404).json({ error: 'not_found' });

    if (planner.weekly_entry_id) {
      return res.status(400).json({ error: 'already_linked_use_weekly_entries_patch' });
    }

    const gate = await assertPlannerDailyMutate(actor, planner.student_id);
    if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

    const b = req.body || {};
    const topic = String(b.topic ?? '').trim();
    const subject = String(b.subject ?? planner.subject ?? '').trim() || 'Genel';
    const target = Number(b.target_questions ?? b.targetQuestions ?? planner.planned_quantity ?? 0);
    const solved = Number(b.solved_questions ?? b.solvedQuestions ?? 0);
    const correct = Number(b.correct ?? b.correctAnswers ?? 0);
    const wrong = Number(b.wrong ?? b.wrongAnswers ?? 0);
    const blank = Number(b.blank ?? b.blankAnswers ?? 0);

    if (!(target > 0 || solved > 0)) {
      return res.status(400).json({ error: 'target_or_solved_required' });
    }

    const institutionId = planner.institution_id ?? gate.student?.institution_id ?? actor.institution_id ?? null;
    const entryId = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();

    const entryPayload = {
      id: entryId,
      student_id: planner.student_id,
      date: padDate(planner.planner_date),
      subject,
      topic: topic || subject,
      target_questions: Number.isFinite(target) && target >= 0 ? target : 0,
      solved_questions: Number.isFinite(solved) && solved >= 0 ? solved : 0,
      correct: Number.isFinite(correct) && correct >= 0 ? correct : 0,
      wrong: Number.isFinite(wrong) && wrong >= 0 ? wrong : 0,
      blank: Number.isFinite(blank) && blank >= 0 ? blank : 0,
      notes: b.notes != null ? String(b.notes).slice(0, 2000) : b.coachComment != null ? String(b.coachComment).slice(0, 2000) : null,
      reading_minutes:
        b.reading_minutes != null || b.readingMinutes != null
          ? Number(b.reading_minutes ?? b.readingMinutes)
          : null,
      book_id: b.book_id ?? b.bookId ?? null,
      book_title: b.book_title != null ? String(b.book_title).slice(0, 500) : b.bookTitle != null ? String(b.bookTitle).slice(0, 500) : null,
      institution_id: institutionId,
      created_at: now,
      updated_at: now,
    };

    const { plannedQty, completedQty, status } = derivePlannerStatus(entryPayload.target_questions, entryPayload.solved_questions);
    const title = plannerTitleFromTopic(subject, entryPayload.topic);

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('weekly_entries')
      .insert(entryPayload)
      .select()
      .single();
    if (insErr) throw insErr;

    const { data: updatedPlanner, error: upErr } = await supabaseAdmin
      .from('weekly_planner_entries')
      .update({
        weekly_entry_id: inserted.id,
        subject,
        title,
        planned_quantity: plannedQty,
        completed_quantity: completedQty,
        status,
        updated_at: now,
      })
      .eq('id', plannerId)
      .select()
      .single();
    if (upErr) throw upErr;

    return res.status(200).json({ data: { weekly_entry: inserted, planner_entry: updatedPlanner } });
  } catch (e) {
    console.error('[planner-daily-log]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
