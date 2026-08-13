/**
 * Koç yaz kayıt / geçiş / referans takip tablosu
 * GET/POST/PATCH /api/coach-enrollment-tracker?op=...
 *
 * Koç listesi ve sayılar sistemden otomatik üretilir:
 * - öğrenci / veli: students.coach_id + parent_phone
 * - yaz kayıt: parent_sign_contracts (yaz kampı) + student_payment_records (yaz_kayit)
 * - 8→9: class_level LGS/8 havuzu; kaydolan = imzalı 9. sınıf / dönem kaydı veya donem_kayit ödeme
 * - referans / memnuniyet videosu: henüz sistem alanı yok → manuel (opsiyonel override)
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { isMissingTableError } from '../api/_lib/supabase-schema.js';
import { isUuid } from '../api/_lib/uuid.js';

const PLATFORM_PRIMARY_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

/** Otomatik hesaplanan alanlar */
const AUTO_METRIC_KEYS = [
  'student_count',
  'yaz_kayitli',
  'yaz_kayit_olan',
  'gecis_8_9',
  'gecis_8_9_kayit',
  'veli_sayisi'
];

/** Manuel (sistemde kaynak yok) */
const MANUAL_METRIC_KEYS = ['referans_istenen', 'referans_alinan', 'veli_memnuniyet_video'];

const METRIC_KEYS = [...AUTO_METRIC_KEYS, ...MANUAL_METRIC_KEYS];

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

function missingTableResponse(res) {
  return res.status(503).json({
    error: 'table_missing',
    message:
      'Koç takip tablosu henüz kurulmadı. Supabase SQL Editor’da 2026-08-13-coach-enrollment-tracker.sql dosyasını çalıştırın.',
    sql_file: 'student-coaching-system/sql/2026-08-13-coach-enrollment-tracker.sql'
  });
}

function normTr(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

function isYazProgram(programAdi) {
  const p = normTr(programAdi);
  return p.includes('yaz kamp') || p.includes('yaz kay');
}

function isGrade8(classLevel) {
  const s = normTr(classLevel);
  if (!s) return false;
  if (s === 'lgs' || s.includes('lgs')) return true;
  if (s === '8' || s.startsWith('8.') || s.startsWith('8 ')) return true;
  const digits = s.replace(/\D/g, '');
  return digits === '8';
}

function isGrade9(classLevel) {
  const s = normTr(classLevel);
  if (!s) return false;
  if (s === '9' || s.startsWith('9.') || s.startsWith('9 ')) return true;
  const digits = s.replace(/\D/g, '');
  return digits === '9';
}

/** 8→9 / 9. sınıf dönem kaydı sinyali */
function is9EnrollmentContract(row) {
  if (isGrade9(row?.sinif)) return true;
  const prog = normTr(row?.program_adi);
  if (!prog) return false;
  if (/(^|[^0-9])9\s*,\s*10/.test(prog)) return true;
  if (/9\.\s*s[ıi]n[iı]f/.test(prog)) return true;
  if (prog.includes('9. sınıf') || prog.includes('9 sınıf')) return true;
  return false;
}

function emptyAuto() {
  return {
    student_count: 0,
    yaz_kayitli: 0,
    yaz_kayit_olan: 0,
    gecis_8_9: 0,
    gecis_8_9_kayit: 0,
    veli_sayisi: 0
  };
}

/**
 * Kurumdaki öğrenciler + yaz/dönem sözleşmeleri + ödemelerden koç bazlı otomatik metrikler.
 */
async function computeAutoMetricsByCoach(institutionId, coachIds) {
  const byCoach = new Map();
  for (const id of coachIds) byCoach.set(id, emptyAuto());

  const studentCoach = new Map(); // student_id -> coach_id
  const grade8IdsByCoach = new Map(); // coach_id -> Set(student_id)

  const { data: students, error: sErr } = await supabaseAdmin
    .from('students')
    .select('id, coach_id, class_level, parent_phone, parent_name, institution_id')
    .eq('institution_id', institutionId);
  if (sErr) throw sErr;

  for (const st of students || []) {
    const coachId = String(st.coach_id || '').trim();
    if (!coachId || !byCoach.has(coachId)) continue;
    const auto = byCoach.get(coachId);
    auto.student_count += 1;
    studentCoach.set(String(st.id), coachId);
    const phone = String(st.parent_phone || '').trim();
    const pname = String(st.parent_name || '').trim();
    if (phone || pname) {
      // distinct veli: telefon tercih, yoksa isim
      if (!auto._veliKeys) auto._veliKeys = new Set();
      auto._veliKeys.add(phone ? `p:${phone}` : `n:${pname.toLocaleLowerCase('tr-TR')}`);
    }
    if (isGrade8(st.class_level)) {
      if (!grade8IdsByCoach.has(coachId)) grade8IdsByCoach.set(coachId, new Set());
      grade8IdsByCoach.get(coachId).add(String(st.id));
      auto.gecis_8_9 += 1;
    }
  }

  for (const auto of byCoach.values()) {
    auto.veli_sayisi = auto._veliKeys ? auto._veliKeys.size : 0;
    delete auto._veliKeys;
  }

  // Yaz / 9. sınıf sözleşmeleri
  let contracts = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('parent_sign_contracts')
      .select('id, status, program_adi, sinif, student_id, institution_id, telefon, ogrenci_ad, ogrenci_soyad')
      .eq('institution_id', institutionId)
      .limit(2000);
    if (error) {
      if (!isMissingTableError(error, 'parent_sign_contracts')) throw error;
    } else {
      contracts = data || [];
    }
  } catch (e) {
    if (!isMissingTableError(e, 'parent_sign_contracts')) throw e;
  }

  const yazPoolByCoach = new Map(); // coach -> Set(studentKey)
  const yazSignedByCoach = new Map();
  const enrolled9ByCoach = new Map(); // grade8 students who enrolled to 9

  const bumpSet = (map, coachId, key) => {
    if (!coachId || !byCoach.has(coachId) || !key) return;
    if (!map.has(coachId)) map.set(coachId, new Set());
    map.get(coachId).add(key);
  };

  for (const c of contracts) {
    const sid = String(c.student_id || '').trim();
    let coachId = sid ? studentCoach.get(sid) : null;
    // student_id yoksa telefon ile koç öğrencisine bağla
    if (!coachId) {
      const tel = String(c.telefon || '').trim();
      if (tel) {
        for (const st of students || []) {
          if (String(st.parent_phone || '').trim() === tel && byCoach.has(String(st.coach_id || ''))) {
            coachId = String(st.coach_id);
            break;
          }
        }
      }
    }
    if (!coachId) continue;

    const key = sid || `c:${c.id}`;
    const status = String(c.status || '').toLowerCase();
    const signed = status === 'signed';

    if (isYazProgram(c.program_adi)) {
      bumpSet(yazPoolByCoach, coachId, key);
      if (signed) bumpSet(yazSignedByCoach, coachId, key);
    }

    if (signed && is9EnrollmentContract(c) && sid && grade8IdsByCoach.get(coachId)?.has(sid)) {
      bumpSet(enrolled9ByCoach, coachId, sid);
    }
  }

  // Ödemeler: yaz_kayit / donem_kayit
  let payments = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('student_payment_records')
      .select('id, payment_type, status, student_id, coach_id, institution_id')
      .eq('institution_id', institutionId)
      .in('payment_type', ['yaz_kayit', 'donem_kayit'])
      .neq('status', 'cancelled')
      .limit(2000);
    if (error) {
      if (!String(error.message || '').includes('schema cache') && !isMissingTableError(error, 'student_payment_records')) {
        throw error;
      }
    } else {
      payments = data || [];
    }
  } catch (e) {
    if (!isMissingTableError(e, 'student_payment_records')) {
      // tablo yoksa sessiz geç
      if (!String(e?.message || '').includes('schema cache')) throw e;
    }
  }

  for (const p of payments) {
    const sid = String(p.student_id || '').trim();
    let coachId = String(p.coach_id || '').trim() || (sid ? studentCoach.get(sid) : '');
    if (!coachId || !byCoach.has(coachId)) continue;
    const key = sid || `pay:${p.id}`;
    const type = String(p.payment_type || '');
    const st = String(p.status || '').toLowerCase();
    const paidLike = st === 'paid' || st === 'partial';

    if (type === 'yaz_kayit') {
      bumpSet(yazPoolByCoach, coachId, key);
      if (paidLike) bumpSet(yazSignedByCoach, coachId, key);
    }
    if (type === 'donem_kayit' && paidLike && sid && grade8IdsByCoach.get(coachId)?.has(sid)) {
      bumpSet(enrolled9ByCoach, coachId, sid);
    }
  }

  // Yaz aktiflik dönemi (varsa)
  try {
    const { data: periods, error } = await supabaseAdmin
      .from('student_activity_periods')
      .select('student_id, coach_id, period_type, status')
      .eq('period_type', 'summer')
      .eq('status', 'active')
      .limit(2000);
    if (!error && periods) {
      for (const per of periods) {
        const sid = String(per.student_id || '').trim();
        let coachId = String(per.coach_id || '').trim() || (sid ? studentCoach.get(sid) : '');
        if (!coachId || !byCoach.has(coachId)) continue;
        if (sid) bumpSet(yazPoolByCoach, coachId, sid);
      }
    }
  } catch {
    /* optional */
  }

  for (const [coachId, auto] of byCoach.entries()) {
    auto.yaz_kayitli = yazPoolByCoach.get(coachId)?.size || 0;
    auto.yaz_kayit_olan = yazSignedByCoach.get(coachId)?.size || 0;
    auto.gecis_8_9_kayit = enrolled9ByCoach.get(coachId)?.size || 0;
  }

  return byCoach;
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

      // coaches.user_id / student_ids bazı ortamlarda yok — güvenli kolon seti
      let coachesQ = supabaseAdmin
        .from('coaches')
        .select('id, name, email, institution_id')
        .order('name', { ascending: true });
      coachesQ = coachesQ.eq('institution_id', institutionId);
      const { data: coaches, error: cErr } = await coachesQ;
      if (cErr) return res.status(500).json({ error: cErr.message });

      let coachList = coaches || [];
      if (coachOnly) {
        const myCoachId = String(actor.coach_id || '').trim();
        const em = String(actor.email || '').trim().toLowerCase();
        coachList = coachList.filter(
          (c) =>
            (myCoachId && c.id === myCoachId) ||
            (em && String(c.email || '').trim().toLowerCase() === em)
        );
      }

      const autoByCoach = await computeAutoMetricsByCoach(
        institutionId,
        coachList.map((c) => c.id)
      );

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
        const auto = autoByCoach.get(c.id) || emptyAuto();
        const row = {
          coach_id: c.id,
          coach_name: c.name || c.email || c.id,
          metric_id: m.id || null,
          notes: m.notes ?? null,
          updated_at: m.updated_at || null,
          auto: { ...auto },
          overridden: {}
        };

        for (const k of AUTO_METRIC_KEYS) {
          const hasOverride = m[k] != null;
          row.overridden[k] = hasOverride;
          row[k] = hasOverride ? m[k] : auto[k];
          row[`${k}_auto`] = auto[k];
        }
        for (const k of MANUAL_METRIC_KEYS) {
          row[k] = m[k] ?? null;
          row.overridden[k] = m[k] != null;
        }
        return row;
      });

      // Öğrencisi olan koçlar üstte
      rows.sort((a, b) => {
        const d = (b.student_count || 0) - (a.student_count || 0);
        if (d !== 0) return d;
        return String(a.coach_name || '').localeCompare(String(b.coach_name || ''), 'tr');
      });

      const totals = METRIC_KEYS.reduce((acc, k) => {
        acc[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
        return acc;
      }, {});

      return res.status(200).json({
        period,
        rows,
        totals,
        can_edit: manager,
        auto_keys: AUTO_METRIC_KEYS,
        manual_keys: MANUAL_METRIC_KEYS
      });
    }

    if ((req.method === 'POST' || req.method === 'PATCH') && op === 'upsert-row') {
      if (!manager) return res.status(403).json({ error: 'forbidden' });
      const periodId = String(body.period_id || '').trim();
      const coachId = String(body.coach_id || '').trim();
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
