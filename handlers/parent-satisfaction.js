import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  ACTION_TYPES,
  CALL_RESULTS,
  CALL_STATUSES,
  SURVEY_QUESTIONS,
  deriveCallStatus,
  recommendOpensReferral,
  summarizeByAgent,
  summarizeCalls
} from '../api/_lib/parent-satisfaction-core.js';

const ASSIGN_TABLE = 'parent_call_assignments';
const SURVEY_TABLE = 'parent_call_surveys';

function isManager(actor, tags) {
  const r = String(actor?.role || '').toLowerCase();
  const t = Array.isArray(tags) ? tags : [];
  return r === 'admin' || r === 'super_admin' || t.includes('admin') || t.includes('super_admin');
}

/** Pasif / silinmiş öğrenciler aranmaz. */
const INACTIVE = new Set(['withdrawn', 'cancelled', 'canceled', 'inactive', 'passive', 'archived', 'frozen']);

function studentIsActive(s) {
  if (s.deleted_at) return false;
  return !INACTIVE.has(String(s.enrollment_status || '').trim().toLowerCase());
}

/**
 * Öğrenci listesi + atama + son görüşme.
 * Öğrenci/veli bilgileri students tablosundan OKUNUR, kopyalanmaz.
 */
async function loadRows(institutionId) {
  let sq = supabaseAdmin
    .from('students')
    .select(
      'id, name, phone, class_level, branch, parent_name, parent_phone, coach_id, institution_id, enrollment_status, deleted_at'
    )
    .order('name', { ascending: true })
    .limit(5000);
  if (institutionId) sq = sq.eq('institution_id', institutionId);
  const { data: students, error } = await sq;
  if (error) throw error;
  const active = (students || []).filter(studentIsActive);
  const ids = active.map((s) => s.id);
  if (!ids.length) return { rows: [], coachById: {}, classById: {} };

  const [assignRes, surveyRes, coachRes, clsRes] = await Promise.all([
    supabaseAdmin.from(ASSIGN_TABLE).select('student_id, agent_user_id, assigned_at').in('student_id', ids),
    supabaseAdmin
      .from(SURVEY_TABLE)
      .select(
        'id, student_id, agent_user_id, call_result, call_back_at, action_required, action_type, action_done_at, referral_lead_id, q_lessons, q_coach, q_tech, q_recommend, created_at'
      )
      .in('student_id', ids)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('coaches').select('id, name'),
    supabaseAdmin.from('class_students').select('student_id, class_id').in('student_id', ids)
  ]);

  const assignBy = new Map((assignRes.data || []).map((a) => [String(a.student_id), a]));
  const lastBy = new Map();
  const allBy = new Map();
  for (const s of surveyRes.data || []) {
    const sid = String(s.student_id);
    if (!lastBy.has(sid)) lastBy.set(sid, s);
    if (!allBy.has(sid)) allBy.set(sid, []);
    allBy.get(sid).push(s);
  }
  const coachById = Object.fromEntries((coachRes.data || []).map((c) => [String(c.id), c.name || '']));

  const classIds = [...new Set((clsRes.data || []).map((c) => String(c.class_id)))];
  let classById = {};
  if (classIds.length) {
    const { data: cls } = await supabaseAdmin.from('classes').select('id, name').in('id', classIds);
    classById = Object.fromEntries((cls || []).map((c) => [String(c.id), c.name || '']));
  }
  const classOf = new Map();
  for (const c of clsRes.data || []) {
    const sid = String(c.student_id);
    if (!classOf.has(sid)) classOf.set(sid, classById[String(c.class_id)] || '');
  }

  const rows = active.map((s) => {
    const last = lastBy.get(String(s.id)) || null;
    const list = allBy.get(String(s.id)) || [];
    return {
      student_id: s.id,
      student_name: s.name || '',
      student_phone: s.phone || null,
      class_level: s.class_level || null,
      branch: s.branch || null,
      class_name: classOf.get(String(s.id)) || null,
      parent_name: s.parent_name || null,
      parent_phone: s.parent_phone || null,
      institution_id: s.institution_id || null,
      coach_id: s.coach_id || null,
      coach_name: s.coach_id ? coachById[String(s.coach_id)] || null : null,
      agent_user_id: assignBy.get(String(s.id))?.agent_user_id || null,
      call_status: deriveCallStatus(last),
      last_call_at: last?.created_at || null,
      last_call_result: last?.call_result || null,
      call_back_at: last?.call_back_at || null,
      action_required: Boolean(last?.action_required && !last?.action_done_at),
      action_type: last?.action_type || null,
      satisfaction: last?.q_lessons || null,
      recommend: last?.q_recommend || null,
      // Dört yanıt da satırda: istatistik ekrandaki filtrelere (kurum, sınıf,
      // temsilci) uyacak şekilde süzülmüş listeden hesaplansın
      q_lessons: last?.q_lessons || null,
      q_coach: last?.q_coach || null,
      q_tech: last?.q_tech || null,
      q_recommend: last?.q_recommend || null,
      has_referral: list.some((x) => x.referral_lead_id),
      survey_count: list.length
    };
  });
  return { rows, coachById };
}

/** Satirlarda gecen kurumlarin adlari — liste ve filtre icin. */
async function loadInstitutionNames(ids) {
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  if (!uniq.length) return {};
  const { data, error } = await supabaseAdmin.from('institutions').select('id, name').in('id', uniq);
  // Kurum tablosu okunamazsa liste yine calissin; yalniz ad bos kalir
  if (error) {
    console.warn('[parent-satisfaction] kurum adlari:', error.message);
    return {};
  }
  return Object.fromEntries((data || []).map((i) => [String(i.id), i.name || '']));
}

async function loadAgentNames(ids) {
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  if (!uniq.length) return {};
  const { data } = await supabaseAdmin.from('users').select('id, name').in('id', uniq);
  return Object.fromEntries((data || []).map((u) => [String(u.id), u.name || '']));
}

/**
 * Veli Memnuniyet ve Takip.
 * Yönetici herkesi görür; temsilci yalnız kendine atananları.
 */
export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  const tags = await normalizedUserRolesFromDb(actor.sub).catch(() => []);
  const manager = isManager(actor, tags);
  const op = String(req.query?.op || '').trim();
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  /**
   * Kurum kapsami.
   *
   * Temsilci her zaman kendi kurumuna kilitli. Yonetici birden cok kuruma
   * bakabildigi icin istekte kurum gonderebilir; gondermezse kendi kurumu,
   * o da yoksa tum kurumlar gelir.
   */
  const requestedInstitution = String(req.query?.institution_id || body?.institution_id || '').trim();
  const institutionId = manager
    ? requestedInstitution || actor.institution_id || null
    : actor.institution_id || null;

  try {
    if (req.method === 'GET' && (op === '' || op === 'list')) {
      const { rows } = await loadRows(institutionId);
      const mine = manager ? rows : rows.filter((r) => String(r.agent_user_id || '') === String(actor.sub));
      const nameById = await loadAgentNames(rows.map((r) => r.agent_user_id));
      const instById = await loadInstitutionNames(rows.map((r) => r.institution_id));

      let agents = [];
      if (manager) {
        let uq = supabaseAdmin
          .from('users')
          .select('id, name, email, role, roles')
          .eq('is_active', true)
          .limit(300);
        if (institutionId) uq = uq.eq('institution_id', institutionId);
        const { data: users } = await uq;
        agents = (users || []).filter((u) => String(u.role || '') !== 'student');
      }

      return res.status(200).json({
        ok: true,
        is_manager: manager,
        rows: mine,
        agent_names: nameById,
        agents,
        institution_names: instById,
        // Filtre kutusu yalnız listede gerçekten geçen kurumları göstersin
        institutions: [...new Set(mine.map((r) => String(r.institution_id || '')).filter(Boolean))]
          .map((id) => ({ id, name: instById[id] || 'Kurum' }))
          .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
        institution_id: institutionId,
        summary: summarizeCalls(mine),
        by_agent: manager ? summarizeByAgent(rows, nameById) : [],
        meta: { questions: SURVEY_QUESTIONS, call_results: CALL_RESULTS, statuses: CALL_STATUSES, action_types: ACTION_TYPES }
      });
    }

    /** Toplu atama — tek tek veya sınıfın tamamı */
    if (req.method === 'POST' && op === 'assign') {
      if (!manager) return res.status(403).json({ error: 'forbidden' });
      const agentId = String(body.agent_user_id || '').trim() || null;
      const studentIds = [...new Set((body.student_ids || []).map((x) => String(x || '').trim()).filter(Boolean))];
      if (!studentIds.length) return res.status(400).json({ error: 'student_ids_required' });

      const now = new Date().toISOString();
      const rows = studentIds.map((sid) => ({
        institution_id: institutionId,
        student_id: sid,
        agent_user_id: agentId,
        assigned_by: actor.sub || null,
        assigned_at: now,
        updated_at: now
      }));
      const { error } = await supabaseAdmin.from(ASSIGN_TABLE).upsert(rows, { onConflict: 'student_id' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, assigned: rows.length });
    }

    /** Görüşme kaydı — her arama AYRI satır, geçmiş korunur */
    if (req.method === 'POST' && op === 'save-survey') {
      const studentId = String(body.student_id || '').trim();
      if (!studentId) return res.status(400).json({ error: 'student_id_required' });

      if (!manager) {
        const { data: asg } = await supabaseAdmin
          .from(ASSIGN_TABLE)
          .select('agent_user_id')
          .eq('student_id', studentId)
          .maybeSingle();
        if (String(asg?.agent_user_id || '') !== String(actor.sub)) {
          return res.status(403).json({ error: 'forbidden', hint: 'Bu öğrenci size atanmamış.' });
        }
      }

      const row = {
        institution_id: institutionId,
        student_id: studentId,
        agent_user_id: actor.sub || null,
        call_result: String(body.call_result || 'completed'),
        call_back_at: body.call_back_at || null,
        q_lessons: body.q_lessons || null,
        q_lessons_note: String(body.q_lessons_note || '').trim() || null,
        q_coach: body.q_coach || null,
        q_coach_note: String(body.q_coach_note || '').trim() || null,
        q_tech: body.q_tech || null,
        q_tech_note: String(body.q_tech_note || '').trim() || null,
        tech_support_needed: body.tech_support_needed === true,
        q_recommend: body.q_recommend || null,
        general_note: String(body.general_note || '').trim() || null,
        action_required: body.action_required === true,
        action_type: body.action_required === true ? body.action_type || null : null,
        action_note: body.action_required === true ? String(body.action_note || '').trim() || null : null,
        action_due_at: body.action_required === true ? body.action_due_at || null : null,
        created_by: actor.sub || null
      };

      /**
       * Referans: paralel müşteri sistemi açılmaz, mevcut CRM lead yapısına
       * kayıt açılır ve id'si ankete yazılır.
       */
      const refName = String(body.referral_name || '').trim();
      const refPhone = String(body.referral_phone || '').trim();
      if (recommendOpensReferral(row.q_recommend) && (refName || refPhone)) {
        row.referral_name = refName || null;
        row.referral_phone = refPhone || null;
        row.referral_grade = String(body.referral_grade || '').trim() || null;
        row.referral_note = String(body.referral_note || '').trim() || null;
        try {
          const parts = refName.split(/\s+/).filter(Boolean);
          const { data: lead } = await supabaseAdmin
            .from('registration_leads')
            .insert({
              institution_id: institutionId,
              first_name: (parts[0] || 'Referans').slice(0, 80),
              last_name: (parts.slice(1).join(' ') || 'Aday').slice(0, 80),
              phone: refPhone || null,
              grade_program: row.referral_grade || 'unspecified',
              primary_status: 'tracking',
              stage: 'new_lead',
              temperature: 'warm',
              source: 'parent_referral',
              notes: [`Veli referansı (öğrenci: ${studentId})`, row.referral_note].filter(Boolean).join(' — ')
            })
            .select('id')
            .maybeSingle();
          if (lead?.id) row.referral_lead_id = lead.id;
        } catch (e) {
          console.warn('[parent-satisfaction] referans lead:', errorMessage(e));
        }
      }

      const { data, error } = await supabaseAdmin.from(SURVEY_TABLE).insert(row).select('id').maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, id: data?.id || null, referral_lead_id: row.referral_lead_id || null });
    }

    /** Geçmiş görüşmeler — hiçbir kayıt silinmez/üzerine yazılmaz */
    if (req.method === 'GET' && op === 'history') {
      const studentId = String(req.query?.student_id || '').trim();
      if (!studentId) return res.status(400).json({ error: 'student_id_required' });
      if (!manager) {
        const { data: asg } = await supabaseAdmin
          .from(ASSIGN_TABLE)
          .select('agent_user_id')
          .eq('student_id', studentId)
          .maybeSingle();
        if (String(asg?.agent_user_id || '') !== String(actor.sub)) {
          return res.status(403).json({ error: 'forbidden' });
        }
      }
      const { data, error } = await supabaseAdmin
        .from(SURVEY_TABLE)
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return res.status(500).json({ error: error.message });
      const nameById = await loadAgentNames((data || []).map((r) => r.agent_user_id));
      return res.status(200).json({
        ok: true,
        items: (data || []).map((r) => ({ ...r, agent_name: nameById[String(r.agent_user_id)] || null }))
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    if (/parent_call_|does not exist|schema cache/i.test(errorMessage(e))) {
      return res.status(503).json({
        error: 'table_missing',
        hint: 'sql/2026-09-29-parent-satisfaction.sql çalıştırın'
      });
    }
    return res.status(500).json({ error: errorMessage(e) });
  }
}
