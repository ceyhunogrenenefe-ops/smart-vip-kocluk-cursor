import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

const TABLE = 'platform_academic_center_links';

const DEFAULT_LINKS = {
  studyClasses: {
    class56: 'https://kurumsal.ornek.edu/tr/etut-56',
    class78: 'https://kurumsal.ornek.edu/tr/etut-78',
    class911: 'https://kurumsal.ornek.edu/tr/etut-911',
    yks: 'https://kurumsal.ornek.edu/tr/etut-yks'
  },
  exams: {
    exam: 'https://kurumsal.ornek.edu/tr/deneme',
    optic: 'https://kurumsal.ornek.edu/tr/sanal-optik'
  },
  questionPools: {
    pool1: 'https://kurumsal.ornek.edu/tr/havuz-1',
    pool2: 'https://kurumsal.ornek.edu/tr/havuz-2'
  }
};

function parseBody(req) {
  const b = req.body;
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

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(base[k] && typeof base[k] === 'object' ? base[k] : {}, v);
    } else if (typeof v === 'string') {
      out[k] = v;
    }
  }
  return out;
}

function coerceLinks(raw) {
  const d = DEFAULT_LINKS;
  if (!raw || typeof raw !== 'object') return { ...d };
  return deepMerge(d, raw);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .select('links, payload')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        const msg = String(error.message || '');
        const missing =
          msg.includes('does not exist') ||
          msg.includes('schema cache') ||
          msg.includes("'links' column") ||
          msg.includes('links column') ||
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          error.code === 'PGRST204';

        if (missing) {
          return res.status(200).json({
            data: DEFAULT_LINKS,
            warning:
              'platform_academic_center_links eksik veya `links` sütunu yok. Supabase SQL Editor\'da sql/2026-05-08-platform-academic-center-links-links-column.sql (veya 2026-05-07-academic-center-links.sql) çalıştırın.',
            defaults: true
          });
        }

        return res.status(500).json({
          error: error.message,
          hint: "Supabase'de sql/2026-05-08-platform-academic-center-links-links-column.sql migration'ını çalıştırın; şimdilik varsayılan linkler döndürüldü.",
          data: DEFAULT_LINKS,
          defaults: true
        });
      }

      const raw = data?.links ?? data?.payload;
      const merged = coerceLinks(raw);
      return res.status(200).json({ data: merged });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'read_failed';
      return res.status(500).json({
        error: msg,
        data: DEFAULT_LINKS,
        defaults: true
      });
    }
  }

  if (req.method === 'PUT') {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch {
      return res.status(401).json({ error: 'Missing token' });
    }

    const role = String(actor.role || '').trim();
    if (role !== 'super_admin' && role !== 'admin') {
      return res.status(403).json({ error: 'forbidden', hint: 'Yalnızca süper admin ve kurum yöneticisi.' });
    }

    const body = parseBody(req);
    const next = coerceLinks(body);

    try {
      const ts = new Date().toISOString();
      const row = {
        id: 1,
        links: next,
        payload: next,
        updated_at: ts
      };
      const { data, error } = await supabaseAdmin.from(TABLE).upsert(row, { onConflict: 'id' }).select('links, payload').single();

      if (error) {
        const msg = String(error.message || '');
        const missing =
          msg.includes('does not exist') ||
          msg.includes('schema cache') ||
          msg.includes("'links' column") ||
          msg.includes('links column') ||
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          error.code === 'PGRST204';

        return res.status(missing ? 503 : 500).json({
          error:
            error.message ||
            'Kayıt başarısız. SUPABASE_SERVICE_ROLE_KEY ve migration (platform_academic_center_links) kontrol edin.',
          hint:
            "Supabase SQL Editor'da student-coaching-system/sql/2026-05-08-platform-academic-center-links-links-column.sql (veya 2026-05-07-academic-center-links.sql) dosyasını çalıştırın; ardından şema yenilenir."
        });
      }

      const merged = coerceLinks(data?.links ?? data?.payload);
      return res.status(200).json({ data: merged });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'upsert_failed';
      return res.status(500).json({ error: msg });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'method_not_allowed' });
}
