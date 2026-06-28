import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import {
  coerceAcademicLinks,
  linksForInstitution,
  normalizeAcademicLinksStore,
  upsertDefaultLinks,
  upsertInstitutionLinks,
  DEFAULT_ACADEMIC_LINKS
} from '../api/_lib/academic-center-links-store.js';

const TABLE = 'platform_academic_center_links';

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

function resolveInstitutionScope(actor, requestedId) {
  const role = String(actor.role || '').trim();
  const req = String(requestedId || '').trim();
  if (role === 'super_admin') return req;
  const own = String(actor.institution_id || '').trim();
  if (role === 'admin') return own || req;
  return own || req;
}

async function readStore() {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('links, payload')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return normalizeAcademicLinksStore(data?.links ?? data?.payload);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      let actor = null;
      try {
        actor = requireAuthenticatedActor(req);
        actor = await enrichStudentActor(actor);
      } catch {
        actor = null;
      }

      const qInst = String(req.query?.institution_id || '').trim();
      const institutionId = actor
        ? resolveInstitutionScope(actor, qInst)
        : qInst;

      let store;
      try {
        store = await readStore();
      } catch (error) {
        const msg = String(error?.message || '');
        const missing =
          msg.includes('does not exist') ||
          msg.includes('schema cache') ||
          error?.code === '42P01' ||
          error?.code === 'PGRST205';

        if (missing) {
          return res.status(200).json({
            data: coerceAcademicLinks(DEFAULT_ACADEMIC_LINKS),
            institution_id: institutionId || null,
            warning:
              'platform_academic_center_links eksik. sql/2026-05-07-academic-center-links.sql çalıştırın.',
            defaults: true
          });
        }
        throw error;
      }

      const data = linksForInstitution(store, institutionId);
      return res.status(200).json({ data, institution_id: institutionId || null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'read_failed';
      return res.status(500).json({
        error: msg,
        data: coerceAcademicLinks(DEFAULT_ACADEMIC_LINKS),
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
    actor = await enrichStudentActor(actor);

    const role = String(actor.role || '').trim();
    if (role !== 'super_admin' && role !== 'admin') {
      return res.status(403).json({ error: 'forbidden', hint: 'Yalnızca süper admin ve kurum yöneticisi.' });
    }

    const body = parseBody(req);
    const institutionId = resolveInstitutionScope(actor, body.institution_id);
    const patch = coerceAcademicLinks(body.links ? body.links : body);

    try {
      let store;
      try {
        store = await readStore();
      } catch (readErr) {
        store = normalizeAcademicLinksStore(null);
      }

      const nextStore = institutionId
        ? upsertInstitutionLinks(store, institutionId, patch)
        : upsertDefaultLinks(store, patch);

      const ts = new Date().toISOString();
      const row = {
        id: 1,
        links: nextStore,
        payload: nextStore,
        updated_at: ts
      };
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .upsert(row, { onConflict: 'id' })
        .select('links, payload')
        .single();

      if (error) {
        return res.status(500).json({
          error: error.message || 'Kayıt başarısız.',
          hint: "Supabase'de platform_academic_center_links migration'ını çalıştırın."
        });
      }

      const savedStore = normalizeAcademicLinksStore(data?.links ?? data?.payload);
      const saved = linksForInstitution(savedStore, institutionId);
      return res.status(200).json({ data: saved, institution_id: institutionId || null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'upsert_failed';
      return res.status(500).json({ error: msg });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'method_not_allowed' });
}
