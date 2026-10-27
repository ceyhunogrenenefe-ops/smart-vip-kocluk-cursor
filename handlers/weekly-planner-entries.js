import { requireAuth } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  actorIsStudentRole,
  assertStudentPlannerRead,
  assertStudentPlannerWrite,
  buildAccessContext
} from '../api/_lib/student-access-gate.js';

import {
  cakismalariAyikla,
  haftaBasi,
  planKopyasiUret,
  tarihKaydir,
  yazimIcinSadele
} from '../api/_lib/haftalik-plan-kopyala.js';

const padDate = (v) => String(v || '').trim().slice(0, 10);

const toMinutes = (t) => {
  const s = String(t || '').trim();
  const [h, m] = s.split(':').map((x) => parseInt(String(x || '0'), 10));
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
};

/** 00:00–01:59 gece yarısından sonra (23:00–01:00 blokları geçerli). */
const toPlannerMinutes = (t) => {
  const m = toMinutes(t);
  if (m == null) return null;
  const h = Math.floor(m / 60);
  if (h <= 2) return m + 24 * 60;
  return m;
};

/** Overlap inclusive intervals [start, end] in minutes — both ends inclusive for whole-hour UX */
function timeRangesOverlap(s1, e1, s2, e2) {
  return s1 < e2 && s2 < e1;
}

async function findOverlapConflict(studentId, plannerDate, startTime, endTime, excludeId) {
  const a1 = toPlannerMinutes(startTime);
  const b1 = toPlannerMinutes(endTime);
  if (a1 == null || b1 == null) return null;
  if (b1 <= a1) return { error: 'invalid_time_range' };

  const { data, error } = await supabaseAdmin
    .from('weekly_planner_entries')
    .select('id,start_time,end_time,title,subject')
    .eq('student_id', studentId)
    .eq('planner_date', plannerDate);
  if (error) throw error;
  for (const row of data || []) {
    if (excludeId && row.id === excludeId) continue;
    const ca = toPlannerMinutes(row.start_time);
    const cb = toPlannerMinutes(row.end_time);
    if (ca == null || cb == null) continue;
    if (cb <= ca) continue;
    if (timeRangesOverlap(a1, b1, ca, cb)) {
      return {
        conflictingId: row.id,
        conflicting: {
          id: row.id,
          title: row.title || row.subject || 'Plan',
          start_time: String(row.start_time || '').slice(0, 5),
          end_time: String(row.end_time || '').slice(0, 5)
        }
      };
    }
  }
  return null;
}

export default async function handler(req, res) {
  try {
    const ctx = await buildAccessContext(requireAuth(req));
    const { actor, roleSet } = ctx;
    const op = String(req.query.op || '').trim();

    if (req.method === 'GET') {
      const studentRaw = actorIsStudentRole(roleSet)
        ? String(actor.student_id || '')
        : String(req.query.student_id || '').trim();
      const from = padDate(req.query.from);
      const to = padDate(req.query.to);
      if (!studentRaw) return res.status(400).json({ error: 'student_id_required' });
      if (!from || !to) return res.status(400).json({ error: 'from_to_required' });

      const gate = await assertStudentPlannerRead(ctx, studentRaw);
      if (!gate.ok) return res.status(gate.status).json({ error: 'forbidden' });

      const { data, error } = await supabaseAdmin
        .from('weekly_planner_entries')
        .select('*')
        .eq('student_id', studentRaw)
        .gte('planner_date', from)
        .lte('planner_date', to)
        .order('planner_date', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    /**
     * HAFTALIK PLANI BASKA HAFTAYA AKTAR
     *
     * op=copy-week-preview  : hicbir sey yazmaz, ne olacagini dondurur
     * op=copy-week          : aktarir. mode: 'iptal' | 'birlestir' | 'degistir'
     *
     * Hedef haftada plan varsa ASLA dogrudan uzerine yazilmaz; kip
     * acikca secilmek zorundadir. Varsayilan 'iptal'dir.
     */
    if (req.method === 'POST' && (op === 'copy-week' || op === 'copy-week-preview')) {
      const body = req.body || {};
      const sid = actorIsStudentRole(roleSet)
        ? String(actor.student_id || '')
        : String(body.student_id || body.studentId || '').trim();
      if (!sid) return res.status(400).json({ error: 'student_id_required' });

      // Aktarim yalnizca SECILEN ogrenci icin; yazma yetkisi her iki opta da aranir
      const mutate = await assertStudentPlannerWrite(ctx, sid);
      if (!mutate.ok) return res.status(mutate.status).json({ error: 'forbidden' });

      const kaynakHafta = haftaBasi(padDate(body.source_week || body.sourceWeek));
      const hedefHafta = haftaBasi(padDate(body.target_week || body.targetWeek));
      if (!kaynakHafta || !hedefHafta) return res.status(400).json({ error: 'week_required' });
      if (kaynakHafta === hedefHafta) return res.status(400).json({ error: 'same_week' });

      const kaynakSon = tarihKaydir(kaynakHafta, 6);
      const hedefSon = tarihKaydir(hedefHafta, 6);

      const [{ data: kaynakSatirlar, error: kErr }, { data: hedefSatirlar, error: hErr }] =
        await Promise.all([
          supabaseAdmin
            .from('weekly_planner_entries')
            .select('*')
            .eq('student_id', sid)
            .gte('planner_date', kaynakHafta)
            .lte('planner_date', kaynakSon)
            .order('planner_date', { ascending: true }),
          supabaseAdmin
            .from('weekly_planner_entries')
            .select('*')
            .eq('student_id', sid)
            .gte('planner_date', hedefHafta)
            .lte('planner_date', hedefSon)
            .order('planner_date', { ascending: true })
        ]);
      if (kErr) throw kErr;
      if (hErr) throw hErr;

      if (!(kaynakSatirlar || []).length) {
        return res.status(400).json({ error: 'source_week_empty', message: 'Kaynak haftada görev yok.' });
      }

      const uretim = planKopyasiUret(kaynakSatirlar || [], {
        kaynakHaftaBasi: kaynakHafta,
        hedefHaftaBasi: hedefHafta
      });
      if (uretim.hata) return res.status(400).json({ error: uretim.hata });

      /**
       * Hedefler de aktarıldıysa (istemci önce hedefleri yeni haftaya kopyalar)
       * goal_id_map {eskiHedefId: yeniHedefId} ile bloklar yeni hedeflere bağlanır.
       * Yeni hedef kimlikleri yalnızca bu öğrenciye aitse kabul edilir.
       */
      const hamHarita =
        body.goal_id_map && typeof body.goal_id_map === 'object' && !Array.isArray(body.goal_id_map)
          ? body.goal_id_map
          : null;
      if (hamHarita) {
        const yeniIdler = [...new Set(Object.values(hamHarita).map((v) => String(v || '').trim()).filter(Boolean))];
        let gecerli = new Set();
        if (yeniIdler.length) {
          const { data: hedefRows, error: gErr } = await supabaseAdmin
            .from('coach_weekly_goals')
            .select('id')
            .eq('student_id', sid)
            .in('id', yeniIdler);
          if (gErr) throw gErr;
          gecerli = new Set((hedefRows || []).map((r) => String(r.id)));
        }
        const kaynakHedef = new Map((kaynakSatirlar || []).map((r) => [String(r.id), r.coach_goal_id || null]));
        for (const k of uretim.kopyalar) {
          const eski = kaynakHedef.get(String(k._kaynak_id));
          const yeni = eski ? String(hamHarita[eski] || '') : '';
          if (yeni && gecerli.has(yeni)) k.coach_goal_id = yeni;
        }
      }

      const mevcutSayi = (hedefSatirlar || []).length;
      const { eklenecek, cakisan } = cakismalariAyikla(uretim.kopyalar, hedefSatirlar || []);

      const ozet = {
        source_week: kaynakHafta,
        target_week: hedefHafta,
        source_count: (kaynakSatirlar || []).length,
        target_existing_count: mevcutSayi,
        copy_count: uretim.kopyalar.length,
        skipped_invalid: uretim.atlanan,
        conflict_count: cakisan.length,
        mergeable_count: eklenecek.length
      };

      if (op === 'copy-week-preview') {
        return res.status(200).json({
          data: {
            ...ozet,
            preview: uretim.kopyalar,
            conflicts: cakisan.map((c) => ({
              planner_date: c.kopya.planner_date,
              start_time: c.kopya.start_time,
              end_time: c.kopya.end_time,
              title: c.kopya.title,
              existing_title: c.mevcut.title,
              existing_start: c.mevcut.start_time,
              existing_end: c.mevcut.end_time
            })),
            existing: hedefSatirlar || []
          }
        });
      }

      const mode = String(body.mode || 'iptal').trim();
      if (mevcutSayi > 0 && mode === 'iptal') {
        return res.status(409).json({ error: 'target_week_not_empty', data: ozet });
      }
      if (!['iptal', 'birlestir', 'degistir'].includes(mode)) {
        return res.status(400).json({ error: 'invalid_mode' });
      }

      let silinen = 0;
      let yazilacak = uretim.kopyalar;

      if (mevcutSayi > 0 && mode === 'birlestir') {
        // Cakisan saatler korunur: mevcut gorev silinmez, kopyasi eklenmez
        yazilacak = eklenecek;
      }

      if (mevcutSayi > 0 && mode === 'degistir') {
        /**
         * Yalniz PLAN satirlari silinir. weekly_entries (gerceklesen
         * calisma) ayri tabloda durur ve bu islemden etkilenmez.
         */
        const silinecekIdler = (hedefSatirlar || []).map((r) => r.id).filter(Boolean);
        if (silinecekIdler.length) {
          const { error: dErr } = await supabaseAdmin
            .from('weekly_planner_entries')
            .delete()
            .eq('student_id', sid)
            .in('id', silinecekIdler);
          if (dErr) throw dErr;
          silinen = silinecekIdler.length;
        }
      }

      if (!yazilacak.length) {
        return res.status(200).json({ data: { ...ozet, inserted: 0, deleted: silinen, mode } });
      }

      const now = new Date().toISOString();
      const satirlar = yazilacak.map((k) => ({
        ...yazimIcinSadele(k),
        student_id: sid,
        institution_id: k.institution_id ?? mutate.student?.institution_id ?? actor.institution_id ?? null,
        created_at: now,
        updated_at: now
      }));

      const { data: eklenen, error: iErr } = await supabaseAdmin
        .from('weekly_planner_entries')
        .insert(satirlar)
        .select();
      if (iErr) throw iErr;

      return res.status(200).json({
        data: { ...ozet, inserted: (eklenen || []).length, deleted: silinen, mode, entries: eklenen || [] }
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const sid = actorIsStudentRole(roleSet)
        ? String(actor.student_id || '')
        : String(body.student_id || body.studentId || '').trim();
      if (!sid) return res.status(400).json({ error: 'student_id_required' });

      const mutate = await assertStudentPlannerWrite(ctx, sid);
      if (!mutate.ok) return res.status(mutate.status).json({ error: 'forbidden' });

      const plannerDate = padDate(body.planner_date ?? body.plannerDate ?? body.date);
      const startTime = String(body.start_time ?? body.startTime ?? '').trim();
      const endTime = String(body.end_time ?? body.endTime ?? '').trim();
      const subject = String(body.subject ?? '').trim();
      const title =
        String(body.title ?? '').trim() ||
        (subject ? `${subject} çalışması` : 'Görev');
      const plannedQty = Number(body.planned_quantity ?? body.plannedQuantity ?? 0);
      const completedQty = Number(body.completed_quantity ?? body.completedQuantity ?? 0);
      let status = String(body.status || 'planned');
      const coachGoalId = body.coach_goal_id || body.coachGoalId || null;

      const allowedStatus = ['planned', 'completed', 'partial', 'missed'];
      if (!allowedStatus.includes(status)) status = 'planned';

      if (!plannerDate || !startTime || !endTime) return res.status(400).json({ error: 'date_time_required' });

      const clash = await findOverlapConflict(sid, plannerDate, startTime, endTime, null);
      if (clash?.error) return res.status(400).json({ error: clash.error });
      if (clash?.conflictingId) {
        return res
          .status(409)
          .json({ error: 'time_conflict', conflicting_id: clash.conflictingId, conflicting: clash.conflicting });
      }

      const institutionId =
        body.institution_id ?? mutate.student?.institution_id ?? actor.institution_id ?? null;

      const id =
        body.id && String(body.id).trim()
          ? String(body.id).trim()
          : `wpe-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const now = new Date().toISOString();

      const row = {
        id,
        student_id: sid,
        institution_id: institutionId,
        coach_goal_id: coachGoalId,
        subject,
        title,
        planned_quantity: Number.isFinite(plannedQty) && plannedQty >= 0 ? plannedQty : 0,
        completed_quantity: Number.isFinite(completedQty) && completedQty >= 0 ? completedQty : 0,
        planner_date: plannerDate,
        start_time: startTime,
        end_time: endTime,
        status,
        created_at: now,
        updated_at: now
      };

      const { data, error } = await supabaseAdmin.from('weekly_planner_entries').insert(row).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: exErr } = await supabaseAdmin
        .from('weekly_planner_entries')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });

      const mutate = await assertStudentPlannerWrite(ctx, existing.student_id);
      if (!mutate.ok) return res.status(mutate.status).json({ error: 'forbidden' });

      const merged = {
        planner_date: padDate(existing.planner_date),
        start_time: existing.start_time,
        end_time: existing.end_time,
        ...(req.body || {})
      };
      const nextDate =
        merged.planner_date ??
        merged.plannerDate ??
        merged.date ??
        padDate(existing.planner_date);
      const nextStart = String(
        merged.start_time ?? merged.startTime ?? existing.start_time
      ).trim();
      const nextEnd = String(
        merged.end_time ?? merged.endTime ?? existing.end_time
      ).trim();

      const clash = await findOverlapConflict(existing.student_id, nextDate, nextStart, nextEnd, id);
      if (clash?.error) return res.status(400).json({ error: clash.error });
      if (clash?.conflictingId) {
        return res
          .status(409)
          .json({ error: 'time_conflict', conflicting_id: clash.conflictingId, conflicting: clash.conflicting });
      }

      const patch = { ...(req.body || {}), updated_at: new Date().toISOString() };
      if (merged.plannerDate !== undefined || merged.planner_date !== undefined || merged.date !== undefined) {
        patch.planner_date = nextDate;
        delete patch.date;
        delete patch.plannerDate;
      }
      delete patch.student_id;
      delete patch.created_at;

      const { data, error } = await supabaseAdmin
        .from('weekly_planner_entries')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: exErr } = await supabaseAdmin
        .from('weekly_planner_entries')
        .select('id,student_id')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });

      const mutate = await assertStudentPlannerWrite(ctx, existing.student_id);
      if (!mutate.ok) return res.status(mutate.status).json({ error: 'forbidden' });

      const { error } = await supabaseAdmin.from('weekly_planner_entries').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[weekly-planner-entries]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
