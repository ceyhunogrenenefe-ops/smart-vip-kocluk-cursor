/**
 * Öğrenci aktiflik dönemleri
 * GET  /api/student-activity?student_id= | coach_id= | op=audit
 * POST /api/student-activity?op=create|set-status|update|close
 */
import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  actorRoleSet,
  actorIsAdminLike,
  roleSetHasSuperAdmin
} from '../api/_lib/actor-roles.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import { isMissingTableError } from '../api/_lib/supabase-schema.js';
import {
  PERIOD_TYPES,
  ACTIVITY_STATUSES,
  padYmd,
  loadPeriodsForStudents,
  resolveDisplayStatus,
  assertNoActiveOverlap,
  writeActivityAudit,
  isActiveFromPeriods
} from '../api/_lib/student-activity.js';

function jsonError(res, status, error, extra) {
  return res.status(status).json({ error, ...extra });
}

async function resolveCoachIdForActor(actor) {
  if (actor.coach_id) return String(actor.coach_id);
  if (!actor.sub) return null;
  const { data: u } = await supabaseAdmin.from('users').select('email').eq('id', actor.sub).maybeSingle();
  const em = u?.email ? String(u.email).toLowerCase().trim() : '';
  if (!em) return null;
  const { data: c } = await supabaseAdmin.from('coaches').select('id').ilike('email', em).maybeSingle();
  return c?.id ? String(c.id) : null;
}

async function loadStudentOr404(studentId) {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id,name,coach_id,institution_id')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function assertCanManageStudent(actor, roleSet, student) {
  if (!student) return jsonError;
  if (roleSetHasSuperAdmin(roleSet)) return true;
  if (actorIsAdminLike(actor, roleSet)) {
    if (!hasInstitutionAccess(actor, student.institution_id)) {
      const e = new Error('Kurum dışı öğrenci');
      e.status = 403;
      throw e;
    }
    return true;
  }
  if (roleSet.has('coach') || String(actor.role) === 'coach') {
    const coachId = await resolveCoachIdForActor(actor);
    if (!coachId || String(student.coach_id) !== coachId) {
      const e = new Error('Bu öğrenci size bağlı değil');
      e.status = 403;
      throw e;
    }
    return true;
  }
  const e = new Error('Yetkiniz yok');
  e.status = 403;
  throw e;
}

function normalizePeriodBody(body) {
  const start_date = padYmd(body.start_date || body.startDate);
  const end_date =
    body.end_date === null || body.end_date === '' || body.endDate === ''
      ? null
      : padYmd(body.end_date ?? body.endDate);
  const status = String(body.status || 'active').toLowerCase();
  const period_type = String(body.period_type || body.periodType || 'custom').toLowerCase();
  if (!start_date) {
    const e = new Error('start_date gerekli (YYYY-MM-DD)');
    e.status = 400;
    throw e;
  }
  if (end_date && end_date < start_date) {
    const e = new Error('end_date start_date’den önce olamaz');
    e.status = 400;
    throw e;
  }
  if (!ACTIVITY_STATUSES.includes(status)) {
    const e = new Error('status active|passive olmalı');
    e.status = 400;
    throw e;
  }
  if (!PERIOD_TYPES.includes(period_type)) {
    const e = new Error('period_type summer|school_year|custom olmalı');
    e.status = 400;
    throw e;
  }
  return {
    start_date,
    end_date,
    status,
    period_type,
    passive_reason: body.passive_reason != null ? String(body.passive_reason).trim() || null : body.passiveReason != null ? String(body.passiveReason).trim() || null : null,
    note: body.note != null ? String(body.note).trim() || null : null,
    coach_id: body.coach_id != null ? String(body.coach_id).trim() || null : body.coachId != null ? String(body.coachId).trim() || null : null
  };
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const roleSet = await actorRoleSet(actor);
    const op = String(req.query?.op || '').trim();

    if (req.method === 'GET') {
      const studentId = String(req.query?.student_id || '').trim();
      const coachIdQ = String(req.query?.coach_id || '').trim();
      const today = getIstanbulDateString();

      if (op === 'audit' && studentId) {
        const student = await loadStudentOr404(studentId);
        if (!student) return jsonError(res, 404, 'student_not_found');
        await assertCanManageStudent(actor, roleSet, student);
        const { data, error } = await supabaseAdmin
          .from('student_activity_audit_logs')
          .select('*')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) {
          if (isMissingTableError(error, 'student_activity_audit_logs')) {
            return res.status(200).json({ data: [], hint: 'audit_table_missing' });
          }
          throw error;
        }
        return res.status(200).json({ data: data || [] });
      }

      let studentIds = [];
      if (studentId) {
        const student = await loadStudentOr404(studentId);
        if (!student) return jsonError(res, 404, 'student_not_found');
        await assertCanManageStudent(actor, roleSet, student);
        studentIds = [studentId];
      } else {
        let coachId = coachIdQ;
        if (!coachId && (roleSet.has('coach') || actor.role === 'coach')) {
          coachId = await resolveCoachIdForActor(actor);
        }
        if (!coachId && !actorIsAdminLike(actor, roleSet) && !roleSetHasSuperAdmin(roleSet)) {
          return jsonError(res, 400, 'student_id or coach_id required');
        }
        let q = supabaseAdmin.from('students').select('id,coach_id,name,institution_id');
        if (coachId) q = q.eq('coach_id', coachId);
        else if (!roleSetHasSuperAdmin(roleSet) && actor.institution_id) {
          q = q.eq('institution_id', actor.institution_id);
        }
        const { data, error } = await q.limit(2000);
        if (error) throw error;
        studentIds = (data || []).map((s) => String(s.id));
      }

      const periodsMap = await loadPeriodsForStudents(studentIds, {
        coachId: coachIdQ || undefined
      });

      const studentsOut = studentIds.map((sid) => {
        const periods = periodsMap.get(sid) || [];
        const display = resolveDisplayStatus(periods, today, coachIdQ || undefined);
        return {
          student_id: sid,
          display_status: display.status,
          display_label: display.label,
          scheduled_start: display.starts || null,
          active_on_today: isActiveFromPeriods(periods, today, { coachId: coachIdQ || undefined }),
          periods
        };
      });

      return res.status(200).json({
        today,
        count: studentsOut.length,
        students: studentsOut,
        periods_by_student: Object.fromEntries([...periodsMap.entries()])
      });
    }

    if (req.method !== 'POST') return jsonError(res, 405, 'method_not_allowed');

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const studentId = String(body.student_id || body.studentId || req.query?.student_id || '').trim();
    if (!studentId) return jsonError(res, 400, 'student_id_required');

    const student = await loadStudentOr404(studentId);
    if (!student) return jsonError(res, 404, 'student_not_found');
    await assertCanManageStudent(actor, roleSet, student);

    const coachId =
      body.coach_id ||
      body.coachId ||
      student.coach_id ||
      (await resolveCoachIdForActor(actor));

    if (op === 'create' || op === 'set-status' || !op) {
      const fields = normalizePeriodBody({
        ...body,
        coach_id: coachId,
        status: body.status || (op === 'set-status' ? body.status : 'active')
      });

      // set-status: hızlı aktif/pasif — önceki açık aktif dönemi kapat, yeni dönem aç
      if (op === 'set-status') {
        const want = String(body.status || '').toLowerCase();
        if (!ACTIVITY_STATUSES.includes(want)) {
          return jsonError(res, 400, 'status active|passive olmalı');
        }
        const today = padYmd(body.effective_date || body.start_date) || getIstanbulDateString();
        const map = await loadPeriodsForStudents([studentId], { coachId });
        const periods = map.get(studentId) || [];
        const openActive = periods.filter(
          (p) =>
            String(p.status) === 'active' &&
            (!p.end_date || padYmd(p.end_date) >= today) &&
            padYmd(p.start_date) <= today
        );

        if (want === 'passive') {
          for (const p of openActive) {
            const end = padYmd(body.end_date) || today;
            const { data: updated, error } = await supabaseAdmin
              .from('student_activity_periods')
              .update({
                end_date: end < padYmd(p.start_date) ? padYmd(p.start_date) : end,
                updated_at: new Date().toISOString(),
                passive_reason: fields.passive_reason,
                note: fields.note
              })
              .eq('id', p.id)
              .select('*')
              .single();
            if (error) throw error;
            await writeActivityAudit({
              studentId,
              periodId: p.id,
              actorUserId: actor.sub,
              action: 'close_active_for_passive',
              previousValue: p,
              newValue: updated
            });
          }
          // Pasif dönem kaydı (raporlama / neden)
          await assertNoActiveOverlap({
            studentId,
            coachId,
            startDate: today,
            endDate: fields.end_date,
            status: 'passive'
          });
          const { data: inserted, error: insErr } = await supabaseAdmin
            .from('student_activity_periods')
            .insert({
              student_id: studentId,
              coach_id: coachId || null,
              start_date: today,
              end_date: fields.end_date,
              status: 'passive',
              period_type: fields.period_type,
              passive_reason: fields.passive_reason,
              note: fields.note,
              created_by: actor.sub,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select('*')
            .single();
          if (insErr) throw insErr;
          await writeActivityAudit({
            studentId,
            periodId: inserted.id,
            actorUserId: actor.sub,
            action: 'set_passive',
            previousValue: null,
            newValue: inserted
          });
          return res.status(200).json({ ok: true, period: inserted, display_status: 'passive' });
        }

        // want === active
        const start = padYmd(body.start_date) || today;
        await assertNoActiveOverlap({
          studentId,
          coachId,
          startDate: start,
          endDate: fields.end_date,
          status: 'active'
        });
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from('student_activity_periods')
          .insert({
            student_id: studentId,
            coach_id: coachId || null,
            start_date: start,
            end_date: fields.end_date,
            status: 'active',
            period_type: fields.period_type,
            passive_reason: null,
            note: fields.note,
            created_by: actor.sub,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('*')
          .single();
        if (insErr) throw insErr;
        await writeActivityAudit({
          studentId,
          periodId: inserted.id,
          actorUserId: actor.sub,
          action: 'set_active',
          previousValue: null,
          newValue: inserted
        });
        return res.status(200).json({ ok: true, period: inserted, display_status: 'active' });
      }

      await assertNoActiveOverlap({
        studentId,
        coachId,
        startDate: fields.start_date,
        endDate: fields.end_date,
        status: fields.status
      });

      const { data: inserted, error } = await supabaseAdmin
        .from('student_activity_periods')
        .insert({
          student_id: studentId,
          coach_id: fields.coach_id || coachId || null,
          start_date: fields.start_date,
          end_date: fields.end_date,
          status: fields.status,
          period_type: fields.period_type,
          passive_reason: fields.passive_reason,
          note: fields.note,
          created_by: actor.sub,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('*')
        .single();
      if (error) {
        if (isMissingTableError(error, 'student_activity_periods')) {
          return jsonError(res, 503, 'student_activity_periods tablosu yok — SQL migration çalıştırın', {
            code: 'migration_required'
          });
        }
        throw error;
      }
      await writeActivityAudit({
        studentId,
        periodId: inserted.id,
        actorUserId: actor.sub,
        action: 'create_period',
        previousValue: null,
        newValue: inserted
      });
      return res.status(200).json({ ok: true, period: inserted });
    }

    if (op === 'update') {
      const periodId = String(body.period_id || body.id || '').trim();
      if (!periodId) return jsonError(res, 400, 'period_id_required');
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('student_activity_periods')
        .select('*')
        .eq('id', periodId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!existing || String(existing.student_id) !== studentId) {
        return jsonError(res, 404, 'period_not_found');
      }
      const fields = normalizePeriodBody({ ...existing, ...body, coach_id: body.coach_id ?? existing.coach_id });
      await assertNoActiveOverlap({
        studentId,
        coachId: fields.coach_id || coachId,
        startDate: fields.start_date,
        endDate: fields.end_date,
        excludeId: periodId,
        status: fields.status
      });
      const { data: updated, error } = await supabaseAdmin
        .from('student_activity_periods')
        .update({
          start_date: fields.start_date,
          end_date: fields.end_date,
          status: fields.status,
          period_type: fields.period_type,
          passive_reason: fields.passive_reason,
          note: fields.note,
          coach_id: fields.coach_id || coachId,
          updated_at: new Date().toISOString()
        })
        .eq('id', periodId)
        .select('*')
        .single();
      if (error) throw error;
      await writeActivityAudit({
        studentId,
        periodId,
        actorUserId: actor.sub,
        action: 'update_period',
        previousValue: existing,
        newValue: updated
      });
      return res.status(200).json({ ok: true, period: updated });
    }

    if (op === 'close') {
      const periodId = String(body.period_id || body.id || '').trim();
      const end = padYmd(body.end_date) || getIstanbulDateString();
      if (!periodId) return jsonError(res, 400, 'period_id_required');
      const { data: existing } = await supabaseAdmin
        .from('student_activity_periods')
        .select('*')
        .eq('id', periodId)
        .maybeSingle();
      if (!existing || String(existing.student_id) !== studentId) {
        return jsonError(res, 404, 'period_not_found');
      }
      const { data: updated, error } = await supabaseAdmin
        .from('student_activity_periods')
        .update({ end_date: end, updated_at: new Date().toISOString() })
        .eq('id', periodId)
        .select('*')
        .single();
      if (error) throw error;
      await writeActivityAudit({
        studentId,
        periodId,
        actorUserId: actor.sub,
        action: 'close_period',
        previousValue: existing,
        newValue: updated
      });
      return res.status(200).json({ ok: true, period: updated });
    }

    return jsonError(res, 400, 'unknown_op', { allowed: ['create', 'set-status', 'update', 'close'] });
  } catch (e) {
    const msg = errorMessage(e);
    const status = Number(e?.status) || (msg.includes('Unauthorized') ? 401 : 500);
    if (e?.code === 'activity_period_overlap') {
      return jsonError(res, 400, msg, { code: e.code });
    }
    if (isMissingTableError(e, 'student_activity_periods')) {
      return jsonError(res, 503, 'student_activity_periods tablosu yok — SQL migration çalıştırın', {
        code: 'migration_required'
      });
    }
    console.error('[student-activity]', msg);
    return jsonError(res, status, msg);
  }
}
