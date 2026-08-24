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
  fetchEdesisOgrenciAssignedSinavIdsDetailed,
  getEdesisAbpAuthStatus,
  fetchEdesisGradesList,
  fetchEdesisDepartmentsList,
  fetchEdesisClassroomsList,
  createEdesisClassroom,
  createEdesisStudent,
  createEdesisParent,
  fetchEdesisExamStructure,
  loadEdesisExamBookletPdf,
  loadEdesisHataKarnesiPdf,
  pickEdesisBookletLessons,
  listEdesisBookletCodes,
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
  pickEdesisResultExamId,
  EDESIS_EMPTY_LIST_HELP
} from '../api/_lib/edesis-client.js';
import {
  processEdesisRows,
  findStudentMatchPreview,
  EDESIS_MATCHING_GUIDE
} from '../api/_lib/edesis-student-match.js';

const STAFF = new Set(['super_admin', 'admin', 'coach']);
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
  try {
    const es = await fetchEdesisStudentByOgrenciId(edesisStudentId, cfg);
    gradeName = es?.gradeName || '';
    className = es?.className || '';
    classroomId = es?.classroomId || '';
  } catch {
    /* sınıf Edesis’ten gelmezse class_level yeter */
  }
  return {
    programKeys: inferEdesisExamProgramKeys({ gradeName, className, classLevel }),
    classroomId,
    gradeName,
    className,
    classLevel
  };
}

/**
 * Öğrenci Sınava gir — yalnızca Edesis’te bu öğrenci ID’sine tanımlanan denemeler.
 * Kaynak: ogrenciIds, GetOgrenciSinavIds / OgrenciSinavListesi (ID’siz AP),
 * GetOgrenciBySinavId, güvenilir StudentId/ClassroomId alt kümesi.
 * Program/recency yedeği YOK — atanmamış deneme gösterilmez (tüm katalog dökülmesin).
 */
async function loadAvailableEdesisExamsForStudent({
  edesisStudentId,
  platformStudentId,
  actor,
  studentHint,
  cfg
}) {
  const scope = await resolveStudentEdesisScope({
    edesisStudentId,
    platformStudentId,
    studentHint,
    cfg
  });
  const catalog = await fetchEdesisExamsCatalog(cfg).catch(() => ({ rows: [] }));
  const fullRows = catalog.rows || [];
  const [studentCatalog, classroomCatalog, studentResults] = await Promise.all([
    fetchEdesisExamsCatalogForStudent(edesisStudentId, cfg, {
      fullCatalogRows: fullRows
    }).catch(() => ({ rows: [] })),
    scope.classroomId
      ? fetchEdesisExamsCatalogForClassroom(scope.classroomId, cfg, fullRows).catch(() => ({
          rows: []
        }))
      : Promise.resolve({ rows: [] }),
    fetchEdesisStudentResults(edesisStudentId, cfg, { enrichSubjects: false }).catch(() => ({
      rows: []
    }))
  ]);

  let studentRows = studentCatalog.rows || [];
  if (studentRows.length && !catalogQueryLooksFiltered(fullRows, studentRows)) {
    studentRows = [];
  }
  let classroomRows = classroomCatalog.rows || [];
  if (classroomRows.length && !catalogQueryLooksFiltered(fullRows, classroomRows)) {
    classroomRows = [];
  }

  const assignedResolved = await resolveAssignedCatalogRowsForStudentAsync(
    {
      catalogRows: fullRows,
      studentCatalogRows: studentRows,
      classroomCatalogRows: classroomRows,
      edesisStudentId,
      classroomId: scope.classroomId
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
  const items = buildStudentAvailableEdesisExamItems({
    catalogRows: fullRows,
    assignedCatalogRows: hasAssignmentSignal ? assignedCatalogRows : [],
    resultRows: studentResults.rows || [],
    edesisStudentId,
    programKeys: scope.programKeys,
    classroomId: scope.classroomId,
    studentId: platformStudentId || `edesis-${edesisStudentId}`,
    institutionId: actor?.institution_id || null,
    // Atama yoksa boş liste — kurum kataloğu / program yedeği kapalı
    allowRecencyFallback: false,
    requireExplicitAssignment: true
  });
  const takeableIds = items.filter((x) => x.canTake && !x.hasStudentResult).map((x) => x.examId);
  const abpAuth = adminAssignment?.abpAuth || getEdesisAbpAuthStatus();
  return {
    items,
    meta: {
      assignmentMode: hasAssignmentSignal ? 'assigned' : 'assigned-empty',
      assignedCount: hasAssignmentSignal ? assignedCatalogRows.length : 0,
      assignedExamIds: (assignedCatalogRows || [])
        .map((ex) => pickEdesisCatalogExamId(ex))
        .filter(Boolean)
        .slice(0, 80),
      takeableCount: takeableIds.length,
      takeableExamIds: takeableIds.slice(0, 40),
      classroomId: scope.classroomId || null,
      studentCatalogCount: studentRows.length,
      classroomCatalogCount: classroomRows.length,
      fullCatalogCount: fullRows.length,
      programKeys: [...(scope.programKeys || [])],
      adminAssignmentSource: adminAssignment?.source || null,
      adminSinavIdCount: adminAssignment?.ids?.length || 0,
      adminSinavIdsSample: (adminAssignment?.ids || []).slice(0, 20),
      adminAssignmentAttempts: adminAssignment?.attempts || [],
      abpAuth
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
      return res.status(200).json({
        configured: keyOk,
        apiVersion: 'v1.5',
        institutionCode: cfg.institutionCode || null,
        baseUrl: cfg.baseUrl,
        authMode: cfg.authMode,
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
          ? 'probe veya sync — v1.5 API; ham cevap gönderimi için exam_results:write (admin/custom)'
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
      return res.status(200).json({ apiVersion: 'v1.5', baseUrl: cfg.baseUrl, attempts: out });
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
      const pdf = await loadEdesisExamBookletPdf(examId, kitapcikTuru, cfg);
      return res.status(200).json({
        ok: Boolean(pdf.ok && pdf.looksPdf),
        examId,
        kitapcikTuru,
        denemeId: pdf.denemeId || null,
        files: (pdf.files || []).map((f) => ({
          url: f.url,
          name: f.name,
          kitapcikTuru: f.kitapcikTuru || '',
          hasBuf: Boolean(f.buf)
        })),
        attempts: pdf.attempts || [],
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
      const filters = {
        TermId: req.query?.TermId ?? req.query?.termId ?? req.body?.TermId,
        StudentState: req.query?.StudentState ?? req.query?.studentState ?? req.body?.StudentState,
        ClassroomId: req.query?.ClassroomId ?? req.query?.classroomId ?? req.body?.ClassroomId,
        IsActive: req.query?.IsActive ?? req.query?.isActive ?? req.body?.IsActive,
        ModifiedAfter: req.query?.ModifiedAfter ?? req.query?.modifiedAfter ?? req.body?.ModifiedAfter,
        Filter: req.query?.Filter ?? req.query?.filter ?? req.body?.Filter
      };
      const fetchResult = await fetchEdesisStudentsList(cfg, filters);
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
          edesis_ogrenci_id: s.edesis_ogrenci_id || null,
          parent_phone: s.parent_phone || null
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

      const mappedExams = (fetchResult.rows || []).map((row) => {
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
          return res.status(404).json({
            ok: false,
            error: 'hata_karnesi_pdf_missing',
            message: pdf.message,
            hint: pdf.hint
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
        denemeId: structure.denemeId || null,
        bookletPdfs: structure.bookletPdfs || [],
        examFamily: structure.examFamily || 'generic',
        bookletMode: structure.bookletMode || 'single',
        choiceCount: structure.choiceCount || 4,
        remainingSeconds: structure.remainingSeconds || 0,
        examTitle: structure.examTitle || '',
        examType: structure.examType || ''
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
      const files = (pdf.files || []).map((f) => ({
        url: f.url,
        kitapcikTuru: f.kitapcikTuru || '',
        name: f.name || 'Kitapçık PDF'
      }));
      if (download) {
        if (!pdf.ok || !pdf.buf || !pdf.looksPdf) {
          return res.status(404).json({
            error: 'booklet_pdf_missing',
            hint: 'Bu sınav için kitapçık PDF’si Edesis’te bulunamadı',
            files,
            denemeId: pdf.denemeId || null,
            attempts: Array.isArray(pdf.attempts) ? pdf.attempts.slice(0, 25) : []
          });
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="kitapcik-${(kitapcikTuru || 'A').replace(/[^A-Za-z0-9]/g, '')}.pdf"`
        );
        res.setHeader('Cache-Control', 'private, max-age=120');
        return res.status(200).send(pdf.buf);
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

      return res.status(200).json({
        ok: true,
        edesisStudentId,
        count: items.length,
        items,
        scope: meta.assignmentMode || 'assigned',
        assignmentMeta: meta,
        takeableCount: items.filter((x) => x.canTake && !x.hasStudentResult).length,
        hint: (() => {
          const takeable = items.filter((x) => x.canTake && !x.hasStudentResult).length;
          if (takeable > 0) return null;
          const abp = meta.abpAuth || {};
          if (!abp.configured) {
            return 'Size tanımlı açık deneme listesi için Edesis panel oturumu gerekir (Vercel: EDESIS_ABP_USER + EDESIS_ABP_PASSWORD). Katalog dökülmez.';
          }
          if (items.length) {
            return 'Girilmiş sonuçlarınız var; size tanımlı yeni açık deneme yok.';
          }
          return 'Size tanımlı açık Edesis denemesi yok. Koçunuzun Edesis’te bu öğrenci ID’sine sınav atadığından emin olun.';
        })()
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
        edesisStudentId,
        adminAssignment,
        assignmentMeta: loaded.meta,
        takeableCount: (loaded.items || []).filter((x) => x.canTake && !x.hasStudentResult).length,
        takeableSample: (loaded.items || [])
          .filter((x) => x.canTake && !x.hasStudentResult)
          .slice(0, 20)
          .map((x) => ({ examId: x.examId, examTitle: x.examTitle, examType: x.examType })),
        resultCount: (loaded.items || []).filter((x) => x.hasStudentResult).length
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
      if (!assignedExam) {
        return res.status(403).json({
          error: 'exam_not_assigned',
          hint: 'Bu deneme size tanımlanmamış'
        });
      }
      if (isStudent && !isStaff && assignedExam.hasStudentResult) {
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
        return res.status(status).json({
          ok: false,
          error: 'ingest_rejected',
          message: ingest.message,
          accepted: ingest.accepted,
          rejected: ingest.rejected,
          hint:
            ingest.httpStatus === 403
              ? 'API key exam_results:write kapsamına sahip olmalı (admin veya custom paket)'
              : ingest.rejected?.[0]?.reason || ingest.message
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

export { runSync };
