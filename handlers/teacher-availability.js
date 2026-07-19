/**
 * Öğretmen haftalık müsaitlik (özel ders vitrini — koçluk derslerinden bağımsız)
 * GET    /api/teacher-availability
 * POST   /api/teacher-availability?op=upsert|delete|close-day|exception|copy-week
 * GET    /api/teacher-availability?op=slots  (kendi önizleme)
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  assertNoOverlap,
  computePublicSlots,
  loadAvailabilityBundle
} from '../api/_lib/teacher-availability.js';

function jwtHasRole(actor, role) {
  const want = String(role || '').toLowerCase();
  if (String(actor?.role || '').toLowerCase() === want) return true;
  if (Array.isArray(actor?.roles) && actor.roles.some((r) => String(r || '').toLowerCase() === want)) {
    return true;
  }
  return false;
}

async function isTeacherLike(actor) {
  if (jwtHasRole(actor, 'teacher') || jwtHasRole(actor, 'coach')) return true;
  try {
    const roles = await actorRoleSet(actor);
    const list = roles instanceof Set ? [...roles] : Array.isArray(roles) ? roles : [];
    return list.map(String).some((r) => r === 'teacher' || r === 'coach');
  } catch (_) {
    return false;
  }
}

async function profileForUser(uid) {
  const { data } = await supabaseAdmin
    .from('teacher_profiles')
    .select('id, user_id, status, is_active, deleted_at')
    .eq('user_id', uid)
    .is('deleted_at', null)
    .maybeSingle();
  return data;
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    if (!(await isTeacherLike(actor))) return res.status(403).json({ error: 'forbidden' });
    const uid = String(actor.sub || '');
    const profile = await profileForUser(uid);
    if (!profile) return res.status(400).json({ error: 'profile_required' });

    const op = String(req.query.op || '').trim();

    if (req.method === 'GET' && (op === 'slots' || op === '')) {
      const bundle = await loadAvailabilityBundle(uid);
      if (op === 'slots') {
        return res.status(200).json({
          slots: computePublicSlots(bundle),
          rules: bundle.rules,
          exceptions: bundle.exceptions
        });
      }
      return res.status(200).json({
        rules: bundle.rules,
        exceptions: bundle.exceptions,
        bookings: bundle.bookings
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const body = req.body || {};

    if (op === 'upsert') {
      const day = Number(body.day_of_week);
      const start = String(body.start_time || '').slice(0, 5);
      const end = String(body.end_time || '').slice(0, 5);
      const dur = Number(body.slot_duration_min) || 60;
      const id = body.id ? String(body.id) : null;
      if (!(day >= 0 && day <= 6)) return res.status(400).json({ error: 'invalid_day' });

      const { data: existing } = await supabaseAdmin
        .from('teacher_availability')
        .select('*')
        .eq('teacher_id', uid)
        .eq('day_of_week', day)
        .eq('is_active', true);
      try {
        assertNoOverlap(existing || [], start, end, id);
      } catch (e) {
        return res.status(400).json({ error: errorMessage(e) });
      }

      const row = {
        teacher_id: uid,
        profile_id: profile.id,
        day_of_week: day,
        start_time: start,
        end_time: end === '00:00' ? '00:00' : end,
        slot_duration_min: dur,
        is_active: true,
        timezone: 'Europe/Istanbul',
        updated_at: new Date().toISOString()
      };

      let saved;
      if (id) {
        const { data, error } = await supabaseAdmin
          .from('teacher_availability')
          .update(row)
          .eq('id', id)
          .eq('teacher_id', uid)
          .select('*')
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from('teacher_availability')
          .insert({ ...row, created_at: new Date().toISOString() })
          .select('*')
          .single();
        if (error) throw error;
        saved = data;
      }
      return res.status(200).json({ rule: saved });
    }

    if (op === 'delete') {
      const id = String(body.id || '');
      if (!id) return res.status(400).json({ error: 'id_required' });

      // Dolu rezervasyon uyarısı
      const { data: rule } = await supabaseAdmin
        .from('teacher_availability')
        .select('*')
        .eq('id', id)
        .eq('teacher_id', uid)
        .maybeSingle();
      if (!rule) return res.status(404).json({ error: 'not_found' });

      const force = !!body.force;
      if (!force) {
        const bundle = await loadAvailabilityBundle(uid);
        const slots = computePublicSlots(bundle).filter(
          (s) => s.day_of_week === rule.day_of_week && s.status === 'busy'
        );
        if (slots.length) {
          return res.status(409).json({
            error: 'has_bookings',
            message: 'Bu aralıkta dolu randevu var. Otomatik iptal edilmez. force=true ile yine de kapatabilirsiniz.',
            busy_count: slots.length
          });
        }
      }

      const { error } = await supabaseAdmin
        .from('teacher_availability')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('teacher_id', uid);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (op === 'close-day') {
      const date = String(body.exception_date || body.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid_date' });
      const { data, error } = await supabaseAdmin
        .from('teacher_availability_exceptions')
        .insert({
          teacher_id: uid,
          profile_id: profile.id,
          exception_date: date,
          exception_type: 'unavailable',
          reason: String(body.reason || 'Kapalı gün').slice(0, 200),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ exception: data });
    }

    if (op === 'exception') {
      const date = String(body.exception_date || '').slice(0, 10);
      const type = String(body.exception_type || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid_date' });
      if (!['available', 'unavailable'].includes(type)) return res.status(400).json({ error: 'invalid_type' });
      const { data, error } = await supabaseAdmin
        .from('teacher_availability_exceptions')
        .insert({
          teacher_id: uid,
          profile_id: profile.id,
          exception_date: date,
          start_time: body.start_time ? String(body.start_time).slice(0, 5) : null,
          end_time: body.end_time ? String(body.end_time).slice(0, 5) : null,
          exception_type: type,
          reason: body.reason ? String(body.reason).slice(0, 200) : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ exception: data });
    }

    if (op === 'copy-week') {
      // Mevcut aktif kuralları olduğu gibi bırak; istemci tekrar upsert eder.
      // Sunucu: weeks_ahead kadar aynı günlere exception available kopyalamaz —
      // haftalık kurallar zaten tekrar eder. Bu op no-op başarı.
      return res.status(200).json({
        ok: true,
        message: 'Haftalık kurallar her hafta otomatik uygulanır. İstisna için close-day / exception kullanın.'
      });
    }

    return res.status(400).json({ error: 'unknown_op' });
  } catch (e) {
    const msg = errorMessage(e);
    if (msg.includes('Unauthorized') || /\bauth\b/i.test(msg)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[teacher-availability]', msg);
    return res.status(500).json({ error: 'server_error', message: msg });
  }
}
