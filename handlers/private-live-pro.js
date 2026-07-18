/**
 * Canlı Özel Ders Profesyonel Modül API
 * Mevcut teacher_lessons / quota / assignments bozulmaz; ek meta + paket + ödeme + dashboard.
 *
 * GET  ?scope=dashboard|packages|enrollments|payments|history|reports|lesson-meta|files|low-credits
 * POST ?op=package|enrollment|lesson-meta|file
 * PATCH ?op=package|enrollment|lesson-meta
 * DELETE ?op=package|file|enrollment
 *
 * Ödeme alanları öğretmen rolüne ASLA dönülmez.
 */
import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  actorIsAdminLike,
  actorRoleSet,
  roleSetHasAdmin,
  roleSetHasSuperAdmin
} from '../api/_lib/actor-roles.js';
import { sumLessonUnitsUsed } from '../api/_lib/count-teacher-lesson-usage.js';
import { upsertPrivateLessonAssignmentRow, deactivatePrivateLessonAssignmentRow } from '../api/_lib/private-lesson-assignment-store.js';
import { getTeacherPanelStudentScope } from '../api/_lib/teacher-class-scope.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });

const PAYMENT_FIELDS = [
  'amount_total',
  'amount_paid',
  'discount',
  'payment_status',
  'due_date',
  'enrollment_notes'
];

function canSeePayments(roleSet) {
  return roleSetHasSuperAdmin(roleSet) || roleSetHasAdmin(roleSet) || roleSet.has('coach');
}

function stripPaymentFields(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const k of PAYMENT_FIELDS) delete out[k];
  return out;
}

function derivePaymentStatus(row) {
  const status = String(row.payment_status || '').trim();
  if (status && status !== 'unpaid') return status;
  const total = Number(row.amount_total || 0);
  const paid = Number(row.amount_paid || 0);
  if (total <= 0 && paid <= 0) return status || 'unpaid';
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0 && paid < total) {
    if (row.due_date) {
      const due = new Date(`${row.due_date}T23:59:59`);
      if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return 'overdue';
    }
    return 'partial';
  }
  if (row.due_date) {
    const due = new Date(`${row.due_date}T23:59:59`);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return 'overdue';
  }
  return status || 'unpaid';
}

async function assertCanAccessStudent(actor, student, roleSet) {
  if (!student) return false;
  if (roleSetHasSuperAdmin(roleSet)) return true;
  if (roleSetHasAdmin(roleSet)) return hasInstitutionAccess(actor, student.institution_id);
  if (roleSet.has('teacher') && actor.sub) {
    if (hasInstitutionAccess(actor, student.institution_id)) {
      const { ids } = await getTeacherPanelStudentScope(actor.sub, actor.institution_id || null);
      return ids.includes(String(student.id || '').trim());
    }
    const { ids } = await getTeacherPanelStudentScope(actor.sub, actor.institution_id || null);
    return ids.includes(String(student.id || '').trim());
  }
  if (roleSet.has('coach')) {
    return Boolean(actor.coach_id && String(student.coach_id || '') === String(actor.coach_id));
  }
  if (roleSet.has('student')) {
    return Boolean(actor.student_id && String(student.id) === String(actor.student_id));
  }
  return false;
}

function schemaMissing(err) {
  return /does not exist|schema cache|column .* does not exist/i.test(errorMessage(err));
}

async function loadEnrollmentStats(row) {
  const used = await sumLessonUnitsUsed(row.student_id, row.teacher_id);
  const cap = row.credits_total == null ? null : Number(row.credits_total);
  const remaining = cap == null ? null : Math.max(0, cap - used);

  const { data: lessons } = await supabaseAdmin
    .from('teacher_lessons')
    .select('id, status')
    .eq('student_id', row.student_id)
    .eq('teacher_id', row.teacher_id);

  const list = lessons || [];
  const completed = list.filter((l) => l.status === 'completed').length;
  const cancelled = list.filter((l) => l.status === 'cancelled').length;
  const pending = list.filter((l) => l.status === 'scheduled').length;

  let makeup = 0;
  let absent = 0;
  if (list.length) {
    const ids = list.map((l) => l.id);
    const { data: meta, error: metaErr } = await supabaseAdmin
      .from('teacher_lesson_session_meta')
      .select('lesson_id, attendance_status')
      .in('lesson_id', ids);
    if (!metaErr) {
      for (const m of meta || []) {
        if (m.attendance_status === 'makeup') makeup += 1;
        if (m.attendance_status === 'absent') absent += 1;
      }
    }
  }

  return {
    used_units: used,
    remaining_units: remaining,
    credits_total: cap,
    total_lessons: list.length,
    completed,
    cancelled,
    pending,
    makeup,
    absent
  };
}

async function enrichEnrollment(row, roleSet, nameMaps = null) {
  const stats = await loadEnrollmentStats(row);
  let maps = nameMaps;
  if (!maps) {
    maps = await loadNameMaps([row]);
  }
  const studentName = maps?.students?.[row.student_id] || row.student_name || null;
  const teacherName = maps?.teachers?.[row.teacher_id] || row.teacher_name || null;
  let out = {
    ...row,
    student_name: studentName,
    teacher_name: teacherName,
    payment_status: derivePaymentStatus(row),
    stats
  };
  if (!canSeePayments(roleSet)) out = stripPaymentFields(out);
  return out;
}

/** Toplu isim çözümü — UI UUID göstermesin */
async function loadNameMaps(rows) {
  const studentIds = [...new Set((rows || []).map((r) => String(r.student_id || '').trim()).filter(Boolean))];
  const teacherIds = [...new Set((rows || []).map((r) => String(r.teacher_id || '').trim()).filter(Boolean))];
  const students = {};
  const teachers = {};

  if (studentIds.length) {
    const { data } = await supabaseAdmin.from('students').select('id, name').in('id', studentIds);
    for (const s of data || []) {
      students[s.id] = s.name || s.id;
    }
  }
  if (teacherIds.length) {
    const { data } = await supabaseAdmin.from('users').select('id, name, email').in('id', teacherIds);
    for (const u of data || []) {
      teachers[u.id] = u.name || u.email || u.id;
    }
  }
  return { students, teachers };
}

async function enrichEnrollmentList(rows, roleSet) {
  const nameMaps = await loadNameMaps(rows);
  const enriched = [];
  for (const row of rows || []) {
    enriched.push(await enrichEnrollment(row, roleSet, nameMaps));
  }
  return enriched;
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const roleSet = await actorRoleSet(actor);
    const scope = typeof req.query?.scope === 'string' ? req.query.scope.trim() : '';
    const op = typeof req.query?.op === 'string' ? req.query.op.trim() : '';

    const staffOk =
      roleSetHasSuperAdmin(roleSet) ||
      roleSetHasAdmin(roleSet) ||
      roleSet.has('teacher') ||
      roleSet.has('coach') ||
      roleSet.has('student');
    if (!staffOk) return jsonError(res, 403, 'forbidden');

    /* ---------- GET ---------- */
    if (req.method === 'GET') {
      if (scope === 'packages') {
        let q = supabaseAdmin
          .from('private_lesson_packages')
          .select('*')
          .eq('active', true)
          .order('sort_order', { ascending: true });
        if (!roleSetHasSuperAdmin(roleSet) && actor.institution_id) {
          q = q.or(`institution_id.eq.${actor.institution_id},institution_id.is.null`);
        }
        const { data, error } = await q;
        if (error) {
          if (schemaMissing(error)) return res.status(200).json({ data: [], hint: 'private_live_pro_sql_missing' });
          throw error;
        }
        return res.status(200).json({ data: data || [] });
      }

      if (scope === 'enrollments' || scope === 'payments') {
        if (scope === 'payments' && !canSeePayments(roleSet)) {
          return jsonError(res, 403, 'payments_forbidden_for_teacher');
        }

        let q = supabaseAdmin.from('student_teacher_lesson_quota').select('*');

        if (roleSet.has('student') && actor.student_id) {
          q = q.eq('student_id', actor.student_id);
        } else if (roleSet.has('teacher') && !actorIsAdminLike(actor, roleSet) && actor.sub) {
          q = q.eq('teacher_id', actor.sub);
        } else if (roleSet.has('coach') && !actorIsAdminLike(actor, roleSet) && actor.coach_id) {
          const { data: students } = await supabaseAdmin
            .from('students')
            .select('id')
            .eq('coach_id', actor.coach_id);
          const ids = (students || []).map((s) => s.id);
          if (!ids.length) return res.status(200).json({ data: [] });
          q = q.in('student_id', ids);
        } else if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet) && actor.institution_id) {
          q = q.eq('institution_id', actor.institution_id);
        }

        const studentFilter =
          typeof req.query?.student_id === 'string' ? req.query.student_id.trim() : '';
        const teacherFilter =
          typeof req.query?.teacher_id === 'string' ? req.query.teacher_id.trim() : '';
        if (studentFilter) q = q.eq('student_id', studentFilter);
        if (teacherFilter) q = q.eq('teacher_id', teacherFilter);

        const { data: rows, error } = await q.order('updated_at', { ascending: false }).limit(500);
        if (error) {
          if (schemaMissing(error)) return res.status(200).json({ data: [], hint: 'private_live_pro_sql_missing' });
          throw error;
        }

        const enriched = await enrichEnrollmentList(rows || [], roleSet);

        if (scope === 'payments') {
          return res.status(200).json({
            data: enriched.map((r) => ({
              ...r,
              payment_status: derivePaymentStatus(r)
            }))
          });
        }
        return res.status(200).json({ data: enriched });
      }

      if (scope === 'low-credits') {
        if (roleSet.has('student')) return jsonError(res, 403, 'forbidden');
        const { data: rows, error } = await supabaseAdmin
          .from('student_teacher_lesson_quota')
          .select('*')
          .not('credits_total', 'is', null)
          .limit(500);
        if (error) {
          if (schemaMissing(error)) return res.status(200).json({ data: [], hint: 'private_live_pro_sql_missing' });
          throw error;
        }
        const warnings = [];
        const candidateRows = [];
        for (const row of rows || []) {
          if (roleSet.has('teacher') && row.teacher_id !== actor.sub) continue;
          if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet) && actor.institution_id) {
            if (row.institution_id && row.institution_id !== actor.institution_id) continue;
          }
          if (roleSet.has('coach') && !actorIsAdminLike(actor, roleSet) && actor.coach_id) {
            const { data: st } = await supabaseAdmin
              .from('students')
              .select('coach_id')
              .eq('id', row.student_id)
              .maybeSingle();
            if (!st || String(st.coach_id) !== String(actor.coach_id)) continue;
          }
          candidateRows.push(row);
        }
        const nameMaps = await loadNameMaps(candidateRows);
        for (const row of candidateRows) {
          const used = await sumLessonUnitsUsed(row.student_id, row.teacher_id);
          const cap = Number(row.credits_total);
          const remaining = Math.max(0, cap - used);
          if (remaining < 5) {
            let out = await enrichEnrollment(
              { ...row, used_units: used, remaining_units: remaining },
              roleSet,
              nameMaps
            );
            out.used_units = used;
            out.remaining_units = remaining;
            warnings.push(out);
          }
        }
        return res.status(200).json({ data: warnings });
      }

      if (scope === 'dashboard') {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        const todayIso = `${y}-${m}-${d}`;
        const tom = new Date(today);
        tom.setDate(tom.getDate() + 1);
        const tomorrowIso = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;

        let lessonQ = supabaseAdmin
          .from('teacher_lessons')
          .select('id, teacher_id, student_id, title, lesson_date, start_time, end_time, status, meeting_link, platform')
          .in('lesson_date', [todayIso, tomorrowIso])
          .eq('status', 'scheduled')
          .order('start_time', { ascending: true });

        if (roleSet.has('student') && actor.student_id) {
          lessonQ = lessonQ.eq('student_id', actor.student_id);
        } else if (roleSet.has('teacher') && !actorIsAdminLike(actor, roleSet) && actor.sub) {
          lessonQ = lessonQ.eq('teacher_id', actor.sub);
        } else if (roleSet.has('coach') && !actorIsAdminLike(actor, roleSet) && actor.coach_id) {
          const { data: students } = await supabaseAdmin
            .from('students')
            .select('id')
            .eq('coach_id', actor.coach_id);
          const ids = (students || []).map((s) => s.id);
          if (!ids.length) {
            return res.status(200).json({
              data: {
                today: [],
                tomorrow: [],
                student_count: 0,
                active_packages: 0,
                upcoming_payments: [],
                low_credits: [],
                cancelled_recent: 0,
                pending_makeups: 0
              }
            });
          }
          lessonQ = lessonQ.in('student_id', ids);
        } else if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet) && actor.institution_id) {
          lessonQ = lessonQ.eq('institution_id', actor.institution_id);
        }

        const { data: nearLessons, error: le } = await lessonQ;
        if (le) throw le;
        const todayLessons = (nearLessons || []).filter((l) => l.lesson_date === todayIso);
        const tomorrowLessons = (nearLessons || []).filter((l) => l.lesson_date === tomorrowIso);

        const enrollRes = await handlerGetEnrollmentsLite(actor, roleSet);
        const enrollments = enrollRes.data || [];
        const studentIds = new Set(enrollments.map((e) => e.student_id));
        const activePackages = enrollments.filter(
          (e) => e.stats?.remaining_units == null || e.stats.remaining_units > 0
        ).length;

        let upcomingPayments = [];
        let lowCredits = [];
        if (canSeePayments(roleSet)) {
          upcomingPayments = enrollments
            .filter((e) => ['partial', 'overdue', 'unpaid'].includes(String(e.payment_status)))
            .slice(0, 20);
        }
        lowCredits = enrollments
          .filter((e) => e.stats?.remaining_units != null && e.stats.remaining_units < 5)
          .slice(0, 20);

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 14);
        const weekIso = weekAgo.toISOString().slice(0, 10);
        let cancelQ = supabaseAdmin
          .from('teacher_lessons')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'cancelled')
          .gte('lesson_date', weekIso);
        if (roleSet.has('teacher') && actor.sub) cancelQ = cancelQ.eq('teacher_id', actor.sub);
        if (roleSet.has('student') && actor.student_id) cancelQ = cancelQ.eq('student_id', actor.student_id);
        const { count: cancelledRecent } = await cancelQ;

        let pendingMakeups = 0;
        {
          const { count, error: muErr } = await supabaseAdmin
            .from('teacher_lesson_session_meta')
            .select('lesson_id', { count: 'exact', head: true })
            .eq('attendance_status', 'makeup');
          if (!muErr) pendingMakeups = count || 0;
        }

        return res.status(200).json({
          data: {
            today: todayLessons,
            tomorrow: tomorrowLessons,
            student_count: studentIds.size,
            active_packages: activePackages,
            upcoming_payments: upcomingPayments,
            low_credits: lowCredits,
            cancelled_recent: cancelledRecent || 0,
            pending_makeups: pendingMakeups
          }
        });
      }

      if (scope === 'history') {
        const studentId =
          typeof req.query?.student_id === 'string' ? req.query.student_id.trim() : '';
        let q = supabaseAdmin
          .from('teacher_lessons')
          .select(
            'id, teacher_id, student_id, title, lesson_date, start_time, end_time, status, platform, meeting_link, recording_link, duration_minutes, bbb_meeting_id'
          )
          .order('lesson_date', { ascending: false })
          .order('start_time', { ascending: false })
          .limit(200);

        if (roleSet.has('student') && actor.student_id) {
          q = q.eq('student_id', actor.student_id);
        } else if (studentId) {
          q = q.eq('student_id', studentId);
        } else if (roleSet.has('teacher') && !actorIsAdminLike(actor, roleSet) && actor.sub) {
          q = q.eq('teacher_id', actor.sub);
        }

        const { data: lessons, error } = await q;
        if (error) throw error;
        const ids = (lessons || []).map((l) => l.id);
        let metaMap = {};
        let filesMap = {};
        let sqlHint = null;
        if (ids.length) {
          const { data: metas, error: metaErr } = await supabaseAdmin
            .from('teacher_lesson_session_meta')
            .select('*')
            .in('lesson_id', ids);
          if (metaErr) {
            if (!schemaMissing(metaErr)) throw metaErr;
            sqlHint = 'private_live_pro_sql_missing';
          } else {
            for (const m of metas || []) metaMap[m.lesson_id] = m;
          }
          const { data: files, error: filesErr } = await supabaseAdmin
            .from('teacher_lesson_files')
            .select('*')
            .in('lesson_id', ids);
          if (filesErr) {
            if (!schemaMissing(filesErr)) throw filesErr;
            sqlHint = 'private_live_pro_sql_missing';
          } else {
            for (const f of files || []) {
              if (!filesMap[f.lesson_id]) filesMap[f.lesson_id] = [];
              filesMap[f.lesson_id].push(f);
            }
          }
        }
        return res.status(200).json({
          data: (lessons || []).map((l) => ({
            ...l,
            date: l.lesson_date,
            meta: metaMap[l.id] || null,
            files: filesMap[l.id] || []
          })),
          ...(sqlHint ? { hint: sqlHint } : {})
        });
      }

      if (scope === 'reports') {
        if (roleSet.has('student')) return jsonError(res, 403, 'forbidden');
        const enrollRes = await handlerGetEnrollmentsLite(actor, roleSet);
        const enrollments = enrollRes.data || [];
        const summary = {
          total_enrollments: enrollments.length,
          total_completed: enrollments.reduce((a, e) => a + (e.stats?.completed || 0), 0),
          total_remaining: enrollments.reduce(
            (a, e) => a + (e.stats?.remaining_units == null ? 0 : e.stats.remaining_units),
            0
          ),
          total_absent: enrollments.reduce((a, e) => a + (e.stats?.absent || 0), 0),
          payment_breakdown: canSeePayments(roleSet)
            ? enrollments.reduce((acc, e) => {
                const s = String(e.payment_status || 'unpaid');
                acc[s] = (acc[s] || 0) + 1;
                return acc;
              }, {})
            : null,
          enrollments: canSeePayments(roleSet)
            ? enrollments
            : enrollments.map((e) => stripPaymentFields(e))
        };
        return res.status(200).json({ data: summary });
      }

      if (scope === 'lesson-meta') {
        const lessonId =
          typeof req.query?.lesson_id === 'string' ? req.query.lesson_id.trim() : '';
        if (!lessonId) return jsonError(res, 400, 'lesson_id_required');
        const { data: lesson, error: le } = await supabaseAdmin
          .from('teacher_lessons')
          .select('*')
          .eq('id', lessonId)
          .maybeSingle();
        if (le) throw le;
        if (!lesson) return jsonError(res, 404, 'lesson_not_found');
        const { data: student } = await supabaseAdmin
          .from('students')
          .select('*')
          .eq('id', lesson.student_id)
          .maybeSingle();
        if (!(await assertCanAccessStudent(actor, student, roleSet))) {
          if (!(roleSet.has('teacher') && lesson.teacher_id === actor.sub)) {
            return jsonError(res, 403, 'forbidden');
          }
        }
        const { data: meta } = await supabaseAdmin
          .from('teacher_lesson_session_meta')
          .select('*')
          .eq('lesson_id', lessonId)
          .maybeSingle();
        const { data: files } = await supabaseAdmin
          .from('teacher_lesson_files')
          .select('*')
          .eq('lesson_id', lessonId)
          .order('created_at', { ascending: false });
        return res.status(200).json({ data: { lesson, meta: meta || null, files: files || [] } });
      }

      if (scope === 'files') {
        const lessonId =
          typeof req.query?.lesson_id === 'string' ? req.query.lesson_id.trim() : '';
        if (!lessonId) return jsonError(res, 400, 'lesson_id_required');
        const { data, error } = await supabaseAdmin
          .from('teacher_lesson_files')
          .select('*')
          .eq('lesson_id', lessonId)
          .order('created_at', { ascending: false });
        if (error) {
          if (schemaMissing(error)) return res.status(200).json({ data: [], hint: 'private_live_pro_sql_missing' });
          throw error;
        }
        return res.status(200).json({ data: data || [] });
      }

      return jsonError(res, 400, 'unknown_scope');
    }

    /* ---------- POST ---------- */
    if (req.method === 'POST') {
      const body = req.body || {};

      if (op === 'package') {
        if (!actorIsAdminLike(actor, roleSet)) return jsonError(res, 403, 'forbidden');
        const name = String(body.name || '').trim();
        if (!name) return jsonError(res, 400, 'name_required');
        const isUnlimited = Boolean(body.is_unlimited);
        const row = {
          institution_id: roleSetHasSuperAdmin(roleSet)
            ? body.institution_id || actor.institution_id || null
            : actor.institution_id || null,
          name,
          lesson_count: isUnlimited ? null : Number(body.lesson_count || 0),
          is_unlimited: isUnlimited,
          price: Number(body.price || 0),
          discount: Number(body.discount || 0),
          duration_minutes: Number(body.duration_minutes || 60),
          active: body.active !== false,
          sort_order: Number(body.sort_order || 0),
          notes: body.notes ? String(body.notes) : null,
          updated_at: new Date().toISOString()
        };
        const { data, error } = await supabaseAdmin
          .from('private_lesson_packages')
          .insert(row)
          .select('*')
          .single();
        if (error) {
          if (schemaMissing(error)) return jsonError(res, 503, 'private_live_pro_sql_missing');
          throw error;
        }
        return res.status(201).json({ data });
      }

      if (op === 'enrollment') {
        if (!actorIsAdminLike(actor, roleSet) && !roleSet.has('coach')) {
          return jsonError(res, 403, 'forbidden');
        }
        const studentId = String(body.student_id || '').trim();
        const teacherId = String(body.teacher_id || '').trim();
        if (!studentId || !teacherId) return jsonError(res, 400, 'student_teacher_required');

        const { data: student, error: se } = await supabaseAdmin
          .from('students')
          .select('*')
          .eq('id', studentId)
          .maybeSingle();
        if (se) throw se;
        if (!student) return jsonError(res, 404, 'student_not_found');
        if (!(await assertCanAccessStudent(actor, student, roleSet)) && !actorIsAdminLike(actor, roleSet)) {
          return jsonError(res, 403, 'forbidden');
        }

        const isUnlimited = Boolean(body.is_unlimited) || body.credits_total == null;
        const payload = {
          institution_id: student.institution_id || actor.institution_id || null,
          student_id: studentId,
          teacher_id: teacherId,
          credits_total: isUnlimited ? null : Number(body.credits_total),
          package_id: body.package_id || null,
          package_label: body.package_label ? String(body.package_label) : null,
          coach_id: body.coach_id || student.coach_id || null,
          subject: body.subject ? String(body.subject) : null,
          class_level: body.class_level ? String(body.class_level) : null,
          start_date: body.start_date || null,
          end_date: body.end_date || null,
          weekly_lesson_count:
            body.weekly_lesson_count != null ? Number(body.weekly_lesson_count) : null,
          duration_minutes: body.duration_minutes != null ? Number(body.duration_minutes) : 60,
          updated_at: new Date().toISOString()
        };

        if (canSeePayments(roleSet)) {
          payload.amount_total = Number(body.amount_total || 0);
          payload.amount_paid = Number(body.amount_paid || 0);
          payload.discount = Number(body.discount || 0);
          payload.payment_status = body.payment_status || derivePaymentStatus(payload);
          payload.due_date = body.due_date || null;
          payload.enrollment_notes = body.enrollment_notes
            ? String(body.enrollment_notes)
            : null;
        }

        const { data, error } = await supabaseAdmin
          .from('student_teacher_lesson_quota')
          .upsert(payload, { onConflict: 'student_id,teacher_id' })
          .select('*')
          .single();
        if (error) {
          if (schemaMissing(error)) {
            // Fallback: eski şema — sadece kota alanları
            const { data: legacy, error: le2 } = await supabaseAdmin
              .from('student_teacher_lesson_quota')
              .upsert(
                {
                  institution_id: payload.institution_id,
                  student_id: studentId,
                  teacher_id: teacherId,
                  credits_total: payload.credits_total,
                  updated_at: payload.updated_at
                },
                { onConflict: 'student_id,teacher_id' }
              )
              .select('*')
              .single();
            if (le2) throw le2;
            await upsertPrivateLessonAssignmentRow({
              institutionId: payload.institution_id,
              teacherId,
              studentId,
              active: true
            }).catch(() => null);
            return res.status(201).json({
              data: await enrichEnrollment(legacy, roleSet),
              hint: 'private_live_pro_sql_missing_partial'
            });
          }
          throw error;
        }

        await upsertPrivateLessonAssignmentRow({
          institutionId: payload.institution_id,
          teacherId,
          studentId,
          active: true
        }).catch(() => null);

        return res.status(201).json({ data: await enrichEnrollment(data, roleSet) });
      }

      if (op === 'lesson-meta') {
        const lessonId = String(body.lesson_id || '').trim();
        if (!lessonId) return jsonError(res, 400, 'lesson_id_required');
        const { data: lesson, error: le } = await supabaseAdmin
          .from('teacher_lessons')
          .select('*')
          .eq('id', lessonId)
          .maybeSingle();
        if (le) throw le;
        if (!lesson) return jsonError(res, 404, 'lesson_not_found');
        const teacherOk = roleSet.has('teacher') && lesson.teacher_id === actor.sub;
        if (!teacherOk && !actorIsAdminLike(actor, roleSet) && !roleSet.has('coach')) {
          return jsonError(res, 403, 'forbidden');
        }

        const row = {
          lesson_id: lessonId,
          attendance_status: body.attendance_status || null,
          topic: body.topic != null ? String(body.topic) : null,
          gains: body.gains != null ? String(body.gains) : null,
          gaps: body.gaps != null ? String(body.gaps) : null,
          homework: body.homework != null ? String(body.homework) : null,
          next_plan: body.next_plan != null ? String(body.next_plan) : null,
          notes: body.notes != null ? String(body.notes) : null,
          coach_note: body.coach_note != null ? String(body.coach_note) : null,
          updated_by: actor.sub || null,
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabaseAdmin
          .from('teacher_lesson_session_meta')
          .upsert(row, { onConflict: 'lesson_id' })
          .select('*')
          .single();
        if (error) {
          if (schemaMissing(error)) return jsonError(res, 503, 'private_live_pro_sql_missing');
          throw error;
        }

        // Yoklama "present/late" ise dersi completed yap (kota düşümü mevcut completed mantığıyla)
        if (['present', 'late'].includes(String(row.attendance_status)) && lesson.status === 'scheduled') {
          await supabaseAdmin
            .from('teacher_lessons')
            .update({ status: 'completed' })
            .eq('id', lessonId);
        }
        if (row.attendance_status === 'cancelled' && lesson.status === 'scheduled') {
          await supabaseAdmin
            .from('teacher_lessons')
            .update({ status: 'cancelled' })
            .eq('id', lessonId);
        }

        return res.status(200).json({ data });
      }

      if (op === 'file') {
        const lessonId = String(body.lesson_id || '').trim();
        const title = String(body.title || '').trim();
        const url = String(body.url || '').trim();
        if (!lessonId || !title || !url) return jsonError(res, 400, 'lesson_title_url_required');
        const { data: lesson } = await supabaseAdmin
          .from('teacher_lessons')
          .select('teacher_id, student_id')
          .eq('id', lessonId)
          .maybeSingle();
        if (!lesson) return jsonError(res, 404, 'lesson_not_found');
        const teacherOk = roleSet.has('teacher') && lesson.teacher_id === actor.sub;
        if (!teacherOk && !actorIsAdminLike(actor, roleSet) && !roleSet.has('coach')) {
          return jsonError(res, 403, 'forbidden');
        }
        const row = {
          lesson_id: lessonId,
          file_type: body.file_type || 'link',
          title,
          url,
          created_by: actor.sub || null
        };
        const { data, error } = await supabaseAdmin
          .from('teacher_lesson_files')
          .insert(row)
          .select('*')
          .single();
        if (error) {
          if (schemaMissing(error)) return jsonError(res, 503, 'private_live_pro_sql_missing');
          throw error;
        }
        return res.status(201).json({ data });
      }

      return jsonError(res, 400, 'unknown_op');
    }

    /* ---------- PATCH ---------- */
    if (req.method === 'PATCH') {
      const body = req.body || {};

      if (op === 'package') {
        if (!actorIsAdminLike(actor, roleSet)) return jsonError(res, 403, 'forbidden');
        const id = String(body.id || req.query?.id || '').trim();
        if (!id) return jsonError(res, 400, 'id_required');
        const patch = { updated_at: new Date().toISOString() };
        for (const k of [
          'name',
          'lesson_count',
          'is_unlimited',
          'price',
          'discount',
          'duration_minutes',
          'active',
          'sort_order',
          'notes'
        ]) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        const { data, error } = await supabaseAdmin
          .from('private_lesson_packages')
          .update(patch)
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
      }

      if (op === 'enrollment') {
        if (!actorIsAdminLike(actor, roleSet) && !roleSet.has('coach')) {
          return jsonError(res, 403, 'forbidden');
        }
        const id = String(body.id || '').trim();
        const studentId = String(body.student_id || '').trim();
        const teacherId = String(body.teacher_id || '').trim();
        if (!id && !(studentId && teacherId)) return jsonError(res, 400, 'id_or_pair_required');

        const patch = { updated_at: new Date().toISOString() };
        for (const k of [
          'credits_total',
          'package_id',
          'package_label',
          'coach_id',
          'subject',
          'class_level',
          'start_date',
          'end_date',
          'weekly_lesson_count',
          'duration_minutes',
          'teacher_id'
        ]) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        if (body.is_unlimited === true) {
          patch.credits_total = null;
        } else if (body.is_unlimited === false && body.credits_total !== undefined) {
          patch.credits_total = body.credits_total == null ? null : Number(body.credits_total);
        }
        if (canSeePayments(roleSet)) {
          for (const k of PAYMENT_FIELDS) {
            if (body[k] !== undefined) patch[k] = body[k];
          }
          if (patch.amount_total != null || patch.amount_paid != null || patch.due_date != null) {
            patch.payment_status = body.payment_status || derivePaymentStatus({ ...body, ...patch });
          }
        }

        let upd = supabaseAdmin.from('student_teacher_lesson_quota').update(patch);
        if (id) upd = upd.eq('id', id);
        else upd = upd.eq('student_id', studentId).eq('teacher_id', teacherId);

        const { data, error } = await upd.select('*').maybeSingle();
        if (error) throw error;
        if (!data) return jsonError(res, 404, 'enrollment_not_found');

        // Öğretmen değiştiyse geçmiş dersler silinmez; atama güncellenir
        if (body.teacher_id && body.previous_teacher_id && body.teacher_id !== body.previous_teacher_id) {
          await deactivatePrivateLessonAssignmentRow({
            studentId: data.student_id,
            teacherId: body.previous_teacher_id
          }).catch(() => null);
          await upsertPrivateLessonAssignmentRow({
            institutionId: data.institution_id,
            teacherId: body.teacher_id,
            studentId: data.student_id,
            active: true
          }).catch(() => null);
        } else {
          await upsertPrivateLessonAssignmentRow({
            institutionId: data.institution_id,
            teacherId: data.teacher_id,
            studentId: data.student_id,
            active: true
          }).catch(() => null);
        }

        return res.status(200).json({ data: await enrichEnrollment(data, roleSet) });
      }

      if (op === 'lesson-meta') {
        const lessonId = String(body.lesson_id || '').trim();
        if (!lessonId) return jsonError(res, 400, 'lesson_id_required');
        const { data: lesson, error: le } = await supabaseAdmin
          .from('teacher_lessons')
          .select('*')
          .eq('id', lessonId)
          .maybeSingle();
        if (le) throw le;
        if (!lesson) return jsonError(res, 404, 'lesson_not_found');
        const teacherOk = roleSet.has('teacher') && lesson.teacher_id === actor.sub;
        if (!teacherOk && !actorIsAdminLike(actor, roleSet) && !roleSet.has('coach')) {
          return jsonError(res, 403, 'forbidden');
        }
        const row = {
          lesson_id: lessonId,
          attendance_status: body.attendance_status ?? undefined,
          topic: body.topic !== undefined ? String(body.topic) : undefined,
          gains: body.gains !== undefined ? String(body.gains) : undefined,
          gaps: body.gaps !== undefined ? String(body.gaps) : undefined,
          homework: body.homework !== undefined ? String(body.homework) : undefined,
          next_plan: body.next_plan !== undefined ? String(body.next_plan) : undefined,
          notes: body.notes !== undefined ? String(body.notes) : undefined,
          coach_note: body.coach_note !== undefined ? String(body.coach_note) : undefined,
          updated_by: actor.sub || null,
          updated_at: new Date().toISOString()
        };
        Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
        const { data, error } = await supabaseAdmin
          .from('teacher_lesson_session_meta')
          .upsert(row, { onConflict: 'lesson_id' })
          .select('*')
          .single();
        if (error) {
          if (schemaMissing(error)) return jsonError(res, 503, 'private_live_pro_sql_missing');
          throw error;
        }
        return res.status(200).json({ data });
      }

      return jsonError(res, 400, 'unknown_op');
    }

    /* ---------- DELETE ---------- */
    if (req.method === 'DELETE') {
      if (op === 'package') {
        if (!actorIsAdminLike(actor, roleSet)) return jsonError(res, 403, 'forbidden');
        const id = String(req.query?.id || req.body?.id || '').trim();
        if (!id) return jsonError(res, 400, 'id_required');
        const { error } = await supabaseAdmin
          .from('private_lesson_packages')
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
      if (op === 'file') {
        const id = String(req.query?.id || req.body?.id || '').trim();
        if (!id) return jsonError(res, 400, 'id_required');
        const { error } = await supabaseAdmin.from('teacher_lesson_files').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
      if (op === 'enrollment') {
        if (!actorIsAdminLike(actor, roleSet) && !roleSet.has('coach')) {
          return jsonError(res, 403, 'forbidden');
        }
        const id = String(req.query?.id || req.body?.id || '').trim();
        const studentId = String(req.query?.student_id || req.body?.student_id || '').trim();
        const teacherId = String(req.query?.teacher_id || req.body?.teacher_id || '').trim();
        if (!id && !(studentId && teacherId)) return jsonError(res, 400, 'id_or_pair_required');

        let q = supabaseAdmin.from('student_teacher_lesson_quota').select('id, student_id, teacher_id');
        if (id) q = q.eq('id', id);
        else q = q.eq('student_id', studentId).eq('teacher_id', teacherId);
        const { data: row, error: findErr } = await q.maybeSingle();
        if (findErr) throw findErr;
        if (!row) return jsonError(res, 404, 'enrollment_not_found');

        const { error } = await supabaseAdmin
          .from('student_teacher_lesson_quota')
          .delete()
          .eq('id', row.id);
        if (error) throw error;

        await deactivatePrivateLessonAssignmentRow({
          studentId: row.student_id,
          teacherId: row.teacher_id
        }).catch(() => null);

        return res.status(200).json({ ok: true, id: row.id });
      }
      return jsonError(res, 400, 'unknown_op');
    }

    return jsonError(res, 405, 'method_not_allowed');
  } catch (e) {
    console.error('[private-live-pro]', e);
    return jsonError(res, 500, errorMessage(e));
  }
}

/** Internal helper — aynı yetki filtreleriyle enrollment listesi */
async function handlerGetEnrollmentsLite(actor, roleSet) {
  let q = supabaseAdmin.from('student_teacher_lesson_quota').select('*');
  if (roleSet.has('student') && actor.student_id) {
    q = q.eq('student_id', actor.student_id);
  } else if (roleSet.has('teacher') && !actorIsAdminLike(actor, roleSet) && actor.sub) {
    q = q.eq('teacher_id', actor.sub);
  } else if (roleSet.has('coach') && !actorIsAdminLike(actor, roleSet) && actor.coach_id) {
    const { data: students } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('coach_id', actor.coach_id);
    const ids = (students || []).map((s) => s.id);
    if (!ids.length) return { data: [] };
    q = q.in('student_id', ids);
  } else if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet) && actor.institution_id) {
    q = q.eq('institution_id', actor.institution_id);
  }
  const { data: rows, error } = await q.limit(500);
  if (error) {
    if (schemaMissing(error)) return { data: [], hint: 'private_live_pro_sql_missing' };
    throw error;
  }
  return { data: await enrichEnrollmentList(rows || [], roleSet) };
}
