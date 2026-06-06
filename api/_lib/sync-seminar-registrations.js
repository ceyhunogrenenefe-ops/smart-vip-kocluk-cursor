import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendEventInvites } from './institution-event-send.js';
import { getIstanbulDateString, getIstanbulHour, getIstanbulMinute } from './istanbul-time.js';

const PLATFORM_PRIMARY_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

/** Supabase’de gerçek tablo adı (kullanıcı: seminer_kayitlari) */
const SEMINER_TABLE_CANDIDATES = ['seminer_kayitlari', 'seminar_kayitlari'];
let cachedSeminerTable = null;

const NAME_KEYS = [
  'ad_soyad',
  'adsoyad',
  'full_name',
  'isim',
  'ad',
  'name',
  'ogrenci_adi',
  'veli_adi',
  'katilimci_adi',
  'ogrenci',
  'veli',
  'katilimci',
  'musteri_adi'
];
const FIRST_KEYS = ['ad', 'first_name', 'isim', 'ogrenci_adi'];
const LAST_KEYS = ['soyad', 'last_name', 'soyisim'];
const PHONE_KEYS = [
  'telefon',
  'tel',
  'phone',
  'gsm',
  'cep',
  'veli_tel',
  'ogrenci_tel',
  'whatsapp',
  'cep_telefonu',
  'telefon_no',
  'phone_number',
  'numara',
  'iletisim',
  'veli_telefon',
  'ogrenci_telefon'
];
const EMAIL_KEYS = ['email', 'eposta', 'e_posta', 'mail'];
const KEY_KEYS = [
  'seminer_key',
  'seminer_slug',
  'seminer_id',
  'seminer_adi',
  'seminer_turu',
  'seminer',
  'etkinlik_key',
  'event_key',
  'seminer_baslik',
  'baslik'
];
const EVENT_ID_KEYS = ['event_id', 'etkinlik_id', 'institution_event_id'];
const INSTITUTION_KEYS = ['institution_id', 'kurum_id'];

function pickField(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function phoneDigits10(phone) {
  return String(phone || '')
    .replace(/\D/g, '')
    .slice(-10);
}

function normalizeTrPhone(raw) {
  const e164 = normalizePhoneToE164(raw);
  if (e164) return e164;
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('05')) return normalizePhoneToE164(digits);
  if (digits.length === 10 && digits.startsWith('5')) return normalizePhoneToE164(`0${digits}`);
  if (digits.length === 12 && digits.startsWith('90')) return normalizePhoneToE164(`+${digits}`);
  if (digits.length === 13 && digits.startsWith('905')) return normalizePhoneToE164(`+${digits}`);
  return null;
}

function extractPhoneFromRow(row) {
  const direct = normalizeTrPhone(pickField(row, PHONE_KEYS));
  if (direct) return direct;

  for (const [k, v] of Object.entries(row || {})) {
    if (v == null || typeof v === 'object') continue;
    const s = String(v).trim();
    if (!s) continue;
    if (/telefon|tel|phone|gsm|cep|whatsapp|numara|iletisim/i.test(k)) {
      const p = normalizeTrPhone(s);
      if (p) return p;
    }
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13 && /5\d{9}/.test(digits.slice(-10))) {
      const p = normalizeTrPhone(s);
      if (p) return p;
    }
  }
  return null;
}

function extractNameFromRow(row) {
  let display_name = pickField(row, NAME_KEYS);
  if (!display_name) {
    const first = pickField(row, FIRST_KEYS);
    const last = pickField(row, LAST_KEYS);
    display_name = `${first} ${last}`.trim();
  }
  if (!display_name) {
    for (const [k, v] of Object.entries(row || {})) {
      if (v == null || typeof v === 'object') continue;
      if (/^(ad|isim|name|ogrenci|veli|katilimci)/i.test(k) && String(v).trim()) {
        display_name = String(v).trim();
        break;
      }
    }
  }
  return display_name || 'Katılımcı';
}

function normKey(s) {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ');
}

function parseSeminarRegistration(row) {
  const phone = extractPhoneFromRow(row);
  const email = pickField(row, EMAIL_KEYS).toLowerCase();
  const seminar_key = pickField(row, KEY_KEYS);
  const event_id = pickField(row, EVENT_ID_KEYS);
  let institution_id = pickField(row, INSTITUTION_KEYS);
  if (!institution_id) institution_id = PLATFORM_PRIMARY_INSTITUTION_ID;
  return {
    id: String(row.id ?? ''),
    display_name: extractNameFromRow(row),
    phone,
    email,
    seminar_key,
    event_id,
    institution_id,
    created_at: row.created_at || row.createdAt || null
  };
}

function isMissingSeminarTable(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    ((msg.includes('seminer_kayitlari') || msg.includes('seminar_kayitlari')) &&
      msg.includes('does not exist'))
  );
}

async function resolveSeminerTable() {
  if (cachedSeminerTable) return cachedSeminerTable;
  for (const name of SEMINER_TABLE_CANDIDATES) {
    const { error } = await supabaseAdmin.from(name).select('id').limit(1);
    if (!error) {
      cachedSeminerTable = name;
      return name;
    }
    if (!isMissingSeminarTable(error)) throw error;
  }
  return null;
}

function seminerTable() {
  if (!cachedSeminerTable) throw new Error('seminer_table_not_resolved');
  return cachedSeminerTable;
}

function isMissingColumn(error, col) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes(String(col).toLowerCase()) && (msg.includes('column') || msg.includes('does not exist'));
}

/** Planlanmış / seminer otomatik mesaj açık etkinlikler */
export function eventEligibleForSeminarSync(event) {
  if (String(event.seminar_sync_key || '').trim() && event.seminar_auto_send !== false) {
    return true;
  }
  const mode = String(event.send_mode || 'manual');
  if (mode === 'manual') return false;
  if (mode === 'immediate') return true;
  const st = String(event.schedule_status || 'idle');
  if (st === 'scheduled' || st === 'completed') return true;
  if (event.last_schedule_run_at) return true;
  if (event.scheduled_send_at || event.daily_send_time) return true;
  return false;
}

function buildEventMatchContext(events) {
  const eligible = (events || []).filter(eventEligibleForSeminarSync);
  const singleKeyedByInst = new Map();
  const singleEligibleByInst = new Map();

  const byInst = new Map();
  for (const ev of eligible) {
    const inst = String(ev.institution_id || PLATFORM_PRIMARY_INSTITUTION_ID);
    if (!byInst.has(inst)) byInst.set(inst, []);
    byInst.get(inst).push(ev);
  }

  for (const [inst, list] of byInst) {
    const keyed = list.filter((e) => String(e.seminar_sync_key || '').trim());
    if (keyed.length === 1) singleKeyedByInst.set(inst, keyed[0].id);
    if (list.length === 1) singleEligibleByInst.set(inst, list[0].id);
  }

  return { eligible, singleKeyedByInst, singleEligibleByInst };
}

function eventMatchesRegistration(event, reg, ctx) {
  if (reg.event_id && String(event.id) === String(reg.event_id)) return true;

  const inst = String(event.institution_id || PLATFORM_PRIMARY_INSTITUTION_ID);
  const regInst = String(reg.institution_id || PLATFORM_PRIMARY_INSTITUTION_ID);

  const syncKey = normKey(event.seminar_sync_key);
  const regKey = normKey(reg.seminar_key);
  const titleKey = normKey(event.title);

  if (syncKey && regKey && (syncKey === regKey || regKey.includes(syncKey) || syncKey.includes(regKey))) {
    return true;
  }
  if (regKey && titleKey && regKey === titleKey) return true;
  if (syncKey && titleKey && syncKey === titleKey && !regKey) return true;

  if (syncKey && !regKey && ctx.singleKeyedByInst.get(inst) === event.id) return true;

  if (!reg.event_id && !reg.seminar_key && ctx.singleEligibleByInst.get(inst) === event.id) {
    return regInst === inst || !reg.institution_id;
  }

  if (regInst === inst && ctx.singleEligibleByInst.get(inst) === event.id) return true;

  return false;
}

async function loadLinkedRegistrationIds() {
  const linked = new Set();
  const { data, error } = await supabaseAdmin
    .from('institution_event_participants')
    .select('seminar_registration_id')
    .not('seminar_registration_id', 'is', null);
  if (error && !isMissingColumn(error, 'seminar_registration_id')) {
    console.warn('[seminar-sync] linked ids', error.message);
    return linked;
  }
  for (const row of data || []) {
    const id = String(row.seminar_registration_id || '').trim();
    if (id) linked.add(id);
  }
  return linked;
}

async function loadPendingSeminarRegistrations(limit, linkedIds) {
  const table = seminerTable();
  let query = supabaseAdmin.from(table).select('*').order('created_at', { ascending: false });

  const { data: filtered, error: filterErr } = await supabaseAdmin
    .from(table)
    .select('*')
    .is('synced_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!filterErr && filtered?.length) {
    return filtered.filter((r) => !linkedIds.has(String(r.id ?? '')));
  }

  if (filterErr && !isMissingColumn(filterErr, 'synced_at')) {
    if (isMissingSeminarTable(filterErr)) throw filterErr;
  }

  const { data: all, error: allErr } = await query.limit(Math.max(limit, 200));
  if (allErr) {
    if (isMissingSeminarTable(allErr)) return [];
    throw allErr;
  }

  return (all || []).filter((r) => !linkedIds.has(String(r.id ?? ''))).slice(0, limit);
}

async function findParticipantByPhone(eventId, phone) {
  const target = phoneDigits10(phone);
  if (!target) return null;
  const { data: rows } = await supabaseAdmin
    .from('institution_event_participants')
    .select('id, whatsapp_status, phone')
    .eq('event_id', eventId);
  return (
    (rows || []).find((r) => phoneDigits10(r.phone) === target) || null
  );
}

async function tryMatchStudent({ phone, email, display_name, institution_id }) {
  let q = supabaseAdmin.from('students').select('id, name, email, phone, parent_phone, institution_id');
  const inst = institution_id || PLATFORM_PRIMARY_INSTITUTION_ID;
  if (inst) q = q.eq('institution_id', inst);
  const { data: rows } = await q.limit(800);
  const list = rows || [];
  const em = email.toLowerCase().trim();
  if (em) {
    const hit = list.find((s) => (s.email || '').toLowerCase().trim() === em);
    if (hit) return hit;
  }
  const digits = phoneDigits10(phone);
  if (digits.length >= 10) {
    const hit = list.find((s) => {
      const p1 = phoneDigits10(s.phone);
      const p2 = phoneDigits10(s.parent_phone);
      return p1 === digits || p2 === digits;
    });
    if (hit) return hit;
  }
  const dn = normKey(display_name);
  if (dn && dn !== 'katılımcı') {
    const hit = list.find((s) => normKey(s.name) === dn);
    if (hit) return hit;
  }
  return null;
}

function parseHm(timeVal) {
  const s = String(timeVal || '').slice(0, 8);
  const [h, m] = s.split(':');
  return { hour: parseInt(h, 10), minute: parseInt(m, 10) };
}

/** Planlı gönderim saati geçti mi? (once: tek sefer; daily: bugünün saati) */
function hasScheduledSendTimePassed(event, now = new Date()) {
  const mode = String(event.send_mode || 'manual');
  if (mode === 'once' && event.scheduled_send_at) {
    const ms = new Date(event.scheduled_send_at).getTime();
    return Number.isFinite(ms) && now.getTime() >= ms;
  }
  if (mode === 'daily' && event.daily_send_time) {
    const { hour: th, minute: tm } = parseHm(event.daily_send_time);
    if (!Number.isFinite(th) || !Number.isFinite(tm)) return false;
    const nowMin = getIstanbulHour(now) * 60 + getIstanbulMinute(now);
    return nowMin >= th * 60 + tm;
  }
  return false;
}

function shouldAutoSendOnRegister(event) {
  if (event.seminar_auto_send === false) return false;
  if (!String(event.meeting_link || '').trim()) return false;
  if (!String(event.template_type || '').trim()) return false;
  const mode = String(event.send_mode || 'manual');
  if (mode === 'immediate') return true;
  // Planlı etkinlik: saat gelmeden kuyruğa al; geç kalan seminer kayıtlarına hemen gönder
  if (mode === 'once' || mode === 'daily') return hasScheduledSendTimePassed(event);
  return false;
}

async function markRegistrationSynced(rawId, participantId, eventId) {
  const patch = {
    synced_participant_id: participantId,
    synced_event_id: eventId,
    synced_at: new Date().toISOString()
  };
  const { error } = await supabaseAdmin.from(seminerTable()).update(patch).eq('id', rawId);
  if (error && isMissingColumn(error, 'synced_at')) return;
  if (error) console.warn('[seminar-sync] mark synced', rawId, error.message);
}

/**
 * seminer_kayitlari → institution_event_participants
 */
export async function syncSeminarRegistrationsToEvents({ limit = 200, log = [] } = {}) {
  const table = await resolveSeminerTable();
  if (!table) {
    return {
      ok: true,
      skipped: 'seminer_kayitlari_missing',
      synced: 0,
      log,
      hint: `Tablo bulunamadı. Denenen: ${SEMINER_TABLE_CANDIDATES.join(', ')}`
    };
  }

  const linkedIds = await loadLinkedRegistrationIds();

  let regs;
  try {
    regs = await loadPendingSeminarRegistrations(limit, linkedIds);
  } catch (regErr) {
    if (isMissingSeminarTable(regErr)) {
      return {
        ok: true,
        skipped: 'seminer_kayitlari_missing',
        synced: 0,
        log,
        table
      };
    }
    throw regErr;
  }

  const { count: totalRows, error: totalErr } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true });
  if (totalErr && isMissingSeminarTable(totalErr)) {
    return { ok: true, skipped: 'seminer_kayitlari_missing', synced: 0, log, table };
  }

  const { data: events, error: evErr } = await supabaseAdmin.from('institution_events').select('*');
  if (evErr) throw evErr;

  const ctx = buildEventMatchContext(events);
  const skips = {
    invalid_phone: 0,
    no_matching_event: 0,
    phone_already_on_event: 0,
    insert_error: 0
  };

  let syncedCount = 0;
  let sentCount = 0;

  if (!regs.length) {
    return {
      ok: true,
      synced: 0,
      sent: 0,
      registrations: 0,
      total_in_table: totalRows ?? null,
      already_linked: linkedIds.size,
      eligible_events: ctx.eligible.length,
      table,
      log
    };
  }

  for (const raw of regs) {
    const reg = parseSeminarRegistration(raw);
    if (!reg.phone) {
      skips.invalid_phone++;
      log.push({ registration_id: reg.id, skip: 'invalid_phone', row_keys: Object.keys(raw || {}) });
      continue;
    }

    const targets = ctx.eligible.filter((ev) => eventMatchesRegistration(ev, reg, ctx));
    if (!targets.length) {
      skips.no_matching_event++;
      log.push({
        registration_id: reg.id,
        skip: 'no_matching_event',
        seminar_key: reg.seminar_key || null,
        eligible_events: ctx.eligible.map((e) => ({
          id: e.id,
          title: e.title,
          seminar_sync_key: e.seminar_sync_key
        }))
      });
      continue;
    }

    let firstParticipantId = null;
    let firstEventId = null;

    for (const event of targets) {
      const existing = await findParticipantByPhone(event.id, reg.phone);
      if (existing) {
        skips.phone_already_on_event++;
        log.push({
          registration_id: reg.id,
          event_id: event.id,
          skip: 'phone_already_on_event',
          participant_id: existing.id
        });
        if (!firstParticipantId) {
          firstParticipantId = existing.id;
          firstEventId = event.id;
        }
        linkedIds.add(reg.id);
        continue;
      }

      const student = await tryMatchStudent({
        phone: reg.phone,
        email: reg.email,
        display_name: reg.display_name,
        institution_id: reg.institution_id || event.institution_id
      });

      const display_name =
        student?.name && reg.display_name === 'Katılımcı'
          ? String(student.name).trim()
          : reg.display_name;

      const insertPayload = {
        event_id: event.id,
        student_id: student?.id || null,
        display_name,
        phone: reg.phone,
        source_type: student?.id ? 'student' : 'external',
        whatsapp_status: 'pending'
      };
      if (reg.id) insertPayload.seminar_registration_id = reg.id;

      let inserted;
      const { data: insData, error: insErr } = await supabaseAdmin
        .from('institution_event_participants')
        .insert(insertPayload)
        .select('id')
        .single();

      if (insErr && isMissingColumn(insErr, 'seminar_registration_id')) {
        delete insertPayload.seminar_registration_id;
        const retry = await supabaseAdmin
          .from('institution_event_participants')
          .insert(insertPayload)
          .select('id')
          .single();
        inserted = retry.data;
        if (retry.error) {
          skips.insert_error++;
          log.push({ registration_id: reg.id, event_id: event.id, error: retry.error.message });
          continue;
        }
      } else if (insErr) {
        skips.insert_error++;
        log.push({ registration_id: reg.id, event_id: event.id, error: insErr.message });
        continue;
      } else {
        inserted = insData;
      }

      syncedCount++;
      linkedIds.add(reg.id);
      if (!firstParticipantId) {
        firstParticipantId = inserted.id;
        firstEventId = event.id;
      }

      if (shouldAutoSendOnRegister(event)) {
        try {
          const out = await sendEventInvites(event, { participantIds: [inserted.id] });
          sentCount += out.sent || 0;
          log.push({
            registration_id: reg.id,
            event_id: event.id,
            participant_id: inserted.id,
            whatsapp_sent: out.sent,
            whatsapp_failed: out.failed
          });
        } catch (e) {
          log.push({
            registration_id: reg.id,
            event_id: event.id,
            participant_id: inserted.id,
            whatsapp_error: String(e?.message || e)
          });
        }
      } else {
        log.push({
          registration_id: reg.id,
          event_id: event.id,
          participant_id: inserted.id,
          queued: true
        });
      }
    }

    if (firstParticipantId) {
      await markRegistrationSynced(raw.id, firstParticipantId, firstEventId);
    }
  }

  return {
    ok: true,
    synced: syncedCount,
    sent: sentCount,
    registrations: regs.length,
    total_in_table: totalRows ?? null,
    already_linked: linkedIds.size,
    eligible_events: ctx.eligible.length,
    table,
    skips,
    log
  };
}
