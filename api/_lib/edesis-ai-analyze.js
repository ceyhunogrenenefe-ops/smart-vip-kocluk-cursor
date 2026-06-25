import { requireAuthenticatedActor } from './auth.js';
import { hasInstitutionAccess } from './auth.js';
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import {
  getEdesisConfig,
  fetchEdesisExamDetailForStudent,
  enrichEdesisRowsWithSubjectDetails,
  generateEdesisExamReport,
  mapEdesisRowToExamDraft
} from './edesis-client.js';
import { buildWeeklyCoachContext } from './ai-weekly-context.js';
import {
  extractTextFromPdfUrl,
  buildPdfKarneContextBlock,
  mergePdfTopicsIntoExam
} from './edesis-karne-pdf-parse.js';
function canUseAiChat(actor) {
  const r = String(actor.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'coach';
}

async function actorCanAccessStudent(actor, studentId) {
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'admin') {
    const { data } = await supabaseAdmin.from('students').select('institution_id').eq('id', studentId).maybeSingle();
    return hasInstitutionAccess(actor, data?.institution_id || null);
  }
  if (actor.role === 'coach') {
    const { data: st } = await supabaseAdmin
      .from('students')
      .select('id, coach_id, institution_id')
      .eq('id', studentId)
      .maybeSingle();
    return Boolean(st && actor.coach_id && st.coach_id === actor.coach_id);
  }
  return false;
}

function examFromPayload(row) {
  if (!row) return null;
  const p = row.app_payload;
  if (p && typeof p === 'object' && p.studentId) return p;
  return null;
}

function countTopics(exam) {
  return (exam?.subjects || []).reduce((n, s) => n + (s.topics?.length ?? 0), 0);
}

function buildHataKarnesiText(exam) {
  const lines = [];
  for (const s of exam?.subjects || []) {
    const weakTopics = (s.topics || []).filter((t) => (t.wrong ?? 0) > 0 || (t.blank ?? 0) > 0);
    if (!weakTopics.length && s.wrong <= 0 && s.blank <= 0) continue;
    lines.push(
      `• ${s.name}: net ${s.net} (D${s.correct}/Y${s.wrong}/B${s.blank})${
        weakTopics.length
          ? `\n  Konu hataları: ${weakTopics
              .map((t) => `${t.name}(Y${t.wrong}${t.blank ? `/B${t.blank}` : ''})`)
              .join('; ')}`
          : ''
      }`
    );
  }
  return lines.length ? lines.join('\n') : 'Konu kırılımı yok — Edesis detay çekilmeli.';
}

function buildSubjectsTable(exam) {
  return (exam?.subjects || [])
    .map(
      (s) =>
        `${s.name}: net ${s.net}, D/Y/B ${s.correct}/${s.wrong}/${s.blank}` +
        ((s.topics?.length ?? 0) > 0
          ? `, ${s.topics.length} konu satırı`
          : '')
    )
    .join('\n');
}

async function loadExamForStudent({ studentId, examId, edesisExamId, edesisStudentId, institutionId }) {
  if (examId) {
    const { data } = await supabaseAdmin
      .from('exam_results')
      .select('id, student_id, app_payload, institution_id')
      .eq('id', examId)
      .maybeSingle();
    const exam = examFromPayload(data);
    if (exam && data.student_id === studentId) return { exam, rowId: data.id };
  }

  const { data: rows } = await supabaseAdmin
    .from('exam_results')
    .select('id, app_payload, date')
    .eq('student_id', studentId)
    .order('date', { ascending: false })
    .limit(50);

  const edesisRows = (rows || [])
    .map((r) => ({ id: r.id, exam: examFromPayload(r) }))
    .filter((x) => x.exam && (x.exam.source === 'edesis' || x.exam.edesisExamId));

  if (edesisExamId) {
    const hit = edesisRows.find(
      (x) => String(x.exam.edesisExamId || '') === String(edesisExamId)
    );
    if (hit) return { exam: hit.exam, rowId: hit.id };
  }

  if (edesisRows[0]) return { exam: edesisRows[0].exam, rowId: edesisRows[0].id };

  const cfg = getEdesisConfig();
  if (!cfg.apiKey) return { exam: null, rowId: null };

  let resolvedEdesisId = String(edesisStudentId || '').trim();
  if (!resolvedEdesisId) {
    const { data: st } = await supabaseAdmin
      .from('students')
      .select('edesis_ogrenci_id')
      .eq('id', studentId)
      .maybeSingle();
    resolvedEdesisId = String(st?.edesis_ogrenci_id || '').trim();
  }

  const targetExamId = String(edesisExamId || '').trim();
  if (!resolvedEdesisId || !targetExamId) return { exam: null, rowId: null };

  const detail = await fetchEdesisExamDetailForStudent(targetExamId, resolvedEdesisId, cfg);
  if (!detail.row) return { exam: null, rowId: null };

  const enriched = await enrichEdesisRowsWithSubjectDetails([detail.row], cfg, { maxStudents: 1 });
  const row = enriched.rows[0] || detail.row;
  const draft = mapEdesisRowToExamDraft(row, { studentId, institutionId });
  return { exam: draft, rowId: null, fetchedLive: true };
}

async function ensureTopicDetail(exam, studentId, institutionId) {
  if (countTopics(exam) > 0) return exam;
  const edesisExamId = String(exam.edesisExamId || '').trim();
  let edesisStudentId = String(exam.edesisStudentId || '').trim();
  if (!edesisExamId) return exam;

  const cfg = getEdesisConfig();
  if (!cfg.apiKey) return exam;

  if (!edesisStudentId) {
    const { data: st } = await supabaseAdmin
      .from('students')
      .select('edesis_ogrenci_id')
      .eq('id', studentId)
      .maybeSingle();
    edesisStudentId = String(st?.edesis_ogrenci_id || '').trim();
  }
  if (!edesisStudentId) return exam;

  const detail = await fetchEdesisExamDetailForStudent(edesisExamId, edesisStudentId, cfg);
  if (!detail.row) return exam;

  const enriched = await enrichEdesisRowsWithSubjectDetails([detail.row], cfg, { maxStudents: 1 });
  const row = enriched.rows[0] || detail.row;
  const draft = mapEdesisRowToExamDraft(row, { studentId, institutionId });
  draft.id = exam.id || draft.id;
  return draft;
}

async function fetchKarneUrl(exam, studentId) {
  const examId = String(exam.edesisExamId || '').trim();
  if (!examId) return null;

  let edesisStudentId = String(exam.edesisStudentId || '').trim();
  if (!edesisStudentId) {
    const { data: st } = await supabaseAdmin
      .from('students')
      .select('edesis_ogrenci_id')
      .eq('id', studentId)
      .maybeSingle();
    edesisStudentId = String(st?.edesis_ogrenci_id || '').trim();
  }
  if (!edesisStudentId) return null;

  const cfg = getEdesisConfig();
  if (!cfg.apiKey) return null;

  try {
    const report = await generateEdesisExamReport({
      examId,
      studentIds: [edesisStudentId],
      reportCodes: [102],
      forceNew: false
    });
    return report.reportUrl || null;
  } catch {
    return null;
  }
}

async function callEdesisCoachAi({
  studentName,
  classLevel,
  exams = [],
  reportUrls = [],
  pdfKarneBlocks = [],
  weeklyContext = null
}) {
  const examList = Array.isArray(exams) ? exams.filter(Boolean) : exams ? [exams] : [];
  const hasWeekly = Boolean(weeklyContext?.hasData && weeklyContext?.text);
  if (!examList.length && !hasWeekly) throw new Error('analysis_context_empty');

  const apiKey = (process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY || '').trim();
  const multi = examList.length > 1;

  if (!apiKey) {
    const offlineBlocks = examList
      .map(
        (exam, i) =>
          `**Deneme ${i + 1}: ${exam.examTitle || exam.examType}** (${exam.examDate}) — ${exam.totalNet} net\n${buildHataKarnesiText(exam)}${pdfKarneBlocks[i] ? `\n${pdfKarneBlocks[i].slice(0, 2000)}` : ''}`
      )
      .join('\n\n');
    return {
      content: [
        'OpenAI API anahtarı tanımlı değil — Vercel OPENAI_API_KEY ekleyin veya Ayarlar’da BYOK kullanın.',
        '',
        hasWeekly ? weeklyContext.text : '',
        examList.length ? '**Edesis özet (offline):**' : '',
        offlineBlocks
      ]
        .filter(Boolean)
        .join('\n\n'),
      meta: { reason: 'no_api_key', examCount: examList.length, hasWeekly }
    };
  }

  const examBlocks =
    examList.length > 0
      ? examList
          .map((exam, i) => {
            const pdfBlock = pdfKarneBlocks[i] || pdfKarneBlocks[0] || '';
            return [
              `=== Deneme ${i + 1}: ${exam.examTitle || exam.examType} (${exam.examDate}) — ${exam.totalNet} net ===`,
              'Ders özeti (Edesis API):',
              buildSubjectsTable(exam),
              'Konu bazlı hata karnesi (API verisi):',
              buildHataKarnesiText(exam),
              pdfBlock
                ? `Karne PDF metin analizi (hata karnesi):\n${pdfBlock}`
                : reportUrls[i]
                  ? `Karne PDF URL (metin çıkarılamadı): ${reportUrls[i]}`
                  : 'Karne PDF: alınamadı'
            ].join('\n');
          })
          .join('\n\n')
      : '';

  const userBlock = [
    `Öğrenci: ${studentName}${classLevel ? ` (${classLevel})` : ''}`,
    hasWeekly ? `\n${weeklyContext.text}\n` : '',
    examList.length ? `Analiz edilecek Edesis deneme sayısı: ${examList.length}` : 'Seçili Edesis denemesi yok.',
    examBlocks
  ]
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `Sen Türkiye'de deneyimli bir sınav koçusun. Öğrencinin haftalık çalışma kayıtlarını, koç hedeflerini ve Edesis deneme sınavı karne verilerini (API + PDF metin) birlikte yorumluyorsun.

Görevin:
1) ${hasWeekly ? 'Haftalık planda ne yaptı, koç hedeflerinin kaçını gerçekleştirdi — net özetle.' : 'Haftalık kayıt yoksa belirt.'}
2) ${examList.length ? 'Seçili deneme(ler)in performansını özetle; varsa denemeler arası trendi karşılaştır.' : 'Deneme verisi yoksa atla.'}
3) Konu bazlı hata karnesini (API ve PDF metninden) birlikte değerlendir — tekrarlayan zayıf konuları önceliklendir.
4) Haftalık çalışma ile deneme sonuçlarını ilişkilendir (hedef gerçekleşme vs deneme performansı).
5) Öğrenciye uygulanabilir 5-7 maddelik çalışma planı ver.
6) Veli/koç için kısa özet paragraf ekle.

Kurallar:
- Türkçe yaz.
- Veride olmayan konu uydurma.
- PDF metni varsa URL yerine metindeki konu hatalarını kullan.
- Markdown kullan (başlıklar, madde işaretleri).`;

  const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.35,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userBlock }
      ]
    })
  });

  const payload = await aiResponse.json().catch(() => ({}));
  if (!aiResponse.ok) {
    throw new Error(payload?.error?.message || `openai_${aiResponse.status}`);
  }

  const totalTopics = examList.reduce((n, e) => n + countTopics(e), 0);
  return {
    content: payload?.choices?.[0]?.message?.content?.trim() || 'Analiz üretilemedi.',
    meta: {
      model: 'gpt-4o-mini',
      topicCount: totalTopics,
      examCount: examList.length,
      hasWeekly,
      multi
    }
  };
}

function parseIdList(body, ...keys) {
  for (const key of keys) {
    const raw = body[key];
    if (Array.isArray(raw)) {
      return raw.map((x) => String(x || '').trim()).filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) {
      return raw
        .split(/[,;\s]+/)
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }
  return [];
}

async function loadExamsForStudent({
  studentId,
  examIds = [],
  edesisExamIds = [],
  edesisStudentId,
  institutionId
}) {
  const loaded = [];
  const seen = new Set();

  for (const examId of examIds) {
    const { exam, rowId } = await loadExamForStudent({
      studentId,
      examId,
      edesisStudentId,
      institutionId
    });
    const key = exam?.id || examId;
    if (exam && !seen.has(key)) {
      seen.add(key);
      loaded.push({ exam, rowId });
    }
  }

  for (const edesisExamId of edesisExamIds) {
    if (loaded.some((x) => String(x.exam.edesisExamId || '') === String(edesisExamId))) continue;
    const { exam, rowId } = await loadExamForStudent({
      studentId,
      edesisExamId,
      edesisStudentId,
      institutionId
    });
    const key = exam?.id || `edesis:${edesisExamId}`;
    if (exam && !seen.has(key)) {
      seen.add(key);
      loaded.push({ exam, rowId });
    }
  }

  return loaded.sort(
    (a, b) => new Date(b.exam.examDate || 0).getTime() - new Date(a.exam.examDate || 0).getTime()
  );
}

/** POST { op: 'analyze_edesis', student_id, exam_id?, exam_ids?, edesis_exam_id?, edesis_exam_ids? } */
export async function handleEdesisAiAnalyze(req, res, actor) {
  if (!canUseAiChat(actor)) return res.status(403).json({ error: 'forbidden' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const studentId = String(body.student_id || '').trim();
  const examId = String(body.exam_id || '').trim();
  const edesisExamId = String(body.edesis_exam_id || body.edesisExamId || '').trim();
  const edesisStudentId = String(body.edesis_student_id || body.edesisStudentId || '').trim();

  let examIds = parseIdList(body, 'exam_ids', 'examIds');
  let edesisExamIds = parseIdList(body, 'edesis_exam_ids', 'edesisExamIds');
  if (examId && !examIds.includes(examId)) examIds.push(examId);
  if (edesisExamId && !edesisExamIds.includes(edesisExamId)) edesisExamIds.push(edesisExamId);
  const includeWeekly = body.include_weekly !== false && body.includeWeekly !== false;

  if (!studentId) return res.status(400).json({ error: 'student_id_required' });

  const ok = await actorCanAccessStudent(actor, studentId);
  if (!ok) return res.status(403).json({ error: 'forbidden' });

  const { data: studentRow } = await supabaseAdmin
    .from('students')
    .select('id, name, class_level, institution_id, edesis_ogrenci_id')
    .eq('id', studentId)
    .maybeSingle();
  if (!studentRow) return res.status(404).json({ error: 'student_not_found' });

  const institutionId = studentRow.institution_id || actor.institution_id || null;

  let loaded = await loadExamsForStudent({
    studentId,
    examIds,
    edesisExamIds,
    edesisStudentId,
    institutionId
  });

  let weeklyContext = null;
  if (includeWeekly) {
    try {
      weeklyContext = await buildWeeklyCoachContext(studentId);
    } catch {
      weeklyContext = { hasData: false, text: 'Haftalık veri yüklenemedi.' };
    }
  }

  if (!loaded.length && !weeklyContext?.hasData) {
    return res.status(404).json({
      error: 'analysis_context_not_found',
      hint: 'Haftalık kayıt ekleyin veya Edesis denemesi seçin / senkron edin'
    });
  }

  const enrichedExams = [];
  for (const item of loaded) {
    let exam = await ensureTopicDetail(item.exam, studentId, institutionId);
    if (item.rowId && countTopics(exam) > 0) {
      await supabaseAdmin
        .from('exam_results')
        .update({ app_payload: exam, updated_at: new Date().toISOString() })
        .eq('id', item.rowId);
    }
    enrichedExams.push(exam);
  }

  const reportUrls = [];
  const pdfKarneBlocks = [];
  for (const exam of enrichedExams.slice(0, 3)) {
    const url = await fetchKarneUrl(exam, studentId);
    reportUrls.push(url);
    if (url) {
      const pdfRaw = await extractTextFromPdfUrl(url);
      const block = buildPdfKarneContextBlock(pdfRaw);
      pdfKarneBlocks.push(block);
      const idx = enrichedExams.indexOf(exam);
      if (idx >= 0 && countTopics(enrichedExams[idx]) === 0 && pdfRaw.text) {
        enrichedExams[idx] = mergePdfTopicsIntoExam(enrichedExams[idx], pdfRaw);
      }
    } else {
      pdfKarneBlocks.push('');
    }
  }

  try {
    const { content, meta } = await callEdesisCoachAi({
      studentName: studentRow.name,
      classLevel: studentRow.class_level,
      exams: enrichedExams,
      reportUrls,
      pdfKarneBlocks,
      weeklyContext
    });

    const primary = enrichedExams[0];
    return res.status(200).json({
      ok: true,
      content,
      reportUrl: reportUrls[0] || null,
      reportUrls: reportUrls.filter(Boolean),
      pdfParsed: pdfKarneBlocks.some(Boolean),
      weeklyIncluded: Boolean(weeklyContext?.hasData),
      examCount: enrichedExams.length,
      exams: enrichedExams.map((exam) => ({
        id: exam.id,
        examTitle: exam.examTitle || exam.examType,
        examDate: exam.examDate,
        totalNet: exam.totalNet,
        edesisExamId: exam.edesisExamId,
        subjectCount: exam.subjects?.length ?? 0,
        topicCount: countTopics(exam)
      })),
      exam: primary
        ? {
            id: primary.id,
            examTitle: primary.examTitle || primary.examType,
            examDate: primary.examDate,
            totalNet: primary.totalNet,
            edesisExamId: primary.edesisExamId,
            subjectCount: primary.subjects?.length ?? 0,
            topicCount: countTopics(primary)
          }
        : null,
      meta
    });
  } catch (e) {
    return res.status(502).json({ error: 'edesis_ai_analyze_failed', message: errorMessage(e) });
  }
}
