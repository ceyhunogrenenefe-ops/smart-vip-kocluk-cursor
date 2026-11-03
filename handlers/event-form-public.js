/**
 * Herkese açık etkinlik kayıt formu
 *   GET  /api/event-form?slug=paragraf-etkinligi  → form + etkinlik özeti + KVKK metni
 *   POST /api/event-form?slug=paragraf-etkinligi  → kayıt (veli adı, öğrenci adı, telefon, KVKK)
 *
 * Yetki istemez. Yalnız formun ve etkinliğin kamuya açık bilgilerini döner;
 * katılım linki ve katılımcı verisi bu uçtan çıkmaz.
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { sendEventInvites, resolveEventMeetingLink, templateBindingsNeedLink } from '../api/_lib/institution-event-send.js';
import { ingestSiteLead } from '../api/_lib/site-leads.js';
import {
  GRADE_OPTIONS,
  eventStartMs,
  isValidSlug,
  normalizeFormSettings,
  validateSubmission
} from '../api/_lib/event-form-logic.js';

const MAX_SUBMITS_PER_IP_10MIN = 8;
/** Etkinlik başladıktan bu kadar sonra form otomatik kapanır */
const CLOSE_AFTER_START_MS = 60 * 60 * 1000;
const MAX_LOGO_CHARS = 400_000;

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

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.headers['x-real-ip'] || '').trim() || null;
}

function formatTrDate(isoDate) {
  const s = String(isoDate || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return '';
  return `${d}.${m}.${y}`;
}

async function loadFormEvent(slug) {
  const { data, error } = await supabaseAdmin
    .from('institution_events')
    .select('*')
    .ilike('form_slug', slug)
    .eq('form_enabled', true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function isClosed(event, settings, nowMs = Date.now()) {
  if (settings.closed) return true;
  if (event.schedule_status === 'cancelled') return true;
  const start = eventStartMs(event);
  if (start != null && nowMs > start + CLOSE_AFTER_START_MS) return true;
  return false;
}

async function loadInstitutionPublic(institutionId) {
  if (!institutionId) return { name: '', logo: null, kvkk_text: '', kvkk_url: '' };
  const [{ data: inst }, { data: legal }] = await Promise.all([
    supabaseAdmin.from('institutions').select('name, logo').eq('id', institutionId).maybeSingle(),
    supabaseAdmin
      .from('parent_sign_institution_legal')
      .select('kvkk_aydinlatma, kvkk_doc_url')
      .eq('institution_id', institutionId)
      .maybeSingle()
  ]);
  const logo = String(inst?.logo || '');
  return {
    name: String(inst?.name || ''),
    logo: logo && logo.length <= MAX_LOGO_CHARS ? logo : null,
    kvkk_text: String(legal?.kvkk_aydinlatma || ''),
    kvkk_url: String(legal?.kvkk_doc_url || '')
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const slug = String(req.query?.slug || '').trim().toLowerCase();
  if (!isValidSlug(slug)) return res.status(404).json({ error: 'not_found' });

  let event;
  try {
    event = await loadFormEvent(slug);
  } catch (e) {
    console.warn('[event-form] load', errorMessage(e));
    return res.status(500).json({ error: 'load_failed' });
  }
  if (!event) return res.status(404).json({ error: 'not_found' });

  const settings = normalizeFormSettings(event.form_settings);

  if (req.method === 'GET') {
    const inst = await loadInstitutionPublic(event.institution_id);
    return res.status(200).json({
      ok: true,
      institution: { name: inst.name, logo: inst.logo },
      event: {
        title: event.title,
        description: event.description || '',
        date: formatTrDate(event.event_date),
        time: String(event.event_time || '').slice(0, 5),
        location: event.location || ''
      },
      form: {
        heading: settings.heading || event.title,
        intro: settings.intro,
        button_label: settings.button_label,
        success_message: settings.success_message,
        fields: settings.fields,
        grade_options: GRADE_OPTIONS,
        kvkk_text: settings.kvkk_text || inst.kvkk_text,
        kvkk_url: settings.kvkk_url || inst.kvkk_url,
        contact_consent: settings.contact_consent,
        closed: isClosed(event, settings),
        closed_message: settings.closed_message
      }
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = parseBody(req);
  // Bot tuzağı: görünmez alan doluysa sessizce "başarılı" dön
  if (String(body.website || '').trim()) return res.status(200).json({ ok: true });

  if (isClosed(event, settings)) {
    return res.status(409).json({ error: 'closed', message: settings.closed_message });
  }

  const v = validateSubmission(body, settings);
  if (!v.ok) return res.status(400).json({ error: 'invalid', errors: v.errors });
  const d = v.data;
  const ip = clientIp(req);

  try {
    if (ip) {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('institution_event_participants')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('form_meta->>ip', ip)
        .gte('created_at', since);
      if ((count || 0) >= MAX_SUBMITS_PER_IP_10MIN) {
        return res.status(429).json({ error: 'too_many', message: 'Çok fazla deneme. Lütfen birkaç dakika sonra tekrar deneyin.' });
      }
    }

    // Aynı telefon + aynı öğrenci → yeni kayıt açma, bilgileri güncelle
    const { data: existingRows } = await supabaseAdmin
      .from('institution_event_participants')
      .select('id, student_name, whatsapp_status')
      .eq('event_id', event.id)
      .eq('phone', d.phone);
    const sameStudent = (existingRows || []).find(
      (r) => String(r.student_name || '').trim().toLocaleLowerCase('tr') === d.student_name.toLocaleLowerCase('tr')
    );
    const nowIso = new Date().toISOString();
    const formMeta = {
      ip,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
      contact_consent: settings.contact_consent ? body.contact_consent === true : null,
      utm: body.utm && typeof body.utm === 'object' ? body.utm : null,
      referrer: String(body.referrer || '').slice(0, 300) || null,
      kvkk_version: (settings.kvkk_text || settings.kvkk_url || 'institution').slice(0, 80)
    };

    if (sameStudent) {
      await supabaseAdmin
        .from('institution_event_participants')
        .update({
          display_name: d.parent_name,
          parent_name: d.parent_name,
          grade: d.grade || null,
          kvkk_accepted_at: nowIso,
          form_meta: formMeta
        })
        .eq('id', sameStudent.id);
      return res.status(200).json({ ok: true, already: true, message: settings.success_message });
    }

    const { data: participant, error: insErr } = await supabaseAdmin
      .from('institution_event_participants')
      .insert({
        event_id: event.id,
        display_name: d.parent_name,
        parent_name: d.parent_name,
        student_name: d.student_name || null,
        grade: d.grade || null,
        phone: d.phone,
        source_type: 'external',
        whatsapp_status: 'pending',
        kvkk_accepted_at: nowIso,
        form_meta: formMeta
      })
      .select('*')
      .maybeSingle();
    if (insErr || !participant) throw insErr || new Error('insert_failed');

    // Onay mesajı — aynı telefona daha önce gittiyse (kardeş kaydı) tekrar gönderme
    const alreadyMessaged = (existingRows || []).some((r) => r.whatsapp_status === 'sent');
    if (settings.send_confirmation && !alreadyMessaged) {
      try {
        const { data: tpl } = await supabaseAdmin
          .from('message_templates')
          .select('variables, twilio_variable_bindings, content')
          .eq('type', event.template_type)
          .maybeSingle();
        if (tpl?.content && !(templateBindingsNeedLink(tpl) && !resolveEventMeetingLink(event))) {
          await sendEventInvites(event, { participantIds: [participant.id] });
        }
      } catch (e) {
        console.warn('[event-form] confirm send', errorMessage(e));
      }
    } else if (alreadyMessaged) {
      await supabaseAdmin
        .from('institution_event_participants')
        .update({ whatsapp_status: 'sent', whatsapp_error: 'kardes_kaydi_ayni_telefon' })
        .eq('id', participant.id);
    }

    // CRM Kayıt Takibi'ne aday
    if (settings.add_to_crm) {
      try {
        const lead = await ingestSiteLead({
          form_kind: 'etkinlik',
          ad_soyad: d.parent_name,
          ogrenci: d.student_name,
          telefon: d.phone,
          sinif: d.grade,
          not: `Etkinlik kaydı: ${event.title}${event.event_date ? ` (${formatTrDate(event.event_date)} ${String(event.event_time || '').slice(0, 5)})` : ''}`,
          page: `/f/${slug}`,
          utm: formMeta.utm || undefined
        });
        if (lead?.lead_id) {
          await supabaseAdmin
            .from('institution_event_participants')
            .update({ lead_id: String(lead.lead_id) })
            .eq('id', participant.id);
        }
      } catch (e) {
        console.warn('[event-form] crm lead', errorMessage(e));
      }
    }

    return res.status(201).json({ ok: true, message: settings.success_message });
  } catch (e) {
    console.warn('[event-form] submit', errorMessage(e));
    return res.status(500).json({ error: 'submit_failed', message: 'Kayıt sırasında bir sorun oluştu. Lütfen tekrar deneyin.' });
  }
}
