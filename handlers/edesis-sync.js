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
  mapEdesisRowToExamDraft,
  flattenEdesisRows
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
    apiHint
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
    probeAttempts: fetchResult.probeAttempts ?? undefined,
    studentsInDb: students.length,
    fetched: rows.length,
    rowsWithStudentFields: rowsWithStudentFields ?? 0,
    sampleRowKeys: sampleRowKeys || [],
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
      return res.status(200).json({
        configured: Boolean(cfg.apiKey),
        institutionCode: cfg.institutionCode,
        baseUrl: cfg.baseUrl,
        examsPath: cfg.examsPath || null,
        authMode: cfg.authMode,
        studentsInDb: students.length,
        studentsWithEdesisId: withEdesisId,
        studentsWithEmail: withEmail,
        matchingGuide: EDESIS_MATCHING_GUIDE.tr,
        hint: cfg.apiKey
          ? 'probe veya sync çağırın'
          : 'Vercel: EDEISIS_API_KEY ekleyin'
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

    return res.status(400).json({
      error: 'unknown_op',
      allowed: ['status', 'probe', 'discover', 'match-check', 'sync', 'import']
    });
  } catch (e) {
    const msg = errorMessage(e);
    if (msg === 'Missing token' || msg === 'Token expired' || msg === 'Invalid token') {
      return res.status(401).json({ error: msg });
    }
    return res.status(500).json({ ok: false, error: msg });
  }
}
