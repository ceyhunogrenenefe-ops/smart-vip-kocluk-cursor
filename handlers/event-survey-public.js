/**
 * Etkinlik sonrası anket (herkese açık, kişiye özel bağlantı)
 *   GET  /api/event-survey?token=…  → etkinlik adı, katılımcının adı, daha önce yanıtladı mı
 *   POST /api/event-survey?token=…  → puan (1–5), beklenti, bilgi almak ister mi, konu, yorum
 *
 * Yetki istemez; bağlantıdaki rastgele kimlik yalnız bir katılımcıya aittir.
 * Telefon ve diğer kişisel bilgiler bu uçtan dönmez.
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { ingestSiteLead } from '../api/_lib/site-leads.js';
import { normalizeFormSettings, validateSurvey } from '../api/_lib/event-form-logic.js';

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

function firstName(full) {
  return String(full || '').trim().split(/\s+/)[0] || '';
}

function formatTrDate(isoDate) {
  const s = String(isoDate || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
}

async function loadByToken(token) {
  const { data: participant, error } = await supabaseAdmin
    .from('institution_event_participants')
    .select('id, event_id, display_name, parent_name, student_name, grade, phone, lead_id')
    .eq('survey_token', token)
    .maybeSingle();
  if (error) throw error;
  if (!participant) return null;
  const { data: event, error: eErr } = await supabaseAdmin
    .from('institution_events')
    .select('id, institution_id, title, event_date, event_time, form_settings')
    .eq('id', participant.event_id)
    .maybeSingle();
  if (eErr) throw eErr;
  if (!event) return null;
  return { participant, event };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = String(req.query?.token || '').trim();
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return res.status(404).json({ error: 'not_found' });

  let ctx;
  try {
    ctx = await loadByToken(token);
  } catch (e) {
    console.warn('[event-survey] load', errorMessage(e));
    return res.status(500).json({ error: 'load_failed' });
  }
  if (!ctx) return res.status(404).json({ error: 'not_found' });
  const { participant, event } = ctx;

  const { data: existing } = await supabaseAdmin
    .from('institution_event_survey_responses')
    .select('id, rating, expectation, want_info, topics, comment')
    .eq('participant_id', participant.id)
    .maybeSingle();

  if (req.method === 'GET') {
    const { data: inst } = await supabaseAdmin
      .from('institutions')
      .select('name, logo')
      .eq('id', event.institution_id)
      .maybeSingle();
    const logo = String(inst?.logo || '');
    return res.status(200).json({
      ok: true,
      institution: { name: String(inst?.name || ''), logo: logo && logo.length <= MAX_LOGO_CHARS ? logo : null },
      event: {
        title: event.title,
        date: formatTrDate(event.event_date),
        time: String(event.event_time || '').slice(0, 5)
      },
      name: firstName(participant.parent_name || participant.display_name),
      answered: Boolean(existing),
      previous: existing || null
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = parseBody(req);
  if (String(body.website || '').trim()) return res.status(200).json({ ok: true });
  const v = validateSurvey(body);
  if (!v.ok) return res.status(400).json({ error: 'invalid', errors: v.errors });

  const nowIso = new Date().toISOString();
  const row = {
    event_id: event.id,
    participant_id: participant.id,
    ...v.data,
    meta: { user_agent: String(req.headers['user-agent'] || '').slice(0, 300) },
    updated_at: nowIso
  };

  try {
    const { error } = await supabaseAdmin
      .from('institution_event_survey_responses')
      .upsert(row, { onConflict: 'participant_id' });
    if (error) throw error;

    // "Bilgi almak istiyorum" → CRM'de sıcak aday (yalnız ilk kez işaretlendiğinde)
    const settings = normalizeFormSettings(event.form_settings);
    if (v.data.want_info === true && existing?.want_info !== true && settings.add_to_crm !== false) {
      try {
        await ingestSiteLead({
          form_kind: 'etkinlik',
          ad_soyad: participant.parent_name || participant.display_name,
          ogrenci: participant.student_name || '',
          telefon: participant.phone,
          sinif: participant.grade || '',
          not: `Seminer anketi: "${event.title}" sonrası kurum hakkında BİLGİ ALMAK İSTİYOR. Puan: ${v.data.rating}/5${
            v.data.comment ? ` — Yorum: ${v.data.comment.slice(0, 300)}` : ''
          }`,
          page: `/anket (${event.title})`
        });
      } catch (e) {
        console.warn('[event-survey] crm lead', errorMessage(e));
      }
    }
    return res.status(200).json({ ok: true, updated: Boolean(existing) });
  } catch (e) {
    console.warn('[event-survey] submit', errorMessage(e));
    return res.status(500).json({ error: 'submit_failed', message: 'Yanıtınız kaydedilemedi. Lütfen tekrar deneyin.' });
  }
}
