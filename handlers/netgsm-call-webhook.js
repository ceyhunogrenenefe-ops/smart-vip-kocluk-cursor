/**
 * Netgsm Netsantral → Kayıt Takibi (telefon aramaları)
 * POST /api/netgsm-call-webhook?secret=<NETGSM_WEBHOOK_SECRET>
 *
 * Kurulum:
 *   1. Vercel env:
 *        NETGSM_WEBHOOK_SECRET   rastgele uzun bir anahtar (zorunlu)
 *        NETGSM_TRACKED_NUMBERS  takip edilecek hat(lar), örn. 08503034014 (boşsa tüm hatlar)
 *   2. Netgsm paneli → Ayarlar → Genel Ayarlar → API Talep Ayarları:
 *        https://www.dersonlinevipkocluk.com/api/netgsm-call-webhook?secret=<anahtar>
 *   3. Supabase'de sql/2026-11-21-crm-phone-calls.sql çalıştırılır (çift kayıt koruması).
 *
 * Ne yapar (gelen çağrı, takip edilen hat):
 *   - InboundtoPBX / Inbound_call gelir gelmez aday kartı açılır (cdr'i beklemez).
 *   - Numara CRM'de varsa kayda "Gelen arama / Cevapsız arama" etkileşimi düşer.
 *   - Yoksa kaynak "telefon_arayan" ile yeni aday açılır ve sorumlu ataması yapılır.
 *   - Cevapsız çağrıda (cdr) adaya "call_back" sonraki aksiyonu yazılır.
 * Giden, iç çağrı, DTMF ve Queue 200 ile kabul edilip yok sayılır.
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import {
  createLeadFromInbound,
  findLeadByPhone,
  resolveDefaultInstitutionId
} from '../api/_lib/registration-channel-ingest.js';
import { normalizeTrPhone } from '../api/_lib/registration-tracking-utils.js';
import {
  formatDuration,
  isTrackedCall,
  normalizeNetgsmEvent,
  parseNetgsmBody,
  parseTrackedNumbers
} from '../api/_lib/netgsm-call-parse.js';

const LEAD_SOURCE = 'telefon_arayan';

function expectedSecret() {
  return String(process.env.NETGSM_WEBHOOK_SECRET || '').trim();
}

function readSecret(req) {
  const h = req.headers || {};
  const header = h['x-netgsm-secret'] || '';
  if (header) return String(header).trim();
  const q = req.query && typeof req.query === 'object' ? req.query : {};
  return String(q.secret || '').trim();
}

function isMissingTable(error) {
  return /crm_phone_calls|does not exist|schema cache/i.test(error?.message || '');
}

/**
 * Çift kayıt koruması. true = yeni çağrı, false = daha önce işlendi.
 * Tablo yoksa (migration çalıştırılmadıysa) korumasız devam eder.
 */
async function claimCall(event, institutionId, raw) {
  if (!event.callId) return { fresh: true, rowId: null };
  const { data, error } = await supabaseAdmin
    .from('crm_phone_calls')
    .insert({
      institution_id: institutionId,
      provider: 'netgsm',
      provider_call_id: event.callId,
      direction: event.direction,
      answered: event.answered,
      caller_number: event.caller,
      called_number: event.called,
      pbx_number: event.pbx,
      duration_sec: event.durationSec,
      started_at: event.startedAt,
      recording_url: event.recordingUrl,
      raw
    })
    .select('id')
    .maybeSingle();
  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) {
      const { data: existing } = await supabaseAdmin
        .from('crm_phone_calls')
        .select('id, lead_id')
        .eq('provider', 'netgsm')
        .eq('provider_call_id', event.callId)
        .maybeSingle();
      return { fresh: false, rowId: existing?.id || null, leadId: existing?.lead_id || null };
    }
    if (isMissingTable(error)) {
      console.warn('[netgsm-webhook] crm_phone_calls tablosu yok — sql/2026-11-21-crm-phone-calls.sql çalıştırın');
      return { fresh: true, rowId: null };
    }
    throw error;
  }
  return { fresh: true, rowId: data?.id || null };
}

async function recordCallOnLead(lead, event, institutionId, { note = true } = {}) {
  const answered = event.answered === true;
  const missed = event.answered === false;
  const title = missed ? 'Cevapsız arama' : 'Gelen arama';
  const parts = [
    answered && event.durationSec != null
      ? `Görüşme süresi: ${formatDuration(event.durationSec)}`
      : missed
        ? 'Çağrı cevaplanmadı — geri aranmalı'
        : 'Çağrı santrale düştü',
    event.called ? `Aranan hat: ${event.called}` : null,
    event.recordingUrl ? `Ses kaydı: ${event.recordingUrl}` : null
  ].filter(Boolean);

  if (note) {
  try {
    await supabaseAdmin.from('registration_interactions').insert({
      lead_id: lead.id,
      institution_id: institutionId,
      interaction_type: 'phone_call',
      interaction_at: event.startedAt,
      title,
      description: parts.join('\n'),
      result: null,
      created_by: null
    });
  } catch (e) {
    console.warn('[netgsm-webhook] interaction insert:', e instanceof Error ? e.message : e);
  }
  }

  const patch = {
    last_inbound_channel: 'phone',
    last_inbound_snippet: title,
    last_inbound_at: event.startedAt,
    updated_at: new Date().toISOString()
  };
  if (event.answered === false) {
    patch.next_action_type = 'call_back';
    patch.next_action_at = new Date().toISOString();
  }
  try {
    await supabaseAdmin.from('registration_leads').update(patch).eq('id', lead.id);
  } catch (e) {
    console.warn('[netgsm-webhook] lead patch:', e instanceof Error ? e.message : e);
  }
}

function logDecision(event, result) {
  console.info('[netgsm-webhook]', {
    scenario: event.scenario || 'none',
    kind: event.kind,
    direction: event.direction,
    answered: event.answered,
    result: result.ignored ? result.reason : result.ok ? 'saved' : result.reason || 'fail',
    caller_tail: String(event.caller || '').slice(-4)
  });
}

export async function processNetgsmEvent(rawBody) {
  const event = normalizeNetgsmEvent(rawBody);
  const tracked = parseTrackedNumbers(process.env.NETGSM_TRACKED_NUMBERS);
  const inboundCdr = event.kind === 'cdr' && event.direction !== 'outbound' && event.direction !== 'internal';
  const recordable = event.kind === 'inbound' || inboundCdr;

  if (!recordable) {
    const result = { ignored: true, reason: `scenario:${event.scenario || 'unknown'}` };
    logDecision(event, result);
    return result;
  }
  if (!isTrackedCall(event, tracked)) {
    const result = { ignored: true, reason: 'untracked_line' };
    logDecision(event, result);
    return result;
  }

  const normalizedPhone = normalizeTrPhone(event.caller);
  if (!normalizedPhone) {
    const result = { ignored: true, reason: 'no_caller_number' };
    logDecision(event, result);
    return result;
  }

  const institutionId = await resolveDefaultInstitutionId();
  if (!institutionId) {
    const result = { ignored: true, reason: 'no_institution' };
    logDecision(event, result);
    return result;
  }

  const claim = await claimCall(event, institutionId, rawBody);
  if (!claim.fresh && claim.leadId) {
    await recordCallOnLead(
      { id: claim.leadId },
      event,
      institutionId,
      { note: Boolean(event.durationSec || event.recordingUrl || event.answered === false) }
    );
    const result = { ok: true, duplicate: true, lead_id: claim.leadId, answered: event.answered };
    logDecision(event, result);
    return result;
  }

  try {
    const result = await attachCallToLead(event, normalizedPhone, institutionId, claim.rowId);
    logDecision(event, result);
    return result;
  } catch (e) {
    // Netgsm tekrar gönderirse yeniden işlenebilsin diye çift kayıt satırını geri al
    if (claim.rowId) {
      await supabaseAdmin.from('crm_phone_calls').delete().eq('id', claim.rowId);
    }
    throw e;
  }
}

async function attachCallToLead(event, normalizedPhone, institutionId, claimRowId) {
  let lead = await findLeadByPhone(normalizedPhone, institutionId);
  let created = false;
  if (!lead) {
    lead = await createLeadFromInbound({
      institutionId,
      channel: 'phone',
      phone: event.caller,
      normalizedPhone,
      contactName: 'Telefon Arayan',
      source: LEAD_SOURCE,
      notes: `İlk temas: ${event.called || event.pbx || 'santral'} hattına gelen arama`
    });
    created = Boolean(lead?.id);
  }
  if (!lead?.id) return { ok: false, reason: 'lead_not_created' };

  const leadInstitution = lead.institution_id || institutionId;
  // 0850 satış hattı. Kayıtlı veli numarası da panoda görünsün; kurum içi işaret
  // bu kartı Kayıt Takibi listesinden siliyordu.
  await supabaseAdmin
    .from('registration_leads')
    .update({ is_internal: false, internal_reason: 'manual_unmarked' })
    .eq('id', lead.id)
    .eq('is_internal', true);
  await recordCallOnLead(lead, event, leadInstitution);

  if (claimRowId) {
    await supabaseAdmin.from('crm_phone_calls').update({ lead_id: lead.id }).eq('id', claimRowId);
  }

  return { ok: true, lead_id: lead.id, created, answered: event.answered };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'netgsm-call-webhook',
      secret_configured: Boolean(expectedSecret()),
      tracked_numbers: parseTrackedNumbers(process.env.NETGSM_TRACKED_NUMBERS).length
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const expected = expectedSecret();
  if (!expected) return res.status(503).json({ error: 'secret_not_configured' });
  if (readSecret(req) !== expected) return res.status(401).json({ error: 'unauthorized' });

  try {
    const result = await processNetgsmEvent(parseNetgsmBody(req.body));
    return res.status(200).json(result);
  } catch (e) {
    console.error('[netgsm-webhook]', e instanceof Error ? e.message : e);
    return res.status(500).json({ error: 'processing_failed' });
  }
}
