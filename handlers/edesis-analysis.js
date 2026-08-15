/**
 * Edesis sınav analizi API
 * GET/POST /api/edesis-analysis?op=
 * student-analysis | save-evaluation | list-evaluations | publish-evaluation
 * generate-pdf | poll-pdf | list-pdfs | share-log | dashboard | thresholds
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import { isMissingTableError } from '../api/_lib/supabase-schema.js';
import { studentIdsForTeacher } from '../api/_lib/student-teacher-scope.js';
import {
  generateEdesisExamReport,
  pollEdesisReportJob,
  getEdesisConfig,
  fetchEdesisDefaultTermId,
  fetchEdesisStudentResults,
  mapEdesisRowToExamDraft,
  pickEdesisResultExamId
} from '../api/_lib/edesis-client.js';
import {
  payloadToExam,
  buildFullStudentAnalysis,
  inferExamFamilyFromClassLevel,
  resolveEdesisExamId,
  mergeExamListsPreferRicher,
  examHasResult,
  EDESIS_REPORT_CODES,
  EDESIS_REPORT_LABELS,
  ANALYSIS_STATUS_LABELS,
  DEFAULT_TOPIC_THRESHOLDS
} from '../api/_lib/edesis-exam-analysis.js';

const STAFF = new Set(['super_admin', 'admin', 'coach', 'teacher']);
const STUDENT_OPS = new Set(['student-analysis', 'list-evaluations', 'list-pdfs']);
const SHARE_OPS = new Set(['generate-pdf', 'poll-pdf', 'share-log', 'list-pdfs']);

function tagsOf(actor, dbTags) {
  const set = new Set(Array.isArray(dbTags) ? dbTags : []);
  if (actor?.role) set.add(String(actor.role).toLowerCase());
  if (Array.isArray(actor?.roles)) actor.roles.forEach((r) => set.add(String(r).toLowerCase()));
  return [...set];
}

function isSuper(tags) {
  return tags.includes('super_admin');
}
function isAdmin(tags) {
  return tags.includes('admin') || isSuper(tags);
}
function isCoach(tags) {
  return tags.includes('coach');
}
function isTeacher(tags) {
  return tags.includes('teacher');
}
function isStudent(tags) {
  return tags.includes('student');
}

function turkishError(msg, status) {
  const m = String(msg || '');
  if (status === 401 || /Missing token|Token expired|Invalid token/i.test(m)) {
    return 'Oturum geçersiz veya süresi doldu. Tekrar giriş yapın.';
  }
  if (status === 403 || /forbidden/i.test(m)) {
    return 'Bu işlem için yetkiniz yok.';
  }
  if (/EDESIS_API_KEY/i.test(m)) {
    return 'Edesis API anahtarı sunucuda tanımlı değil. Yöneticiden Vercel ortam değişkenini kontrol etmesini isteyin.';
  }
  if (/401/.test(m) && /edesis|api.?key/i.test(m)) {
    return 'Edesis API anahtarı geçersiz. Bağlantı ayarlarını kontrol edin.';
  }
  if (/403/.test(m) && /edesis|scope/i.test(m)) {
    return 'Edesis yetki paketi yetersiz (exams:read / reports:generate).';
  }
  if (/429/.test(m)) return 'Edesis istek limiti aşıldı; sistem kısa süre sonra yeniden deneyecek.';
  if (/student_not_found/.test(m)) return 'Öğrenci bulunamadı.';
  if (/not_approved/.test(m)) return 'Onaylanmamış otomatik taslak öğrenciye veya veliye gönderilemez.';
  return m;
}

async function loadTeacherBranch(actor) {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('branch, school')
      .eq('id', actor.sub)
      .maybeSingle();
    if (error) return null;
    return String(data?.branch || data?.school || '').trim() || null;
  } catch {
    return null;
  }
}

async function loadStudentRow(studentId) {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id, name, email, phone, parent_phone, institution_id, coach_id, edesis_ogrenci_id, class_level')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function assertCanAccessStudent(actor, tags, student) {
  if (!student) {
    const err = new Error('student_not_found');
    err.status = 404;
    throw err;
  }
  if (isSuper(tags)) return;
  if (isStudent(tags) && !isAdmin(tags) && !isCoach(tags) && !isTeacher(tags)) {
    const own = String(actor.student_id || '').trim();
    if (own && own === String(student.id)) return;
    const err = new Error('forbidden');
    err.status = 403;
    throw err;
  }
  const inst = actor?.institution_id;
  if (inst && student.institution_id && student.institution_id !== inst && !isSuper(tags)) {
    const err = new Error('forbidden_institution');
    err.status = 403;
    throw err;
  }
  if (isCoach(tags) && !isAdmin(tags)) {
    const coachId = String(actor.coach_id || '').trim();
    if (coachId && String(student.coach_id || '').trim() !== coachId) {
      const err = new Error('forbidden_coach');
      err.status = 403;
      throw err;
    }
  }
  if (isTeacher(tags) && !isAdmin(tags) && !isCoach(tags)) {
    const ids = await studentIdsForTeacher(actor.sub, actor.institution_id || student.institution_id);
    if (!ids.includes(String(student.id))) {
      const err = new Error('forbidden_teacher');
      err.status = 403;
      throw err;
    }
  }
}

async function loadStudentExams(studentId) {
  const { data, error } = await supabaseAdmin
    .from('exam_results')
    .select('id, student_id, exam_name, date, net_score, correct, wrong, blank, app_payload, institution_id, created_at, updated_at')
    .eq('student_id', studentId)
    .order('date', { ascending: false })
    .limit(200);
  if (error) throw error;
  const local = (data || [])
    .map((row) => {
      try {
        const exam = payloadToExam(row);
        if (row.created_at && !exam.createdAt) exam.createdAt = row.created_at;
        if (row.updated_at) exam.updatedAt = row.updated_at;
        return exam;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  let edesisStudentId = '';
  let institutionId = null;
  try {
    const { data: st } = await supabaseAdmin
      .from('students')
      .select('edesis_ogrenci_id, institution_id')
      .eq('id', studentId)
      .maybeSingle();
    edesisStudentId = String(st?.edesis_ogrenci_id || '').trim();
    institutionId = st?.institution_id || null;
  } catch {
    /* sınıf / eşleşme yoksa yerel liste yeter */
  }

  const cfg = getEdesisConfig();
  if (!edesisStudentId || !cfg.apiKey) return local;

  try {
    const liveFetch = await fetchEdesisStudentResults(edesisStudentId, cfg, { enrichSubjects: true });
    const live = (liveFetch.rows || [])
      .map((row) => {
        try {
          const draft = mapEdesisRowToExamDraft(row, { studentId, institutionId });
          const eid = pickEdesisResultExamId(row) || draft.edesisExamId;
          if (eid) {
            draft.edesisExamId = String(eid);
            draft.id = `edesis-${eid}-${studentId}`;
          }
          // Canlı listede createdAt=şimdi olmasın; sıralama examDate ile kalsın
          if (draft.examDate) {
            draft.createdAt = `${String(draft.examDate).slice(0, 10)}T12:00:00.000Z`;
          }
          return draft;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const merged = mergeExamListsPreferRicher(local, live);

    // Analizde görünen yeni Edesis sonuçlarını yerel tabloya yaz (ExamTracking vb.)
    const localKeys = new Set(
      local.map((e) => resolveEdesisExamId(e)).filter(Boolean).map(String)
    );
    const missing = live.filter((e) => {
      const id = resolveEdesisExamId(e);
      return id && !localKeys.has(String(id)) && examHasResult(e);
    });
    for (const exam of missing.slice(0, 30)) {
      try {
        const now = new Date().toISOString();
        const totals = (exam.subjects || []).reduce(
          (a, s) => ({
            correct: a.correct + (s.correct ?? 0),
            wrong: a.wrong + (s.wrong ?? 0),
            blank: a.blank + (s.blank ?? 0)
          }),
          { correct: 0, wrong: 0, blank: 0 }
        );
        const tq = totals.correct + totals.wrong + totals.blank;
        await supabaseAdmin.from('exam_results').upsert(
          {
            id: exam.id,
            student_id: studentId,
            exam_name: String(exam.examTitle || exam.examType || 'Deneme'),
            date: String(exam.examDate || now).slice(0, 10),
            raw_score: null,
            net_score: exam.totalNet,
            correct: totals.correct,
            wrong: totals.wrong,
            blank: totals.blank,
            total_questions: tq > 0 ? tq : null,
            institution_id: institutionId,
            app_payload: exam,
            updated_at: now,
            created_at: exam.createdAt || now
          },
          { onConflict: 'id' }
        );
      } catch {
        /* tek satır yazılamasa analiz yine döner */
      }
    }

    return merged;
  } catch {
    return local;
  }
}

async function loadThresholds(institutionId) {
  if (!institutionId) return DEFAULT_TOPIC_THRESHOLDS;
  const { data, error } = await supabaseAdmin
    .from('edesis_topic_thresholds')
    .select('bands')
    .eq('institution_id', institutionId)
    .maybeSingle();
  if (error && isMissingTableError(error, 'edesis_topic_thresholds')) return DEFAULT_TOPIC_THRESHOLDS;
  if (error) throw error;
  return Array.isArray(data?.bands) && data.bands.length ? data.bands : DEFAULT_TOPIC_THRESHOLDS;
}

function changedFields(prev, next) {
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  const out = [];
  for (const k of keys) {
    if (JSON.stringify(prev?.[k] ?? '') !== JSON.stringify(next?.[k] ?? '')) out.push(k);
  }
  return out;
}

async function dashboardFor(actor, tags) {
  let q = supabaseAdmin.from('exam_results').select('id, student_id, date, net_score, institution_id');
  if (!isSuper(tags) && actor.institution_id) q = q.eq('institution_id', actor.institution_id);
  const { data: exams, error } = await q.limit(3000);
  if (error) throw error;

  let studentsQ = supabaseAdmin.from('students').select('id, name, coach_id, institution_id, edesis_ogrenci_id');
  if (!isSuper(tags) && actor.institution_id) studentsQ = studentsQ.eq('institution_id', actor.institution_id);
  if (isCoach(tags) && !isAdmin(tags) && actor.coach_id) studentsQ = studentsQ.eq('coach_id', actor.coach_id);
  const { data: students, error: se } = await studentsQ.limit(3000);
  if (se) throw se;

  let scopedStudents = students || [];
  if (isTeacher(tags) && !isAdmin(tags) && !isCoach(tags)) {
    const ids = new Set(await studentIdsForTeacher(actor.sub, actor.institution_id));
    scopedStudents = scopedStudents.filter((s) => ids.has(s.id));
  }
  const studentIds = new Set(scopedStudents.map((s) => s.id));
  const scopedExams = (exams || []).filter((e) => studentIds.has(e.student_id));

  const byStudent = new Map();
  for (const e of scopedExams) {
    const exam = {
      examDate: e.date,
      date: e.date,
      totalNet: e.net_score,
      net: e.net_score
    };
    if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, []);
    byStudent.get(e.student_id).push(exam);
  }

  const falling = [];
  const rising = [];
  const pendingEval = [];
  for (const st of scopedStudents) {
    const list = (byStudent.get(st.id) || [])
      .filter((x) => x)
      .sort((a, b) => Date.parse(b.examDate || b.date || 0) - Date.parse(a.examDate || a.date || 0));
    const withRes = list.filter((x) => x.totalNet != null || x.correct || x.wrong);
    if (withRes.length >= 2) {
      const d = Number(withRes[0].totalNet) - Number(withRes[1].totalNet);
      if (d < 0) falling.push({ id: st.id, name: st.name, change: Math.round(d * 100) / 100 });
      if (d > 0) rising.push({ id: st.id, name: st.name, change: Math.round(d * 100) / 100 });
    }
  }

  let reports = [];
  let reportsQ = supabaseAdmin
    .from('student_analysis_reports')
    .select('id, student_id, status, updated_at, institution_id')
    .is('deleted_at', null)
    .limit(500);
  if (!isSuper(tags) && actor.institution_id) reportsQ = reportsQ.eq('institution_id', actor.institution_id);
  const { data: reps, error: re } = await reportsQ;
  if (!re) reports = (reps || []).filter((r) => studentIds.has(r.student_id));
  else if (!isMissingTableError(re, 'student_analysis_reports')) throw re;

  const evalByStudent = new Set(reports.filter((r) => r.status !== 'draft').map((r) => r.student_id));
  for (const st of scopedStudents) {
    if (byStudent.get(st.id)?.length && !evalByStudent.has(st.id)) {
      pendingEval.push({ id: st.id, name: st.name });
    }
  }

  let shares = [];
  let pdfs = [];
  try {
    const { data, error: shErr } = await supabaseAdmin.from('report_share_logs').select('id, delivery_status').limit(500);
    if (!shErr) shares = data || [];
  } catch {
    shares = [];
  }
  try {
    const { data, error: pdfErr } = await supabaseAdmin
      .from('generated_exam_reports')
      .select('id, status')
      .is('deleted_at', null)
      .limit(500);
    if (!pdfErr) pdfs = data || [];
  } catch {
    pdfs = [];
  }

  return {
    role: tags.find((t) => STAFF.has(t) || t === 'student') || actor.role,
    studentCount: scopedStudents.length,
    syncedStudents: scopedStudents.filter((s) => s.edesis_ogrenci_id).length,
    examCount: scopedExams.length,
    falling: falling.sort((a, b) => a.change - b.change).slice(0, 20),
    rising: rising.sort((a, b) => b.change - a.change).slice(0, 20),
    pendingEvaluations: pendingEval.slice(0, 30),
    reportsAwaitingApproval: reports.filter((r) => r.status === 'admin_review' || r.status === 'coach_review').length,
    unpublishedReports: reports.filter((r) => r.status === 'approved').length,
    pdfCount: (pdfs || []).length,
    shareCount: (shares || []).length,
    shareFailed: (shares || []).filter((s) => s.delivery_status === 'failed').length
  };
}

export default async function handler(req, res) {
  const op = String(req.query?.op || req.body?.op || 'student-analysis').trim();
  try {
    const actor = requireAuthenticatedActor(req);
    const dbTags = await normalizedUserRolesFromDb(actor.sub);
    const tags = tagsOf(actor, dbTags);
    const staff = tags.some((t) => STAFF.has(t));
    const studentOnly = isStudent(tags) && !staff;

    if (studentOnly && !STUDENT_OPS.has(op)) {
      return res.status(403).json({ error: 'forbidden', hint: 'Öğrenci yalnızca kendi analizini görebilir' });
    }
    if (!staff && !studentOnly) {
      return res.status(403).json({ error: 'forbidden' });
    }

    if (op === 'dashboard') {
      try {
        const dash = await dashboardFor(actor, tags);
        return res.status(200).json({ ok: true, dashboard: dash });
      } catch (e) {
        return res.status(200).json({
          ok: true,
          dashboard: {
            role: actor.role,
            studentCount: 0,
            syncedStudents: 0,
            examCount: 0,
            falling: [],
            rising: [],
            pendingEvaluations: [],
            reportsAwaitingApproval: 0,
            unpublishedReports: 0,
            pdfCount: 0,
            shareCount: 0,
            shareFailed: 0,
            hint: turkishError(errorMessage(e), 500)
          }
        });
      }
    }

    if (op === 'connection-status') {
      if (!isAdmin(tags)) return res.status(403).json({ error: 'forbidden', hint: 'Bu işlem için yetkiniz yok.' });
      const cfg = getEdesisConfig();
      return res.status(200).json({
        ok: true,
        connected: Boolean(cfg.apiKey),
        baseUrl: cfg.baseUrl || null,
        authMode: 'x-api-key',
        keyConfigured: Boolean(cfg.apiKey),
        hint: cfg.apiKey
          ? 'API anahtarı yalnızca sunucuda saklanır; tarayıcıya gönderilmez.'
          : 'Vercel EDESIS_API_KEY tanımlayın. Anahtar arayüzde tutulmaz.'
      });
    }

    if (op === 'thresholds' && req.method === 'POST') {
      if (!isAdmin(tags)) return res.status(403).json({ error: 'forbidden' });
      const bands = Array.isArray(req.body?.bands) ? req.body.bands : DEFAULT_TOPIC_THRESHOLDS;
      const institutionId = actor.institution_id;
      if (!institutionId) return res.status(400).json({ error: 'institution_required' });
      const { error } = await supabaseAdmin.from('edesis_topic_thresholds').upsert({
        institution_id: institutionId,
        bands,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      return res.status(200).json({ ok: true, bands });
    }

    const studentId = String(req.query?.studentId || req.body?.studentId || actor.student_id || '').trim();
    if (!studentId) return res.status(400).json({ error: 'studentId_required' });
    const student = await loadStudentRow(studentId);
    await assertCanAccessStudent(actor, tags, student);

    if (op === 'student-analysis') {
      const exams = await loadStudentExams(studentId);
      const requestedFamily = String(req.query?.family || req.body?.family || '').trim();
      const family =
        !requestedFamily || requestedFamily === 'all' || requestedFamily === 'hepsi'
          ? null
          : requestedFamily;
      const window = String(req.query?.window || req.body?.window || 'last10').trim();
      const from = req.query?.from || req.body?.from || null;
      const to = req.query?.to || req.body?.to || null;
      const examIds = req.body?.examIds || (req.query?.examIds ? String(req.query.examIds).split(',') : null);
      const thresholds = await loadThresholds(student.institution_id);
      let teacherBranch = null;
      if (isTeacher(tags) && !isAdmin(tags) && !isCoach(tags)) {
        teacherBranch = await loadTeacherBranch(actor);
      }
      const analysis = buildFullStudentAnalysis(exams, {
        family,
        window,
        from,
        to,
        examIds,
        thresholds,
        studentName: student.name,
        teacherBranch
      });
      return res.status(200).json({
        ok: true,
        student: {
          id: student.id,
          name: student.name,
          classLevel: student.class_level,
          edesisStudentId: student.edesis_ogrenci_id,
          parentPhone: student.parent_phone
        },
        analysis,
        inferredFamily: family,
        teacherBranch,
        statusLabels: ANALYSIS_STATUS_LABELS
      });
    }

    if (op === 'archive-evaluation') {
      if (studentOnly) return res.status(403).json({ error: 'forbidden', hint: 'Bu işlem için yetkiniz yok.' });
      const reportId = String(req.body?.reportId || req.query?.reportId || '').trim();
      if (!reportId) return res.status(400).json({ error: 'reportId_required', hint: 'Rapor seçin.' });
      const { data: prev, error: pe } = await supabaseAdmin
        .from('student_analysis_reports')
        .select('id, student_id, status')
        .eq('id', reportId)
        .maybeSingle();
      if (pe) throw pe;
      if (!prev || prev.student_id !== studentId) return res.status(404).json({ error: 'report_not_found' });
      const { data, error } = await supabaseAdmin
        .from('student_analysis_reports')
        .update({
          deleted_at: new Date().toISOString(),
          status: 'archived',
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId)
        .select()
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ ok: true, item: data });
    }

    if (op === 'list-versions') {
      const reportId = String(req.query?.reportId || req.body?.reportId || '').trim();
      if (!reportId) return res.status(400).json({ error: 'reportId_required' });
      const { data: prev, error: pe } = await supabaseAdmin
        .from('student_analysis_reports')
        .select('id, student_id')
        .eq('id', reportId)
        .maybeSingle();
      if (pe) throw pe;
      if (!prev || prev.student_id !== studentId) return res.status(404).json({ error: 'report_not_found' });
      const { data, error } = await supabaseAdmin
        .from('student_analysis_report_versions')
        .select('id, version_no, editor_id, editor_role, changed_fields, created_at')
        .eq('report_id', reportId)
        .order('version_no', { ascending: false })
        .limit(50);
      if (error && isMissingTableError(error, 'student_analysis_report_versions')) {
        return res.status(200).json({ ok: true, items: [] });
      }
      if (error) throw error;
      return res.status(200).json({ ok: true, items: data || [] });
    }

    if (op === 'list-evaluations') {
      const { data, error } = await supabaseAdmin
        .from('student_analysis_reports')
        .select('id, status, window_key, exam_family, sections, auto_draft, created_by, created_by_role, created_at, updated_at, published_at, shared_parent_at')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error && isMissingTableError(error, 'student_analysis_reports')) {
        return res.status(200).json({ ok: true, items: [], hint: 'SQL 2026-08-14-edesis-exam-analysis-module.sql çalıştırın' });
      }
      if (error) throw error;
      let items = data || [];
      if (studentOnly) {
        items = items.filter((r) => ['published_student', 'shared_parent', 'approved'].includes(r.status));
      }
      return res.status(200).json({ ok: true, items });
    }

    if (op === 'save-evaluation') {
      if (studentOnly) return res.status(403).json({ error: 'forbidden' });
      const sections = req.body?.sections && typeof req.body.sections === 'object' ? req.body.sections : {};
      const autoDraft = req.body?.autoDraft && typeof req.body.autoDraft === 'object' ? req.body.autoDraft : {};
      const chartPayload = req.body?.chartPayload && typeof req.body.chartPayload === 'object' ? req.body.chartPayload : {};
      const examIds = Array.isArray(req.body?.examIds) ? req.body.examIds.map(String) : [];
      const status = String(req.body?.status || 'draft').trim() || 'draft';
      const reportId = String(req.body?.reportId || '').trim();
      const windowKey = String(req.body?.window || 'last5').trim();
      const examFamily = String(req.body?.family || '').trim() || null;
      const now = new Date().toISOString();

      if (reportId) {
        const { data: prev, error: pe } = await supabaseAdmin
          .from('student_analysis_reports')
          .select('*')
          .eq('id', reportId)
          .maybeSingle();
        if (pe) throw pe;
        if (!prev || prev.student_id !== studentId) return res.status(404).json({ error: 'report_not_found' });
        const fields = changedFields(prev.sections, sections);
        const { data: vers } = await supabaseAdmin
          .from('student_analysis_report_versions')
          .select('version_no')
          .eq('report_id', reportId)
          .order('version_no', { ascending: false })
          .limit(1);
        const versionNo = (vers?.[0]?.version_no || 0) + 1;
        await supabaseAdmin.from('student_analysis_report_versions').insert({
          report_id: reportId,
          version_no: versionNo,
          editor_id: actor.sub,
          editor_role: actor.role,
          changed_fields: fields,
          previous_sections: prev.sections,
          sections
        });
        const { data, error } = await supabaseAdmin
          .from('student_analysis_reports')
          .update({
            sections,
            auto_draft: autoDraft,
            chart_payload: chartPayload,
            exam_ids: examIds,
            window_key: windowKey,
            exam_family: examFamily,
            status: status === 'draft' && fields.length ? 'revised' : status,
            updated_at: now
          })
          .eq('id', reportId)
          .select()
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ ok: true, item: data, versionNo });
      }

      const { data, error } = await supabaseAdmin
        .from('student_analysis_reports')
        .insert({
          institution_id: student.institution_id,
          student_id: studentId,
          status,
          window_key: windowKey,
          exam_family: examFamily,
          exam_ids: examIds,
          auto_draft: autoDraft,
          sections,
          chart_payload: chartPayload,
          created_by: actor.sub,
          created_by_role: actor.role
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (examIds.length) {
        await supabaseAdmin.from('student_analysis_report_exams').insert(
          examIds.map((exam_id) => ({ report_id: data.id, exam_id }))
        );
      }
      return res.status(200).json({ ok: true, item: data });
    }

    if (op === 'publish-evaluation') {
      if (studentOnly) return res.status(403).json({ error: 'forbidden' });
      const reportId = String(req.body?.reportId || '').trim();
      if (!reportId) return res.status(400).json({ error: 'reportId_required' });
      const { data: prev, error: pe } = await supabaseAdmin
        .from('student_analysis_reports')
        .select('*')
        .eq('id', reportId)
        .maybeSingle();
      if (pe) throw pe;
      if (!prev || prev.student_id !== studentId) return res.status(404).json({ error: 'report_not_found' });
      if (prev.status === 'draft' && !isAdmin(tags)) {
        return res.status(400).json({
          error: 'not_approved',
          hint: 'Onaylanmamış otomatik taslak öğrenciye aktarılamaz'
        });
      }
      const { data, error } = await supabaseAdmin
        .from('student_analysis_reports')
        .update({
          status: 'published_student',
          published_at: new Date().toISOString(),
          approved_by: isAdmin(tags) ? actor.sub : prev.approved_by,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId)
        .select()
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ ok: true, item: data });
    }

    if (op === 'generate-pdf') {
      if (studentOnly) return res.status(403).json({ error: 'forbidden' });
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      let examId = String(req.body?.examId || req.query?.examId || '').trim();
      const codesRaw = req.body?.reportCodes || req.query?.reportCodes || [102];
      const reportCodes = (Array.isArray(codesRaw) ? codesRaw : String(codesRaw).split(','))
        .map((c) => Number(c))
        .filter((c) => [EDESIS_REPORT_CODES.KARNE, EDESIS_REPORT_CODES.BK5, EDESIS_REPORT_CODES.BK10].includes(c));
      if (!/^\d+$/.test(examId)) {
        const exams = await loadStudentExams(studentId);
        const fromRow = exams.find((e) => String(e.id || '') === examId);
        examId =
          resolveEdesisExamId(fromRow || { id: examId }) ||
          exams.map((e) => resolveEdesisExamId(e)).find(Boolean) ||
          '';
      }
      if (!examId) {
        return res.status(400).json({
          error: 'examId_required',
          hint: 'Bu öğrencinin sonuçlarında Edesis sınav numarası yok. Senkron çalıştırın veya sınavı tablodan seçin.'
        });
      }
      if (!student.edesis_ogrenci_id) {
        return res.status(400).json({
          error: 'edesis_student_id_missing',
          hint: 'Öğrenci Edesis ID ile eşleşmemiş. Edesis sayfasından eşleştirin.'
        });
      }
      if (!reportCodes.length) return res.status(400).json({ error: 'reportCodes_required' });
      const forceNew = Boolean(req.body?.forceNew);
      if (!forceNew) {
        const { data: existing } = await supabaseAdmin
          .from('generated_exam_reports')
          .select('id, report_code, report_label, exam_title, status, report_url, job_id, created_at, edesis_exam_id')
          .eq('student_id', studentId)
          .eq('edesis_exam_id', examId)
          .in('report_code', reportCodes)
          .is('deleted_at', null)
          .not('report_url', 'is', null)
          .order('created_at', { ascending: false });
        const byCode = new Map();
        for (const row of existing || []) {
          if (!byCode.has(row.report_code) && row.report_url) byCode.set(row.report_code, row);
        }
        if (reportCodes.every((c) => byCode.has(c))) {
          const items = reportCodes.map((c) => byCode.get(c));
          return res.status(200).json({
            ok: true,
            reused: true,
            reportUrl: items[0]?.report_url,
            status: 'completed',
            message: 'Önceden oluşturulmuş rapor kullanıldı. Yeniden oluşturmak için forceNew işaretleyin.',
            items
          });
        }
      }
      const termId = req.body?.termId ?? (await fetchEdesisDefaultTermId(cfg));
      const report = await generateEdesisExamReport(
        {
          examId,
          termId,
          studentIds: [student.edesis_ogrenci_id],
          reportCodes,
          forceNew
        },
        cfg
      );
      const rows = reportCodes.map((code) => ({
        institution_id: student.institution_id,
        student_id: studentId,
        edesis_student_id: student.edesis_ogrenci_id,
        edesis_exam_id: examId,
        term_id: termId != null ? String(termId) : null,
        report_code: code,
        report_label: EDESIS_REPORT_LABELS[code] || String(code),
        exam_title: String(req.body?.examTitle || ''),
        status: report.reportUrl ? 'completed' : String(report.status || 'processing').toLowerCase(),
        job_id: report.jobId,
        report_url: report.reportUrl,
        force_new: forceNew,
        created_by: actor.sub
      }));
      const { data, error } = await supabaseAdmin.from('generated_exam_reports').insert(rows).select();
      if (error && !isMissingTableError(error, 'generated_exam_reports')) throw error;
      return res.status(200).json({
        ok: true,
        reportUrl: report.reportUrl,
        jobId: report.jobId,
        status: report.status,
        message: report.message,
        items: data || rows
      });
    }

    if (op === 'poll-pdf') {
      const jobId = String(req.query?.jobId || req.body?.jobId || '').trim();
      const reportId = String(req.query?.reportId || req.body?.reportId || '').trim();
      if (!jobId && !reportId) return res.status(400).json({ error: 'jobId_required' });
      let row = null;
      if (reportId) {
        const { data } = await supabaseAdmin.from('generated_exam_reports').select('*').eq('id', reportId).maybeSingle();
        row = data;
      }
      const jid = jobId || row?.job_id;
      if (!jid) return res.status(400).json({ error: 'jobId_required' });
      const cfg = getEdesisConfig();
      try {
        const payload = await pollEdesisReportJob(cfg, jid, { maxAttempts: 8, delayMs: 2000 });
        const reportUrl = payload.reportUrl || null;
        if (reportUrl && row?.id) {
          await supabaseAdmin
            .from('generated_exam_reports')
            .update({
              report_url: reportUrl,
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', row.id);
        }
        return res.status(200).json({ ok: true, reportUrl, status: payload.status || 'Completed', jobId: jid });
      } catch (e) {
        return res.status(200).json({
          ok: false,
          jobId: jid,
          status: 'processing',
          message: errorMessage(e)
        });
      }
    }

    if (op === 'list-pdfs') {
      const { data, error } = await supabaseAdmin
        .from('generated_exam_reports')
        .select('id, report_code, report_label, exam_title, status, report_url, job_id, created_at, created_by, viewed_at, edesis_exam_id, term_id')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(80);
      if (error && isMissingTableError(error, 'generated_exam_reports')) {
        return res.status(200).json({ ok: true, items: [] });
      }
      if (error) throw error;
      return res.status(200).json({ ok: true, items: data || [] });
    }

    if (op === 'share-log') {
      if (studentOnly) return res.status(403).json({ error: 'forbidden' });
      if (!SHARE_OPS.has(op) && !staff) return res.status(403).json({ error: 'forbidden' });
      const { data: recent } = await supabaseAdmin
        .from('report_share_logs')
        .select('id, created_at, report_url, report_type')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(5);
      const reportUrl = String(req.body?.reportUrl || '').trim();
      const dup = (recent || []).find((r) => r.report_url === reportUrl && Date.now() - Date.parse(r.created_at) < 10 * 60 * 1000);
      if (dup && !req.body?.confirmDuplicate) {
        return res.status(409).json({
          error: 'duplicate_share',
          hint: 'Bu rapor son 10 dakikada veliye gönderildi. Tekrar göndermek için onaylayın.',
          lastShareAt: dup.created_at
        });
      }
      const { data, error } = await supabaseAdmin
        .from('report_share_logs')
        .insert({
          institution_id: student.institution_id,
          student_id: studentId,
          generated_report_id: req.body?.generatedReportId || null,
          sender_id: actor.sub,
          parent_name: req.body?.parentName || null,
          parent_phone: req.body?.parentPhone || student.parent_phone,
          report_type: req.body?.reportType || 'karne',
          message_body: req.body?.message || null,
          report_url: reportUrl,
          delivery_status: req.body?.deliveryStatus || 'sent'
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (req.body?.generatedReportId) {
        await supabaseAdmin
          .from('generated_exam_reports')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', req.body.generatedReportId);
      }
      if (req.body?.analysisReportId) {
        await supabaseAdmin
          .from('student_analysis_reports')
          .update({ status: 'shared_parent', shared_parent_at: new Date().toISOString() })
          .eq('id', req.body.analysisReportId)
          .eq('student_id', studentId);
      }
      return res.status(200).json({ ok: true, item: data });
    }

    return res.status(400).json({
      error: 'unknown_op',
      allowed: [
        'student-analysis',
        'save-evaluation',
        'list-evaluations',
        'publish-evaluation',
        'generate-pdf',
        'poll-pdf',
        'list-pdfs',
        'share-log',
        'dashboard',
        'connection-status',
        'archive-evaluation',
        'list-versions',
        'thresholds'
      ]
    });
  } catch (e) {
    const raw = errorMessage(e);
    const status = e.status || (raw === 'Missing token' || raw === 'Token expired' || raw === 'Invalid token' ? 401 : 500);
    return res.status(status).json({ ok: false, error: turkishError(raw, status), detail: raw });
  }
}
