/**
 * Dış öğretmen başvurusu (site)
 * POST /api/teacher-applications
 * GET  /api/teacher-applications  (admin, liste)
 */
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
const ipBuckets = new Map();

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

function isRateLimited(ip) {
  const now = Date.now();
  const prev = ipBuckets.get(ip) || [];
  const recent = prev.filter((ts) => now - ts < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    ipBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipBuckets.set(ip, recent);
  return false;
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
          hint: 'sql/2026-07-29-teacher-applications.sql dosyasını Supabase’de çalıştırın.'
        });
      }
      throw error;
    }
    return res.status(200).json({ data: data || [] });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = currentIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'too_many_requests', hint: 'Lütfen bir süre sonra tekrar deneyin.' });
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
      message: 'Bu e-posta ile son günlerde başvuru alınmış.'
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

  const { data: application, error: insErr } = await supabaseAdmin
    .from('teacher_applications')
    .insert(insertRow)
    .select('*')
    .single();

  if (insErr) {
    const em = String(insErr.message || '');
    if (/teacher_applications/i.test(em) || /42P01|PGRST/i.test(em)) {
      return res.status(503).json({
        error: 'table_missing',
        hint: 'sql/2026-07-29-teacher-applications.sql dosyasını Supabase’de çalıştırın.'
      });
    }
    throw insErr;
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
      message: 'Başvurunuz alındı. İnceleme sonrası size dönüş yapılacaktır.'
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
