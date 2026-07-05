import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { toPlannerMinutes, timeRangesOverlapHalfOpen, snapToContainingHourSlot } from '../api/_lib/planner-slot-conflict.js';
import { syncWeeklyEntryPlannerRow } from '../api/_lib/sync-weekly-entry-planner.js';

const padDate = (v) => String(v || '').trim().slice(0, 10);

function isEtutSubject(s) {
  const n = String(s ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return n === 'etüt' || n === 'etut' || n.includes('etüt') || n.includes('etut');
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

const assertStudentMutate = async (actor, studentId) => {
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

function normalizeLine(raw) {
  const subject = String(raw?.subject ?? '').trim();
  const topic = String(raw?.topic ?? '').trim();
  const correct = Math.max(0, Number(raw?.correct ?? raw?.correctAnswers ?? 0) || 0);
  const wrong = Math.max(0, Number(raw?.wrong ?? raw?.wrongAnswers ?? 0) || 0);
  const blank = Math.max(0, Number(raw?.blank ?? raw?.blankAnswers ?? 0) || 0);
  const solved = correct + wrong + blank;
  const notes = raw?.notes != null ? String(raw.notes).slice(0, 2000) : null;
  return { subject, topic, correct, wrong, blank, solved, notes };
}

function buildEtutPlannerTitle(lines) {
  const parts = lines
    .filter((l) => l.solved > 0)
    .map((l) => {
      const sub = l.subject || 'Ders';
      const top = l.topic ? ` · ${l.topic}` : '';
      return `${sub}${top} (${l.solved})`;
    });
  return parts.length ? `Etüt: ${parts.join(', ')}` : 'Etüt';
}

function derivePlannerStatus(plannedQty, completedQty) {
  const plan = Math.max(0, Number(plannedQty) || 0);
  const done = Math.max(0, Number(completedQty) || 0);
  let status = 'planned';
  if (plan > 0) {
    if (done >= plan) status = 'completed';
    else if (done > 0) status = 'partial';
  } else if (done > 0) {
    status = 'partial';
  }
  return { plannedQty: plan, completedQty: done, status };
}

async function findEtutPlannerBlock(studentId, plannerDate, startTime, endTime) {
  const { data, error } = await supabaseAdmin
    .from('weekly_planner_entries')
    .select('*')
    .eq('student_id', studentId)
    .eq('planner_date', padDate(plannerDate));
  if (error) throw error;

  const rows = (data || []).filter((r) => isEtutSubject(r.subject) || isEtutSubject(r.title));
  if (!rows.length) return null;

  const st = startTime ? String(startTime).trim().slice(0, 8) : '';
  const et = endTime ? String(endTime).trim().slice(0, 8) : '';
  if (st && et) {
    const a1 = toPlannerMinutes(st);
    const b1 = toPlannerMinutes(et);
    if (a1 != null && b1 != null && b1 > a1) {
      const exact = rows.find((r) => {
        const rs = toPlannerMinutes(r.start_time);
        const re = toPlannerMinutes(r.end_time);
        return rs === a1 && re === b1;
      });
      if (exact) return exact;

      const overlap = rows.find((r) => {
        const rs = toPlannerMinutes(r.start_time);
        const re = toPlannerMinutes(r.end_time);
        if (rs == null || re == null || re <= rs) return false;
        return timeRangesOverlapHalfOpen(a1, b1, rs, re);
      });
      if (overlap) return overlap;
    }
  }

  const open = rows.find((r) => !r.weekly_entry_id);
  if (open) return open;
  if (rows.length === 1) return rows[0];
  return rows.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))[0];
}

async function createEtutPlannerBlock(studentId, institutionId, plannerDate, startTime, endTime) {
  const slot = snapToContainingHourSlot(startTime || endTime || '12:00');
  const now = new Date().toISOString();
  const id = `wpe-etut-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const row = {
    id,
    student_id: studentId,
    institution_id: institutionId,
    subject: 'Etüt',
    title: 'Etüt',
    planned_quantity: 0,
    completed_quantity: 0,
    planner_date: padDate(plannerDate),
    start_time: slot.start_time,
    end_time: slot.end_time,
    status: 'planned',
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await supabaseAdmin.from('weekly_planner_entries').insert(row).select().single();
  if (error) throw error;
  return data;
}

/**
 * Etüt raporu: weekly_entries oluşturur ve mevcut Etüt plan bloğuna (aynı saat) bağlar.
 */
export default async function handler(req, res) {
  try {
    const actor = requireAuth(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const b = req.body || {};
    const studentId = String(
      actor.role === 'student' ? actor.student_id : b.student_id ?? b.studentId ?? ''
    ).trim();
    if (!studentId) return res.status(400).json({ error: 'student_id_required' });

    const gate = await assertStudentMutate(actor, studentId);
    if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

    const rawLines = Array.isArray(b.lines) ? b.lines : [];
    if (!rawLines.length) return res.status(400).json({ error: 'lines_required' });

    const lines = rawLines.map(normalizeLine).filter((l) => l.subject && l.topic);
    if (!lines.length) return res.status(400).json({ error: 'lines_required' });
    for (const line of lines) {
      if (!(line.solved > 0)) return res.status(400).json({ error: 'solved_required', subject: line.subject });
    }

    const plannerDate = padDate(b.planner_date ?? b.plannerDate ?? b.date ?? lines[0]?.date);
    if (!plannerDate) return res.status(400).json({ error: 'date_required' });

    const plannerEntryId = String(b.planner_entry_id ?? b.plannerEntryId ?? '').trim();
    const startTime = b.start_time ?? b.startTime ?? null;
    const endTime = b.end_time ?? b.endTime ?? null;
    const summaryNotes = b.notes != null ? String(b.notes).slice(0, 2000) : null;

    let anchor = null;
    if (plannerEntryId) {
      const { data, error } = await supabaseAdmin
        .from('weekly_planner_entries')
        .select('*')
        .eq('id', plannerEntryId)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.student_id !== studentId) return res.status(404).json({ error: 'planner_not_found' });
      anchor = data;
    }

    if (!anchor) {
      anchor = await findEtutPlannerBlock(studentId, plannerDate, startTime, endTime);
    }

    if (!anchor && startTime && endTime) {
      anchor = await createEtutPlannerBlock(
        studentId,
        gate.student?.institution_id ?? actor.institution_id ?? null,
        plannerDate,
        startTime,
        endTime
      );
    }

    const institutionId = gate.student?.institution_id ?? actor.institution_id ?? anchor?.institution_id ?? null;
    const now = new Date().toISOString();
    const createdEntries = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const entryId = `entry-etut-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`;
      const notes = line.notes ?? (i === 0 ? summaryNotes : summaryNotes ? `[Etüt] ${summaryNotes}` : null);
      const payload = {
        id: entryId,
        student_id: studentId,
        date: plannerDate,
        subject: line.subject,
        topic: line.topic,
        target_questions: line.solved,
        solved_questions: line.solved,
        correct: line.correct,
        wrong: line.wrong,
        blank: line.blank,
        notes,
        institution_id: institutionId,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await supabaseAdmin.from('weekly_entries').insert(payload).select().single();
      if (error) throw error;
      createdEntries.push(data);
    }

    let updatedPlanner = null;
    const etutSlot = snapToContainingHourSlot(
      anchor?.start_time || startTime || endTime || '12:00'
    );
    const etutIgnoreIds = anchor ? [anchor.id] : [];

    if (anchor) {
      const totalSolved = lines.reduce((s, l) => s + l.solved, 0);
      const plannedQty = Math.max(Number(anchor.planned_quantity) || 0, totalSolved);
      const { completedQty, status } = derivePlannerStatus(plannedQty, totalSolved);
      const title = buildEtutPlannerTitle(lines);
      const primaryEntry = createdEntries[0];

      let linkedEntryId = anchor.weekly_entry_id || null;
      if (linkedEntryId) {
        const { data: linked } = await supabaseAdmin
          .from('weekly_entries')
          .select('id')
          .eq('id', linkedEntryId)
          .maybeSingle();
        if (!linked) linkedEntryId = null;
      }

      if (!linkedEntryId) {
        linkedEntryId = primaryEntry.id;
      } else {
        await supabaseAdmin
          .from('weekly_entries')
          .update({
            subject: primaryEntry.subject,
            topic: primaryEntry.topic,
            target_questions: primaryEntry.target_questions,
            solved_questions: primaryEntry.solved_questions,
            correct: primaryEntry.correct,
            wrong: primaryEntry.wrong,
            blank: primaryEntry.blank,
            notes: primaryEntry.notes,
            updated_at: now,
          })
          .eq('id', linkedEntryId);
        await supabaseAdmin.from('weekly_entries').delete().eq('id', primaryEntry.id);
        createdEntries[0] = { ...primaryEntry, id: linkedEntryId };
      }

      const { data, error } = await supabaseAdmin
        .from('weekly_planner_entries')
        .update({
          weekly_entry_id: linkedEntryId,
          subject: 'Etüt',
          title,
          planned_quantity: plannedQty,
          completed_quantity: completedQty,
          status,
          start_time: etutSlot.start_time,
          end_time: etutSlot.end_time,
          updated_at: now,
        })
        .eq('id', anchor.id)
        .select()
        .single();
      if (error) throw error;
      updatedPlanner = data;
    }

    const anchorLinkedId = updatedPlanner?.weekly_entry_id || null;
    for (const entry of createdEntries) {
      if (anchorLinkedId && entry.id === anchorLinkedId) continue;
      try {
        await syncWeeklyEntryPlannerRow(entry, {
          preferredStart: etutSlot.start_time,
          preferredEnd: etutSlot.end_time,
          ignoreOverlapIds: etutIgnoreIds,
        });
      } catch (se) {
        console.error('[etut-session-report] syncWeeklyEntryPlannerRow', se);
      }
    }

    return res.status(200).json({
      data: {
        weekly_entries: createdEntries,
        planner_entry: updatedPlanner,
      },
    });
  } catch (e) {
    console.error('[etut-session-report]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
