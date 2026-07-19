/**
 * Public özel ders rezervasyonu (çift rezervasyon korumalı)
 * POST /api/public-teacher-book
 * Body: { slug, starts_at, ends_at, student_name, student_email, student_phone, notes }
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { computePublicSlots, loadAvailabilityBundle } from '../api/_lib/teacher-availability.js';

function applyCors(req, res) {
  const allowed = String(
    process.env.PUBLIC_TEACHERS_CORS_ORIGIN ||
      'https://onlinevipdershane.com,https://www.onlinevipdershane.com'
  )
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const body = req.body || {};
    const slug = String(body.slug || '').trim();
    const startsAt = String(body.starts_at || '').trim();
    const endsAt = String(body.ends_at || '').trim();
    if (!slug || !startsAt || !endsAt) {
      return res.status(400).json({ error: 'slug_and_slot_required' });
    }

    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !(start < end)) {
      return res.status(400).json({ error: 'invalid_slot' });
    }
    if (start.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'slot_in_past' });
    }

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('teacher_profiles')
      .select('*')
      .eq('slug', slug)
      .in('status', ['published', 'update_pending', 'changes_pending'])
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!profile?.published_snapshot) return res.status(404).json({ error: 'not_found' });
    if (profile.status === 'passive' || profile.status === 'deleted') {
      return res.status(400).json({ error: 'profile_not_bookable' });
    }

    const teacherId = profile.user_id;
    const bundle = await loadAvailabilityBundle(teacherId);
    const slots = computePublicSlots(bundle);
    const match = slots.find(
      (s) =>
        s.status === 'free' &&
        s.starts_at &&
        Math.abs(new Date(s.starts_at).getTime() - start.getTime()) < 1000
    );
    if (!match) {
      return res.status(409).json({ error: 'slot_unavailable' });
    }

    const { data: booking, error } = await supabaseAdmin
      .from('teacher_private_bookings')
      .insert({
        teacher_id: teacherId,
        profile_id: profile.id,
        student_name: String(body.student_name || '').slice(0, 120) || null,
        student_email: String(body.student_email || '').slice(0, 200) || null,
        student_phone: String(body.student_phone || '').slice(0, 40) || null,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: 'confirmed',
        source: 'site',
        notes: body.notes ? String(body.notes).slice(0, 500) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) {
      // unique violation
      if (String(error.code) === '23505' || /duplicate|unique/i.test(String(error.message))) {
        return res.status(409).json({ error: 'slot_already_taken' });
      }
      throw error;
    }

    return res.status(201).json({ booking: { id: booking.id, starts_at: booking.starts_at, ends_at: booking.ends_at } });
  } catch (e) {
    console.error('[public-teacher-book]', errorMessage(e));
    return res.status(500).json({ error: 'server_error' });
  }
}
