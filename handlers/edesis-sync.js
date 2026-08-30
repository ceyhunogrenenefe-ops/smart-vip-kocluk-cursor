import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  getEdesisConfig,
  loadEdesisRuntimeSecretsFromDb,
  saveEdesisRuntimeSecretsToDb,
  getEdesisAbpAuthStatus,
  probeEdesisApi,
  scanEdesisEndpoints,
  fetchEdesisExamList,
  fetchEdesisJson,
  fetchEdesisExamDetailForStudent,
  enrichEdesisRowsWithSubjectDetails,
  generateEdesisExamReport,
  fetchEdesisDefaultTermId,
  fetchEdesisStudentsList,
  fetchEdesisStudentByOgrenciId,
  fetchEdesisTermsList,
  fetchEdesisExamsCatalog,
  fetchEdesisExamsCatalogForStudent,
  fetchEdesisExamsCatalogForClassroom,
  resolveAssignedCatalogRowsForStudentAsync,
  catalogQueryLooksFiltered,
  fetchEdesisStudentResults,
  inferEdesisExamProgramKeys,
  buildStudentAvailableEdesisExamItems,
  pickEdesisCatalogExamId,
  pickEdesisResultExamId,
  collectOpenOnlineProgramExams,
  formatEdesisAvailableExamItem,
  fetchEdesisOgrenciAssignedSinavIdsDetailed,
  fetchEdesisExamCatalogRowDetail,
  fetchEdesisExamRosterStudentIds,
  catalogExamAssignedToStudent,
  enrichTakeableExamDurations,
  resultRowBelongsToStudent,
  edesisResultLooksSubmitted,
  edesisResultHiddenFromStudent,
  fetchEdesisGradesList,
  fetchEdesisDepartmentsList,
  fetchEdesisClassroomsList,
  createEdesisClassroom,
  createEdesisStudent,
  createEdesisParent,
  fetchEdesisExamStructure,
  loadEdesisExamBookletPdf,
  loadEdesisHataKarnesiPdf,
  absorbEdesisBookletSource,
  pickGoogleDriveFetchUrl,
  googleDrivePreviewUrl,
  rewriteBookletFilesForBrowser,
  pickEdesisBookletLessons,
  listEdesisBookletCodes,
  denemeOnlyBookletCodes,
  kitapcikAllowedForExam,
  normalizeKitapcikCode,
  fetchEdesisDenemeAnswerKeyInfo,
  fetchEdesisExamSubjects,
  fetchEdesisExamResultsLessons,
  fetchEdesisExamResultsSubjects,
  submitEdesisExamResults,
  fetchEdesisIngestJobStatus,
  pollEdesisIngestJob,
  V1_PATHS,
  isAuthConnectedResponse,
  isReachableEdesisResponse,
  mapEdesisRowToExamDraft,
  flattenEdesisRows,
  studentMatchKeysFromEdesisRow,
  pickExamDurationSeconds,
  EDESIS_EMPTY_LIST_HELP
} from '../api/_lib/edesis-client.js';
import {
  processEdesisRows,
  findStudentMatchPreview,
  EDESIS_MATCHING_GUIDE
} from '../api/_lib/edesis-student-match.js';
import { enrollPlatformStudentsBatch, EDESIS_AUTO_ENROLL_MARKER, EDESIS_AUTO_ENROLL_INSTITUTION_ID } from '../api/_lib/edesis-auto-enroll.js';

const STAFF = new Set(['super_admin', 'admin', 'coach']);
const EDESIS_PDF_DURATION_MARKER = 'edesis-pdf-duration-2026-08-27';
const EDESIS_ASSIGNED_ONLY_MARKER = 'edesis-open-takeable-2026-08-30';
/** Aynı Hobby instance’ta üst üste op=sync 504 üretmesin */
let syncInFlight = null;
/** Öğrencinin kendi Edesis sonuç / karne / sınava giriş ops */
const STUDENT_ALLOWED_OPS = new Set([
  'student-results',
  'exam-karne-pdf',
  'exam-hata-karnesi-pdf',
  'exam-detail',
  'exam-structure',
  'exam-booklet-pdf',
  'available-exams',
  'submit-exam',
  'ingest-status'
]);

function actorIsStudent(actor, tags) {
  const role = String(actor?.role || '').toLowerCase();
  return role === 'student' || (Array.isArray(tags) && tags.includes('student'));
}

const STUDENT_SELF_COLS =
  'id, name, email, edesis_ogrenci_id, institution_id, user_id, platform_user_id, class_level';
const STUDENT_SELF_COLS_FALLBACK =
  'id, name, email, edesis_ogrenci_id, institution_id, user_id, platform_user_id';

async function selectStudentSelf(buildQuery) {
  let { data, error } = await buildQuery(STUDENT_SELF_COLS);
  if (error && String(error.message || '').includes('class_level')) {
    ({ data, error } = await buildQuery(STUDENT_SELF_COLS_FALLBACK));
  }
  if (error) throw error;
  return data;
}

async function resolveOwnPlatformStudent(actor) {
  const uid = String(actor?.sub || '').trim();
  const sidHint = String(actor?.student_id || '').trim();
  if (sidHint) {
    const data = await selectStudentSelf((cols) =>
      supabaseAdmin.from('students').select(cols).eq('id', sidHint).maybeSingle()
    );
    if (data) return data;
  }
  if (!uid || uid === 'anonymous') return null;
  return selectStudentSelf((cols) =>
    supabaseAdmin
      .from('students')
      .select(cols)
      .or(`platform_user_id.eq.${uid},user_id.eq.${uid}`)
      .limit(1)
      .maybeSingle()
  );
}

async function loadStudentClassLevel(platformStudentId, knownStudent) {
  const fromKnown = String(knownStudent?.class_level || knownStudent?.classLevel || '').trim();
  if (fromKnown) return fromKnown;
  if (!platformStudentId) return '';
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('class_level')
    .eq('id', platformStudentId)
    .maybeSingle();
  if (error && String(error.message || '').includes('class_level')) return '';
  if (error) throw error;
  return data?.class_level != null ? String(data.class_level).trim() : '';
}

async function resolveStudentProgramKeys({ edesisStudentId, platformStudentId, studentHint, cfg }) {
  const scope = await resolveStudentEdesisScope({ edesisStudentId, platformStudentId, studentHint, cfg });
  return scope.programKeys;
}

async function resolveStudentEdesisScope({ edesisStudentId, platformStudentId, studentHint, cfg }) {
  const classLevel = await loadStudentClassLevel(platformStudentId, studentHint);
  let gradeName = '';
  let className = '';
  let classroomId = '';
  let studentGradeId = '';
  try {
    const es = await fetchEdesisStudentByOgrenciId(edesisStudentId, cfg);
    gradeName = es?.gradeName || '';
    className = es?.className || '';
    classroomId = es?.classroomId || '';
    studentGradeId = es?.gradeId || '';
  } catch {
    /* sınıf Edesis’ten gelmezse class_level yeter */
  }
  return {
    programKeys: inferEdesisExamProgramKeys({ gradeName, className, classLevel }),
    classroomId,
    gradeName,
    className,
    classLevel,
    studentGradeId
  };
}

/**
 * Öğrenci Sınava gir — bu öğrenciye tanımlı / girilebilir denemeler.
 * Kaynak: ogrenciIds + GetOgrenciSinavIds + rapor sınıf ataması +
 * yeni online (boş/ince roster, kademe, program, GetSinavForView penceresi).
 * GetOgrenciSinavIds analiz geçmişidir; yeni deneme açık katalog yolundan gelir.
 * Tarihi geçmiş / başka öğrenciye kilitli roster / fat Ready kurum listesi eklenmez.
 */
async function loadAvailableEdesisExamsForStudent({
  edesisStudentId,
  platformStudentId,
  actor,
  studentHint,
  cfg
}) {
  const t0 = Date.now();
  const [scope, catalog, studentResults] = await Promise.all([
    resolveStudentEdesisScope({
      edesisStudentId,
      platformStudentId,
      studentHint,
      cfg
    }),
    fetchEdesisExamsCatalog(cfg).catch(() => ({ rows: [], cached: false })),
    fetchEdesisStudentResults(edesisStudentId, cfg, { enrichSubjects: false }).catch(() => ({
      rows: []
    }))
  ]);
  const fullRows = catalog.rows || [];
  // StudentId/ClassroomId katalog sorguları Edesis’te yok sayılıp 1972 satır dump eder (~4s ×2).
  const assignedResolved = await resolveAssignedCatalogRowsForStudentAsync(
    {
      catalogRows: fullRows,
      studentCatalogRows: [],
      classroomCatalogRows: [],
      edesisStudentId,
      classroomId: scope.classroomId,
      programKeys: scope.programKeys,
      gradeName: scope.gradeName || '',
      studentGradeId: scope.studentGradeId || ''
    },
    cfg
  );
  const assignedCatalogRows = Array.isArray(assignedResolved)
    ? assignedResolved
    : assignedResolved?.rows || [];
  const adminAssignment = Array.isArray(assignedResolved)
    ? null
    : assignedResolved?.adminAssignment || null;

  const hasAssignmentSignal = Array.isArray(assignedCatalogRows) && assignedCatalogRows.length > 0;
  const assignedExamIds = (assignedCatalogRows || [])
    .map((ex) => pickEdesisCatalogExamId(ex))
    .filter(Boolean);
  const assignmentMode = hasAssignmentSignal ? 'assigned' : 'assigned-empty';
  const items = buildStudentAvailableEdesisExamItems({
    catalogRows: fullRows,
    assignedCatalogRows: hasAssignmentSignal ? assignedCatalogRows : [],
    resultRows: studentResults.rows || [],
    edesisStudentId,
    programKeys: scope.programKeys,
    classroomId: scope.classroomId,
    studentId: platformStudentId || `edesis-${edesisStudentId}`,
    institutionId: actor?.institution_id || null,
    gradeName: scope.gradeName || '',
    studentGradeId: scope.studentGradeId || '',
    // Atama yoksa boş liste — kurum kataloğu / program yedeği kapalı
    allowRecencyFallback: false,
    requireExplicitAssignment: true
  });
  await enrichTakeableExamDurations(items, cfg, { limit: 6 });
  const takeableIds = items.filter((x) => x.canTake && !x.hasStudentResult).map((x) => x.examId);
  const resultExamIds = (studentResults.rows || [])
    .map((row) => pickEdesisResultExamId(row))
    .filter(Boolean);
  const openOnlineRows = collectOpenOnlineProgramExams(fullRows, {
    programKeys: scope.programKeys,
    gradeName: scope.gradeName || '',
    excludeExamIds: [...resultExamIds, ...takeableIds]
  });
  const openOnline = openOnlineRows.slice(0, 48).map((ex) =>
    formatEdesisAvailableExamItem(pickEdesisCatalogExamId(ex), ex, null, {
      studentId: platformStudentId || `edesis-${edesisStudentId}`,
      institutionId: actor?.institution_id || null
    })
  );
  const abpAuth = adminAssignment?.abpAuth || getEdesisAbpAuthStatus();
  return {
    items,
    resultRows: studentResults.rows || [],
    openOnline,
    scope,
    meta: {
      assignmentMode,
      assignedCount: hasAssignmentSignal ? assignedCatalogRows.length : 0,
      assignedExamIds: assignedExamIds.slice(0, 80),
      takeableCount: takeableIds.length,
      takeableExamIds: takeableIds.slice(0, 40),
      classroomId: scope.classroomId || null,
      studentCatalogCount: 0,
      classroomCatalogCount: 0,
      fullCatalogCount: fullRows.length,
      catalogCached: Boolean(catalog.cached),
      programKeys: [...(scope.programKeys || [])],
      adminAssignmentSource: adminAssignment?.preferredSource || adminAssignment?.source || null,
      adminSinavIdCount: adminAssignment?.ids?.length || 0,
      adminSinavIdsSample: (adminAssignment?.ids || []).slice(0, 20),
      adminAssignmentAttempts: adminAssignment?.attempts || [],
      analysisIdCount: adminAssignment?.analysisIds?.length || 0,
      adminSinavTuruIdCount: adminAssignment?.sinavTuruIds?.length || 0,
      abpAuth,
      probeSkipped: Boolean(assignedResolved?.probeSkipped),
      probeSkipReason: assignedResolved?.probeSkipReason || null,
      probeCandidateCount: assignedResolved?.probeCandidateCount ?? null,
      studentRapor: assignedResolved?.studentRapor || null,
      openCatalogCount: assignedResolved?.openCatalogCount ?? 0,
      openCatalogExamIds: assignedResolved?.openCatalogExamIds || [],
      openOnlineCount: openOnline.length,
      totalMs: Date.now() - t0
    }
  };
}

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
    exam_name: String(exam.examTitle || exam.examType || 'Deneme'),
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

function actorIsCoach(actor, tags) {
  return tags.includes('coach') || actor?.role === 'coach';
}

/** Kurum + (koç ise) yalnızca kendi öğrencileri; ada göre sıralı */
function filterStudentsForActor(students, actor, tags) {
  let list = Array.isArray(students) ? [...students] : [];
  const inst = actor?.institution_id;
  if (inst && !actorIsSuper(actor, tags)) {
    list = list.filter((s) => !s.institution_id || s.institution_id === inst);
  }
  const coachId = actor?.coach_id ? String(actor.coach_id).trim() : '';
  if (coachId && actorIsCoach(actor, tags) && !actorIsSuper(actor, tags)) {
    list = list.filter((s) => String(s.coach_id || '').trim() === coachId);
  }
  list.sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'tr', { sensitivity: 'base' })
  );
  return list;
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
  const flat = row && typeof row === 'object' ? row : {};
  return {
    edesisId: keys.edesisStudentId || null,
    name: keys.name || null,
    termId: flat.termId ?? null,
    termName: flat.termName ?? null,
    studentState: flat.studentState ?? null,
    classroomId: flat.classroomId ?? null,
    modifiedDate: flat.modifiedDate ?? null,
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
    .select('id, institution_id, coach_id, edesis_ogrenci_id, name, email')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  if (!st) throw new Error('student_not_found');
  const inst = actor?.institution_id;
  if (inst && !actorIsSuper(actor, tags) && st.institution_id && st.institution_id !== inst) {
    throw new Error('forbidden_institution');
  }
  const coachId = actor?.coach_id ? String(actor.coach_id).trim() : '';
  if (coachId && actorIsCoach(actor, tags) && !actorIsSuper(actor, tags)) {
    if (String(st.coach_id || '').trim() !== coachId) {
      throw new Error('forbidden_coach');
    }
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
  const withLevel =
    'id, name, email, phone, parent_phone, institution_id, coach_id, edesis_ogrenci_id, user_id, platform_user_id, class_level';
  const cols =
    'id, name, email, phone, parent_phone, institution_id, coach_id, edesis_ogrenci_id, user_id, platform_user_id';
  let { data, error } = await supabaseAdmin.from('students').select(withLevel).limit(5000);
  if (error && String(error.message || '').includes('class_level')) {
    ({ data, error } = await supabaseAdmin.from('students').select(cols).limit(5000));
  }
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('edesis_ogrenci_id')) {
      ({ data, error } = await supabaseAdmin
        .from('students')
        .select('id, name, email, phone, parent_phone, institution_id, coach_id, user_id, platform_user_id')
        .limit(5000));
    } else if (msg.includes('coach_id')) {
      ({ data, error } = await supabaseAdmin
        .from('students')
        .select('id, name, email, phone, parent_phone, institution_id, edesis_ogrenci_id, user_id, platform_user_id')
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

function mapHubResultExams(rows, platformId, edesisStudentId, institutionId) {
  return (rows || []).map((row) => {
    const draft = mapEdesisRowToExamDraft(row, {
      studentId: platformId || `edesis-${edesisStudentId}`,
      institutionId
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
      examType: draft.examType,
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

/** Optik submit / tek sınav detayı → platform exam_results (Analizlerim grafikleri) */
async function importEdesisExamResultToLocal({
  examId,
  edesisStudentId,
  platformStudentId,
  institutionId,
  cfg
}) {
  if (!examId || !edesisStudentId || !platformStudentId) {
    return { imported: 0, reason: 'missing_ids' };
  }
  let row = null;
  let fetchMode = null;
  try {
    const detail = await fetchEdesisExamDetailForStudent(examId, edesisStudentId, cfg);
    if (detail?.row) {
      row = detail.row;
      fetchMode = detail.fetchMode;
    }
  } catch {
    /* aşağıda student-results yedek */
  }
  if (!row) {
    try {
      const fr = await fetchEdesisStudentResults(edesisStudentId, cfg, { enrichSubjects: true });
      row =
        (fr.rows || []).find((r) => String(pickEdesisResultExamId(r) || '') === String(examId)) ||
        null;
      fetchMode = fr.fetchMode;
    } catch {
      return { imported: 0, reason: 'fetch_failed' };
    }
  }
  if (!row) return { imported: 0, reason: 'not_found', fetchMode };

  try {
    const enriched = await enrichEdesisRowsWithSubjectDetails([row], cfg, { maxStudents: 5 });
    if (enriched.rows[0]) row = enriched.rows[0];
  } catch {
    /* net/ders yoksa ham satır yeterli */
  }

  const draft = mapEdesisRowToExamDraft(row, {
    studentId: platformStudentId,
    institutionId: institutionId || null
  });
  draft.studentId = platformStudentId;
  draft.id = `edesis-${examId}-${platformStudentId}`;
  draft.edesisExamId = String(examId);
  draft.createdAt = new Date().toISOString();
  const { imported, errors } = await upsertExams([draft]);
  return { imported, exam: draft, fetchMode, errors };
}

async function runSync(actor) {
  const started = new Date().toISOString();
  let result;
  try {
    result = await runSyncInner(actor);
  } catch (e) {
    result = { ok: false, error: errorMessage(e) };
  }
  try {
    await supabaseAdmin.from('edesis_sync_logs').insert({
      institution_id: actor?.institution_id || null,
      started_at: started,
      finished_at: new Date().toISOString(),
      status: result?.ok ? 'completed' : 'failed',
      source: actor?.role === 'cron' ? 'cron' : 'manual',
      fetched: result?.fetched || 0,
      matched: result?.matched || 0,
      imported: result?.imported || 0,
      error_message: result?.error || result?.diagnosis || null,
      payload: {
        unmatchedCount: result?.unmatchedCount || 0,
        httpStatus: result?.httpStatus || null
      }
    });
  } catch {
    /* tablo yoksa senkron yine de döner */
  }
  return result;
}

async function runSyncInner(actor) {
  const cfg = getEdesisConfig();
  if (!cfg.apiKey) {
    return { ok: false, error: 'EDESIS_API_KEY_missing', hint: 'Vercel Environment Variables' };
  }

  const institutionId = actor?.institution_id || null;
  const students = await loadStudentsForMatching();

  // Manuel UI: light sync (enrich yok) — Vercel Hobby ~60s 504 önleme. Cron: tam.
  const skipEnrich = String(actor?.role || '') !== 'cron';
  const tFetch = Date.now();
  const fetchResult = await fetchEdesisExamList({ skipEnrich });
  const fetchMs = Date.now() - tFetch;
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
  // Manuel sync: çok satırda upsert 504 yapmasın
  const examCap = skipEnrich ? 150 : exams.length;
  const cappedExams = exams.slice(0, examCap);
  const { imported, skipped, errors } = await upsertExams(cappedExams);

  return {
    ok: true,
    baseUrl,
    path,
    fetchMode: fetchMode || 'exams',
    skipEnrich,
    fetchMs,
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
    capped: exams.length > cappedExams.length,
    capLimit: examCap,
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
      const result = await runSync({ institution_id: null, role: 'cron' });
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: errorMessage(e) });
    }
  }

  try {
    let actor = requireAuthenticatedActor(req);
    try {
      const { enrichStudentActor } = await import('../api/_lib/enrich-student-actor.js');
      actor = await enrichStudentActor(actor);
    } catch {
      /* coach_id zenginleştirmesi opsiyonel */
    }
    const tags = await normalizedUserRolesFromDb(actor.sub);
    const isStaff = tags.some((t) => STAFF.has(t)) || STAFF.has(actor.role);
    const isStudent = actorIsStudent(actor, tags);
    const studentAllowedOp = STUDENT_ALLOWED_OPS.has(op);

    if (!isStaff && !(isStudent && studentAllowedOp)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    // Vercel env yoksa commerce_settings.meta.edesis (configure-edesis)
    await loadEdesisRuntimeSecretsFromDb(supabaseAdmin);

    /** Öğrenci yalnızca kendi kartına erişir; yabancı ID'leri yok sayar */
    let studentSelf = null;
    if (isStudent && !isStaff && studentAllowedOp) {
      studentSelf = await resolveOwnPlatformStudent(actor);
      if (!studentSelf) {
        return res.status(400).json({
          error: 'student_profile_missing',
          hint: 'Öğrenci kartınız bulunamadı. Çıkış yapıp tekrar giriş yapın veya koçunuza başvurun.'
        });
      }
      // Force ownership on query/body for downstream ops
      if (req.query && typeof req.query === 'object') {
        req.query.studentId = String(studentSelf.id);
        const ownEdesis = String(studentSelf.edesis_ogrenci_id || '').trim();
        if (ownEdesis) req.query.edesisStudentId = ownEdesis;
        else delete req.query.edesisStudentId;
      }
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        req.body.studentId = String(studentSelf.id);
        const ownEdesis = String(studentSelf.edesis_ogrenci_id || '').trim();
        if (ownEdesis) req.body.edesisStudentId = ownEdesis;
        else delete req.body.edesisStudentId;
      }
    }

    if (op === 'status') {
      const cfg = getEdesisConfig();
      const institutionId = actor?.institution_id || null;
      const students = await loadStudentsForMatching();
      const withEdesisId = students.filter((s) => s.edesis_ogrenci_id).length;
      const withEmail = students.filter((s) => s.email).length;
      const keyOk = Boolean(cfg.apiKey);
      const abpAuth = getEdesisAbpAuthStatus();
      return res.status(200).json({
        configured: keyOk,
        apiVersion: 'v1.5',
        deployMarker: EDESIS_PDF_DURATION_MARKER,
        institutionCode: cfg.institutionCode || null,
        baseUrl: cfg.baseUrl,
        authMode: cfg.authMode,
        tenantId: cfg.tenantId || null,
        abpAuth,
        endpoints: {
          students: '/api/external/v1/students',
          exams: '/api/external/v1/exams',
          examResults: '/api/external/v1/exams/results',
          examStructure: '/api/external/v1/exams/{id}/structure',
          examIngest: 'POST /api/external/v1/exams/{id}/results',
          ingestStatus: '/api/external/v1/exams/{id}/results/status'
        },
        studentsInDb: students.length,
        studentsWithEdesisId: withEdesisId,
        studentsWithEmail: withEmail,
        matchingGuide: EDESIS_MATCHING_GUIDE.tr,
        hint: keyOk
          ? abpAuth.configured
            ? 'probe veya sync — v1.5 + ABP TokenAuth (GetOgrenciSinavIds)'
            : 'API key var; Sınava gir için ABP: op=configure-edesis (abpUser/abpPassword) veya Vercel EDESIS_ABP_USER/PASSWORD'
          : 'Vercel: EDESIS_API_KEY + EDESIS_API_BASE_URL=https://onlinevipdershane.api.edesis.com + EDESIS_AUTH_MODE=x-api-key'
      });
    }

    if (op === 'configure-edesis' && (req.method === 'POST' || req.method === 'PUT')) {
      if (!actorIsSuper(actor, tags)) {
        return res.status(403).json({ error: 'super_admin_required' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const patch = {};
      if (body.apiKey != null) patch.apiKey = body.apiKey;
      if (body.baseUrl != null) patch.baseUrl = body.baseUrl;
      if (body.abpUser != null || body.abpUsername != null) {
        patch.abpUser = body.abpUser || body.abpUsername;
      }
      if (body.abpPassword != null) patch.abpPassword = body.abpPassword;
      if (body.abpBearer != null || body.abpToken != null) {
        patch.abpBearer = body.abpBearer || body.abpToken;
      }
      if (body.tenantId != null) patch.tenantId = body.tenantId;
      if (!Object.keys(patch).length) {
        return res.status(400).json({
          error: 'empty_patch',
          hint: 'apiKey, abpUser, abpPassword, tenantId, baseUrl alanlarından en az birini gönderin'
        });
      }
      try {
        const saved = await saveEdesisRuntimeSecretsToDb(supabaseAdmin, patch);
        const cfg = getEdesisConfig();
        // ABP doğrula (şifre yazıldıysa)
        let abpProbe = null;
        if (cfg.abpUser && cfg.abpPassword) {
          const { resolveEdesisAbpAccessToken } = await import('../api/_lib/edesis-client.js');
          abpProbe = await resolveEdesisAbpAccessToken(cfg);
        }
        return res.status(200).json({
          ok: true,
          deployMarker: EDESIS_PDF_DURATION_MARKER,
          configured: Boolean(cfg.apiKey),
          abpAuth: getEdesisAbpAuthStatus(),
          abpProbe: abpProbe
            ? { status: abpProbe.status, error: abpProbe.error, hasToken: Boolean(abpProbe.token) }
            : null,
          tenantId: cfg.tenantId || null,
          savedKeys: Object.keys(patch),
          // asla şifre/token döndürme
          hasApiKey: Boolean(saved.apiKey || cfg.apiKey),
          hasAbpUser: Boolean(saved.abpUser || cfg.abpUser),
          hasAbpPassword: Boolean(saved.abpPassword || cfg.abpPassword)
        });
      } catch (e) {
        return res.status(500).json({ ok: false, error: errorMessage(e) });
      }
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
      return res.status(200).json({
        apiVersion: 'v1.5',
        deployMarker: EDESIS_PDF_DURATION_MARKER,
        baseUrl: cfg.baseUrl,
        attempts: out
      });
    }

    if (op === 'exam-booklet-debug') {
      if (!isStaff) return res.status(403).json({ error: 'forbidden' });
      const examId = String(req.query?.examId || req.body?.examId || '').trim();
      const kitapcikTuru = String(req.query?.kitapcikTuru || req.body?.kitapcikTuru || 'A').trim();
      if (!examId) return res.status(400).json({ error: 'examId_required' });
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
      const byId = await fetchEdesisJson(localCfg, `/api/external/v1/exams/${encodeURIComponent(examId)}`);
      const detail = await fetchEdesisExamCatalogRowDetail(examId, cfg);
      const absorbed = detail ? absorbEdesisBookletSource(detail, examId) : null;
      const pdf = await loadEdesisExamBookletPdf(examId, kitapcikTuru, cfg);
      const denemeId = pdf.denemeId || absorbed?.denemeId || null;
      const keyInfo = denemeId ? await fetchEdesisDenemeAnswerKeyInfo(denemeId, localCfg) : { codes: [], detail: [] };
      return res.status(200).json({
        ok: Boolean(pdf.ok && pdf.looksPdf),
        examId,
        kitapcikTuru,
        denemeId,
        answerKeyBookletCodes: keyInfo.codes || [],
        answerKeyDetail: keyInfo.detail || [],
        answerKeyError: keyInfo.error || null,
        files: (pdf.files || []).map((f) => ({
          url: f.url,
          name: f.name,
          kitapcikTuru: f.kitapcikTuru || '',
          hasBuf: Boolean(f.buf),
          hasFileToken: Boolean(f.fileToken)
        })),
        attempts: pdf.attempts || [],
        catalogDetail: detail
          ? {
              keys: Object.keys(detail).slice(0, 80),
              denemeId: absorbed?.denemeId || null,
              denemeUrl: String(detail.denemeUrl || detail.DenemeUrl || '').slice(0, 300),
              nestedDenemeUrl: String(detail.sinav?.denemeUrl || detail.sinav?.DenemeUrl || '').slice(0, 300),
              txtDosyayasi: String(detail.txtDosyayasi || '').slice(0, 300),
              sinavSuresi: detail.sinavSuresi ?? detail.sinav?.sinavSuresi ?? null,
              kalanSure: detail.kalanSure ?? detail.sinav?.kalanSure ?? null,
              kalanSaniye: detail.kalanSaniye ?? detail.sinav?.kalanSaniye ?? null,
              isSinavSuresiForStudent:
                detail.isSinavSuresiForStudent ?? detail.sinav?.isSinavSuresiForStudent ?? null,
              remainingSeconds: pickExamDurationSeconds(detail),
              fileCount: absorbed?.files?.length || 0,
              fileUrls: (absorbed?.files || []).slice(0, 8).map((f) => f.url)
            }
          : null,
        examById: {
          status: byId.status,
          ok: byId.ok,
          keys:
            byId.json && typeof byId.json === 'object' && !Array.isArray(byId.json)
              ? Object.keys(byId.json).slice(0, 80)
              : [],
          preview: String(byId.rawPreview || byId.text || '').slice(0, 500)
        },
        pdfBytes: pdf.ok && pdf.buf ? pdf.buf.length : 0
      });
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
        if (syncInFlight) {
          const result = await syncInFlight;
          return res.status(200).json({ ...result, coalesced: true });
        }
        const pending = runSync(actor);
        syncInFlight = pending;
        try {
          const result = await pending;
          return res.status(200).json(result);
        } finally {
          if (syncInFlight === pending) syncInFlight = null;
        }
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
      const students = filterStudentsForActor(await loadStudentsForMatching(), actor, tags);
      const wantFull = String(req.query?.full || req.body?.full || '') === '1';
      if (!wantFull) {
        const items = students
          .filter((s) => s.edesis_ogrenci_id)
          .map((s) => ({
            edesisId: s.edesis_ogrenci_id,
            name: s.name,
            email: s.email,
            schoolNo: null,
            platformStudentId: s.id,
            platformStudentName: s.name,
            matchMethod: 'edesis_ogrenci_id',
            linked: true,
            parent_phone: s.parent_phone || null,
            class_level: s.class_level || null
          }));
        return res.status(200).json({
          ok: true,
          light: true,
          count: items.length,
          items,
          platformStudents: students.map((s) => ({
            id: s.id,
            name: s.name,
            email: s.email,
            edesis_ogrenci_id: s.edesis_ogrenci_id || null,
            parent_phone: s.parent_phone || null,
            class_level: s.class_level || null
          }))
        });
      }
      const filters = {
        TermId: req.query?.TermId ?? req.query?.termId ?? req.body?.TermId,
        StudentState: req.query?.StudentState ?? req.query?.studentState ?? req.body?.StudentState,
        ClassroomId: req.query?.ClassroomId ?? req.query?.classroomId ?? req.body?.ClassroomId,
        IsActive: req.query?.IsActive ?? req.query?.isActive ?? req.body?.IsActive,
        ModifiedAfter: req.query?.ModifiedAfter ?? req.query?.modifiedAfter ?? req.body?.ModifiedAfter,
        Filter: req.query?.Filter ?? req.query?.filter ?? req.body?.Filter
      };
      const fetchResult = await fetchEdesisStudentsList(cfg, filters);
      const items = (fetchResult.rows || []).map((row) => matchEdesisStudentToPlatform(row, students));
      return res.status(200).json({
        ok: true,
        count: items.length,
        items,
        platformStudents: students.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          edesis_ogrenci_id: s.edesis_ogrenci_id || null,
          parent_phone: s.parent_phone || null,
          class_level: s.class_level || null
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
      const fetchResult = await fetchEdesisExamsCatalog(cfg, {
        Filter: req.query?.Filter ?? req.query?.filter ?? req.body?.Filter,
        resultsUpdatedAfter:
          req.query?.resultsUpdatedAfter ?? req.body?.resultsUpdatedAfter ?? null
      });
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

      const fetchResult = await fetchEdesisStudentResults(edesisStudentId, cfg, { enrichSubjects: false });
      const students = filterStudentsForActor(await loadStudentsForMatching(), actor, tags);
      const institutionId = actor?.institution_id || null;
      let matched =
        students.find((s) => String(s.edesis_ogrenci_id || '').trim() === edesisStudentId) ||
        (platformStudentId ? students.find((s) => s.id === platformStudentId) : null);
      const platformId = platformStudentId || matched?.id || null;

      let parentPhone = matched?.parent_phone || null;
      let platformStudentName = matched?.name || null;
      if (platformId) {
        let { data: stFresh, error: stErr } = await supabaseAdmin
          .from('students')
          .select('parent_phone, name, class_level')
          .eq('id', platformId)
          .maybeSingle();
        if (stErr && String(stErr.message || '').includes('class_level')) {
          ({ data: stFresh, error: stErr } = await supabaseAdmin
            .from('students')
            .select('parent_phone, name')
            .eq('id', platformId)
            .maybeSingle());
        }
        if (stFresh) {
          parentPhone = stFresh.parent_phone || parentPhone;
          platformStudentName = stFresh.name || platformStudentName;
          if (stFresh.class_level != null) matched = { ...(matched || {}), class_level: stFresh.class_level };
        }
      }

      const mappedExams = mapHubResultExams(
        (fetchResult.rows || []).filter((row) => !(isStudent && !isStaff && edesisResultHiddenFromStudent(row))),
        platformId,
        edesisStudentId,
        institutionId || matched?.institution_id || null
      );
      // Öğrencinin kendi Edesis sonuçlarını programla süzme.
      // Atanmış çapraz program denemeleri (ör. sınıf 12/YKS iken YÖS SARMAL)
      // ingest sonrası Sonuçlarım’da kayboluyordu.
      const exams = mappedExams;

      return res.status(200).json({
        ok: true,
        edesisStudentId,
        platformStudentId: platformId,
        platformStudentName: platformStudentName || null,
        parent_phone: parentPhone || null,
        parent_phone_source: 'coaching_system',
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
        const codesRaw = req.query?.reportCodes ?? req.body?.reportCodes ?? [102];
        const reportCodes = (Array.isArray(codesRaw) ? codesRaw : String(codesRaw).split(','))
          .map((c) => Number(c))
          .filter((c) => [102, 104, 105].includes(c));
        const forceNew = String(req.query?.forceNew || req.body?.forceNew || '') === '1' || req.body?.forceNew === true;
        const report = await generateEdesisExamReport(
          {
            examId,
            termId,
            studentIds: [edesisStudentId],
            reportCodes: reportCodes.length ? reportCodes : [102],
            forceNew
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

    if (op === 'exam-hata-karnesi-pdf') {
      const examId = String(req.query?.examId || req.body?.examId || '').trim();
      const download = String(req.query?.download || req.body?.download || '') === '1';
      if (!examId) return res.status(400).json({ error: 'examId_required' });

      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });

      let edesisStudentId = String(req.query?.edesisStudentId || req.body?.edesisStudentId || '').trim();
      const studentId = String(req.query?.studentId || req.body?.studentId || '').trim();
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
        const pdf = await loadEdesisHataKarnesiPdf({ examId, edesisStudentId }, cfg);
        if (download && pdf.buf && pdf.looksPdf) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'inline; filename="hata-karnesi.pdf"');
          res.setHeader('Cache-Control', 'private, max-age=120');
          return res.status(200).send(pdf.buf);
        }
        if (!pdf.ok && !pdf.reportUrl) {
          return res.status(200).json({
            ok: false,
            error: 'hata_karnesi_pdf_missing',
            message: pdf.message,
            hint: pdf.hint || 'Bu sınav için hata karnesi PDF’si Edesis’te bulunamadı'
          });
        }
        return res.status(200).json({
          ok: true,
          examId,
          edesisStudentId,
          reportUrl: pdf.reportUrl || null,
          source: pdf.source || null,
          fileName: pdf.fileName || 'hata-karnesi.pdf',
          message: pdf.message,
          hint: pdf.hint || null
        });
      } catch (e) {
        return res.status(502).json({
          error: 'hata_karnesi_pdf_failed',
          message: errorMessage(e),
          hint: 'Edesis hata karnesi (boş + yanlış sorular) — hata kitapçığı değildir'
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

    if (op === 'exam-structure') {
      const examId = String(req.query?.examId || req.body?.examId || '').trim();
      if (!examId) return res.status(400).json({ error: 'examId_required' });
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const structure = await fetchEdesisExamStructure(examId, cfg);
      if (structure.error && !structure.rows?.length) {
        return res.status(structure.httpStatus && structure.httpStatus >= 400 ? structure.httpStatus : 502).json({
          error: 'exam_structure_failed',
          message: structure.error,
          hint: 'GET /exams/{id}/structure — exams:read gerekli'
        });
      }
      return res.status(200).json({
        ok: true,
        examId,
        count: structure.rows.length,
        items: structure.rows,
        booklets: structure.booklets,
        availableBookletCodes: structure.availableBookletCodes || listEdesisBookletCodes(structure),
        answerKeyBookletCodes: structure.answerKeyBookletCodes || [],
        answerKeyDetail: structure.answerKeyDetail || [],
        denemeOnlyBookletCodes: structure.denemeOnlyBookletCodes || denemeOnlyBookletCodes(structure),
        denemeId: structure.denemeId || null,
        bookletPdfs: rewriteBookletFilesForBrowser(structure.bookletPdfs || []),
        examFamily: structure.examFamily || 'generic',
        bookletMode: structure.bookletMode || 'single',
        choiceCount: structure.choiceCount || 4,
        remainingSeconds: structure.remainingSeconds || 0,
        examTitle: structure.examTitle || '',
        examType: structure.examType || '',
        deployMarker: EDESIS_PDF_DURATION_MARKER
      });
    }

    if (op === 'exam-booklet-pdf') {
      const examId = String(req.query?.examId || req.body?.examId || '').trim();
      const kitapcikTuru = String(req.query?.kitapcikTuru || req.body?.kitapcikTuru || '').trim();
      const preferredFileUrl = String(req.query?.fileUrl || req.body?.fileUrl || '').trim();
      const download = String(req.query?.download || req.body?.download || '') === '1';
      if (!examId) return res.status(400).json({ error: 'examId_required' });
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });

      if (isStudent && !isStaff) {
        const edesisStudentId = String(
          req.query?.edesisStudentId || req.body?.edesisStudentId || studentSelf?.edesis_ogrenci_id || ''
        ).trim();
        if (!edesisStudentId) {
          return res.status(400).json({
            error: 'edesis_student_id_missing',
            hint: 'Kitapçık PDF için Edesis öğrenci eşlemesi gerekli'
          });
        }
        // Kitapçık kurum paylaşımıdır; atama listesi gecikince 403 boş PDF üretmesin.
        // Öğrenci kimliği + sınav UUID yeter (structure zaten aynı id ile açılır).
      }

      const pdf = await loadEdesisExamBookletPdf(examId, kitapcikTuru, cfg, {
        preferredFileUrl: preferredFileUrl || undefined
      });
      const files = rewriteBookletFilesForBrowser(
        (pdf.files || []).map((f) => ({
          url: f.url,
          kitapcikTuru: f.kitapcikTuru || '',
          name: f.name || 'Kitapçık PDF'
        }))
      );
      if (download) {
        res.setHeader('Cache-Control', 'private, no-store');
        const driveUrl = pickGoogleDriveFetchUrl([pdf.url, ...(pdf.files || []).map((f) => f.url)]);
        if (pdf.ok && pdf.buf && pdf.looksPdf && pdf.buf.length <= 4_000_000) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader(
            'Content-Disposition',
            `inline; filename="kitapcik-${(kitapcikTuru || 'A').replace(/[^A-Za-z0-9]/g, '')}.pdf"`
          );
          return res.status(200).send(pdf.buf);
        }
        // Drive 7MB: Vercel gövde limiti + tarayıcı CORS/CORP. 302 Chrome’da Failed to fetch.
        // 200 JSON + /preview iframe — konsolda 404 yok, PDF görünür.
        const preview =
          pdf.previewUrl ||
          googleDrivePreviewUrl(driveUrl || pdf.url || preferredFileUrl);
        if (preview) {
          return res.status(200).json({
            ok: true,
            publicFetch: true,
            viewer: 'google-drive-preview',
            url: preview,
            downloadUrl: driveUrl || pdf.downloadUrl || pdf.url || null,
            files,
            denemeId: pdf.denemeId || null
          });
        }
        return res.status(200).json({
          ok: false,
          error: 'booklet_pdf_missing',
          hint: 'Bu sınav için kitapçık PDF’si Edesis’te bulunamadı',
          files,
          denemeId: pdf.denemeId || null,
          attempts: Array.isArray(pdf.attempts) ? pdf.attempts.slice(0, 25) : []
        });
      }
      if (!pdf.ok && !files.length) {
        return res.status(404).json({
          ok: false,
          error: 'booklet_pdf_missing',
          hint: 'Bu sınav için kitapçık PDF’si Edesis’te bulunamadı',
          files,
          denemeId: pdf.denemeId || null,
          attempts: Array.isArray(pdf.attempts) ? pdf.attempts.slice(0, 25) : []
        });
      }
      return res.status(200).json({
        ok: true,
        examId,
        kitapcikTuru: kitapcikTuru || null,
        url: pdf.url || files[0]?.url || null,
        files,
        denemeId: pdf.denemeId || null
      });
    }

    if (op === 'exam-subjects') {
      if (!isStaff) return res.status(403).json({ error: 'forbidden' });
      const examId = String(req.query?.examId || req.body?.examId || '').trim();
      if (!examId) return res.status(400).json({ error: 'examId_required' });
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const subjects = await fetchEdesisExamSubjects(examId, cfg);
      return res.status(200).json({ ok: true, examId, count: subjects.rows.length, items: subjects.rows });
    }

    if (op === 'exam-results-lessons' || op === 'exam-results-subjects') {
      if (!isStaff) return res.status(403).json({ error: 'forbidden' });
      const examId = String(req.query?.examId || req.body?.examId || '').trim();
      if (!examId) return res.status(400).json({ error: 'examId_required' });
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const studentId = String(req.query?.edesisStudentId || req.query?.studentId || req.body?.edesisStudentId || '').trim();
      const fetchFn = op === 'exam-results-lessons' ? fetchEdesisExamResultsLessons : fetchEdesisExamResultsSubjects;
      const result = await fetchFn(examId, { studentId: studentId || undefined }, cfg);
      return res.status(200).json({
        ok: true,
        examId,
        count: result.totalCount,
        items: result.rows || []
      });
    }

    if (op === 'available-exams') {
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });

      let edesisStudentId = String(
        req.query?.edesisStudentId || req.body?.edesisStudentId || ''
      ).trim();
      const platformStudentId = String(req.query?.studentId || req.body?.studentId || '').trim();
      let studentHint = studentSelf || null;
      if (!edesisStudentId && platformStudentId) {
        const resolved = await resolveEdesisIdForPlatformStudent(platformStudentId, actor, tags);
        edesisStudentId = resolved.edesisStudentId || '';
        studentHint = resolved.student || studentHint;
      }
      if (!edesisStudentId) {
        return res.status(400).json({
          error: 'edesis_student_id_missing',
          hint: 'Sınava girmek için Edesis öğrenci eşlemesi gerekli — koçunuzdan Edesis ID bağlatın'
        });
      }

      const loaded = await loadAvailableEdesisExamsForStudent({
        edesisStudentId,
        platformStudentId,
        actor,
        studentHint,
        cfg
      });
      const items = loaded.items || [];
      const meta = loaded.meta || {};
      const taken = mapHubResultExams(
        loaded.resultRows || [],
        platformStudentId || null,
        edesisStudentId,
        actor?.institution_id || null
      );

      return res.status(200).json({
        ok: true,
        deployMarker: EDESIS_ASSIGNED_ONLY_MARKER,
        edesisStudentId,
        count: items.length,
        items,
        taken,
        takenCount: taken.length,
        scope: meta.assignmentMode || 'assigned',
        assignmentMeta: meta,
        takeableCount: items.filter((x) => x.canTake && !x.hasStudentResult).length,
        hint: (() => {
          const takeable = items.filter((x) => x.canTake && !x.hasStudentResult).length;
          if (takeable > 0) return null;
          const attempts = meta.adminAssignmentAttempts || [];
          const getIds401 = attempts.some(
            (a) => a?.label === 'GetOgrenciSinavIds' && (a.status === 401 || a.status === 403)
          );
          const analysisN = Number(meta.analysisIdCount || 0);
          if (getIds401 && analysisN > 0) {
            return 'Edesis online atama listesi (GetOgrenciSinavIds) şu an API key ile açılamıyor. Analiz geçmişi Sınava gir’e dökülmez; ABP oturumu (configure-edesis / EDESIS_ABP_USER) gerekir. Girilmiş denemeler Sonuçlarım’da.';
          }
          const getIdsEmpty = attempts.some(
            (a) => a?.label === 'GetOgrenciSinavIds' && a.status === 200 && Number(a.count || 0) === 0
          );
          if (getIdsEmpty && !meta?.abpAuth?.configured) {
            return 'GetOgrenciSinavIds boş/401 — ABP panel kullanıcısı + tenantId (3226) gerekli. op=configure-edesis ile kaydedin.';
          }
          if (items.length) {
            return 'Girilmiş sonuçlarınız var; henüz girilmemiş açık deneme bulunamadı.';
          }
          return 'Size tanımlı açık Edesis denemesi yok. Edesis’te öğrenciye online deneme tanımlayıp Yenile’ye basın.';
        })()
      });
    }

    if (op === 'student-dossier') {
      if (!isStaff) return res.status(403).json({ error: 'forbidden' });
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      let edesisStudentId = String(
        req.query?.edesisStudentId || req.body?.edesisStudentId || ''
      ).trim();
      const platformStudentId = String(req.query?.studentId || req.body?.studentId || '').trim();
      let studentHint = null;
      let autoLinked = false;
      let matchMethod = null;
      if (!edesisStudentId && platformStudentId) {
        const resolved = await resolveEdesisIdForPlatformStudent(platformStudentId, actor, tags);
        edesisStudentId = resolved.edesisStudentId || '';
        studentHint = resolved.student || null;
        autoLinked = Boolean(resolved.autoLinked);
        matchMethod = resolved.matchMethod || null;
      }
      if (!edesisStudentId) {
        return res.status(400).json({
          error: 'edesis_student_id_missing',
          hint: 'Öğrenciyi Edesis ID ile bağlayın — listeden seçip kaydedin'
        });
      }
      const students = filterStudentsForActor(await loadStudentsForMatching(), actor, tags);
      const matched =
        students.find((s) => String(s.edesis_ogrenci_id || '').trim() === edesisStudentId) ||
        (platformStudentId ? students.find((s) => s.id === platformStudentId) : null) ||
        studentHint;
      const platformId = platformStudentId || matched?.id || null;
      const loaded = await loadAvailableEdesisExamsForStudent({
        edesisStudentId,
        platformStudentId: platformId,
        actor,
        studentHint: matched || studentHint,
        cfg
      });
      const taken = mapHubResultExams(
        loaded.resultRows || [],
        platformId,
        edesisStudentId,
        actor?.institution_id || matched?.institution_id || null
      );
      const takeable = (loaded.items || []).filter((x) => x.canTake && !x.hasStudentResult);
      return res.status(200).json({
        ok: true,
        deployMarker: EDESIS_ASSIGNED_ONLY_MARKER,
        edesisStudentId,
        platformStudentId: platformId,
        autoLinked,
        matchMethod,
        profile: {
          name: matched?.name || null,
          email: matched?.email || null,
          classLevel: matched?.class_level || loaded.scope?.classLevel || null,
          gradeName: loaded.scope?.gradeName || null,
          className: loaded.scope?.className || null,
          classroomId: loaded.scope?.classroomId || null,
          parentPhone: matched?.parent_phone || null,
          programKeys: [...(loaded.scope?.programKeys || [])],
          edesis: { id: edesisStudentId }
        },
        takeable,
        taken,
        openOnline: loaded.openOnline || [],
        counts: {
          takeable: takeable.length,
          taken: taken.length,
          openOnline: (loaded.openOnline || []).length
        },
        assignmentMeta: loaded.meta || {}
      });
    }

    if (op === 'debug-assignment') {
      if (!isStaff) return res.status(403).json({ error: 'forbidden' });
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      let edesisStudentId = String(
        req.query?.edesisStudentId || req.body?.edesisStudentId || ''
      ).trim();
      const platformStudentId = String(req.query?.studentId || req.body?.studentId || '').trim();
      if (!edesisStudentId && platformStudentId) {
        const resolved = await resolveEdesisIdForPlatformStudent(platformStudentId, actor, tags);
        edesisStudentId = resolved.edesisStudentId || '';
      }
      if (!edesisStudentId) {
        return res.status(400).json({ error: 'edesis_student_id_missing' });
      }
      const adminAssignment = await fetchEdesisOgrenciAssignedSinavIdsDetailed(edesisStudentId, cfg);
      const loaded = await loadAvailableEdesisExamsForStudent({
        edesisStudentId,
        platformStudentId,
        actor,
        studentHint: null,
        cfg
      });
      return res.status(200).json({
        ok: true,
        deployMarker: EDESIS_ASSIGNED_ONLY_MARKER,
        edesisStudentId,
        adminAssignment,
        assignmentMeta: loaded.meta,
        takeableCount: (loaded.items || []).filter((x) => x.canTake && !x.hasStudentResult).length,
        takeableSample: (loaded.items || [])
          .filter((x) => x.canTake && !x.hasStudentResult)
          .slice(0, 20)
          .map((x) => ({ examId: x.examId, examTitle: x.examTitle || x.name, examType: x.examType })),
        resultCount: (loaded.items || []).filter((x) => x.hasStudentResult).length
      });
    }

    if (op === 'debug-exam-assign') {
      if (!isStaff) return res.status(403).json({ error: 'forbidden' });
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const examId = String(req.query?.examId || req.body?.examId || '').trim();
      let edesisStudentId = String(
        req.query?.edesisStudentId || req.body?.edesisStudentId || ''
      ).trim();
      const platformStudentId = String(req.query?.studentId || req.body?.studentId || '').trim();
      if (!examId) return res.status(400).json({ error: 'examId_required' });
      if (!edesisStudentId && platformStudentId) {
        const resolved = await resolveEdesisIdForPlatformStudent(platformStudentId, actor, tags);
        edesisStudentId = resolved.edesisStudentId || '';
      }
      if (!edesisStudentId) return res.status(400).json({ error: 'edesis_student_id_missing' });
      const detail = await fetchEdesisExamCatalogRowDetail(examId, cfg);
      const roster = await fetchEdesisExamRosterStudentIds(examId, cfg);
      const classroomId = String(req.query?.classroomId || '294965');
      const assign = catalogExamAssignedToStudent(detail || {}, {
        edesisStudentId,
        classroomId,
        allowClassroomOnly: true,
        requireStudentIdMatch: true
      });
      return res.status(200).json({
        ok: true,
        examId,
        edesisStudentId,
        classroomId,
        assign,
        detailKeys: detail ? Object.keys(detail).slice(0, 40) : [],
        ogrenciIds: detail?.ogrenciIds || detail?.studentIds || null,
        classRoomIds: detail?.classRoomIds || detail?.classroomIds || null,
        isAllClasses: detail?.isAllClasses ?? null,
        isOnlineSinavForStudent: detail?.isOnlineSinavForStudent ?? null,
        rosterCount: Array.isArray(roster) ? roster.length : null,
        rosterHasStudent: Array.isArray(roster)
          ? roster.some((id) => String(id) === String(edesisStudentId))
          : null,
        detailSample: detail
          ? {
              id: detail.id,
              sinavAdi: detail.sinavAdi || detail.name,
              gradeId: detail.gradeId ?? detail.sinav?.gradeId ?? null,
              isAllClasses: detail.isAllClasses,
              ogrenciIds: detail.ogrenciIds,
              classRoomIds: detail.classRoomIds,
              startDate: detail.startDate || detail.sinav?.startDate || null,
              endDate: detail.endDate || detail.sinav?.endDate || null,
              sinavTarihi: detail.sinavTarihi || detail.examDate || null,
              toplamOgrenci: detail.toplamOgrenci ?? null,
              sinavKatilanOgrenci: detail.sinavKatilanOgrenci ?? null
            }
          : null
      });
    }

    if (op === 'submit-exam' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const examId = String(body.examId || req.query?.examId || '').trim();
      const kitapcikTuru = String(body.kitapcikTuru || '').trim();
      const kitapcikTuruSay = String(body.kitapcikTuruSay || '').trim();
      const replace = Boolean(body.replace);
      if (!examId) return res.status(400).json({ error: 'examId_required' });
      if (!kitapcikTuru) return res.status(400).json({ error: 'kitapcikTuru_required' });

      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });

      let edesisStudentId = String(body.edesisStudentId || req.query?.edesisStudentId || '').trim();
      const platformStudentId = String(body.studentId || req.query?.studentId || '').trim();
      if (!edesisStudentId && platformStudentId) {
        const resolved = await resolveEdesisIdForPlatformStudent(platformStudentId, actor, tags);
        edesisStudentId = resolved.edesisStudentId || '';
      }
      if (!edesisStudentId) {
        return res.status(400).json({
          error: 'edesis_student_id_missing',
          hint: 'Sınava girmek için Edesis öğrenci eşlemesi gerekli'
        });
      }

      const loaded = await loadAvailableEdesisExamsForStudent({
        edesisStudentId,
        platformStudentId,
        actor,
        studentHint: studentSelf,
        cfg
      });
      const assigned = loaded.items || [];
      const assignedExam = assigned.find((ex) => String(ex.examId) === examId);
      const assignedIdSet = new Set((loaded.meta?.assignedExamIds || []).map((id) => String(id)));
      const inAssigned = assignedIdSet.has(examId) || Boolean(assignedExam);
      if (!inAssigned) {
        return res.status(403).json({
          error: 'exam_not_assigned',
          hint: 'Bu deneme size tanımlanmamış'
        });
      }
      const submittedFromResults = (loaded.resultRows || []).some((row) => {
        if (String(pickEdesisResultExamId(row) || '') !== examId) return false;
        if (edesisStudentId && !resultRowBelongsToStudent(row, edesisStudentId)) return false;
        return edesisResultLooksSubmitted(row);
      });
      if (isStudent && !isStaff && (assignedExam?.hasStudentResult || submittedFromResults)) {
        return res.status(409).json({
          ok: false,
          conflict: true,
          error: 'already_submitted',
          message: 'Bu sınava daha önce girdiniz',
          hint: 'Girilmiş denemeye tekrar girilemez. Sonuçlarım ve Analizlerim sekmelerine bakın.'
        });
      }
      const replaceForIngest = isStudent && !isStaff ? false : replace;

      const structure = await fetchEdesisExamStructure(examId, cfg);
      const kitapcikNorm = normalizeKitapcikCode(kitapcikTuru) || kitapcikTuru;
      const allowed = kitapcikAllowedForExam(structure, kitapcikNorm);
      if (!allowed.ok) {
        return res.status(400).json({
          error: 'invalid_kitapcik',
          message: `Kitapçık türü için cevap anahtarı bulunamadı. KitapcikTuru=${kitapcikNorm}`,
          hint: allowed.available.length
            ? `Bu sınavda kayıtlı kitapçıklar: ${allowed.available.join(', ')}`
            : 'Edesis’te bu deneme için cevap anahtarı yok',
          availableBookletCodes: allowed.available,
          answerKeyBookletCodes: structure.answerKeyBookletCodes || []
        });
      }
      if (kitapcikTuruSay) {
        const allowedSay = kitapcikAllowedForExam(structure, kitapcikTuruSay);
        if (!allowedSay.ok) {
          return res.status(400).json({
            error: 'invalid_kitapcik',
            message: `Kitapçık türü için cevap anahtarı bulunamadı. KitapcikTuruSay=${normalizeKitapcikCode(kitapcikTuruSay)}`,
            hint: allowedSay.available.length
              ? `Bu sınavda kayıtlı kitapçıklar: ${allowedSay.available.join(', ')}`
              : 'Edesis’te bu deneme için sayısal kitapçık cevap anahtarı yok',
            availableBookletCodes: allowedSay.available,
            answerKeyBookletCodes: structure.answerKeyBookletCodes || []
          });
        }
      }
      const bookletLessons = pickEdesisBookletLessons(structure, kitapcikTuru);
      if (!bookletLessons.length) {
        return res.status(400).json({
          error: 'exam_structure_empty',
          message: 'Sınav ders yapısı alınamadı',
          hint: 'Edesis structure endpoint boş döndü',
          booklets: structure.booklets
        });
      }

      const incoming = Array.isArray(body.dersCevaplari) ? body.dersCevaplari : [];
      const byKey = new Map();
      for (const d of incoming) {
        byKey.set(`${Number(d.lessonId)}:${Number(d.dersGrupId)}`, d);
      }
      const dersCevaplari = [];
      for (const lesson of bookletLessons) {
        const hit = byKey.get(`${lesson.lessonId}:${lesson.dersGrupId}`);
        const cevaplar = String(hit?.cevaplar ?? '');
        if (cevaplar.length !== lesson.questionCount) {
          return res.status(400).json({
            error: 'answer_length_mismatch',
            hint: `${lesson.lessonName || 'Ders'} için ${lesson.questionCount} cevap bekleniyor, ${cevaplar.length} geldi`,
            lessonId: lesson.lessonId,
            dersGrupId: lesson.dersGrupId,
            expected: lesson.questionCount,
            actual: cevaplar.length
          });
        }
        dersCevaplari.push({
          lessonId: lesson.lessonId,
          dersGrupId: lesson.dersGrupId,
          cevaplar
        });
      }

      const ingest = await submitEdesisExamResults(
        examId,
        {
          replace: replaceForIngest,
          results: [
            {
              ogrenciId: Number(edesisStudentId),
              kitapcikTuru,
              ...(kitapcikTuruSay ? { kitapcikTuruSay } : {}),
              dersCevaplari
            }
          ]
        },
        cfg
      );

      if (ingest.conflict) {
        return res.status(409).json({
          ok: false,
          conflict: true,
          error: 'existing_result',
          message: ingest.message,
          hint:
            isStudent && !isStaff
              ? 'Bu sınava daha önce girdiniz; tekrar gönderilemez'
              : 'Aynı sınava tekrar girmek için replace: true gönderin'
        });
      }
      if (!ingest.ok) {
        const status = ingest.httpStatus && ingest.httpStatus >= 400 ? ingest.httpStatus : 422;
        const reason = String(ingest.rejected?.[0]?.reason || ingest.message || '');
        return res.status(status).json({
          ok: false,
          error: 'ingest_rejected',
          message: ingest.message,
          accepted: ingest.accepted,
          rejected: ingest.rejected,
          hint:
            ingest.httpStatus === 403
              ? 'API key exam_results:write kapsamına sahip olmalı (admin veya custom paket)'
              : reason || ingest.message,
          availableBookletCodes: listEdesisBookletCodes(structure)
        });
      }

      let job = {
        jobId: ingest.jobId,
        state: ingest.jobId ? 'Pending' : null,
        message: ingest.message
      };
      if (ingest.jobId) {
        job = await pollEdesisIngestJob(examId, ingest.jobId, { maxAttempts: 10, delayMs: 4000 }, cfg);
      }

      let localImport = null;
      const jobState = String(job?.state || '');
      const shouldImportLocal =
        Boolean(platformStudentId) &&
        (!ingest.jobId || ['Completed', 'Success', 'Succeeded'].includes(jobState) || !jobState);
      if (shouldImportLocal) {
        try {
          localImport = await importEdesisExamResultToLocal({
            examId,
            edesisStudentId,
            platformStudentId,
            institutionId: actor?.institution_id || studentSelf?.institution_id || null,
            cfg
          });
          // İnvest henüz skor üretmediyse kısa retry
          if (!localImport?.imported) {
            await new Promise((r) => setTimeout(r, 2500));
            localImport = await importEdesisExamResultToLocal({
              examId,
              edesisStudentId,
              platformStudentId,
              institutionId: actor?.institution_id || studentSelf?.institution_id || null,
              cfg
            });
          }
        } catch (e) {
          localImport = { imported: 0, error: errorMessage(e) };
        }
      }

      return res.status(202).json({
        ok: true,
        accepted: ingest.accepted,
        rejected: ingest.rejected,
        jobId: ingest.jobId,
        statusUrl: ingest.statusUrl,
        job,
        localImport,
        message: ingest.message
      });
    }

    if (op === 'ingest-results' && req.method === 'POST') {
      if (!isStaff) return res.status(403).json({ error: 'forbidden' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const examId = String(body.examId || req.query?.examId || '').trim();
      if (!examId) return res.status(400).json({ error: 'examId_required' });
      if (!Array.isArray(body.results) || !body.results.length) {
        return res.status(400).json({ error: 'results_required', hint: 'results dizisinde en az bir öğrenci satırı olmalı' });
      }
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });

      const ingest = await submitEdesisExamResults(
        examId,
        { replace: Boolean(body.replace), results: body.results },
        cfg
      );
      if (ingest.conflict) {
        return res.status(409).json({
          ok: false,
          conflict: true,
          error: 'existing_result',
          message: ingest.message,
          hint: 'replace gövde alanıdır; ?replace=true query string yok sayılır'
        });
      }
      if (!ingest.ok) {
        const status = ingest.httpStatus && ingest.httpStatus >= 400 ? ingest.httpStatus : 422;
        return res.status(status).json({
          ok: false,
          error: 'ingest_rejected',
          message: ingest.message,
          accepted: ingest.accepted,
          rejected: ingest.rejected
        });
      }

      let job = null;
      if (ingest.jobId && body.poll !== false) {
        job = await pollEdesisIngestJob(examId, ingest.jobId, { maxAttempts: 8, delayMs: 4000 }, cfg);
      }

      return res.status(202).json({
        ok: true,
        accepted: ingest.accepted,
        rejected: ingest.rejected,
        jobId: ingest.jobId,
        statusUrl: ingest.statusUrl,
        job,
        message: ingest.message
      });
    }

    if (op === 'ingest-status') {
      const examId = String(req.query?.examId || req.body?.examId || '').trim();
      const jobId = String(req.query?.jobId || req.body?.jobId || '').trim();
      if (!examId) return res.status(400).json({ error: 'examId_required' });
      if (!jobId) return res.status(400).json({ error: 'jobId_required' });
      const cfg = getEdesisConfig();
      if (!cfg.apiKey) return res.status(400).json({ error: 'EDESIS_API_KEY_missing' });
      const job = await fetchEdesisIngestJobStatus(examId, jobId, cfg);
      return res.status(200).json({
        ok: true,
        examId,
        jobId: job.jobId,
        state: job.state,
        message: job.message
      });
    }

    if (op === 'enroll-platform-students' && (req.method === 'POST' || req.method === 'GET')) {
      if (!(actor.role === 'super_admin' || actor.role === 'admin')) {
        return res.status(403).json({ error: 'admin_required' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const limit = Number(req.query?.limit || body.limit || 6);
      const institutionId =
        actor.role === 'admin' && actor.institution_id
          ? String(actor.institution_id)
          : EDESIS_AUTO_ENROLL_INSTITUTION_ID;
      try {
        const result = await enrollPlatformStudentsBatch({
          limit,
          institutionId
        });
        return res.status(200).json(result);
      } catch (e) {
        return res.status(200).json({
          ok: false,
          error: errorMessage(e),
          marker: EDESIS_AUTO_ENROLL_MARKER
        });
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
        'exam-hata-karnesi-pdf',
        'exam-structure',
        'exam-booklet-pdf',
        'exam-booklet-debug',
        'debug-fetch',
        'exam-subjects',
        'exam-results-lessons',
        'exam-results-subjects',
        'available-exams',
        'debug-assignment',
        'debug-exam-assign',
        'submit-exam',
        'ingest-results',
        'ingest-status',
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
        'create-parent',
        'enroll-platform-students'
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

export { runSync };
