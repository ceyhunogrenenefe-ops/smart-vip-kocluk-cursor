/**
 * AI Soru Havuzu + Denemeler
 *
 *   ?op=extract                  POST  Dokumandan AI ile sorulari cikar (admin/ogretmen)
 *   ?op=questions                GET   Soru havuzu listesi (filtre: agent_id, status, topic, difficulty)
 *   ?op=question-update          POST  Soruyu duzenle / onayla / reddet
 *   ?op=question-delete          POST  Soruyu sil
 *
 *   ?op=papers                   GET   Denemeleri listele
 *   ?op=paper-create             POST  Yeni deneme olustur (filtre ile otomatik veya elle)
 *   ?op=paper-update             POST  Deneme guncelle / yayinla / arsivle
 *   ?op=paper-delete             POST  Deneme sil
 *   ?op=paper-detail             GET   Deneme + sorulari getir (admin view)
 *
 *   ?op=assign                   POST  Denemeyi ogrencilere ata
 *   ?op=assignments-mine         GET   Ogrenci: bana atanmis denemeler
 *   ?op=assignments-paper        GET   Admin: bir denemenin atamalari/sonuclari
 *
 *   ?op=attempt-start            POST  Ogrenci: denemeyi baslat / mevcut attempt'u dondur
 *   ?op=attempt-submit           POST  Ogrenci: cevaplari gonder, otomatik puanla
 *   ?op=attempt-result           GET   Ogrenci/Admin: sonuc detayi
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { extractQuestionsFromChunks, EXTRACT_MODEL } from '../api/_lib/ai-exam-extract.js';
import { costFor, isOpenAIConfigured } from '../api/_lib/ai-rag.js';
import { logUsage } from '../api/_lib/ai-usage.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b || '{}'); } catch { return {}; }
  }
  return {};
}

const normRole = (r) => String(r || '').toLowerCase().trim();
const isAdmin = (a) => ['admin', 'super_admin'].includes(normRole(a.role));
const isStaff = (a) => ['admin', 'super_admin', 'coach', 'teacher'].includes(normRole(a.role));

async function loadAgent(agentId) {
  const { data } = await supabaseAdmin.from('ai_agents').select('*').eq('id', agentId).maybeSingle();
  return data;
}

function canManageAgent(actor, agent) {
  if (isAdmin(actor)) return true;
  return Boolean(agent?.created_by && agent.created_by === actor.sub);
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const op = String(req.query?.op || '').trim();
    if (!op) return res.status(400).json({ error: 'op_required' });

    switch (op) {
      case 'extract': return await extract(req, res, actor);
      case 'questions': return await listQuestions(req, res, actor);
      case 'question-update': return await updateQuestion(req, res, actor);
      case 'question-delete': return await deleteQuestion(req, res, actor);

      case 'papers': return await listPapers(req, res, actor);
      case 'paper-create': return await createPaper(req, res, actor);
      case 'paper-update': return await updatePaper(req, res, actor);
      case 'paper-delete': return await deletePaper(req, res, actor);
      case 'paper-detail': return await paperDetail(req, res, actor);

      case 'assign': return await assignPaper(req, res, actor);
      case 'assignments-mine': return await assignmentsMine(req, res, actor);
      case 'assignments-paper': return await assignmentsForPaper(req, res, actor);

      case 'attempt-start': return await attemptStart(req, res, actor);
      case 'attempt-submit': return await attemptSubmit(req, res, actor);
      case 'attempt-result': return await attemptResult(req, res, actor);

      default: return res.status(400).json({ error: 'unknown_op', op });
    }
  } catch (e) {
    const msg = errorMessage(e);
    if (/Missing token|Invalid token|Token expired|Invalid signature/i.test(msg)) {
      return res.status(401).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
}

/* ─────────────────────────── SORU ÇIKARMA (AI) ─────────────────────────── */

async function extract(req, res, actor) {
  if (!isStaff(actor)) return res.status(403).json({ error: 'forbidden' });
  if (!isOpenAIConfigured()) return res.status(503).json({ error: 'openai_api_key_missing' });

  const body = parseBody(req);
  const agentId = String(body.agent_id || '').trim();
  const documentId = body.document_id ? String(body.document_id).trim() : null;
  if (!agentId) return res.status(400).json({ error: 'agent_id_required' });

  const agent = await loadAgent(agentId);
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  /** İlgili dokümandan tüm chunkları çek (veya ajanın tümünden) */
  const q = supabaseAdmin
    .from('ai_agent_chunks')
    .select('id, document_id, page_no, content')
    .eq('agent_id', agentId)
    .order('document_id')
    .order('chunk_index')
    .limit(2000);
  if (documentId) q.eq('document_id', documentId);
  const { data: chunks, error: cErr } = await q;
  if (cErr) throw cErr;
  if (!chunks?.length) return res.status(200).json({ ok: true, inserted: 0, reason: 'no_chunks' });

  /** Soruları bilinen ile çakışmasın diye mevcutları topla (basit dedupe için) */
  const { data: existing } = await supabaseAdmin
    .from('ai_exam_questions')
    .select('question_text')
    .eq('agent_id', agentId);
  const existingSet = new Set(
    (existing || []).map((r) => String(r.question_text || '').trim().slice(0, 80).toLowerCase())
  );

  /** ~12 chunk = ~12K karakter parçalar halinde çağır */
  const BATCH = 6;
  let inserted = 0;
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
  let parsedQuestions = 0;

  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    try {
      const { questions, usage, model } = await extractQuestionsFromChunks(slice);
      parsedQuestions += questions.length;
      totalUsage.prompt_tokens += usage.prompt_tokens || 0;
      totalUsage.completion_tokens += usage.completion_tokens || 0;

      const rows = [];
      for (const q of questions) {
        const conf = Number(q.confidence ?? 0);
        if (conf < 0.65) continue;
        const key = String(q.question_text || '').trim().slice(0, 80).toLowerCase();
        if (!key || existingSet.has(key)) continue;
        existingSet.add(key);
        rows.push({
          agent_id: agentId,
          document_id: slice[0]?.document_id || null,
          page_no: slice[0]?.page_no || null,
          question_text: String(q.question_text || '').trim(),
          options: Array.isArray(q.options) ? q.options : [],
          answer_key: q.answer_key ? String(q.answer_key).trim().toUpperCase().slice(0, 3) : null,
          solution: q.solution ? String(q.solution).slice(0, 4000) : null,
          topic: q.topic ? String(q.topic).slice(0, 80) : null,
          subtopic: q.subtopic ? String(q.subtopic).slice(0, 80) : null,
          difficulty: ['kolay', 'orta', 'zor'].includes(q.difficulty) ? q.difficulty : 'orta',
          question_type: 'multiple_choice',
          status: 'draft',
          ai_model: model,
          ai_confidence: conf,
          created_by: actor.sub
        });
      }

      if (rows.length) {
        const { error } = await supabaseAdmin.from('ai_exam_questions').insert(rows);
        if (!error) inserted += rows.length;
      }

      await logUsage({
        agentId,
        userId: actor.sub,
        operation: 'chat',
        model,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0
      });
    } catch (e) {
      console.warn('[ai-exams.extract] batch failed', e?.message);
    }
  }

  return res.status(200).json({
    ok: true,
    parsed: parsedQuestions,
    inserted,
    usage: totalUsage,
    cost_usd: costFor(EXTRACT_MODEL, totalUsage.prompt_tokens, totalUsage.completion_tokens)
  });
}

/* ─────────────────────────── SORU HAVUZU ─────────────────────────── */

async function listQuestions(req, res, actor) {
  const agentId = String(req.query?.agent_id || '').trim();
  if (!agentId) return res.status(400).json({ error: 'agent_id_required' });
  const agent = await loadAgent(agentId);
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  if (!isStaff(actor)) return res.status(403).json({ error: 'forbidden' });

  let q = supabaseAdmin
    .from('ai_exam_questions')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(500);
  const status = String(req.query?.status || '').trim();
  if (status) q = q.eq('status', status);
  const topic = String(req.query?.topic || '').trim();
  if (topic) q = q.eq('topic', topic);
  const difficulty = String(req.query?.difficulty || '').trim();
  if (difficulty) q = q.eq('difficulty', difficulty);

  const { data, error } = await q;
  if (error) throw error;
  return res.status(200).json({ data: data || [] });
}

async function updateQuestion(req, res, actor) {
  if (!isStaff(actor)) return res.status(403).json({ error: 'forbidden' });
  const body = parseBody(req);
  const id = String(body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id_required' });
  const patch = {};
  for (const k of ['question_text', 'options', 'answer_key', 'solution', 'topic', 'subtopic', 'difficulty', 'status']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (patch.status && ['approved', 'rejected'].includes(patch.status)) {
    patch.reviewed_by = actor.sub;
    patch.reviewed_at = new Date().toISOString();
  }
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('ai_exam_questions')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return res.status(200).json({ data });
}

async function deleteQuestion(req, res, actor) {
  if (!isStaff(actor)) return res.status(403).json({ error: 'forbidden' });
  const body = parseBody(req);
  const id = String(body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id_required' });
  const { error } = await supabaseAdmin.from('ai_exam_questions').delete().eq('id', id);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

/* ─────────────────────────── DENEMELER ─────────────────────────── */

async function listPapers(req, res, actor) {
  const agentId = String(req.query?.agent_id || '').trim();
  if (!agentId && !isStaff(actor)) return res.status(403).json({ error: 'forbidden' });

  let q = supabaseAdmin
    .from('ai_exam_papers')
    .select('id, agent_id, title, description, duration_minutes, question_count, total_score, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (agentId) q = q.eq('agent_id', agentId);
  if (!isStaff(actor)) q = q.eq('status', 'published');
  const { data, error } = await q;
  if (error) throw error;
  return res.status(200).json({ data: data || [] });
}

async function createPaper(req, res, actor) {
  if (!isStaff(actor)) return res.status(403).json({ error: 'forbidden' });
  const body = parseBody(req);
  const agentId = String(body.agent_id || '').trim();
  const title = String(body.title || '').trim();
  if (!agentId || !title) return res.status(400).json({ error: 'agent_id_and_title_required' });
  const agent = await loadAgent(agentId);
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  let questionIds = Array.isArray(body.question_ids) ? body.question_ids.map(String) : [];

  /** Otomatik secim: konu/zorluk/sayi filtreleri */
  if (!questionIds.length && body.auto) {
    const auto = body.auto || {};
    const count = Math.max(1, Math.min(200, Number(auto.count) || 20));
    const topics = Array.isArray(auto.topics) ? auto.topics.filter(Boolean) : [];
    const diffMix = auto.difficulty_mix || { kolay: 0, orta: 0, zor: 0 };
    const sumMix = (Number(diffMix.kolay) || 0) + (Number(diffMix.orta) || 0) + (Number(diffMix.zor) || 0);

    const pickFor = async (difficulty, n) => {
      if (n <= 0) return [];
      let q = supabaseAdmin
        .from('ai_exam_questions')
        .select('id, topic')
        .eq('agent_id', agentId)
        .eq('status', 'approved');
      if (difficulty) q = q.eq('difficulty', difficulty);
      if (topics.length) q = q.in('topic', topics);
      const { data } = await q.limit(500);
      const rows = data || [];
      /** Mischen */
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
      return rows.slice(0, n).map((r) => r.id);
    };

    if (sumMix > 0) {
      questionIds = [
        ...(await pickFor('kolay', Number(diffMix.kolay) || 0)),
        ...(await pickFor('orta', Number(diffMix.orta) || 0)),
        ...(await pickFor('zor', Number(diffMix.zor) || 0))
      ];
    } else {
      questionIds = await pickFor(null, count);
    }
  }

  const row = {
    agent_id: agentId,
    title,
    description: body.description ? String(body.description).slice(0, 2000) : null,
    duration_minutes: Math.max(5, Math.min(300, Number(body.duration_minutes) || 60)),
    question_count: questionIds.length,
    total_score: Number(body.total_score) > 0 ? Number(body.total_score) : 100,
    question_ids: questionIds,
    status: body.status === 'published' ? 'published' : 'draft',
    created_by: actor.sub,
    institution_id: actor.institution_id || null
  };
  const { data, error } = await supabaseAdmin
    .from('ai_exam_papers')
    .insert(row)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return res.status(201).json({ data });
}

async function updatePaper(req, res, actor) {
  if (!isStaff(actor)) return res.status(403).json({ error: 'forbidden' });
  const body = parseBody(req);
  const id = String(body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id_required' });
  const { data: paper } = await supabaseAdmin.from('ai_exam_papers').select('*').eq('id', id).maybeSingle();
  if (!paper) return res.status(404).json({ error: 'paper_not_found' });
  const agent = await loadAgent(paper.agent_id);
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  const patch = {};
  for (const k of ['title', 'description', 'duration_minutes', 'total_score', 'question_ids', 'status']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (patch.question_ids) patch.question_count = patch.question_ids.length;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('ai_exam_papers')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return res.status(200).json({ data });
}

async function deletePaper(req, res, actor) {
  if (!isStaff(actor)) return res.status(403).json({ error: 'forbidden' });
  const body = parseBody(req);
  const id = String(body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id_required' });
  const { error } = await supabaseAdmin.from('ai_exam_papers').delete().eq('id', id);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

async function paperDetail(req, res, actor) {
  const id = String(req.query?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id_required' });
  const { data: paper } = await supabaseAdmin.from('ai_exam_papers').select('*').eq('id', id).maybeSingle();
  if (!paper) return res.status(404).json({ error: 'paper_not_found' });

  const ids = Array.isArray(paper.question_ids) ? paper.question_ids : [];
  const { data: questions } = await supabaseAdmin
    .from('ai_exam_questions')
    .select('*')
    .in('id', ids.length ? ids : ['__none__']);

  /** question_ids sırasını koru */
  const map = new Map((questions || []).map((q) => [q.id, q]));
  const ordered = ids.map((qid) => map.get(qid)).filter(Boolean);

  /** Öğrenciye gönderilirken cevap anahtarı / çözüm GİZLENİR */
  if (!isStaff(actor)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return res.status(200).json({ data: { ...paper, questions: ordered } });
}

/* ─────────────────────────── ATAMA ─────────────────────────── */

async function assignPaper(req, res, actor) {
  if (!isStaff(actor)) return res.status(403).json({ error: 'forbidden' });
  const body = parseBody(req);
  const paperId = String(body.paper_id || '').trim();
  const studentIds = Array.isArray(body.student_user_ids) ? body.student_user_ids.map(String) : [];
  if (!paperId || !studentIds.length) {
    return res.status(400).json({ error: 'paper_and_students_required' });
  }
  const { data: paper } = await supabaseAdmin.from('ai_exam_papers').select('*').eq('id', paperId).maybeSingle();
  if (!paper) return res.status(404).json({ error: 'paper_not_found' });
  const agent = await loadAgent(paper.agent_id);
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  /** Yayinlanmamissa otomatik yayinla */
  if (paper.status !== 'published') {
    await supabaseAdmin
      .from('ai_exam_papers')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', paper.id);
  }

  const rows = studentIds.map((sid) => ({
    paper_id: paperId,
    agent_id: paper.agent_id,
    student_user_id: sid,
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    status: 'assigned',
    assigned_by: actor.sub
  }));
  const { error } = await supabaseAdmin
    .from('ai_exam_assignments')
    .upsert(rows, { onConflict: 'paper_id,student_user_id', ignoreDuplicates: false });
  if (error) throw error;
  return res.status(200).json({ ok: true, assigned: rows.length });
}

async function assignmentsMine(_req, res, actor) {
  const { data, error } = await supabaseAdmin
    .from('ai_exam_assignments')
    .select(`
      id, paper_id, agent_id, status, starts_at, ends_at, created_at,
      paper:ai_exam_papers ( id, title, description, duration_minutes, question_count, total_score ),
      agent:ai_agents ( id, name, subject )
    `)
    .eq('student_user_id', actor.sub)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;

  /** Sonuçlar */
  const ids = (data || []).map((r) => r.id);
  const { data: attempts } = await supabaseAdmin
    .from('ai_exam_attempts')
    .select('assignment_id, status, score, submitted_at')
    .in('assignment_id', ids.length ? ids : ['__none__']);
  const attemptMap = new Map((attempts || []).map((a) => [a.assignment_id, a]));

  const enriched = (data || []).map((r) => ({ ...r, attempt: attemptMap.get(r.id) || null }));
  return res.status(200).json({ data: enriched });
}

async function assignmentsForPaper(req, res, actor) {
  if (!isStaff(actor)) return res.status(403).json({ error: 'forbidden' });
  const paperId = String(req.query?.paper_id || '').trim();
  if (!paperId) return res.status(400).json({ error: 'paper_id_required' });
  const { data, error } = await supabaseAdmin
    .from('ai_exam_assignments')
    .select(`
      id, student_user_id, status, starts_at, ends_at, created_at,
      student:users!ai_exam_assignments_student_user_id_fkey ( id, name, email )
    `)
    .eq('paper_id', paperId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ids = (data || []).map((r) => r.id);
  const { data: attempts } = await supabaseAdmin
    .from('ai_exam_attempts')
    .select('assignment_id, status, score, correct_count, wrong_count, empty_count, duration_seconds, submitted_at')
    .in('assignment_id', ids.length ? ids : ['__none__']);
  const map = new Map((attempts || []).map((a) => [a.assignment_id, a]));
  const enriched = (data || []).map((r) => ({ ...r, attempt: map.get(r.id) || null }));
  return res.status(200).json({ data: enriched });
}

/* ─────────────────────────── ÇÖZME ─────────────────────────── */

async function attemptStart(req, res, actor) {
  const body = parseBody(req);
  const assignmentId = String(body.assignment_id || '').trim();
  if (!assignmentId) return res.status(400).json({ error: 'assignment_id_required' });

  const { data: assignment } = await supabaseAdmin
    .from('ai_exam_assignments')
    .select('*')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment) return res.status(404).json({ error: 'assignment_not_found' });
  if (assignment.student_user_id !== actor.sub) return res.status(403).json({ error: 'forbidden' });

  const now = Date.now();
  if (assignment.starts_at && new Date(assignment.starts_at).getTime() > now) {
    return res.status(403).json({ error: 'not_yet_open' });
  }
  if (assignment.ends_at && new Date(assignment.ends_at).getTime() < now) {
    return res.status(403).json({ error: 'expired' });
  }

  /** Mevcut attempt varsa devam ettir */
  const { data: existing } = await supabaseAdmin
    .from('ai_exam_attempts')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_user_id', actor.sub)
    .maybeSingle();

  let attempt = existing;
  if (!attempt) {
    const { data: ins, error } = await supabaseAdmin
      .from('ai_exam_attempts')
      .insert({
        assignment_id: assignmentId,
        paper_id: assignment.paper_id,
        student_user_id: actor.sub,
        agent_id: assignment.agent_id,
        answers: {},
        status: 'in_progress'
      })
      .select('*')
      .maybeSingle();
    if (error) throw error;
    attempt = ins;
    await supabaseAdmin
      .from('ai_exam_assignments')
      .update({ status: 'in_progress' })
      .eq('id', assignmentId);
  } else if (attempt.status === 'submitted' || attempt.status === 'graded') {
    return res.status(409).json({ error: 'already_submitted', attempt });
  }

  /** Deneme + soruları (cevap anahtarı VE çözüm gizli olarak) gönder */
  const { data: paper } = await supabaseAdmin
    .from('ai_exam_papers')
    .select('*')
    .eq('id', assignment.paper_id)
    .maybeSingle();
  if (!paper) return res.status(404).json({ error: 'paper_not_found' });

  const ids = Array.isArray(paper.question_ids) ? paper.question_ids : [];
  const { data: questions } = await supabaseAdmin
    .from('ai_exam_questions')
    .select('id, question_text, options, topic, difficulty')
    .in('id', ids.length ? ids : ['__none__']);
  const map = new Map((questions || []).map((q) => [q.id, q]));
  const ordered = ids.map((qid) => map.get(qid)).filter(Boolean);

  return res.status(200).json({
    attempt,
    paper: {
      id: paper.id,
      title: paper.title,
      description: paper.description,
      duration_minutes: paper.duration_minutes,
      total_score: paper.total_score,
      question_count: paper.question_count
    },
    questions: ordered
  });
}

async function attemptSubmit(req, res, actor) {
  const body = parseBody(req);
  const assignmentId = String(body.assignment_id || '').trim();
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
  if (!assignmentId) return res.status(400).json({ error: 'assignment_id_required' });

  const { data: attempt } = await supabaseAdmin
    .from('ai_exam_attempts')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_user_id', actor.sub)
    .maybeSingle();
  if (!attempt) return res.status(404).json({ error: 'attempt_not_found' });
  if (attempt.status !== 'in_progress') return res.status(409).json({ error: 'already_submitted' });

  const { data: paper } = await supabaseAdmin
    .from('ai_exam_papers')
    .select('*')
    .eq('id', attempt.paper_id)
    .maybeSingle();
  if (!paper) return res.status(404).json({ error: 'paper_not_found' });

  const ids = Array.isArray(paper.question_ids) ? paper.question_ids : [];
  const { data: questions } = await supabaseAdmin
    .from('ai_exam_questions')
    .select('id, answer_key, topic, difficulty')
    .in('id', ids.length ? ids : ['__none__']);

  /** Puanlama */
  let correct = 0;
  let wrong = 0;
  let empty = 0;
  const topicStats = {};
  for (const q of questions || []) {
    const ans = String(answers[q.id] || '').trim().toUpperCase();
    const key = String(q.answer_key || '').trim().toUpperCase();
    const t = q.topic || 'Diğer';
    topicStats[t] = topicStats[t] || { correct: 0, wrong: 0, empty: 0, total: 0 };
    topicStats[t].total += 1;
    if (!ans) {
      empty += 1;
      topicStats[t].empty += 1;
    } else if (!key) {
      /** Cevap anahtarı yoksa puanlama yapma, boş say */
      empty += 1;
      topicStats[t].empty += 1;
    } else if (ans === key) {
      correct += 1;
      topicStats[t].correct += 1;
    } else {
      wrong += 1;
      topicStats[t].wrong += 1;
    }
  }

  const total = (questions || []).length || 1;
  const totalScore = Number(paper.total_score) || 100;
  const score = Number(((correct / total) * totalScore).toFixed(2));
  const durationSec = Math.max(1, Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000));

  await supabaseAdmin
    .from('ai_exam_attempts')
    .update({
      answers,
      submitted_at: new Date().toISOString(),
      score,
      correct_count: correct,
      wrong_count: wrong,
      empty_count: empty,
      duration_seconds: durationSec,
      topic_breakdown: topicStats,
      status: 'graded'
    })
    .eq('id', attempt.id);

  await supabaseAdmin
    .from('ai_exam_assignments')
    .update({ status: 'completed' })
    .eq('id', assignmentId);

  return res.status(200).json({
    ok: true,
    score,
    correct,
    wrong,
    empty,
    total,
    topic_breakdown: topicStats,
    duration_seconds: durationSec
  });
}

async function attemptResult(req, res, actor) {
  const assignmentId = String(req.query?.assignment_id || '').trim();
  if (!assignmentId) return res.status(400).json({ error: 'assignment_id_required' });

  const { data: attempt } = await supabaseAdmin
    .from('ai_exam_attempts')
    .select('*')
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  if (!attempt) return res.status(404).json({ error: 'attempt_not_found' });

  /** Öğrenci kendi sonucunu görür; staff hepsini */
  if (attempt.student_user_id !== actor.sub && !isStaff(actor)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { data: paper } = await supabaseAdmin
    .from('ai_exam_papers')
    .select('id, title, total_score, question_ids, agent_id')
    .eq('id', attempt.paper_id)
    .maybeSingle();
  const ids = Array.isArray(paper?.question_ids) ? paper.question_ids : [];
  const { data: questions } = await supabaseAdmin
    .from('ai_exam_questions')
    .select('id, question_text, options, answer_key, solution, topic, difficulty, page_no, document_id')
    .in('id', ids.length ? ids : ['__none__']);
  const map = new Map((questions || []).map((q) => [q.id, q]));
  const ordered = ids.map((qid) => map.get(qid)).filter(Boolean);

  return res.status(200).json({
    attempt,
    paper,
    questions: ordered
  });
}
