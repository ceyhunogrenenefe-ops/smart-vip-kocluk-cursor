/**
 * CRM > Etkinlik Formları (yetkili)
 *   GET    /api/event-forms                      → kurumun etkinlikleri + form/hatırlatma özeti
 *   GET    /api/event-forms?id=…                 → etkinlik + katılımcılar + hatırlatma durumları
 *   GET    /api/event-forms?op=templates         → WhatsApp şablonları
 *   GET    /api/event-forms?op=slug-check&slug=… → link adı uygun mu
 *   POST   /api/event-forms?op=save              → etkinlik + form + hatırlatmalar (oluştur/güncelle)
 *   POST   /api/event-forms?op=delete-participant&id=…&participant_id=…
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { actorRoleSet } from '../api/_lib/actor-roles.js';
import {
  DEFAULT_REMINDERS,
  DEFAULT_REMINDER_TEMPLATE,
  describeReminder,
  isValidSlug,
  normalizeFormSettings,
  normalizeReminderInput,
  reminderFireMs,
  slugifyTr
} from '../api/_lib/event-form-logic.js';

const ALLOWED_ROLES = ['super_admin', 'admin', 'crm_agent', 'coach'];
const PLATFORM_PRIMARY_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';
const SCHEMA_HINT = 'Supabase SQL Editor\'da sql/2026-11-03-event-forms-reminders.sql dosyasını çalıştırın.';

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

function isSchemaError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    msg.includes('form_slug') ||
    msg.includes('form_settings') ||
    msg.includes('institution_event_reminder')
  );
}

function fail(res, e, fallback = 'failed') {
  if (isSchemaError(e)) {
    return res.status(400).json({ error: 'schema_missing', detail: errorMessage(e), hint: SCHEMA_HINT });
  }
  return res.status(500).json({ error: errorMessage(e) || fallback });
}

async function resolveInstitution(actor, roles, req, body) {
  const requested = String(body?.institution_id || req.query?.institution_id || '').trim() || null;
  if (roles.has('super_admin')) return requested || actor.institution_id || PLATFORM_PRIMARY_INSTITUTION_ID;
  if (actor.institution_id) return String(actor.institution_id);
  const { data: u } = await supabaseAdmin.from('users').select('institution_id').eq('id', actor.sub).maybeSingle();
  return u?.institution_id ? String(u.institution_id) : null;
}

async function loadReminders(eventIds) {
  if (!eventIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from('institution_event_reminders')
    .select('*')
    .in('event_id', eventIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function slugTaken(slug, exceptEventId) {
  let q = supabaseAdmin.from('institution_events').select('id').ilike('form_slug', slug);
  if (exceptEventId) q = q.neq('id', exceptEventId);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function uniqueSlug(base, exceptEventId) {
  let candidate = base;
  for (let i = 2; i < 50; i += 1) {
    if (!(await slugTaken(candidate, exceptEventId))) return candidate;
    candidate = `${base.slice(0, 55)}-${i}`;
  }
  return `${base.slice(0, 50)}-${Date.now().toString(36)}`;
}

function sortReminders(event, list) {
  return [...list].sort((a, b) => (reminderFireMs(event, a) ?? 0) - (reminderFireMs(event, b) ?? 0));
}

async function loadDetail(id, institutionId, isSuper) {
  const { data: event, error } = await supabaseAdmin.from('institution_events').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!event) return null;
  if (!isSuper && event.institution_id !== institutionId) return null;

  const [{ data: participants, error: pErr }, reminders] = await Promise.all([
    supabaseAdmin
      .from('institution_event_participants')
      .select('*')
      .eq('event_id', id)
      .order('created_at', { ascending: false }),
    loadReminders([id])
  ]);
  if (pErr) throw pErr;

  const reminderIds = reminders.map((r) => r.id);
  let sends = [];
  if (reminderIds.length) {
    const { data, error: sErr } = await supabaseAdmin
      .from('institution_event_reminder_sends')
      .select('reminder_id, participant_id, status, error, sent_at')
      .in('reminder_id', reminderIds);
    if (sErr) throw sErr;
    sends = data || [];
  }
  const nowMs = Date.now();
  const remindersOut = sortReminders(event, reminders).map((r) => {
    const mine = sends.filter((s) => s.reminder_id === r.id);
    const fire = reminderFireMs(event, r);
    return {
      ...r,
      label: describeReminder(r),
      fire_at: fire != null ? new Date(fire).toISOString() : null,
      state: !r.enabled ? 'disabled' : fire == null ? 'invalid' : fire > nowMs ? 'waiting' : 'done',
      stats: {
        sent: mine.filter((s) => s.status === 'sent').length,
        failed: mine.filter((s) => s.status === 'failed').length,
        skipped: mine.filter((s) => s.status === 'skipped').length
      }
    };
  });
  const byParticipant = {};
  for (const s of sends) {
    (byParticipant[s.participant_id] ||= []).push({ reminder_id: s.reminder_id, status: s.status, error: s.error });
  }
  return {
    ...event,
    form_settings: normalizeFormSettings(event.form_settings),
    reminders: remindersOut,
    participants: (participants || []).map((p) => ({ ...p, reminder_sends: byParticipant[p.id] || [] }))
  };
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch (e) {
    return res.status(401).json({ error: errorMessage(e) || 'Missing token' });
  }
  const roles = await actorRoleSet(actor);
  if (!ALLOWED_ROLES.some((r) => roles.has(r))) {
    return res.status(403).json({ error: 'forbidden', hint: 'Yalnızca yönetici, CRM temsilcisi ve koç.' });
  }
  const isSuper = roles.has('super_admin');
  const body = req.method === 'POST' ? parseBody(req) : null;
  const institutionId = await resolveInstitution(actor, roles, req, body);
  if (!institutionId) return res.status(400).json({ error: 'institution_required' });

  const op = String(req.query?.op || body?.op || '').trim();
  const id = String(req.query?.id || body?.id || '').trim();

  try {
    if (req.method === 'GET' && op === 'templates') {
      const { data, error } = await supabaseAdmin
        .from('message_templates')
        .select('type, name, content, variables, whatsapp_template_status, channel, is_active, institution_id')
        .order('name');
      if (error) throw error;
      const list = (data || []).filter(
        (t) =>
          t.is_active !== false &&
          (!t.institution_id || t.institution_id === institutionId) &&
          (!t.whatsapp_template_status || String(t.whatsapp_template_status).toUpperCase() === 'APPROVED')
      );
      return res.status(200).json({ data: list, default_type: DEFAULT_REMINDER_TEMPLATE });
    }

    if (req.method === 'GET' && op === 'slug-check') {
      const slug = slugifyTr(req.query?.slug || '');
      if (!isValidSlug(slug)) return res.status(200).json({ ok: false, slug, reason: 'invalid' });
      const taken = await slugTaken(slug, id || null);
      return res.status(200).json({ ok: !taken, slug, reason: taken ? 'taken' : null });
    }

    if (req.method === 'GET' && id) {
      const detail = await loadDetail(id, institutionId, isSuper);
      if (!detail) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ data: detail });
    }

    if (req.method === 'GET') {
      const { data: events, error } = await supabaseAdmin
        .from('institution_events')
        .select('id, title, event_date, event_time, meeting_link, template_type, form_enabled, form_slug, form_settings, created_at')
        .eq('institution_id', institutionId)
        .order('event_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const ids = (events || []).map((e) => e.id);
      const [{ data: parts }, reminders] = await Promise.all([
        ids.length
          ? supabaseAdmin.from('institution_event_participants').select('event_id, kvkk_accepted_at').in('event_id', ids)
          : Promise.resolve({ data: [] }),
        loadReminders(ids)
      ]);
      const out = (events || []).map((e) => {
        const p = (parts || []).filter((x) => x.event_id === e.id);
        const r = reminders.filter((x) => x.event_id === e.id && x.enabled);
        return {
          ...e,
          has_link: Boolean(String(e.meeting_link || '').trim()),
          meeting_link: undefined,
          form_settings: normalizeFormSettings(e.form_settings),
          participant_count: p.length,
          form_signup_count: p.filter((x) => x.kvkk_accepted_at).length,
          reminder_count: r.length
        };
      });
      return res.status(200).json({ data: out });
    }

    if (req.method === 'POST' && op === 'delete-participant') {
      const pid = String(req.query?.participant_id || body?.participant_id || '').trim();
      if (!id || !pid) return res.status(400).json({ error: 'id_required' });
      const detail = await loadDetail(id, institutionId, isSuper);
      if (!detail) return res.status(404).json({ error: 'not_found' });
      const { error } = await supabaseAdmin
        .from('institution_event_participants')
        .delete()
        .eq('id', pid)
        .eq('event_id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'POST' && op === 'save') {
      const title = String(body.title || '').trim().slice(0, 200);
      if (!title) return res.status(400).json({ error: 'title_required', hint: 'Etkinlik adı girin.' });
      const event_date = body.event_date ? String(body.event_date).slice(0, 10) : null;
      const event_time = body.event_time ? `${String(body.event_time).slice(0, 5)}:00` : null;
      const form_enabled = body.form_enabled !== false;
      if (form_enabled && (!event_date || !event_time)) {
        return res.status(400).json({ error: 'date_required', hint: 'Form ve hatırlatmalar için tarih ve saat gerekli.' });
      }

      let existing = null;
      if (id) {
        const { data, error } = await supabaseAdmin.from('institution_events').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!data || (!isSuper && data.institution_id !== institutionId)) {
          return res.status(404).json({ error: 'not_found' });
        }
        existing = data;
      }

      let form_slug = existing?.form_slug || null;
      const requestedSlug = slugifyTr(body.form_slug || '');
      if (requestedSlug) {
        if (!isValidSlug(requestedSlug)) {
          return res.status(400).json({ error: 'slug_invalid', hint: 'Link adı en az 3 karakter; harf, rakam ve tire.' });
        }
        if (await slugTaken(requestedSlug, existing?.id || null)) {
          return res.status(409).json({ error: 'slug_taken', hint: 'Bu link adı başka bir etkinlikte kullanılıyor.' });
        }
        form_slug = requestedSlug;
      } else if (form_enabled && !form_slug) {
        form_slug = await uniqueSlug(slugifyTr(title) || 'etkinlik', existing?.id || null);
      }

      const nowIso = new Date().toISOString();
      const row = {
        title,
        description: String(body.description || '').trim() || null,
        event_date,
        event_time,
        location: String(body.location || '').trim() || null,
        meeting_link: String(body.meeting_link || '').trim() || null,
        template_type: String(body.template_type || '').trim() || existing?.template_type || DEFAULT_REMINDER_TEMPLATE,
        form_enabled,
        form_slug,
        form_settings: normalizeFormSettings(body.form_settings),
        updated_at: nowIso
      };

      let eventId = existing?.id;
      if (existing) {
        const { error } = await supabaseAdmin.from('institution_events').update(row).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseAdmin
          .from('institution_events')
          .insert({
            ...row,
            institution_id: institutionId,
            send_mode: 'manual',
            schedule_status: 'idle',
            template_vars: {},
            seminar_auto_send: false,
            created_by: actor.sub,
            created_at: nowIso
          })
          .select('id')
          .maybeSingle();
        if (error) throw error;
        eventId = data.id;
      }

      // Hatırlatmalar: id'li olanlar güncellenir, yeniler eklenir, listede olmayanlar silinir.
      // (Gönderim kaydı silinmesin diye mevcut kurallar yerinde güncellenir.)
      const inputList = Array.isArray(body.reminders)
        ? body.reminders
        : existing
          ? null
          : DEFAULT_REMINDERS.map((r) => ({ ...r }));
      if (inputList) {
        const current = await loadReminders([eventId]);
        const keepIds = new Set();
        for (const raw of inputList.slice(0, 10)) {
          const r = normalizeReminderInput(raw);
          if (!r) continue;
          const rid = String(raw.id || '').trim();
          if (rid && current.some((c) => c.id === rid)) {
            keepIds.add(rid);
            const { error } = await supabaseAdmin
              .from('institution_event_reminders')
              .update({ ...r, updated_at: nowIso })
              .eq('id', rid);
            if (error) throw error;
          } else {
            const { data, error } = await supabaseAdmin
              .from('institution_event_reminders')
              .insert({ ...r, event_id: eventId })
              .select('id')
              .maybeSingle();
            if (error) throw error;
            if (data?.id) keepIds.add(data.id);
          }
        }
        const toDelete = current.filter((c) => !keepIds.has(c.id)).map((c) => c.id);
        if (toDelete.length) {
          const { error } = await supabaseAdmin.from('institution_event_reminders').delete().in('id', toDelete);
          if (error) throw error;
        }
      }

      const detail = await loadDetail(eventId, institutionId, true);
      return res.status(existing ? 200 : 201).json({ data: detail });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.warn('[event-forms-admin]', errorMessage(e));
    return fail(res, e);
  }
}
