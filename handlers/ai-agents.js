/**
 * AI Ders Ajanları — tek handler, op parametresiyle:
 *  GET    ?op=list                      → tüm ajanları listele
 *  POST   ?op=create                    → yeni ajan oluştur (admin/teacher/coach)
 *  POST   ?op=update                    → ajan güncelle
 *  POST   ?op=delete                    → ajan sil (kaskat döküman+chunk siler)
 *
 *  GET    ?op=documents&agent_id=...    → dökümanları listele
 *  POST   ?op=document-init             → yeni döküman kaydı aç (status=processing)
 *  POST   ?op=document-chunks           → batch chunk gönder; sunucu embed eder
 *  POST   ?op=document-finalize         → dökümanı ready işaretle
 *  POST   ?op=document-delete           → döküman + chunks sil
 *  POST   ?op=page-image                → bir sayfanın PNG görüntüsünü Storage'a yükle
 *  POST   ?op=pages-backfill-questions  → mevcut sorulara ai_agent_pages.image_url'i bağla
 *
 *  GET    ?op=conversations             → kullanıcının kendi sohbetleri
 *  GET    ?op=messages&conversation_id  → bir sohbetin mesajları
 *  POST   ?op=chat                      → mesaj at; RAG + LLM çağır; cevap dön
 *
 *  GET    ?op=usage                     → bu kullanıcının bu ay kullanımı + limit
 *  GET    ?op=usage-summary             → admin: tüm ay özeti
 *  GET    ?op=settings                  → ayar oku (admin)
 *  POST   ?op=settings                  → ayar güncelle (admin)
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  chatCompletion,
  chunkPages,
  costFor,
  embedTexts,
  isOpenAIConfigured,
  searchSimilarChunks
} from '../api/_lib/ai-rag.js';
import {
  getMonthlyChatCount,
  getMonthlyUsd,
  getSettings,
  getUsageSummary,
  logUsage
} from '../api/_lib/ai-usage.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b || '{}'); } catch { return {}; }
  }
  return {};
}

function normalizeRole(r) {
  return String(r || '').toLowerCase().trim();
}

function isAdmin(actor) {
  const r = normalizeRole(actor.role);
  return r === 'admin' || r === 'super_admin';
}

function canCreateAgent(actor) {
  const r = normalizeRole(actor.role);
  return r === 'admin' || r === 'super_admin' || r === 'coach' || r === 'teacher';
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

    if (op === 'list') return await listAgents(req, res, actor);
    if (op === 'create') return await createAgent(req, res, actor);
    if (op === 'update') return await updateAgent(req, res, actor);
    if (op === 'delete') return await deleteAgent(req, res, actor);

    if (op === 'documents') return await listDocuments(req, res, actor);
    if (op === 'document-init') return await documentInit(req, res, actor);
    if (op === 'document-chunks') return await documentChunks(req, res, actor);
    if (op === 'document-finalize') return await documentFinalize(req, res, actor);
    if (op === 'document-delete') return await documentDelete(req, res, actor);
    if (op === 'page-image') return await pageImageUpload(req, res, actor);
    if (op === 'pages-backfill-questions') return await backfillQuestionImages(req, res, actor);

    if (op === 'conversations') return await listConversations(req, res, actor);
    if (op === 'messages') return await listMessages(req, res, actor);
    if (op === 'chat') return await chat(req, res, actor);

    if (op === 'usage') return await usageSelf(req, res, actor);
    if (op === 'usage-summary') return await usageSummary(req, res, actor);
    if (op === 'settings') {
      if (req.method === 'POST') return await updateSettings(req, res, actor);
      return await readSettings(req, res, actor);
    }

    return res.status(400).json({ error: 'unknown_op', op });
  } catch (e) {
    const msg = errorMessage(e);
    if (/Missing token|Invalid token|Token expired|Invalid signature/i.test(msg)) {
      return res.status(401).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
}

/* ─────────────────────────── AJAN CRUD ─────────────────────────── */

async function listAgents(_req, res, actor) {
  const q = supabaseAdmin
    .from('ai_agents')
    .select('id, name, subject, grade_level, description, model, is_active, created_by, created_at')
    .order('created_at', { ascending: false });
  /** Admin: hepsi; öğretmen/koç: aktif olanlar (kendininki dahil); öğrenci: aktif */
  if (!isAdmin(actor)) q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return res.status(200).json({ data: data || [] });
}

async function createAgent(req, res, actor) {
  if (!canCreateAgent(actor)) return res.status(403).json({ error: 'forbidden' });
  const body = parseBody(req);
  const name = String(body.name || '').trim();
  const subject = String(body.subject || '').trim();
  if (!name || !subject) return res.status(400).json({ error: 'name_and_subject_required' });

  const row = {
    name,
    subject,
    grade_level: body.grade_level ? String(body.grade_level).trim() : null,
    description: body.description ? String(body.description).trim() : null,
    system_prompt:
      body.system_prompt && String(body.system_prompt).trim().length > 10
        ? String(body.system_prompt).trim()
        : `Sen bir ${subject} koçusun. Türkçe ve adım adım açıkla. Önce verilen kaynak alıntılarını kullan, kaynakta yoksa genel bilgiyle yanıtla ve bunu belirt. Çözümün sonunda kısa bir özet ve "Benzer soru ister misin?" sorusu sun.`,
    model: body.model || 'gpt-4o-mini',
    is_active: true,
    created_by: actor.sub,
    institution_id: actor.institution_id || null
  };
  const { data, error } = await supabaseAdmin
    .from('ai_agents')
    .insert(row)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return res.status(201).json({ data });
}

async function updateAgent(req, res, actor) {
  const body = parseBody(req);
  const id = String(body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id_required' });
  const { data: agent } = await supabaseAdmin.from('ai_agents').select('*').eq('id', id).maybeSingle();
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  const patch = {};
  for (const k of ['name', 'subject', 'grade_level', 'description', 'system_prompt', 'model']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('ai_agents')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return res.status(200).json({ data });
}

async function deleteAgent(req, res, actor) {
  const body = parseBody(req);
  const id = String(body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id_required' });
  const { data: agent } = await supabaseAdmin.from('ai_agents').select('*').eq('id', id).maybeSingle();
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });
  const { error } = await supabaseAdmin.from('ai_agents').delete().eq('id', id);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

/* ─────────────────────────── DÖKÜMAN ─────────────────────────── */

async function listDocuments(req, res, _actor) {
  const agentId = String(req.query?.agent_id || '').trim();
  if (!agentId) return res.status(400).json({ error: 'agent_id_required' });
  const { data, error } = await supabaseAdmin
    .from('ai_agent_documents')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return res.status(200).json({ data: data || [] });
}

async function documentInit(req, res, actor) {
  const body = parseBody(req);
  const agentId = String(body.agent_id || '').trim();
  const title = String(body.title || '').trim();
  if (!agentId || !title) return res.status(400).json({ error: 'agent_id_and_title_required' });

  const { data: agent } = await supabaseAdmin.from('ai_agents').select('*').eq('id', agentId).maybeSingle();
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  const row = {
    agent_id: agentId,
    title,
    source_type: 'pdf',
    file_hash: body.file_hash || null,
    page_count: Number.isFinite(Number(body.page_count)) ? Number(body.page_count) : null,
    status: 'processing',
    uploaded_by: actor.sub
  };
  const { data, error } = await supabaseAdmin
    .from('ai_agent_documents')
    .insert(row)
    .select('*')
    .maybeSingle();
  if (error) {
    if (String(error.code) === '23505') {
      return res.status(409).json({ error: 'duplicate_document' });
    }
    throw error;
  }
  return res.status(201).json({ data });
}

async function documentChunks(req, res, actor) {
  const body = parseBody(req);
  const documentId = String(body.document_id || '').trim();
  const pages = Array.isArray(body.pages) ? body.pages : null;
  if (!documentId || !pages || !pages.length) {
    return res.status(400).json({ error: 'document_id_and_pages_required' });
  }
  if (!isOpenAIConfigured()) return res.status(503).json({ error: 'openai_api_key_missing' });

  const { data: doc } = await supabaseAdmin
    .from('ai_agent_documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc) return res.status(404).json({ error: 'document_not_found' });

  const { data: agent } = await supabaseAdmin
    .from('ai_agents')
    .select('*')
    .eq('id', doc.agent_id)
    .maybeSingle();
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  const chunks = chunkPages(pages);
  if (!chunks.length) return res.status(200).json({ ok: true, inserted: 0 });

  const texts = chunks.map((c) => c.content);
  const { vectors, usage } = await embedTexts(texts);

  const rows = chunks.map((c, i) => ({
    agent_id: doc.agent_id,
    document_id: doc.id,
    page_no: c.page ?? null,
    chunk_index: (doc.total_chunks || 0) + i,
    content: c.content,
    token_estimate: Math.ceil(c.content.length / 4),
    embedding: vectors[i]
  }));

  /** Supabase INSERT'i 500-1000 satır parçalara böl */
  const SLICE = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += SLICE) {
    const batch = rows.slice(i, i + SLICE);
    const { error } = await supabaseAdmin.from('ai_agent_chunks').insert(batch);
    if (error) throw error;
    inserted += batch.length;
  }

  await supabaseAdmin
    .from('ai_agent_documents')
    .update({
      total_chunks: (doc.total_chunks || 0) + inserted,
      total_tokens: (doc.total_tokens || 0) + (usage.total_tokens || 0),
      updated_at: new Date().toISOString()
    })
    .eq('id', doc.id);

  await logUsage({
    agentId: doc.agent_id,
    userId: actor.sub,
    operation: 'embed',
    model: 'text-embedding-3-small',
    promptTokens: usage.total_tokens || 0,
    completionTokens: 0
  });

  return res.status(200).json({
    ok: true,
    inserted,
    total_chunks: (doc.total_chunks || 0) + inserted,
    embedding_tokens: usage.total_tokens || 0,
    cost_usd: costFor('text-embedding-3-small', usage.total_tokens || 0, 0)
  });
}

async function documentFinalize(req, res, actor) {
  const body = parseBody(req);
  const documentId = String(body.document_id || '').trim();
  if (!documentId) return res.status(400).json({ error: 'document_id_required' });
  const { data: doc } = await supabaseAdmin
    .from('ai_agent_documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc) return res.status(404).json({ error: 'document_not_found' });

  const { data: agent } = await supabaseAdmin
    .from('ai_agents')
    .select('*')
    .eq('id', doc.agent_id)
    .maybeSingle();
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  const status = body.error ? 'failed' : 'ready';
  const { error } = await supabaseAdmin
    .from('ai_agent_documents')
    .update({ status, error: body.error || null, updated_at: new Date().toISOString() })
    .eq('id', documentId);
  if (error) throw error;
  return res.status(200).json({ ok: true, status });
}

async function documentDelete(req, res, actor) {
  const body = parseBody(req);
  const documentId = String(body.document_id || '').trim();
  if (!documentId) return res.status(400).json({ error: 'document_id_required' });
  const { data: doc } = await supabaseAdmin
    .from('ai_agent_documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc) return res.status(200).json({ ok: true });

  const { data: agent } = await supabaseAdmin.from('ai_agents').select('*').eq('id', doc.agent_id).maybeSingle();
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  /** Storage'daki PNG sayfalarını da temizle */
  try {
    const { data: pageRows } = await supabaseAdmin
      .from('ai_agent_pages')
      .select('image_url')
      .eq('document_id', documentId);
    if (pageRows && pageRows.length) {
      const paths = pageRows
        .map((r) => extractStoragePath(r.image_url))
        .filter(Boolean);
      if (paths.length) {
        await supabaseAdmin.storage.from('ai-exam-pages').remove(paths).catch(() => null);
      }
    }
  } catch (e) {
    console.warn('[ai-agents] storage cleanup failed', e?.message || e);
  }

  const { error } = await supabaseAdmin.from('ai_agent_documents').delete().eq('id', documentId);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

function extractStoragePath(publicUrl) {
  try {
    const marker = '/ai-exam-pages/';
    const i = String(publicUrl || '').indexOf(marker);
    if (i < 0) return null;
    return publicUrl.slice(i + marker.length);
  } catch {
    return null;
  }
}

/**
 * Bir PDF sayfasının PNG'sini Storage'a yükler ve ai_agent_pages tablosuna kaydeder.
 * Body: { document_id, page_no, image_base64, mime?, width?, height? }
 * Vercel body limit ≈ 4.5MB → her PNG için bağımsız istek (paralel)
 */
async function pageImageUpload(req, res, actor) {
  const body = parseBody(req);
  const documentId = String(body.document_id || '').trim();
  const pageNo = Number.parseInt(String(body.page_no), 10);
  const base64 = String(body.image_base64 || '');
  const mime = String(body.mime || 'image/png').toLowerCase();
  const width = Number.isFinite(Number(body.width)) ? Number(body.width) : null;
  const height = Number.isFinite(Number(body.height)) ? Number(body.height) : null;

  if (!documentId || !Number.isFinite(pageNo) || pageNo < 1 || !base64) {
    return res.status(400).json({ error: 'document_id_page_no_and_image_required' });
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
    return res.status(400).json({ error: 'invalid_mime' });
  }

  const { data: doc } = await supabaseAdmin
    .from('ai_agent_documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc) return res.status(404).json({ error: 'document_not_found' });

  const { data: agent } = await supabaseAdmin
    .from('ai_agents')
    .select('*')
    .eq('id', doc.agent_id)
    .maybeSingle();
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const path = `${doc.agent_id}/${documentId}/p${String(pageNo).padStart(4, '0')}.${ext}`;
  const buffer = Buffer.from(base64, 'base64');

  const { error: upErr } = await supabaseAdmin.storage
    .from('ai-exam-pages')
    .upload(path, buffer, {
      contentType: mime,
      upsert: true,
      cacheControl: '31536000'
    });
  if (upErr) {
    return res.status(500).json({ error: 'storage_upload_failed', detail: errorMessage(upErr) });
  }

  const { data: pub } = supabaseAdmin.storage.from('ai-exam-pages').getPublicUrl(path);
  const imageUrl = pub?.publicUrl;
  if (!imageUrl) return res.status(500).json({ error: 'public_url_failed' });

  /** Upsert ai_agent_pages */
  const { error: dbErr } = await supabaseAdmin
    .from('ai_agent_pages')
    .upsert(
      {
        agent_id: doc.agent_id,
        document_id: documentId,
        page_no: pageNo,
        image_url: imageUrl,
        width,
        height
      },
      { onConflict: 'document_id,page_no' }
    );
  if (dbErr) return res.status(500).json({ error: 'db_upsert_failed', detail: errorMessage(dbErr) });

  return res.status(200).json({ ok: true, url: imageUrl, page_no: pageNo });
}

/**
 * Mevcut sorulara, dokumanin sayfa goruntu URL'lerini baglar.
 * Sayfa goruntuleri yuklendikten SONRA cagrilir (PDF tekrar yuklemeden).
 *
 * Body: { document_id } veya { agent_id } (agent_id ile tum belgeler icin)
 */
async function backfillQuestionImages(req, res, actor) {
  const body = parseBody(req);
  const documentId = body.document_id ? String(body.document_id).trim() : null;
  const agentId = body.agent_id ? String(body.agent_id).trim() : null;
  if (!documentId && !agentId) return res.status(400).json({ error: 'document_id_or_agent_id_required' });

  /** Yetki: belge ya da ajan uzerinden */
  let targetAgentId = agentId;
  if (documentId) {
    const { data: doc } = await supabaseAdmin
      .from('ai_agent_documents')
      .select('agent_id')
      .eq('id', documentId)
      .maybeSingle();
    if (!doc) return res.status(404).json({ error: 'document_not_found' });
    targetAgentId = doc.agent_id;
  }
  const agent = await supabaseAdmin
    .from('ai_agents')
    .select('*')
    .eq('id', targetAgentId)
    .maybeSingle()
    .then((r) => r.data);
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  if (!canManageAgent(actor, agent)) return res.status(403).json({ error: 'forbidden' });

  /** Sayfa kayitlarini cek */
  const pageQuery = supabaseAdmin
    .from('ai_agent_pages')
    .select('document_id, page_no, image_url');
  if (documentId) pageQuery.eq('document_id', documentId);
  else pageQuery.eq('agent_id', targetAgentId);
  const { data: pages, error: pErr } = await pageQuery;
  if (pErr) throw pErr;
  if (!pages?.length) {
    return res.status(200).json({ ok: true, updated: 0, reason: 'no_page_images' });
  }

  /** Her sayfa icin ai_exam_questions'i guncelle */
  let updated = 0;
  for (const p of pages) {
    const { data: rows, error } = await supabaseAdmin
      .from('ai_exam_questions')
      .update({ page_image_url: p.image_url, updated_at: new Date().toISOString() })
      .eq('document_id', p.document_id)
      .eq('page_no', p.page_no)
      .is('page_image_url', null)
      .select('id');
    if (error) {
      console.warn('[backfill] update failed', error.message);
      continue;
    }
    updated += rows?.length || 0;
  }

  return res.status(200).json({ ok: true, updated, pages: pages.length });
}

/* ─────────────────────────── SOHBET ─────────────────────────── */

async function listConversations(_req, res, actor) {
  const { data, error } = await supabaseAdmin
    .from('ai_agent_conversations')
    .select('id, agent_id, title, message_count, last_message_at, created_at')
    .eq('user_id', actor.sub)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(60);
  if (error) throw error;
  return res.status(200).json({ data: data || [] });
}

async function listMessages(req, res, actor) {
  const conversationId = String(req.query?.conversation_id || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversation_id_required' });
  const { data: conv } = await supabaseAdmin
    .from('ai_agent_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return res.status(404).json({ error: 'conversation_not_found' });
  if (conv.user_id !== actor.sub && !isAdmin(actor)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { data, error } = await supabaseAdmin
    .from('ai_agent_messages')
    .select('id, role, content, image_url, citations, created_at, model, prompt_tokens, completion_tokens, cost_usd')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return res.status(200).json({ data: data || [] });
}

async function chat(req, res, actor) {
  if (!isOpenAIConfigured()) return res.status(503).json({ error: 'openai_api_key_missing' });

  const body = parseBody(req);
  const agentId = String(body.agent_id || '').trim();
  const userText = String(body.text || '').trim();
  const imageBase64 = typeof body.image_base64 === 'string' ? body.image_base64.trim() : '';
  const imageMime = String(body.image_mime || 'image/jpeg').trim() || 'image/jpeg';

  if (!agentId) return res.status(400).json({ error: 'agent_id_required' });
  if (!userText && !imageBase64) return res.status(400).json({ error: 'text_or_image_required' });

  const { data: agent } = await supabaseAdmin
    .from('ai_agents')
    .select('*')
    .eq('id', agentId)
    .maybeSingle();
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  if (agent.is_active === false && !isAdmin(actor)) {
    return res.status(403).json({ error: 'agent_disabled' });
  }

  /** Aylık limit (öğrenci/koç/teacher dahil — admin atlar) */
  const settings = await getSettings();
  if (!isAdmin(actor)) {
    const used = await getMonthlyChatCount(actor.sub);
    if (used >= settings.studentMonthlyChatLimit) {
      return res.status(429).json({
        error: 'monthly_chat_limit_reached',
        used,
        limit: settings.studentMonthlyChatLimit
      });
    }
  }

  /** Genel aylık USD bütçe kontrolü */
  if (!isAdmin(actor) && settings.monthlyUsdBudget > 0) {
    const usd = await getMonthlyUsd();
    if (usd >= settings.monthlyUsdBudget) {
      return res.status(429).json({
        error: 'monthly_budget_reached',
        used_usd: Number(usd.toFixed(2)),
        budget_usd: settings.monthlyUsdBudget
      });
    }
  }

  /** Sohbet aç / bul */
  let conversationId = body.conversation_id ? String(body.conversation_id).trim() : '';
  if (!conversationId) {
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('ai_agent_conversations')
      .insert({
        agent_id: agentId,
        user_id: actor.sub,
        student_id: actor.student_id || null,
        title: userText.slice(0, 80) || 'Yeni sohbet'
      })
      .select('id')
      .maybeSingle();
    if (convErr) throw convErr;
    conversationId = conv.id;
  } else {
    const { data: conv } = await supabaseAdmin
      .from('ai_agent_conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();
    if (!conv) return res.status(404).json({ error: 'conversation_not_found' });
    if (conv.user_id !== actor.sub && !isAdmin(actor)) return res.status(403).json({ error: 'forbidden' });
  }

  /** Embedding ile RAG arama (sadece metin sorgusu) */
  let snippets = [];
  if (userText) {
    try {
      const { vectors, usage: embUsage } = await embedTexts([userText]);
      if (vectors[0]) snippets = await searchSimilarChunks(agentId, vectors[0], 6);
      await logUsage({
        agentId,
        userId: actor.sub,
        operation: 'embed',
        model: 'text-embedding-3-small',
        promptTokens: embUsage.total_tokens || 0,
        completionTokens: 0
      });
    } catch (e) {
      console.warn('[ai-agents] embed/search failed', e?.message || e);
    }
  }

  /** Son birkaç mesaj — bağlam */
  const { data: history } = await supabaseAdmin
    .from('ai_agent_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20);

  const imageDataUrl = imageBase64 ? `data:${imageMime};base64,${imageBase64}` : null;
  const modelToUse = imageDataUrl ? (agent.vision_model || 'gpt-4o-mini') : (agent.model || 'gpt-4o-mini');

  let llm;
  try {
    llm = await chatCompletion({
      model: modelToUse,
      systemPrompt: agent.system_prompt,
      contextSnippets: snippets,
      history: (history || []).slice(-12),
      userText: userText || 'Bu görseldeki soruyu adım adım çöz.',
      imageUrl: imageDataUrl
    });
  } catch (e) {
    return res.status(502).json({ error: errorMessage(e) });
  }

  /** Kullanıcı mesajı + asistan mesajı kaydet */
  const userMessageRow = {
    conversation_id: conversationId,
    agent_id: agentId,
    role: 'user',
    content: userText || '(görsel soru)',
    image_url: imageDataUrl ? '(görsel ek)' : null
  };
  const assistantMessageRow = {
    conversation_id: conversationId,
    agent_id: agentId,
    role: 'assistant',
    content: llm.content,
    model: llm.model,
    prompt_tokens: llm.usage.prompt_tokens || 0,
    completion_tokens: llm.usage.completion_tokens || 0,
    cost_usd: costFor(llm.model, llm.usage.prompt_tokens || 0, llm.usage.completion_tokens || 0),
    citations: snippets.map((s) => ({
      document_id: s.document_id,
      page_no: s.page_no,
      score: Number(s.score?.toFixed(3) || 0),
      preview: String(s.content || '').slice(0, 200)
    }))
  };

  await supabaseAdmin.from('ai_agent_messages').insert([userMessageRow, assistantMessageRow]);
  await supabaseAdmin
    .from('ai_agent_conversations')
    .update({
      message_count: (history?.length || 0) + 2,
      last_message_at: new Date().toISOString()
    })
    .eq('id', conversationId);

  await logUsage({
    agentId,
    userId: actor.sub,
    operation: 'chat',
    model: llm.model,
    promptTokens: llm.usage.prompt_tokens || 0,
    completionTokens: llm.usage.completion_tokens || 0
  });

  return res.status(200).json({
    ok: true,
    conversation_id: conversationId,
    answer: llm.content,
    model: llm.model,
    citations: assistantMessageRow.citations,
    usage: llm.usage,
    cost_usd: assistantMessageRow.cost_usd
  });
}

/* ─────────────────────────── KULLANIM ─────────────────────────── */

async function usageSelf(_req, res, actor) {
  const settings = await getSettings();
  const used = await getMonthlyChatCount(actor.sub);
  return res.status(200).json({
    used,
    limit: settings.studentMonthlyChatLimit,
    remaining: Math.max(0, settings.studentMonthlyChatLimit - used)
  });
}

async function usageSummary(req, res, actor) {
  if (!isAdmin(actor)) return res.status(403).json({ error: 'forbidden' });
  const month = String(req.query?.month || '').trim() || undefined;
  const summary = await getUsageSummary({ month });
  const settings = await getSettings();
  return res.status(200).json({ ...summary, budget_usd: settings.monthlyUsdBudget });
}

async function readSettings(_req, res, actor) {
  if (!isAdmin(actor)) return res.status(403).json({ error: 'forbidden' });
  const s = await getSettings();
  return res.status(200).json({ data: s });
}

async function updateSettings(req, res, actor) {
  if (!isAdmin(actor)) return res.status(403).json({ error: 'forbidden' });
  const body = parseBody(req);
  const patch = {};
  if (Number.isFinite(Number(body.student_monthly_chat_limit))) {
    patch.student_monthly_chat_limit = Math.max(0, Math.min(10000, Number(body.student_monthly_chat_limit)));
  }
  if (Number.isFinite(Number(body.monthly_usd_budget))) {
    patch.monthly_usd_budget = Math.max(0, Number(body.monthly_usd_budget));
  }
  patch.updated_at = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('ai_settings')
    .update(patch)
    .eq('id', 1);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}
