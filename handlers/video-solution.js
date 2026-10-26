/**
 * Video Soru Çözüm Merkezi — yönetim API (Aşama 3)
 * GET                           — set listesi veya ?setId= detay
 * GET  ?op=qr&slug=&n=          — karekod data URL
 * POST ?op=create-set
 * PATCH ?op=update-set
 * POST ?op=publish-set | archive-set
 * POST ?op=upsert-question
 * DELETE ?setId= | ?questionId=
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasAdmin, roleSetHasSuperAdmin } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  ensureVideoSolutionSchema,
  VIDEO_SOLUTION_QUESTIONS_TABLE,
  VIDEO_SOLUTION_SETS_TABLE
} from '../api/_lib/video-solution-schema.js';
import { parseVideoSource, videoMediaFromRow } from '../api/_lib/video-solution-media.js';
import {
  videoSolutionPublicBaseUrl,
  videoSolutionQuestionPublicUrl,
  videoSolutionQrDataUrl,
  videoSolutionSetPublicUrl
} from '../api/_lib/video-solution-qr.js';
import { normalizeVideoSolutionSlug, proposeVideoSolutionSlug } from '../api/_lib/video-solution-slug.js';

const WORK_TYPES = new Set(['yazili', 'deneme', 'konu_tarama', 'foy', 'odev', 'genel']);

function parseBody(req) {
  const b = req.body;
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8') || '{}');
    } catch {
      return {};
    }
  }
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function canManage(roles) {
  return (
    roles.has('teacher') ||
    roles.has('coach') ||
    roles.has('admin') ||
    roles.has('super_admin')
  );
}

function institutionFilter(actor, roles) {
  if (roleSetHasSuperAdmin(roles)) return null;
  const id = String(actor.institution_id || '').trim();
  return id || '__none__';
}

async function assertSetAccess(setRow, actor, roles) {
  if (!setRow) return false;
  if (roleSetHasSuperAdmin(roles)) return true;
  const kurum = String(actor.institution_id || '').trim();
  if (!kurum) return false;
  const rowInst = String(setRow.institution_id || '').trim();
  return !rowInst || rowInst === kurum;
}

function mapSet(row) {
  if (!row) return null;
  return {
    id: row.id,
    institution_id: row.institution_id,
    slug: row.slug,
    school_year: row.school_year,
    grade_level: row.grade_level,
    subject: row.subject,
    term: row.term,
    exam_number: row.exam_number,
    work_type: row.work_type,
    title: row.title,
    description: row.description,
    status: row.status,
    created_by: row.created_by,
    updated_at: row.updated_at,
    public_url: videoSolutionSetPublicUrl(row.slug)
  };
}

function mapQuestion(row) {
  if (!row) return null;
  const media = videoMediaFromRow(row);
  return {
    id: row.id,
    set_id: row.set_id,
    question_number: row.question_number,
    title: row.title,
    topic: row.topic,
    teacher_user_id: row.teacher_user_id,
    image_storage_path: row.image_storage_path,
    status: row.status,
    sort_order: row.sort_order,
    updated_at: row.updated_at,
    ...media,
    public_url: null
  };
}

function decorateQuestions(questions, slug) {
  return questions.map((q) => ({
    ...mapQuestion(q),
    public_url: videoSolutionQuestionPublicUrl(slug, q.question_number)
  }));
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const roles = await actorRoleSet(actor);
    if (!canManage(roles)) return res.status(403).json({ error: 'forbidden' });

    const ready = await ensureVideoSolutionSchema();
    if (!ready.ok) return res.status(503).json({ error: 'schema_missing', hint: ready.hint });

    const op = String(req.query?.op || '').trim();
    const instEq = institutionFilter(actor, roles);

    if (req.method === 'GET' && op === 'qr') {
      const slug = String(req.query?.slug || '').trim();
      if (!slug) return res.status(400).json({ error: 'slug_required' });
      let q = supabaseAdmin.from(VIDEO_SOLUTION_SETS_TABLE).select('id,slug,status,institution_id').eq('slug', slug);
      const { data: setRow, error: se } = await q.maybeSingle();
      if (se) throw se;
      if (!setRow || !(await assertSetAccess(setRow, actor, roles))) {
        return res.status(404).json({ error: 'not_found' });
      }
      const nRaw = req.query?.n;
      const url =
        nRaw != null && String(nRaw).trim() !== ''
          ? videoSolutionQuestionPublicUrl(slug, nRaw)
          : videoSolutionSetPublicUrl(slug);
      const qr = await videoSolutionQrDataUrl(url);
      return res.status(200).json({ url, qr_data_url: qr });
    }

    if (req.method === 'GET') {
      const setId = String(req.query?.setId || '').trim();
      if (setId) {
        const { data: setRow, error: se } = await supabaseAdmin
          .from(VIDEO_SOLUTION_SETS_TABLE)
          .select('*')
          .eq('id', setId)
          .maybeSingle();
        if (se) throw se;
        if (!setRow || !(await assertSetAccess(setRow, actor, roles))) {
          return res.status(404).json({ error: 'not_found' });
        }
        const { data: qs, error: qe } = await supabaseAdmin
          .from(VIDEO_SOLUTION_QUESTIONS_TABLE)
          .select('*')
          .eq('set_id', setId)
          .order('sort_order', { ascending: true })
          .order('question_number', { ascending: true });
        if (qe) throw qe;
        return res.status(200).json({
          public_base_url: videoSolutionPublicBaseUrl(),
          set: mapSet(setRow),
          questions: decorateQuestions(qs || [], setRow.slug)
        });
      }

      let listQ = supabaseAdmin
        .from(VIDEO_SOLUTION_SETS_TABLE)
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (instEq) listQ = listQ.eq('institution_id', instEq);
      const status = String(req.query?.status || '').trim();
      if (status) listQ = listQ.eq('status', status);
      const { data: sets, error: le } = await listQ;
      if (le) throw le;

      const setIds = (sets || []).map((s) => s.id);
      let counts = {};
      if (setIds.length) {
        const { data: cq, error: ce } = await supabaseAdmin
          .from(VIDEO_SOLUTION_QUESTIONS_TABLE)
          .select('set_id')
          .in('set_id', setIds);
        if (ce) throw ce;
        for (const r of cq || []) {
          counts[r.set_id] = (counts[r.set_id] || 0) + 1;
        }
      }

      return res.status(200).json({
        public_base_url: videoSolutionPublicBaseUrl(),
        sets: (sets || []).map((s) => ({
          ...mapSet(s),
          question_count: counts[s.id] || 0
        }))
      });
    }

    if (req.method === 'POST' && op === 'create-set') {
      const body = parseBody(req);
      const grade = Number(body.grade_level);
      const subject = String(body.subject || '').trim();
      const schoolYear = String(body.school_year || '').trim();
      const title = String(body.title || '').trim();
      const workType = String(body.work_type || 'genel').trim();
      if (!subject || !schoolYear || !title) {
        return res.status(400).json({ error: 'missing_fields', hint: 'subject, school_year, title zorunlu' });
      }
      if (!Number.isFinite(grade) || grade < 3 || grade > 12) {
        return res.status(400).json({ error: 'invalid_grade' });
      }
      if (!WORK_TYPES.has(workType)) return res.status(400).json({ error: 'invalid_work_type' });

      let slug = normalizeVideoSolutionSlug(body.slug);
      if (!slug) {
        slug = proposeVideoSolutionSlug({
          schoolYear,
          gradeLevel: grade,
          subject,
          workType,
          term: body.term,
          examNumber: body.exam_number
        });
      }

      const term = body.term != null && body.term !== '' ? Number(body.term) : null;
      const examNumber =
        body.exam_number != null && body.exam_number !== '' ? Number(body.exam_number) : null;

      const row = {
        institution_id: instEq && instEq !== '__none__' ? instEq : String(body.institution_id || '').trim() || null,
        slug,
        school_year: schoolYear,
        grade_level: grade,
        subject,
        term: term === 1 || term === 2 ? term : null,
        exam_number: examNumber === 1 || examNumber === 2 ? examNumber : null,
        work_type: workType,
        title,
        description: String(body.description || '').trim() || null,
        status: 'draft',
        created_by: actor.sub,
        updated_by: actor.sub
      };

      const { data, error } = await supabaseAdmin.from(VIDEO_SOLUTION_SETS_TABLE).insert(row).select('*').single();
      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'slug_taken', hint: 'Bu slug kullanılıyor; farklı slug deneyin.' });
        }
        throw error;
      }
      return res.status(201).json({ set: mapSet(data) });
    }

    if (req.method === 'PATCH' && op === 'update-set') {
      const body = parseBody(req);
      const setId = String(body.set_id || body.id || '').trim();
      if (!setId) return res.status(400).json({ error: 'set_id_required' });

      const { data: existing, error: ge } = await supabaseAdmin
        .from(VIDEO_SOLUTION_SETS_TABLE)
        .select('*')
        .eq('id', setId)
        .maybeSingle();
      if (ge) throw ge;
      if (!existing || !(await assertSetAccess(existing, actor, roles))) {
        return res.status(404).json({ error: 'not_found' });
      }

      const patch = { updated_by: actor.sub, updated_at: new Date().toISOString() };
      if (body.title != null) patch.title = String(body.title).trim() || existing.title;
      if (body.description != null) patch.description = String(body.description).trim() || null;
      if (body.subject != null) patch.subject = String(body.subject).trim() || existing.subject;
      if (body.school_year != null) patch.school_year = String(body.school_year).trim() || existing.school_year;
      if (body.grade_level != null) {
        const g = Number(body.grade_level);
        if (!Number.isFinite(g) || g < 3 || g > 12) return res.status(400).json({ error: 'invalid_grade' });
        patch.grade_level = g;
      }
      if (body.work_type != null) {
        const wt = String(body.work_type).trim();
        if (!WORK_TYPES.has(wt)) return res.status(400).json({ error: 'invalid_work_type' });
        patch.work_type = wt;
      }
      if (body.term !== undefined) {
        const t = body.term === null || body.term === '' ? null : Number(body.term);
        patch.term = t === 1 || t === 2 ? t : null;
      }
      if (body.exam_number !== undefined) {
        const e = body.exam_number === null || body.exam_number === '' ? null : Number(body.exam_number);
        patch.exam_number = e === 1 || e === 2 ? e : null;
      }
      if (body.slug != null && existing.status === 'draft') {
        const nextSlug = normalizeVideoSolutionSlug(body.slug);
        if (!nextSlug) return res.status(400).json({ error: 'invalid_slug' });
        patch.slug = nextSlug;
      }

      const { data, error } = await supabaseAdmin
        .from(VIDEO_SOLUTION_SETS_TABLE)
        .update(patch)
        .eq('id', setId)
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'slug_taken' });
        throw error;
      }
      return res.status(200).json({ set: mapSet(data) });
    }

    if (req.method === 'POST' && (op === 'publish-set' || op === 'archive-set')) {
      const body = parseBody(req);
      const setId = String(body.set_id || body.id || '').trim();
      if (!setId) return res.status(400).json({ error: 'set_id_required' });

      const { data: existing, error: ge } = await supabaseAdmin
        .from(VIDEO_SOLUTION_SETS_TABLE)
        .select('*')
        .eq('id', setId)
        .maybeSingle();
      if (ge) throw ge;
      if (!existing || !(await assertSetAccess(existing, actor, roles))) {
        return res.status(404).json({ error: 'not_found' });
      }

      if (op === 'publish-set') {
        const { count, error: ce } = await supabaseAdmin
          .from(VIDEO_SOLUTION_QUESTIONS_TABLE)
          .select('id', { count: 'exact', head: true })
          .eq('set_id', setId);
        if (ce) throw ce;
        if (!count) {
          return res.status(400).json({ error: 'no_questions', hint: 'Yayınlamadan önce en az bir soru ekleyin.' });
        }
        const { data, error } = await supabaseAdmin
          .from(VIDEO_SOLUTION_SETS_TABLE)
          .update({ status: 'published', updated_by: actor.sub, updated_at: new Date().toISOString() })
          .eq('id', setId)
          .select('*')
          .single();
        if (error) throw error;
        await supabaseAdmin
          .from(VIDEO_SOLUTION_QUESTIONS_TABLE)
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq('set_id', setId);
        return res.status(200).json({ set: mapSet(data) });
      }

      const { data, error } = await supabaseAdmin
        .from(VIDEO_SOLUTION_SETS_TABLE)
        .update({ status: 'archived', updated_by: actor.sub, updated_at: new Date().toISOString() })
        .eq('id', setId)
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ set: mapSet(data) });
    }

    if (req.method === 'POST' && op === 'upsert-question') {
      const body = parseBody(req);
      const setId = String(body.set_id || '').trim();
      const qNum = Number(body.question_number);
      if (!setId || !Number.isFinite(qNum) || qNum < 1) {
        return res.status(400).json({ error: 'missing_fields' });
      }

      const { data: setRow, error: se } = await supabaseAdmin
        .from(VIDEO_SOLUTION_SETS_TABLE)
        .select('*')
        .eq('id', setId)
        .maybeSingle();
      if (se) throw se;
      if (!setRow || !(await assertSetAccess(setRow, actor, roles))) {
        return res.status(404).json({ error: 'not_found' });
      }

      const videoInput = String(
        body.video_url || body.youtube_url || body.youtube_video_id || ''
      ).trim();
      const parsed = parseVideoSource(videoInput);
      if (!parsed) {
        return res.status(400).json({
          error: 'invalid_video',
          hint: 'Geçerli YouTube, Vimeo, Google Drive veya https bağlantısı girin.'
        });
      }

      const row = {
        set_id: setId,
        question_number: Math.trunc(qNum),
        title: String(body.title || '').trim() || null,
        topic: String(body.topic || '').trim() || null,
        video_provider: parsed.provider,
        video_ref: parsed.ref,
        youtube_video_id: parsed.provider === 'youtube' ? parsed.ref : null,
        youtube_url: parsed.source_url,
        teacher_user_id: String(body.teacher_user_id || actor.sub || '').trim() || null,
        status: setRow.status === 'published' ? 'published' : 'draft',
        sort_order: Number.isFinite(Number(body.sort_order)) ? Math.trunc(Number(body.sort_order)) : Math.trunc(qNum),
        updated_at: new Date().toISOString()
      };

      const questionId = String(body.id || body.question_id || '').trim();
      if (questionId) {
        const { data, error } = await supabaseAdmin
          .from(VIDEO_SOLUTION_QUESTIONS_TABLE)
          .update(row)
          .eq('id', questionId)
          .eq('set_id', setId)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'not_found' });
        return res.status(200).json({
          question: { ...decorateQuestions([data], setRow.slug)[0] }
        });
      }

      const { data, error } = await supabaseAdmin
        .from(VIDEO_SOLUTION_QUESTIONS_TABLE)
        .upsert(row, { onConflict: 'set_id,question_number' })
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({
        question: { ...decorateQuestions([data], setRow.slug)[0] }
      });
    }

    if (req.method === 'DELETE') {
      const questionId = String(req.query?.questionId || '').trim();
      const setId = String(req.query?.setId || '').trim();

      if (questionId) {
        const { data: qRow, error: qe } = await supabaseAdmin
          .from(VIDEO_SOLUTION_QUESTIONS_TABLE)
          .select('*')
          .eq('id', questionId)
          .maybeSingle();
        if (qe) throw qe;
        if (!qRow) return res.status(404).json({ error: 'not_found' });
        const { data: setRow, error: se } = await supabaseAdmin
          .from(VIDEO_SOLUTION_SETS_TABLE)
          .select('*')
          .eq('id', qRow.set_id)
          .maybeSingle();
        if (se) throw se;
        if (!setRow || !(await assertSetAccess(setRow, actor, roles))) {
          return res.status(404).json({ error: 'not_found' });
        }
        const { error } = await supabaseAdmin.from(VIDEO_SOLUTION_QUESTIONS_TABLE).delete().eq('id', questionId);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      if (setId) {
        const { data: setRow, error: se } = await supabaseAdmin
          .from(VIDEO_SOLUTION_SETS_TABLE)
          .select('*')
          .eq('id', setId)
          .maybeSingle();
        if (se) throw se;
        if (!setRow || !(await assertSetAccess(setRow, actor, roles))) {
          return res.status(404).json({ error: 'not_found' });
        }
        if (setRow.status !== 'draft') {
          return res.status(400).json({
            error: 'not_draft',
            hint: 'Yalnızca taslak çalışmalar silinebilir; yayında olanı arşivleyin.'
          });
        }
        const { error } = await supabaseAdmin.from(VIDEO_SOLUTION_SETS_TABLE).delete().eq('id', setId);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'id_required' });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    console.error('[video-solution]', req.method, String(req.query?.op || ''), msg);
    return res.status(500).json({ error: 'server_error', hint: msg });
  }
}
