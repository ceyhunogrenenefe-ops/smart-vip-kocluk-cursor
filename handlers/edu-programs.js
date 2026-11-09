/**
 * Eğitim programları (Dönem Programı, Deneme Kulübü, Yaz Okulu, Kitap Okuma Atölyesi …)
 *
 * GET   /api/edu-programs?institution_id=        → kurumun programları (pasifler dahil)
 * POST  /api/edu-programs                        → { name, institution_id? } yeni program
 * PATCH /api/edu-programs?id=                    → { name?, is_active?, sort_order? }
 *
 * Silme yok: geçmiş gruplar ve arşivlenmiş sınıflar programa bağlı kalabilsin diye
 * program yalnız pasife alınır. Pasif program yeni kayıt seçimlerinde görünmez.
 */
import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import { isUuid } from '../api/_lib/uuid.js';
import {
  normalizeProgramName,
  validateProgramName,
  canReadPrograms,
  canWritePrograms
} from '../api/_lib/edu-programs.js';

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

function resolveInstitutionId(actor, raw) {
  const role = String(actor.role || '');
  const wanted = String(raw || '').trim();
  const actorId = String(actor.institution_id || '').trim();
  if (role === 'super_admin') return isUuid(wanted) ? wanted : isUuid(actorId) ? actorId : '';
  if (wanted && isUuid(wanted) && hasInstitutionAccess(actor, wanted)) return wanted;
  return isUuid(actorId) ? actorId : '';
}

function isMissingTable(error) {
  const m = String(error?.message || '');
  return error?.code === '42P01' || /relation .*edu_programs.* does not exist|schema cache/i.test(m);
}

const MISSING_TABLE_HINT =
  'Programlar tablosu henüz kurulmamış. Supabase SQL Editor’de sql/2026-11-09-edu-programs.sql dosyasını çalıştırın.';

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  const roleTags = await normalizedUserRolesFromDb(actor.sub).catch(() => []);
  if (!canReadPrograms(actor.role, roleTags)) return res.status(403).json({ error: 'forbidden' });

  try {
    if (req.method === 'GET') {
      const instId = resolveInstitutionId(actor, req.query.institution_id);
      if (!instId) return res.status(200).json({ data: [], error: 'institution_required' });
      const { data, error } = await supabaseAdmin
        .from('edu_programs')
        .select('id, institution_id, name, is_active, sort_order, created_at, updated_at')
        .eq('institution_id', instId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) {
        if (isMissingTable(error)) return res.status(200).json({ data: [], setup_required: true, hint: MISSING_TABLE_HINT });
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ data: data || [] });
    }

    if (!canWritePrograms(actor.role, roleTags)) return res.status(403).json({ error: 'forbidden' });
    const body = parseBody(req);

    if (req.method === 'POST') {
      const instId = resolveInstitutionId(actor, body.institution_id || req.query.institution_id);
      if (!instId) {
        return res.status(400).json({ error: 'institution_required', message: 'Üst menüden kurum seçin.' });
      }
      const name = normalizeProgramName(body.name);
      const invalid = validateProgramName(name);
      if (invalid) return res.status(400).json({ error: invalid });
      const { data: last } = await supabaseAdmin
        .from('edu_programs')
        .select('sort_order')
        .eq('institution_id', instId)
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextSort = (Number(last?.[0]?.sort_order) || 0) + 10;
      const { data, error } = await supabaseAdmin
        .from('edu_programs')
        .insert({ institution_id: instId, name, is_active: true, sort_order: nextSort, created_by: actor.sub })
        .select('*')
        .maybeSingle();
      if (error) {
        if (isMissingTable(error)) return res.status(400).json({ error: MISSING_TABLE_HINT });
        if (error.code === '23505') return res.status(409).json({ error: 'Bu adla bir program zaten var.' });
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || body.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: existing, error: exErr } = await supabaseAdmin
        .from('edu_programs')
        .select('id, institution_id')
        .eq('id', id)
        .maybeSingle();
      if (exErr) return res.status(500).json({ error: exErr.message });
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (!hasInstitutionAccess(actor, existing.institution_id)) return res.status(403).json({ error: 'forbidden' });

      const patch = { updated_at: new Date().toISOString() };
      if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        const name = normalizeProgramName(body.name);
        const invalid = validateProgramName(name);
        if (invalid) return res.status(400).json({ error: invalid });
        patch.name = name;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'is_active')) patch.is_active = Boolean(body.is_active);
      if (Object.prototype.hasOwnProperty.call(body, 'sort_order')) {
        const n = Number(body.sort_order);
        if (Number.isFinite(n)) patch.sort_order = Math.round(n);
      }
      const { data, error } = await supabaseAdmin
        .from('edu_programs')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Bu adla bir program zaten var.' });
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ data });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
