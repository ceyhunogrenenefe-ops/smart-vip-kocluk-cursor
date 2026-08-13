/**
 * Koç yaz kayıt / geçiş / referans takip tablosu
 * GET/POST/PATCH /api/coach-enrollment-tracker?op=...
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { isMissingTableError } from '../api/_lib/supabase-schema.js';
import { isUuid } from '../api/_lib/uuid.js';

const PLATFORM_PRIMARY_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

const METRIC_KEYS = [
  'student_count',
  'yaz_kayitli',
  'yaz_kayit_olan',
  'gecis_8_9',
  'gecis_8_9_kayit',
  'veli_sayisi',
  'referans_istenen',
  'referans_alinan',
  'veli_memnuniyet_video'
];

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

function roleOf(actor) {
  return String(actor?.role || '').trim().toLowerCase();
}

async function loadRoleTags(userId) {
  if (!userId) return [];
  try {
    const { data } = await supabaseAdmin.from('users').select('role, roles').eq('id', userId).maybeSingle();
    const tags = new Set();
    const r = String(data?.role || '').toLowerCase();
    if (r) tags.add(r);
    if (Array.isArray(data?.roles)) {
      for (const x of data.roles) {
        const t = String(x || '').toLowerCase();
        if (t) tags.add(t);
      }
    }
    return [...tags];
  } catch {
    return [];
  }
}

function isManager(tags) {
  return tags.includes('super_admin') || tags.includes('admin');
}

async function resolveInstitutionId(actor, queryInst) {
  const q = String(queryInst || '').trim();
  if (q && isUuid(q)) return q;
  if (actor.institution_id) return String(actor.institution_id);
  const { data: u } = await supabaseAdmin
    .from('users')
    .select('institution_id')
    .eq('id', actor.sub)
    .maybeSingle();
  if (u?.institution_id) return String(u.institution_id);
  if (roleOf(actor) === 'super_admin') return PLATFORM_PRIMARY_INSTITUTION_ID;
  return null;
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function countStudentsForCoach(coach) {
  if (Array.isArray(coach?.student_ids)) return coach.student_ids.filter(Boolean).length;
  return 0;
}

function missingTableResponse(res) {
  return res.status(503).json({
    error: 'table_missing',
    message:
      'Koç takip tablosu henüz kurulmadı. Supabase SQL Editor’da 2026-08-13-coach-enrollment-tracker.sql dosyasını çalıştırın.',
    sql_file: 'student-coaching-system/sql/2026-08-13-coach-enrollment-tracker.sql'
  });
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch (e) {
    return res.status(401).json({ error: errorMessage(e) || 'Unauthorized' });
  }

  const tags = await loadRoleTags(actor.sub);
  const manager = isManager(tags);
  const coachOnly = tags.includes('coach') && !manager;
  if (!manager && !coachOnly && !tags.includes('teacher')) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const op = String(req.query?.op || req.body?.op || '').trim();
  const body = parseBody(req);
  const institutionId = await resolveInstitutionId(
    actor,
    req.query?.institution_id || body.institution_id
  );
  if (!institutionId) {
    return res.status(400).json({ error: 'institution_id_required' });
  }

  try {
    if (req.method === 'GET' && (op === 'periods' || !op)) {
      const { data, error } = await supabaseAdmin
        .from('coach_enrollment_periods')
        .select('*')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false });
      if (error) {
        if (isMissingTableError(error, 'coach_enrollment_periods')) return missingTableResponse(res);
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST' && op === 'ensure-period') {
      if (!manager) return res.status(403).json({ error: 'forbidden' });
      const periodKey = String(body.period_key || '2026-yaz').trim().slice(0, 64) || '2026-yaz';
      const label = String(body.label || '2026 Yaz Kayıt Dönemi').trim().slice(0, 120) || periodKey;
      const { data: existing } = await supabaseAdmin
        .from('coach_enrollment_periods')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('period_key', periodKey)
        .maybeSingle();
      if (existing) {
        return res.status(200).json({ data: existing, created: false });
      }
      const { data, error } = await supabaseAdmin
        .from('coach_enrollment_periods')
        .insert({
          institution_id: institutionId,
          period_key: periodKey,
          label,
          is_active: true
        })
        .select('*')
        .single();
      if (error) {
        if (isMissingTableError(error, 'coach_enrollment_periods')) return missingTableResponse(res);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json({ data, created: true });
    }

    if (req.method === 'GET' && op === 'matrix') {
      let periodId = String(req.query?.period_id || body.period_id || '').trim();
      let period = null;
      if (periodId && isUuid(periodId)) {
        const { data } = await supabaseAdmin
          .from('coach_enrollment_periods')
          .select('*')
          .eq('id', periodId)
          .eq('institution_id', institutionId)
          .maybeSingle();
        period = data;
      }
      if (!period) {
        const { data: periods, error: pErr } = await supabaseAdmin
          .from('coach_enrollment_periods')
          .select('*')
          .eq('institution_id', institutionId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1);
        if (pErr) {
          if (isMissingTableError(pErr, 'coach_enrollment_periods')) return missingTableResponse(res);
          return res.status(500).json({ error: pErr.message });
        }
        period = periods?.[0] || null;
      }
      if (!period && manager) {
        const { data: created, error: cErr } = await supabaseAdmin
          .from('coach_enrollment_periods')
          .insert({
            institution_id: institutionId,
            period_key: '2026-yaz',
            label: '2026 Yaz Kayıt Dönemi',
            is_active: true
          })
          .select('*')
          .single();
        if (cErr) {
          if (isMissingTableError(cErr, 'coach_enrollment_periods')) return missingTableResponse(res);
          return res.status(500).json({ error: cErr.message });
        }
        period = created;
      }
      if (!period) {
        return res.status(200).json({ period: null, rows: [], totals: null });
      }
      periodId = period.id;

      let coachesQ = supabaseAdmin
        .from('coaches')
        .select('id, name, email, student_ids, institution_id, user_id')
        .order('name', { ascending: true });
      coachesQ = coachesQ.eq('institution_id', institutionId);
      const { data: coaches, error: cErr } = await coachesQ;
      if (cErr) return res.status(500).json({ error: cErr.message });

      let coachList = coaches || [];
      if (coachOnly) {
        const myCoachId = String(actor.coach_id || '').trim();
        coachList = coachList.filter((c) => c.id === myCoachId || c.user_id === actor.sub);
      }

      const { data: metrics, error: mErr } = await supabaseAdmin
        .from('coach_enrollment_metrics')
        .select('*')
        .eq('period_id', periodId)
        .eq('institution_id', institutionId);
      if (mErr) {
        if (isMissingTableError(mErr, 'coach_enrollment_metrics')) return missingTableResponse(res);
        return res.status(500).json({ error: mErr.message });
      }
      const byCoach = new Map((metrics || []).map((m) => [m.coach_id, m]));

      const rows = coachList.map((c) => {
        const m = byCoach.get(c.id) || {};
        const autoStudents = countStudentsForCoach(c);
        return {
          coach_id: c.id,
          coach_name: c.name || c.email || c.id,
          metric_id: m.id || null,
          student_count: m.student_count ?? autoStudents,
          student_count_auto: autoStudents,
          yaz_kayitli: m.yaz_kayitli ?? null,
          yaz_kayit_olan: m.yaz_kayit_olan ?? null,
          gecis_8_9: m.gecis_8_9 ?? null,
          gecis_8_9_kayit: m.gecis_8_9_kayit ?? null,
          veli_sayisi: m.veli_sayisi ?? null,
          referans_istenen: m.referans_istenen ?? null,
          referans_alinan: m.referans_alinan ?? null,
          veli_memnuniyet_video: m.veli_memnuniyet_video ?? null,
          notes: m.notes ?? null,
          updated_at: m.updated_at || null
        };
      });

      const totals = METRIC_KEYS.reduce((acc, k) => {
        acc[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
        return acc;
      }, {});

      return res.status(200).json({ period, rows, totals, can_edit: manager });
    }

    if ((req.method === 'POST' || req.method === 'PATCH') && op === 'upsert-row') {
      if (!manager) return res.status(403).json({ error: 'forbidden' });
      const periodId = String(body.period_id || '').trim();
      const coachId = String(body.coach_id || '').trim();
      // coaches.id is text (UUID or legacy ids); period_id is uuid
      if (!isUuid(periodId) || !coachId) {
        return res.status(400).json({ error: 'period_id_and_coach_id_required' });
      }
      const patch = {
        institution_id: institutionId,
        period_id: periodId,
        coach_id: coachId,
        updated_by: actor.sub,
        updated_at: new Date().toISOString()
      };
      for (const k of METRIC_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body, k)) {
          patch[k] = toIntOrNull(body[k]);
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
        patch.notes = String(body.notes || '').trim() || null;
      }

      const { data: existing } = await supabaseAdmin
        .from('coach_enrollment_metrics')
        .select('id')
        .eq('period_id', periodId)
        .eq('coach_id', coachId)
        .maybeSingle();

      let row;
      if (existing?.id) {
        const { data, error } = await supabaseAdmin
          .from('coach_enrollment_metrics')
          .update(patch)
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) {
          if (isMissingTableError(error, 'coach_enrollment_metrics')) return missingTableResponse(res);
          return res.status(500).json({ error: error.message });
        }
        row = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from('coach_enrollment_metrics')
          .insert(patch)
          .select('*')
          .single();
        if (error) {
          if (isMissingTableError(error, 'coach_enrollment_metrics')) return missingTableResponse(res);
          return res.status(500).json({ error: error.message });
        }
        row = data;
      }
      return res.status(200).json({ data: row });
    }

    return res.status(400).json({
      error: 'unknown_op',
      hint: 'periods | matrix | ensure-period | upsert-row'
    });
  } catch (e) {
    return res.status(500).json({ error: errorMessage(e) || 'server_error' });
  }
}
