/**
 * Public öğretmen vitrini (onlinevipdershane.com)
 * GET /api/public/teachers
 * GET /api/public/teachers?slug=
 *
 * Auth yok. Yayında veya changes_pending (snapshot var) + active + private_lesson_enabled.
 * CORS: PUBLIC_TEACHERS_CORS_ORIGIN (virgülle birden fazla)
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { publicCardFromSnapshot, publicDetailFromSnapshot } from '../api/_lib/teacher-profile.js';

function applyCors(req, res) {
  const allowed = String(process.env.PUBLIC_TEACHERS_CORS_ORIGIN || 'https://onlinevipdershane.com,https://www.onlinevipdershane.com')
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120');
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const slug = String(req.query.slug || '').trim();

    if (slug) {
      const { data, error } = await supabaseAdmin
        .from('teacher_profiles')
        .select('*')
        .eq('slug', slug)
        .in('status', ['published', 'changes_pending'])
        .eq('is_active', true)
        .eq('private_lesson_enabled', true)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.published_snapshot) return res.status(404).json({ error: 'not_found' });

      const { data: docs } = await supabaseAdmin
        .from('teacher_documents')
        .select('id, kind, title, description, storage_path, mime_type, is_public, created_at')
        .eq('profile_id', data.id)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      return res.status(200).json({
        teacher: {
          ...publicDetailFromSnapshot(data),
          documents: (docs || []).map((d) => ({
            id: d.id,
            kind: d.kind,
            title: d.title,
            description: d.description,
            mime_type: d.mime_type
          }))
        }
      });
    }

    const { data, error } = await supabaseAdmin
      .from('teacher_profiles')
      .select('*')
      .in('status', ['published', 'changes_pending'])
      .eq('is_active', true)
      .eq('private_lesson_enabled', true)
      .is('deleted_at', null)
      .order('approved_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    // Pasife / silinenler: slug bilinsin ki sitedeki eski statik katalog tekrar canlanmasin
    const { data: managedRows, error: managedErr } = await supabaseAdmin
      .from('teacher_profiles')
      .select('slug')
      .is('deleted_at', null)
      .limit(500);
    if (managedErr) throw managedErr;

    return res.status(200).json({
      teachers: (data || [])
        .filter((r) => r.published_snapshot)
        .map((r) => publicCardFromSnapshot(r)),
      managed_slugs: (managedRows || []).map((r) => r.slug).filter(Boolean)
    });
  } catch (e) {
    console.error('[public-teachers]', errorMessage(e));
    return res.status(500).json({ error: 'server_error' });
  }
}
