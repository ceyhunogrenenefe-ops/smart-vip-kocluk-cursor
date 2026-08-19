/**
 * D─▒┼ş ├Â─şretmen ba┼şvurusu (site)
 * POST /api/teacher-applications
 * POST /api/teacher-applications  body.op=upload-photo  (bilgisayardan foto)
 * GET  /api/teacher-applications  (admin, liste)
 */
import { randomUUID } from 'crypto';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  importTeacherApplicationToProfile,
  normalizeTeacherApplicationBody,
  validateTeacherApplication
} from '../api/_lib/teacher-application-import.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const PHOTO_WINDOW_MS = 15 * 60 * 1000;
const MAX_PHOTO_PER_WINDOW = 20;
const ipBuckets = new Map();
const photoBuckets = new Map();

const PHOTO_BUCKET = process.env.TEACHER_PROFILE_BUCKET || 'teacher-profiles';
const PHOTO_MAX_BYTES = 2.5 * 1024 * 1024;
const PHOTO_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function applyCors(req, res) {
  const allowed = String(
    process.env.PUBLIC_TEACHERS_CORS_ORIGIN ||
      'https://onlinevipdershane.com,https://www.onlinevipdershane.com,http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = String(req.headers.origin || '');
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', allowed[0] || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function currentIp(req) {
  const fromHeader = req.headers['x-forwarded-for'];
  if (Array.isArray(fromHeader) && fromHeader[0]) return String(fromHeader[0]).split(',')[0].trim();
  if (typeof fromHeader === 'string' && fromHeader) return fromHeader.split(',')[0].trim();
  return String(req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown');
}

function isRateLimited(ip, buckets = ipBuckets, windowMs = WINDOW_MS, max = MAX_PER_WINDOW) {
  const now = Date.now();
  const prev = buckets.get(ip) || [];
  const recent = prev.filter((ts) => now - ts < windowMs);
  if (recent.length >= max) {
    buckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  buckets.set(ip, recent);
  return false;
}

function parseBase64Image(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (m) {
    return { contentType: m[1].toLowerCase().replace('image/jpg', 'image/jpeg'), buffer: Buffer.from(m[2], 'base64') };
  }
  // ham base64
  try {
    return { contentType: null, buffer: Buffer.from(s, 'base64') };
  } catch {
    return null;
  }
}

function parseBase64Document(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^data:((?:image\/(?:jpeg|jpg|png|webp)|application\/pdf));base64,(.+)$/i);
  if (m) {
    return {
      contentType: m[1].toLowerCase().replace('image/jpg', 'image/jpeg'),
      buffer: Buffer.from(m[2], 'base64')
    };
  }
  try {
    return { contentType: null, buffer: Buffer.from(s, 'base64') };
  } catch {
    return null;
  }
}

const DOC_MAX_BYTES = 5 * 1024 * 1024;
const DOC_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};

async function handlePhotoUpload(req, res, ip) {
  if (isRateLimited(ip, photoBuckets, PHOTO_WINDOW_MS, MAX_PHOTO_PER_WINDOW)) {
    return res.status(429).json({ error: 'too_many_requests', hint: 'L├╝tfen bir s├╝re sonra tekrar deneyin.' });
  }

  const body = req.body || {};
  const contentTypeHint = String(body.contentType || body.content_type || '').toLowerCase().trim();
  const parsed = parseBase64Image(body.fileBase64 || body.file_base64 || body.dataUrl || body.data_url);
  if (!parsed?.buffer?.length) {
    return res.status(400).json({ error: 'file_required', message: 'Foto─şraf dosyas─▒ gerekli.' });
  }
  if (parsed.buffer.length > PHOTO_MAX_BYTES) {
    return res.status(400).json({
      error: 'file_too_large',
      message: 'Foto─şraf en fazla 2.5 MB olabilir.',
      max_bytes: PHOTO_MAX_BYTES
    });
  }

  const contentType = (parsed.contentType || contentTypeHint || 'image/jpeg').replace('image/jpg', 'image/jpeg');
  const ext = PHOTO_MIME[contentType];
  if (!ext) {
    return res.status(400).json({
      error: 'invalid_mime',
      message: 'Sadece JPG, PNG veya WEBP y├╝kleyin.',
      allowed: Object.keys(PHOTO_MIME)
    });
  }

  const path = `applications/${randomUUID()}/photo.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage.from(PHOTO_BUCKET).upload(path, parsed.buffer, {
    contentType,
    upsert: true
  });
  if (upErr) {
    console.error('[teacher-applications] photo upload', upErr.message || upErr);
    return res.status(503).json({
      error: 'storage_unavailable',
      hint: `Supabase Storage'da "${PHOTO_BUCKET}" bucket olu┼şturun (public).`,
      detail: upErr.message
    });
  }

  let publicUrl = null;
  try {
    const { data: pub } = supabaseAdmin.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    publicUrl = pub?.publicUrl || null;
  } catch {
    publicUrl = null;
  }
  if (!publicUrl) {
    return res.status(503).json({ error: 'public_url_failed', message: 'Foto─şraf y├╝klendi ama URL al─▒namad─▒.' });
  }

  return res.status(200).json({
    ok: true,
    photo_url: publicUrl,
    path,
    bucket: PHOTO_BUCKET,
    contentType
  });
}

async function handleDocumentUpload(req, res, ip) {
  if (isRateLimited(ip, photoBuckets, PHOTO_WINDOW_MS, MAX_PHOTO_PER_WINDOW)) {
    return res.status(429).json({ error: 'too_many_requests', hint: 'L├╝tfen bir s├╝re sonra tekrar deneyin.' });
  }

  const body = req.body || {};
  const contentTypeHint = String(body.contentType || body.content_type || '').toLowerCase().trim();
  const parsed = parseBase64Document(body.fileBase64 || body.file_base64 || body.dataUrl || body.data_url);
  if (!parsed?.buffer?.length) {
    return res.status(400).json({ error: 'file_required', message: 'Belge dosyas─▒ gerekli.' });
  }
  if (parsed.buffer.length > DOC_MAX_BYTES) {
    return res.status(400).json({
      error: 'file_too_large',
      message: 'Belge en fazla 5 MB olabilir.',
      max_bytes: DOC_MAX_BYTES
    });
  }

  let contentType = (parsed.contentType || contentTypeHint || 'application/pdf')
    .toLowerCase()
    .replace('image/jpg', 'image/jpeg');
  let ext = DOC_MIME[contentType];
  if (!ext) {
    const name = String(body.fileName || body.file_name || '').toLowerCase();
    if (name.endsWith('.pdf')) {
      contentType = 'application/pdf';
      ext = 'pdf';
    } else if (/\.(jpe?g)$/.test(name)) {
      contentType = 'image/jpeg';
      ext = 'jpg';
    } else if (name.endsWith('.png')) {
      contentType = 'image/png';
      ext = 'png';
    } else if (name.endsWith('.webp')) {
      contentType = 'image/webp';
      ext = 'webp';
    }
  }
  if (!ext) {
    return res.status(400).json({
      error: 'invalid_mime',
      message: 'Sadece PDF, JPG, PNG veya WEBP y├╝kleyin.',
      allowed: Object.keys(DOC_MIME)
    });
  }

  const path = `applications/${randomUUID()}/credential.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage.from(PHOTO_BUCKET).upload(path, parsed.buffer, {
    contentType,
    upsert: true
  });
  if (upErr) {
    console.error('[teacher-applications] document upload', upErr.message || upErr);
    return res.status(503).json({
      error: 'storage_unavailable',
      hint: `Supabase Storage'da "${PHOTO_BUCKET}" bucket olu┼şturun (public).`,
      detail: upErr.message
    });
  }

  let publicUrl = null;
  try {
    const { data: pub } = supabaseAdmin.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    publicUrl = pub?.publicUrl || null;
  } catch {
    publicUrl = null;
  }
  if (!publicUrl) {
    return res.status(503).json({ error: 'public_url_failed', message: 'Belge y├╝klendi ama URL al─▒namad─▒.' });
  }

  return res.status(200).json({
    ok: true,
    document_url: publicUrl,
    credential_document_url: publicUrl,
    path,
    bucket: PHOTO_BUCKET,
    contentType
  });
}

function isAdminActor(actor) {
  const r = String(actor?.role || '').toLowerCase();
  if (r === 'admin' || r === 'super_admin') return true;
  const roles = Array.isArray(actor?.roles) ? actor.roles : [];
  return roles.some((x) => {
    const v = String(x || '').toLowerCase();
    return v === 'admin' || v === 'super_admin';
  });
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!isAdminActor(actor)) return res.status(403).json({ error: 'forbidden' });

    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const { data, error } = await supabaseAdmin
      .from('teacher_applications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      const em = String(error.message || '');
      if (/teacher_applications/i.test(em) || /42P01|PGRST/i.test(em)) {
        return res.status(503).json({
          error: 'table_missing',
          hint: 'sql/2026-07-29-teacher-applications.sql dosyas─▒n─▒ SupabaseÔÇÖde ├ğal─▒┼şt─▒r─▒n.'
        });
      }
      throw error;
    }
    return res.status(200).json({ data: data || [] });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = currentIp(req);
  // Vercel bazen body'yi string b─▒rak─▒r; op kaybolursa tam ba┼şvuru validasyonuna d├╝┼ş├╝p
  // "Ad ve soyad zorunludur" hatas─▒ ├╝retir ÔÇö belge y├╝klemesini bozar.
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body || '{}');
    } catch {
      req.body = {};
    }
  }
  let bodyOp = String(req.body?.op || req.query?.op || '').trim().toLowerCase();
  const hasFile = Boolean(
    req.body?.fileBase64 || req.body?.file_base64 || req.body?.dataUrl || req.body?.data_url
  );
  if (!bodyOp && hasFile) {
    const ct = String(req.body?.contentType || req.body?.content_type || '').toLowerCase();
    const name = String(req.body?.fileName || req.body?.file_name || '').toLowerCase();
    if (ct.includes('pdf') || name.endsWith('.pdf')) bodyOp = 'upload-document';
    else if (ct.startsWith('image/') || /\.(jpe?g|png|webp)$/.test(name)) bodyOp = 'upload-photo';
    else bodyOp = 'upload-document';
  }
  if (bodyOp === 'upload-photo') {
    try {
      return await handlePhotoUpload(req, res, ip);
    } catch (e) {
      console.error('[teacher-applications] upload-photo', errorMessage(e));
      return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
    }
  }
  if (bodyOp === 'upload-document' || bodyOp === 'upload-credential') {
    try {
      return await handleDocumentUpload(req, res, ip);
    } catch (e) {
      console.error('[teacher-applications] upload-document', errorMessage(e));
      return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
    }
  }

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'too_many_requests', hint: 'L├╝tfen bir s├╝re sonra tekrar deneyin.' });
  }

  const normalized = normalizeTeacherApplicationBody(req.body || {});
  if (normalized._gotcha) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const validationError = validateTeacherApplication(normalized);
  if (validationError) return res.status(400).json({ error: validationError });

  const now = new Date().toISOString();
  const ua = String(req.headers['user-agent'] || '').slice(0, 500);

  const { data: recentDup } = await supabaseAdmin
    .from('teacher_applications')
    .select('id')
    .eq('email', normalized.email)
    .in('status', ['received', 'linked'])
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();
  if (recentDup?.id) {
    return res.status(409).json({
      error: 'basvuru_zaten_var',
      message: 'Bu e-posta ile son g├╝nlerde ba┼şvuru al─▒nm─▒┼ş.'
    });
  }

  const insertRow = {
    first_name: normalized.first_name,
    last_name: normalized.last_name,
    email: normalized.email,
    phone_e164: normalized.phone_e164,
    branch: normalized.branch,
    experience_label: normalized.experience_label || null,
    experience_years: normalized.experience_years,
    address_text: normalized.address_text,
    university: normalized.university,
    graduation_year: normalized.graduation_year,
    short_bio: normalized.short_bio,
    full_bio: normalized.full_bio,
    photo_url: normalized.photo_url,
    credential_document_url: normalized.credential_document_url,
    intro_video_url: normalized.intro_video_url,
    lesson_video_url: normalized.lesson_video_url,
    instagram_url: normalized.instagram_url || null,
    youtube_url: normalized.youtube_url || null,
    grade_levels: normalized.grade_levels,
    kvkk_accepted_at: now,
    source: 'website',
    status: 'received',
    ip_address: ip,
    user_agent: ua,
    payload: req.body || {},
    created_at: now,
    updated_at: now
  };

  let application = null;
  {
    const firstTry = await supabaseAdmin.from('teacher_applications').insert(insertRow).select('*').single();
    if (!firstTry.error && firstTry.data) {
      application = firstTry.data;
    } else {
      const em = String(firstTry.error?.message || '');
      if (/credential_document_url/i.test(em)) {
        const { credential_document_url: _drop, ...withoutCred } = insertRow;
        const retry = await supabaseAdmin.from('teacher_applications').insert(withoutCred).select('*').single();
        if (!retry.error && retry.data) {
          application = retry.data;
        } else if (retry.error) {
          throw retry.error;
        }
      } else if (/teacher_applications/i.test(em) || /42P01|PGRST/i.test(em)) {
        return res.status(503).json({
          error: 'table_missing',
          hint: 'sql/2026-07-29-teacher-applications.sql dosyas─▒n─▒ SupabaseÔÇÖde ├ğal─▒┼şt─▒r─▒n.'
        });
      } else {
        throw firstTry.error;
      }
    }
  }
  if (!application) {
    return res.status(500).json({ error: 'insert_failed' });
  }

  try {
    const { user, profile } = await importTeacherApplicationToProfile(
      { ...application, ...normalized, id: application.id },
      { ip }
    );

    await supabaseAdmin
      .from('teacher_applications')
      .update({
        status: 'linked',
        user_id: user.id,
        profile_id: profile.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', application.id);

    return res.status(201).json({
      ok: true,
      application_id: application.id,
      profile_id: profile.id,
      message: 'Ba┼şvurunuz al─▒nd─▒. ─░nceleme sonras─▒ size d├Ân├╝┼ş yap─▒lacakt─▒r.'
    });
  } catch (e) {
    const status = e.status || 500;
    const msg = e.message_tr || errorMessage(e) || 'import_failed';
    await supabaseAdmin
      .from('teacher_applications')
      .update({
        status: 'failed',
        error_message: String(e.message || msg).slice(0, 2000),
        updated_at: new Date().toISOString()
      })
      .eq('id', application.id);

    return res.status(status).json({
      error: e.message || 'import_failed',
      message: msg,
      application_id: application.id
    });
  }
}
