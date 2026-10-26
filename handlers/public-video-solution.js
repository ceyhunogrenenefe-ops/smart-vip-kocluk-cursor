/**
 * Video çözüm merkezi — öğrenci / veli genel okuma (oturum yok).
 * Yalnızca yayında (published) set ve sorular; kişisel / iç id alanları dönmez.
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { sniffImageDataUrl } from './public-brand-kit.js';
import { ensureVideoSolutionSchema } from '../api/_lib/video-solution-schema.js';
import { fetchPublishedVideoSolutionBySlug } from '../api/_lib/video-solution-public-read.js';

const DEFAULT_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

const MARKA_RENKLERI = {
  lacivert: '#173b70',
  lacivertKoyu: '#0f2a52',
  kirmizi: '#d72d42',
  maviAcik: '#eef4fa',
  gri: '#64748b'
};

function applyCors(_req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function brandForInstitution(institutionId) {
  const id = String(institutionId || '').trim() || DEFAULT_INSTITUTION_ID;
  const { data, error } = await supabaseAdmin
    .from('institutions')
    .select('id, name, logo')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  const logo = data?.logo ? sniffImageDataUrl(data.logo) : null;
  return {
    institution: { id: data?.id || id, name: data?.name || 'Online VIP Dershane' },
    logo: logo ? logo.dataUrl : null,
    colors: MARKA_RENKLERI,
    slogan: 'Olduğunuz yerden, olmak istediğiniz yere.'
  };
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const ready = await ensureVideoSolutionSchema();
    if (!ready.ok) return res.status(503).json({ error: 'schema_missing', hint: ready.hint });

    const slug = String(req.query?.slug || '').trim();
    if (!slug) return res.status(400).json({ error: 'slug_required' });

    const payload = await fetchPublishedVideoSolutionBySlug(slug);
    if (!payload) return res.status(404).json({ error: 'not_found' });

    const brand = await brandForInstitution(payload.set.institution_id);
    const { institution_id: _drop, ...setPublic } = payload.set;

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120');

    return res.status(200).json({
      set: setPublic,
      questions: payload.questions,
      brand
    });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
  }
}
