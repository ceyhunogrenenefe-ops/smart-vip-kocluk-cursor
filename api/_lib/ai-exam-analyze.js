import { requireAuth, hasInstitutionAccess } from './auth.js';
import { supabaseAdmin } from './supabase-admin.js';
import {
  buildSubjectOutputs,
  normalizeExamType,
  estimateTytApproxScore,
  estimateTytPercentileBand,
  estimateLgsScore500,
  estimateLgsPercentileBand,
  buildYearComparisonText,
  bucketStrengthsWeaknesses,
  aggregateYosBands,
  buildErrorPsychology,
  profileFromSubjects,
  projectScoreFromTrend
} from './exam-analysis-engine.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function summarizeGeneralSituation(totalNet, percentile, examType) {
  if (examType === 'LGS') {
    if (totalNet >= 70) return 'Genel olarak çok güçlü bir LGS denemesi görünümü.';
    if (totalNet >= 55) return 'Üst orta ile güçlü arası performans.';
    return 'Temel gereksinimler ve zayıf ders seçimi iyileştirilmeli.';
  }
  if (examType === 'YOS') {
    if (totalNet >= 55) return 'YÖS sayısal blokta üst yüzdebirlik yaklaşıyor görünümü.';
    if (totalNet >= 38) return 'Orta-üst YÖS performans bandı.';
    return 'YÖS’te dengeyi artırmak için matematik-geometry-IQ blokları paralel yükseltilmeli.';
  }
  if (totalNet >= 85) return 'Üst sıralamalara yaklaşabilecek güçte TYT görünümü.';
  if (totalNet >= 65) return 'TYT için sağlıklı ve geliştirilebilir bir temel oluşmuş.';
  if (totalNet >= 45) return 'Temel bloklar oluşmuş; sıralama için net artışı kritik.';
  return 'Net artışına odaklanılmalı; zayıf derslerde yoğunlaşma gerekir.';
}

function buildRecommendations({ examType, weaknesses, strengths, trajectory, psychLines }) {
  const rec = [];
  weaknesses.slice(0, 2).forEach((w) => rec.push(`${w} için haftalık aralıklı tekrar + yanlış defteri.`));
  if (strengths.length) rec.push(`Güçlü alanları koruyun: ${strengths.slice(0, 2).join(', ')}.`);
  if (examType === 'TYT') rec.push('TYT’de istikrar için haftada en az 2 tam deneme + hata analizi.');
  if (examType === 'LGS') rec.push('LGS’de branş bazlı mini testlerle hız ve doğruluk çalışın.');
  if (examType === 'YOS') rec.push('YÖS’te IQ bloğunda süre disiplini; matematikte işlem hızı tekrarları.');
  if (trajectory) {
    rec.push(
      `Trend: ${trajectory.headline} ${trajectory.extrapolated_net_2more != null ? `~${trajectory.extrapolated_net_2more} net hedefi (model).` : ''}`
    );
  }
  psychLines.forEach((p) => rec.push(`${p.title}: ${p.text}`));
  return rec.join('\n');
}

async function fetchStudentInstitution(studentId) {
  const { data } = await supabaseAdmin.from('students').select('id,institution_id').eq('id', studentId).maybeSingle();
  return data?.institution_id || null;
}

async function maybeOpenAiNarrative(contextBlock) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
  if (!apiKey) return null;
  try {
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.35,
        messages: [
          {
            role: 'system',
            content:
              'Sen Türkiye sınavları konusunda deneyimli bir eğitim koçusun. Aşağıdaki SAYISAL sonuçlar zaten hesaplanmış; tekrar hesaplama. Kısa, uygulanabilir Türkçe özet (max 160 kelime): genel başarı, güçlü/zayıf dersler, dikkat/işlem/zaman yorumunu sayıların tutarlılığı içinde bağla.'
          },
          { role: 'user', content: contextBlock }
        ]
      })
    });
    const payload = await aiResponse.json();
    if (!aiResponse.ok) return null;
    return payload?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

async function actorCanAccessStudent(actor, studentId) {
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'admin') {
    const inst = await fetchStudentInstitution(studentId);
    return hasInstitutionAccess(actor, inst);
  }
  if (actor.role === 'student') return actor.student_id === studentId;
  if (actor.role === 'coach') {
    const { data: st } = await supabaseAdmin
      .from('students')
      .select('id,coach_id,institution_id')
      .eq('id', studentId)
      .maybeSingle();
    return Boolean(st && actor.coach_id && st.coach_id === actor.coach_id);
  }
  return false;
}

/** GET: ?student_id=  |  POST: student_id + subjects (op: analyze_exam) */
export async function handleAiExamAnalyze(req, res) {
  const actor = requireAuth(req);
  try {
    if (req.method === 'GET') {
      const studentId = String(req.query?.student_id || '').trim();
      if (!studentId) return res.status(400).json({ error: 'student_id required' });
      const ok = await actorCanAccessStudent(actor, studentId);
      if (!ok) return res.status(403).json({ error: 'forbidden' });

      const { data, error } = await supabaseAdmin
        .from('ai_exam_analysis')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) return res.status(200).json({ data: [], warn: error.message });
      return res.status(200).json({ data: data || [] });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body || {};
    const studentId = String(body.student_id || '').trim();
    const examId = body.exam_id != null ? String(body.exam_id) : null;
    const subjects = Array.isArray(body.subjects) ? body.subjects : [];
    if (!studentId || subjects.length === 0) {
      return res.status(400).json({ error: 'student_id and subjects[] required' });
    }

    const ok = await actorCanAccessStudent(actor, studentId);
    if (!ok) return res.status(403).json({ error: 'forbidden' });

    const institutionId = body.institution_id || (await fetchStudentInstitution(studentId));
    const examTypeNormalized = normalizeExamType(body.exam_type || body.examType);

    const { subjects: enriched, totalNet } = buildSubjectOutputs(subjects);

    let estimatedScore;
    let percentile;
    if (examTypeNormalized === 'LGS') {
      estimatedScore = estimateLgsScore500(totalNet);
      percentile = estimateLgsPercentileBand(totalNet);
    } else if (examTypeNormalized === 'YOS') {
      estimatedScore = estimateTytApproxScore(totalNet);
      percentile = estimateTytPercentileBand((totalNet / 72) * 90);
      percentile = Math.min(99.9, percentile * 1.05);
    } else {
      estimatedScore = estimateTytApproxScore(totalNet);
      percentile = estimateTytPercentileBand(totalNet);
    }

    const yosBuckets = examTypeNormalized === 'YOS' ? aggregateYosBands(enriched) : null;

    const { strengths, weaknesses } = bucketStrengthsWeaknesses(enriched, examTypeNormalized);

    const profile = profileFromSubjects(enriched);
    const psychLines = buildErrorPsychology(profile).map((x) => ({ title: x.title, text: x.text }));

    let trajectory = null;
    const historyPayload = Array.isArray(body.exam_history) ? body.exam_history : [];
    if (historyPayload.length >= 2) {
      trajectory = projectScoreFromTrend(
        [...historyPayload].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
        examTypeNormalized
      );
    }

    const years = examTypeNormalized === 'TYT' ? buildYearComparisonText('TYT', totalNet, percentile) : null;

    const computedPayload = {
      subjects: enriched,
      total_net: totalNet,
      exam_type_model: examTypeNormalized,
      estimated_score_model: estimatedScore,
      percentile_model: percentile,
      yos_buckets: yosBuckets,
      psychology: psychLines,
      general_situation: summarizeGeneralSituation(totalNet, percentile, examTypeNormalized),
      trajectory
    };

    const recommendations = buildRecommendations({
      examType: examTypeNormalized,
      weaknesses,
      strengths,
      trajectory,
      psychLines
    });

    const contextForAi = JSON.stringify(computedPayload, null, 0);
    const aiNarrative = await maybeOpenAiNarrative(contextForAi);

    const row = {
      student_id: studentId,
      exam_id: examId,
      institution_id: institutionId,
      exam_type: examTypeNormalized,
      total_net: round2(totalNet),
      estimated_score: round2(estimatedScore),
      percentile_estimate: round2(percentile),
      year_2025_comparison: years?.year_2025 || null,
      year_2024_comparison: years?.year_2024 || null,
      year_2023_comparison: years?.year_2023 || null,
      strengths: JSON.stringify(strengths),
      weaknesses: JSON.stringify(weaknesses),
      recommendations,
      narrative_summary: aiNarrative,
      computed_payload: computedPayload
    };

    let saved = null;
    let saveError = null;
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('ai_exam_analysis')
      .insert(row)
      .select('*')
      .maybeSingle();
    if (!insertErr) saved = inserted;
    else saveError = insertErr.message;

    return res.status(200).json({
      ok: true,
      analysis: {
        ...computedPayload,
        strengths,
        weaknesses,
        recommendations,
        year_2025_comparison: row.year_2025_comparison,
        year_2024_comparison: row.year_2024_comparison,
        year_2023_comparison: row.year_2023_comparison,
        narrative_summary: aiNarrative
      },
      savedRow: saved,
      saveError
    });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'server error' });
  }
}
