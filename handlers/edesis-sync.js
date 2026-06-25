import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  getEdesisConfig,
  probeEdesisApi,
  scanEdesisEndpoints,
  fetchEdesisExamList,
  fetchEdesisJson,
  fetchEdesisExamDetailForStudent,
  enrichEdesisRowsWithSubjectDetails,
  generateEdesisExamReport,
  fetchEdesisDefaultTermId,
  fetchEdesisStudentsList,
  fetchEdesisTermsList,
  fetchEdesisExamsCatalog,
  fetchEdesisStudentResults,
  fetchEdesisGradesList,
  fetchEdesisDepartmentsList,
  fetchEdesisClassroomsList,
  createEdesisClassroom,
  createEdesisStudent,
  createEdesisParent,
  V1_PATHS,
  isAuthConnectedResponse,
  isReachableEdesisResponse,
  mapEdesisRowToExamDraft,
  flattenEdesisRows,
  studentMatchKeysFromEdesisRow
} from '../api/_lib/edesis-client.js';
import {
  processEdesisRows,
  findStudentMatchPreview,
  EDESIS_MATCHING_GUIDE
} from '../api/_lib/edesis-student-match.js';
import { EDESIS_EMPTY_LIST_HELP } from '../api/_lib/edesis-client.js';

const STAFF = new Set(['super_admin', 'admin', 'coach']);

function examResultToUpsertRow(exam, institutionId) {
  const totals = (exam.subjects || []).reduce(
    (a, s) => ({
      correct: a.correct + (s.correct ?? 0),
      wrong: a.wrong + (s.wrong ?? 0),
      blank: a.blank + (s.blank ?? 0)
    }),
    { correct: 0, wrong: 0, blank: 0 }
  );
  const tq = totals.correct + totals.wrong + totals.blank;
  const now = new Date().toISOString();
  return {
    id: exam.id,
    student_id: exam.studentId,
    exam_name: String(exam.examType),
    date: exam.examDate.slice(0, 10),
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
  };
}

function actorIsSuper(actor, tags) {
  return tags.includes('super_admin') || actor?.role === 'super_admin';
}

function filterStudentsForActor(students, actor, tags) {
  const inst = actor?.institution_id;
  if (!inst || actorIsSuper(actor, tags)) return students;
  return students.filter((s) => !s.institution_id || s.institution_id === inst);
}

function matchEdesisStudentToPlatform(row, students) {
  const keys = studentMatchKeysFromEdesisRow(row);
  let platformStudentId = null;
  let matchMethod = null;

  if (keys.edesisStudentId) {
    const byId = students.find(
      (s) => String(s.edesis_ogrenci_id || '').trim() === String(keys.edesisStudentId).trim()
    );
    if (byId) {
      platformStudentId = byId.id;
      matchMethod = 'edesis_ogrenci_id';
    }
  }

  if (!platformStudentId) {
    const preview = findStudentMatchPreview(students, { name: keys.name, email: keys.email });
    if (preview.studentId) {
      platformStudentId = preview.studentId;
      matchMethod = preview.method;
    }
  }

  const platform = platformStudentId ? students.find((s) => s.id === platformStudentId) : null;
  return {
    edesisId: keys.edesisStudentId || null,
    name: keys.name || null,
    email: keys.email || null,
    schoolNo: keys.schoolNo || null,
    platformStudentId,
    platformStudentName: platform?.name || null,
    matchMethod,
    linked: Boolean(
      keys.edesisStudentId &&
        platform &&
        String(platform.edesis_ogrenci_id || '').trim() === String(keys.edesisStudentId).trim()
    )
  };
}

async function assertStudentAccess(actor, tags, studentId) {
  const { data: st, error } = await supabaseAdmin
    .from('students')
    .select('id, institution_id, edesis_ogrenci_id, name, email')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  if (!st) throw new Error('student_not_found');
  const inst = actor?.institution_id;
  if (inst && !actorIsSuper(actor, tags) && st.institution_id && st.institution_id !== inst) {
    throw new Error('forbidden_institution');
  }
  return st;
}

async function persistEdesisLink(platformStudentId, edesisStudentId) {
  if (!platformStudentId || !edesisStudentId) return false;
  const { error } = await supabaseAdmin
    .from('students')
    .update({ edesis_ogrenci_id: String(edesisStudentId).trim() })
    .eq('id', platformStudentId);
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('edesis_ogrenci_id')) return false;
    throw error;
  }
  return true;
}

/** DB'de edesis_ogrenci_id yoksa Edesis /students listesinden ad/e-posta ile bul */
async function resolveEdesisIdForPlatformStudent(platformStudentId, actor, tags) {
  const students = filterStudentsForActor(await loadStudentsForMatching(), actor, tags);
  const st = students.find((s) => s.id === platformStudentId);
  if (!st) {
    await assertStudentAccess(actor, tags, platformStudentId);
    return { edesisStudentId: null, student: null, matchMethod: null, autoLinked: false };
  }

  const fromDb = String(st.edesis_ogrenci_id || '').trim();
  if (fromDb) {
    return { edesisStudentId: fromDb, student: st, matchMethod: 'edesis_ogrenci_id', autoLinked: false };
  }

  const fetchResult = await fetchEdesisStudentsList();
  for (const row of fetchResult.rows || []) {
    const m = matchEdesisStudentToPlatform(row, students);
    if (m.platformStudentId === platformStudentId && m.edesisId) {
      const autoLinked = await persistEdesisLink(platformStudentId, m.edesisId);
      return {
        edesisStudentId: String(m.edesisId).trim(),
        student: st,
        matchMethod: m.matchMethod,
        autoLinked
      };
    }
  }

  return { edesisStudentId: null, student: st, matchMethod: null, autoLinked: false };
}

async function loadStudentsForMatching() {
  const cols =
    'id, name, email, phone, parent_phone, institution_id, edesis_ogrenci_id, user_id, platform_user_id';
  let { data, error } = await supabaseAdmin.from('students').select(cols).limit(5000);
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('edesis_ogrenci_id')) {
      ({ data, error } = await supabaseAdmin
        .from('students')
        .select('id, name, email, phone, parent_phone, institution_id, user_id, platform_user_id')
        .limit(5000));
    } else {
      throw error;
    }
  }
  let students = data || [];
  const missingEmail = students.filter((s) => !String(s.email || '').trim() && (s.user_id || s.platform_user_id));
  if (missingEmail.length) {
    const userIds = [
      ...new Set(missingEmail.map((s) => s.user_id || s.platform_user_id).filter(Boolean))
    ];
    const { data: users } = await supabaseAdmin.from('users').select('id, email').in('id', userIds);
    const byUser = new Map((users || []).map((u) => [String(u.id), u.email]));
    students = students.map((s) => ({
      ...s,
      email:
        s.email ||
        byUser.get(String(s.user_id || '')) ||
        byUser.get(String(s.platform_user_id || '')) ||
        s.email
    }));
  }
  return students;
}

function buildExamDrafts(processed, students, institutionId) {
  return processed.drafts.map(({ row, studentId }) =>
    mapEdesisRowToExamDraft(row, {
      studentId,
      institutionId:
        institutionId || students.find((s) => s.id === studentId)?.institution_id || null
    })
  );
}

async function upsertExams(exams) {
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const exam of exams) {
    try {
      const row = examResultToUpsertRow(exam, exam.institutionId || null);
      const { error } = await supabaseAdmin
        .from('exam_results')
        .upsert(row, { onConflict: 'id' });
      if (error) throw error;
      imported += 1;
    } catch (e) {
      skipped += 1;
      if (errors.length < 20) errors.push({ id: exam.id, error: errorMessage(e) });
    }
  }
  return { imported, skipped, errors };
}

async function runSync(actor) {
  const cfg = getEdesisConfig();
  if (!cfg.apiKey) {
    return { ok: false, error: 'EDESIS_API_KEY_missing', hint: 'Vercel Environment Variables' };
  }

  const institutionId = actor?.institution_id || null;
  const students = await loadStudentsForMatching();

  const fetchResult = await fetchEdesisExamList();
  const {
    rows,
    baseUrl,
    path,
    fetchMode,
    rowsWithStudentFields,
    sampleRowKeys,
    httpStatus,
    jsonShape,
    apiHint,
    rawPreview,
    contentType,
    parseOk
  } = fetchResult;
  const processed = processEdesisRows(rows, students);
  const exams = buildExamDrafts(processed, students, institutionId);
  const { imported, skipped, errors } = await upsertExams(exams);

  return {
    ok: true,
    baseUrl,
    path,
    fetchMode: fetchMode || 'exams',
    httpStatus: httpStatus ?? null,
    jsonShape: jsonShape ?? null,
    apiHint: apiHint ?? null,
    rawPreview: rawPreview ?? null,
    contentType: contentType ?? null,
    parseOk: parseOk ?? true,
    probeAttempts: fetchResult.probeAttempts ?? undefined,
    studentsInDb: students.length,
    fetched: rows.length,
    rowsWithStudentFields: rowsWithStudentFields ?? 0,
    sampleRowKeys: sampleRowKeys || [],
    sampleSubjectCount: fetchResult.sampleSubjectCount ?? null,
    sampleTopicCount: fetchResult.sampleTopicCount ?? null,
    enrichedCount: fetchResult.enrichedCount ?? 0,
    enrichStudentQueries: fetchResult.enrichStudentQueries ?? 0,
    enrichAnalyticsQueries: fetchResult.enrichAnalyticsQueries ?? 0,
    matched: exams.length,
    imported,
    skipped,
    unmatchedCount: processed.unmatched.length,
    unmatchedSample: processed.unmatched.slice(0, 15),
    matchedByMethod: processed.matchedByMethod,
    matchingGuide: EDESIS_MATCHING_GUIDE.tr,
    emptyListHelp: rows.length === 0 ? EDESIS_EMPTY_LIST_HELP.tr : null,
    errors,
    diagnosis:
      apiHint ||
      (rows.length === 0
        ? 'Edesis API 0 kayıt döndü. Vercel: EDESIS_RESULTS_PATH=/api/external/sinav-sonuclari ekleyin VEYA Ayarlar → JSON içe aktar (Edesis Excel/JSON export)'
        : (rowsWithStudentFields ?? 0) === 0
          ? 'Sınav listesi geldi, öğrenci/net yok — sonuç endpoint gerekir (/api/external/sinav-sonuclari)'
          : exams.length === 0
            ? 'Öğrenci adları geldi ama eşleşmedi — Smart Koçluk öğrenci adı = Edesis adı'
            : imported === 0
              ? 'Eşleşti ama DB yazılamadı — errors alanına bakın'
              : null)
  };
}

/** Manuel JSON içe aktarım (API çalışmazsa) */
async function runImport(body, actor) {
  const raw =
    body?.rows ??
    body?.data ??
    body?.result ??
    (Array.isArray(body) ? body : body);
  const rows = flattenEdesisRows(raw);
  if (!rows.length) {
    return {
      ok: false,
      error: 'empty_payload',
      hint: 'Edesis export: ogrenciAdi, toplamNet, sinavAdi alanlı JSON dizisi veya API yanıtının tamamını yapıştırın'
    };
  }

  const institutionId = actor?.institution_id || null;
  const students = await loadStudentsForMatching();
  const processed = processEdesisRows(rows, students);
  const exams = buildExamDrafts(processed, students, institutionId);
  const { imported, skipped, errors } = await upsertExams(exams);
  return {
    ok: true,
    mode: 'import',
    received: Array.isArray(raw) ? raw.length : 1,
    flattened: rows.length,
    studentsInDb: students.length,
    matched: exams.length,
    imported,
    skipped,
    unmatchedCount: processed.unmatched.length,
    unmatchedSample: processed.unmatched.slice(0, 15),
    matchedByMethod: processed.matchedByMethod,
    matchingGuide: EDESIS_MATCHING_GUIDE.tr,
    errors,
    diagnosis:
      exams.length === 0
        ? 'JSON içinde öğrenci alanları (email, ogrenciAdi, ogrenciId) ve Smart Koçluk kartları uyuşmuyor'
        : null
  };
}

export default async function handler(req, res) {
  const op = String(req.query?.op || req.body?.op || 'status').trim();

  if (op === 'cron-sync') {
    const auth = authorizeVercelOrCronSecret(req);
    if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });
    try {
      const result = await runSync({ institution_id: null, role: 'admin' });
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: errorMessage(e) });
    }
  }

  try {
    const actor = requireAuthenticatedActor(req);
    const tags = await normalizedUserRolesFromDb(actor.sub);
    const allowed = tags.some((t) => STAFF.has(t)) || STAFF.has(actor.role);
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    if (op === 'status') {
      const cfg = getEdesisConfig();
      const institutionId = actor?.institution_id || null;
      const students = await loadStudentsForMatching();
      const withEdesisId = students.filter((s) => s.edesis_ogrenci_id).length;
      const withEmail = students.filter((s) => s.email).length;
      const keyOk = Boolean(cfg.apiKey);
      return res.status(200).json({
        configured: keyOk,
        apiVersion: 'v1',
        institutionCode: cfg.institutionCode || null,
        baseUrl: cfg.baseUrl,
        authMode: cfg.authMode,
        endpoints: {
          students: '/api/external/v1/students',
          exams: '/api/external/v1/exams',
          examResults: '/api/external/v1/exams/results'
        },
        studentsInDb: students.length,
        studentsWithEdesisId: withEdesisId,
        studentsWithEmail: withEmail,
        matchingGuide: EDESIS_MATCHING_GUIDE.tr,
        hint: keyOk
          ? 'probe veya sync — v1 API; KurumKodu header gerekmez'
          : 'Vercel: EDESIS_API_KEY + EDESIS_API_BASE_URL=https://onlinevipdershane.api.edesis.com + EDESIS_AUTH_MODE=x-api-key'
      });
    }

    if (op === 'students-preview') {
      const institutionId = actor?.institution_id || null;
      const students = await loadStudentsForMatching();
      return res.status(200).json({
        count: students.length,
        sample: students.slice(0, 20).map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          phone: s.phone,
          edesis_ogrenci_id: s.edesis_ogrenci_id || null
        })),
        matchingGuide: EDESIS_MATCHING_GUIDE.tr
      });
    }

    if (op === 'debug-fetch') {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const paths = [
        '/api/external/v1/students?MaxResultCount=1',
        '/api/external/v1/exams?MaxResultCount=1',
        '/api/external/v1/exams/results?MaxResultCount=1'
      ];
      const out = [];
      for (const path of paths) {
        const r = await fetchEdesisJson({ ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] }, path);
        out.push({
          path,
          status: r.status,
          ok: r.ok,
          contentType: r.contentType,
          rawPreview: (r.rawPreview || r.text || '').slice(0, 160),
          authConnected: isAuthConnectedResponse(r),
          reachable: isReachableEdesisResponse(r),
          rowCount: isReachableEdesisResponse(r) ? flattenEdesisRows(r.json).length : 0,
          totalCount: r.json?.totalCount ?? null,
          apiError: r.json?.error ?? null
        });
      }
      return res.status(200).json({ apiVersion: 'v1', baseUrl: cfg.baseUrl, attempts: out });
    }

    if (op === 'probe') {
      const result = await probeEdesisApi();
      return res.status(200).json({
        ...result,
        emptyListHelp: EDESIS_EMPTY_LIST_HELP.tr
      });
    }

    if (op === 'match-check') {
      const q = String(req.query?.name || req.body?.name || '').trim();
      const em = String(req.query?.email || req.body?.email || '').trim();
      const students = await loadStudentsForMatching();
      const preview = findStudentMatchPreview(students, { name: q, email: em });
      return res.status(200).json({
        ok: true,
        query: { name: q, email: em },
        studentsInDb: students.length,
        preview,
        hint: preview.studentId
          ? 'Eşleşme bulundu — JSON içe aktar veya API satırında aynı email/ogrenciAdi olmalı'
          : 'Kartta e-posta yok veya ad farklı — Öğrenciler menüsünde email alanını doldurun'
      });
    }

    if (op === 'discover') {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const scan = await scanEdesisEndpoints(cfg);
      return res.status(200).json({
        ...scan,
        emptyListHelp: EDESIS_EMPTY_LIST_HELP.tr
      });
    }

    if (op === 'sync' && (req.method === 'POST' || req.method === 'GET')) {
      try {
        const result = await runSync(actor);
        return res.status(200).json(result);
      } catch (e) {
        return res.status(200).json({
          ok: true,
          fetched: 0,
          matched: 0,
          imported: 0,
          error: errorMessage(e),
          diagnosis: `Senkron hatası: ${errorMessage(e)}`
        });
      }
    }

    if (op === 'import' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const result = await runImport(body, actor);
      return res.status(result.ok ? 200 : 400).json(result);
    }

    if (op === 'exam-detail') {
      const examId = String(req.query?.examId || req.body?.examId || '').trim();
      const studentId = String(req.query?.studentId || req.body?.studentId || '').trim();
      const edesisStudentId = String(req.query?.edesisStudentId || req.body?.edesisStudentId || '').trim();
      if (!examId) return res.status(400).json({ error: 'examId_required' });
      if (!studentId && !edesisStudentId) {
        return res.status(400).json({ error: 'studentId_or_edesisStudentId_required' });
      }

      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });

      let resolvedEdesisId = edesisStudentId;
      let autoLinked = false;
      if (!resolvedEdesisId && studentId) {
        const resolved = await resolveEdesisIdForPlatformStudent(studentId, actor, tags);
        resolvedEdesisId = resolved.edesisStudentId || '';
        autoLinked = resolved.autoLinked;
      }
      if (!resolvedEdesisId && studentId) {
        const { data: st } = await supabaseAdmin
          .from('students')
          .select('edesis_ogrenci_id')
          .eq('id', studentId)
          .maybeSingle();
        resolvedEdesisId = String(st?.edesis_ogrenci_id || '').trim();
      }

      const detail = await fetchEdesisExamDetailForStudent(examId, resolvedEdesisId, cfg);
      if (!detail.row) {
        return res.status(404).json({
          error: 'exam_detail_not_found',
          examId,
          edesisStudentId: resolvedEdesisId || null,
          hint: 'Edesis sınav sonucu bulunamadı — önce senkron çalıştırın veya edesis_ogrenci_id eşleşmesini kontrol edin'
        });
      }

      let row = detail.row;
      const enriched = await enrichEdesisRowsWithSubjectDetails([row], cfg, { maxStudents: 25 });
      if (enriched.rows[0]) row = enriched.rows[0];

      const topicCount = (mapEdesisRowToExamDraft(row, {
        studentId: studentId || `pending-${resolvedEdesisId}`,
        institutionId: actor?.institution_id || null
      }).subjects || []).reduce((n, s) => n + (s.topics?.length ?? 0), 0);

      const institutionId = actor?.institution_id || null;
      const draft = mapEdesisRowToExamDraft(row, {
        studentId: studentId || `pending-${resolvedEdesisId}`,
        institutionId
      });
      if (studentId) {
        draft.studentId = studentId;
        draft.id = `edesis-${examId}-${studentId}`;
        const { imported } = await upsertExams([draft]);
        return res.status(200).json({
          ok: true,
          imported,
          exam: draft,
          autoLinked,
          subjectCount: draft.subjects?.length ?? 0,
          topicCount,
          enrichedCount: enriched.enrichedCount,
          fetchMode: detail.fetchMode,
          needsTopicRetry: topicCount === 0
        });
      }

      return res.status(200).json({
        ok: true,
        exam: draft,
        autoLinked,
        subjectCount: draft.subjects?.length ?? 0,
        topicCount,
        enrichedCount: enriched.enrichedCount,
        fetchMode: detail.fetchMode,
        needsTopicRetry: topicCount === 0
      });
    }

    if (op === 'list-students') {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const fetchResult = await fetchEdesisStudentsList();
      const students = filterStudentsForActor(await loadStudentsForMatching(), actor, tags);
      const items = (fetchResult.rows || []).map((row) => matchEdesisStudentToPlatform(row, students));
      return res.status(200).json({
        ok: true,
        count: items.length,
        items,
        platformStudents: students.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          edesis_ogrenci_id: s.edesis_ogrenci_id || null
        }))
      });
    }

    if (op === 'list-terms') {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const fetchResult = await fetchEdesisTermsList();
      return res.status(200).json({
        ok: true,
        count: fetchResult.totalCount,
        items: fetchResult.rows || []
      });
    }

    if (op === 'list-exams') {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const fetchResult = await fetchEdesisExamsCatalog();
      return res.status(200).json({
        ok: true,
        count: fetchResult.totalCount,
        items: fetchResult.rows || []
      });
    }

    if (op === 'student-results') {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });

      let edesisStudentId = String(
        req.query?.edesisStudentId || req.query?.StudentId || req.body?.edesisStudentId || ''
      ).trim();
      const platformStudentId = String(req.query?.studentId || req.body?.studentId || '').trim();
      let autoLinked = false;
      let matchMethod = null;

      if (!edesisStudentId && platformStudentId) {
        const resolved = await resolveEdesisIdForPlatformStudent(platformStudentId, actor, tags);
        edesisStudentId = resolved.edesisStudentId || '';
        autoLinked = resolved.autoLinked;
        matchMethod = resolved.matchMethod;
      }
      if (!edesisStudentId) {
        return res.status(400).json({
          error: 'edesis_student_id_missing',
          hint:
            'Edesis öğrenci ID bulunamadı — Edesis Öğrencileri sekmesinden ad eşleşmesiyle bağlayın veya Edesis ID girin'
        });
      }

      const fetchResult = await fetchEdesisStudentResults(edesisStudentId);
      const students = filterStudentsForActor(await loadStudentsForMatching(), actor, tags);
      const institutionId = actor?.institution_id || null;
      let matched =
        students.find((s) => String(s.edesis_ogrenci_id || '').trim() === edesisStudentId) ||
        (platformStudentId ? students.find((s) => s.id === platformStudentId) : null);
      if (!matched) {
        for (const row of (await fetchEdesisStudentsList()).rows || []) {
          const m = matchEdesisStudentToPlatform(row, students);
          if (String(m.edesisId || '') === edesisStudentId && m.platformStudentId) {
            matched = students.find((s) => s.id === m.platformStudentId) || null;
            break;
          }
        }
      }
      const platformId = platformStudentId || matched?.id || null;

      const exams = (fetchResult.rows || []).map((row) => {
        const draft = mapEdesisRowToExamDraft(row, {
          studentId: platformId || `edesis-${edesisStudentId}`,
          institutionId: institutionId || matched?.institution_id || null
        });
        const totals = (draft.subjects || []).reduce(
          (a, s) => ({
            correct: a.correct + (s.correct ?? 0),
            wrong: a.wrong + (s.wrong ?? 0),
            blank: a.blank + (s.blank ?? 0)
          }),
          { correct: 0, wrong: 0, blank: 0 }
        );
        return {
          edesisExamId: draft.edesisExamId || null,
          examTitle: draft.examTitle || draft.examType,
          examDate: draft.examDate,
          totalNet: draft.totalNet,
          correct: totals.correct,
          wrong: totals.wrong,
          blank: totals.blank,
          subjectCount: draft.subjects?.length ?? 0,
          topicCount: (draft.subjects || []).reduce((n, s) => n + (s.topics?.length ?? 0), 0),
          subjects: draft.subjects || [],
          draft
        };
      });

      return res.status(200).json({
        ok: true,
        edesisStudentId,
        platformStudentId: platformId,
        platformStudentName: matched?.name || null,
        count: exams.length,
        fetchMode: fetchResult.fetchMode,
        autoLinked,
        matchMethod,
        exams
      });
    }

    if (op === 'link-student' && (req.method === 'POST' || req.method === 'GET')) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const platformStudentId = String(
        req.query?.platformStudentId || body.platformStudentId || ''
      ).trim();
      const edesisStudentId = String(req.query?.edesisStudentId || body.edesisStudentId || '').trim();
      if (!platformStudentId || !edesisStudentId) {
        return res.status(400).json({ error: 'platformStudentId_and_edesisStudentId_required' });
      }

      await assertStudentAccess(actor, tags, platformStudentId);
      const { error: upErr } = await supabaseAdmin
        .from('students')
        .update({ edesis_ogrenci_id: edesisStudentId })
        .eq('id', platformStudentId);
      if (upErr) {
        const msg = String(upErr.message || '');
        if (msg.includes('edesis_ogrenci_id')) {
          return res.status(501).json({
            error: 'edesis_column_missing',
            hint: 'students tablosuna edesis_ogrenci_id kolonu ekleyin'
          });
        }
        throw upErr;
      }
      return res.status(200).json({ ok: true, platformStudentId, edesisStudentId });
    }

    if (op === 'exam-karne-pdf') {
      const examId = String(req.query?.examId || req.body?.examId || '').trim();
      const studentId = String(req.query?.studentId || req.body?.studentId || '').trim();
      const termId = req.query?.termId ?? req.body?.termId ?? null;
      if (!examId) return res.status(400).json({ error: 'examId_required' });

      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });

      let edesisStudentId = String(req.query?.edesisStudentId || req.body?.edesisStudentId || '').trim();
      if (!edesisStudentId && studentId) {
        const { data: st } = await supabaseAdmin
          .from('students')
          .select('edesis_ogrenci_id')
          .eq('id', studentId)
          .maybeSingle();
        edesisStudentId = String(st?.edesis_ogrenci_id || '').trim();
      }
      if (!edesisStudentId) {
        return res.status(400).json({
          error: 'edesis_student_id_missing',
          hint: 'Edesis öğrenci ID girin veya students.edesis_ogrenci_id doldurun'
        });
      }

      try {
        const report = await generateEdesisExamReport(
          {
            examId,
            termId,
            studentIds: [edesisStudentId],
            reportCodes: [102],
            forceNew: false
          },
          cfg
        );
        if (!report.reportUrl) {
          return res.status(502).json({
            error: 'report_url_missing',
            status: report.status,
            jobId: report.jobId,
            message: report.message,
            hint: 'API key admin veya student_dashboard paketi olmalı (reports:generate). termId otomatik seçildi.'
          });
        }
        return res.status(200).json({ ok: true, ...report });
      } catch (e) {
        return res.status(502).json({
          error: 'exam_report_failed',
          message: errorMessage(e),
          hint: 'API key paketi student_dashboard, admin veya full_read olmalı (reports:generate)'
        });
      }
    }

    if (op === 'list-grades') {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      try {
        const fetchResult = await fetchEdesisGradesList();
        return res.status(200).json({ ok: true, count: fetchResult.totalCount, items: fetchResult.rows || [] });
      } catch (e) {
        return res.status(502).json({ error: 'grades_fetch_failed', message: errorMessage(e), hint: 'Admin API paketi gerekli (GET /grades)' });
      }
    }

    if (op === 'list-departments') {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      try {
        const fetchResult = await fetchEdesisDepartmentsList();
        return res.status(200).json({ ok: true, count: fetchResult.totalCount, items: fetchResult.rows || [] });
      } catch (e) {
        return res.status(502).json({ error: 'departments_fetch_failed', message: errorMessage(e), hint: 'Admin API paketi gerekli (GET /departments)' });
      }
    }

    if (op === 'list-classrooms') {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      try {
        const fetchResult = await fetchEdesisClassroomsList();
        return res.status(200).json({ ok: true, count: fetchResult.totalCount, items: fetchResult.rows || [] });
      } catch (e) {
        return res.status(502).json({ error: 'classrooms_fetch_failed', message: errorMessage(e) });
      }
    }

    if (op === 'create-classroom' && (req.method === 'POST' || req.method === 'GET')) {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      try {
        const created = await createEdesisClassroom(body, cfg);
        return res.status(200).json({ ok: true, item: created, path: V1_PATHS.classrooms });
      } catch (e) {
        return res.status(502).json({ error: 'create_classroom_failed', message: errorMessage(e), hint: 'Admin paketi + gradeId gerekli' });
      }
    }

    if (op === 'create-student' && (req.method === 'POST' || req.method === 'GET')) {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      try {
        const created = await createEdesisStudent(body, cfg);
        return res.status(200).json({ ok: true, item: created, path: V1_PATHS.students });
      } catch (e) {
        return res.status(502).json({ error: 'create_student_failed', message: errorMessage(e), hint: 'classroomId ve bolumId (lise) gerekli' });
      }
    }

    if (op === 'create-parent' && (req.method === 'POST' || req.method === 'GET')) {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      try {
        const created = await createEdesisParent(body, cfg);
        return res.status(200).json({ ok: true, item: created, path: V1_PATHS.parents });
      } catch (e) {
        return res.status(502).json({ error: 'create_parent_failed', message: errorMessage(e), hint: 'studentId (Edesis) gerekli' });
      }
    }

    return res.status(400).json({
      error: 'unknown_op',
      allowed: [
        'status',
        'probe',
        'discover',
        'match-check',
        'sync',
        'import',
        'exam-detail',
        'exam-karne-pdf',
        'list-students',
        'list-terms',
        'list-exams',
        'student-results',
        'link-student',
        'list-grades',
        'list-departments',
        'list-classrooms',
        'create-classroom',
        'create-student',
        'create-parent'
      ]
    });
  } catch (e) {
    const msg = errorMessage(e);
    if (msg === 'Missing token' || msg === 'Token expired' || msg === 'Invalid token') {
      return res.status(401).json({ error: msg });
    }
    return res.status(500).json({ ok: false, error: msg });
  }
}
