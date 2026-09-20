/**
 * onlinevipdershane.com form / reklam formu → CRM lead + inbox mesajı
 * Kommo köprüsü yok; native registration_leads + crm_conversations.
 */
import { createHash } from 'node:crypto';
import { ingestRegistrationChannelMessage } from './registration-channel-ingest.js';
import {
  inferGradeProgramFromText,
  isKnownGradeProgram,
  normalizeGradeProgram,
  normalizeTrPhone,
  splitFullName
} from './registration-tracking-utils.js';

export const SITE_LEAD_PANEL_ORIGIN = 'https://www.dersonlinevipkocluk.com';

export const DEFAULT_SITE_LEAD_ORIGINS = [
  'https://onlinevipdershane.com',
  'https://www.onlinevipdershane.com',
  'https://kocluk-kayit-formu.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const HONEYPOT_KEYS = ['website', 'company', 'hp', '_gotcha', 'fax'];

const PAID_SOURCE_RE = /facebook|fbclid|instagram|ig|meta|google|gclid|tiktok|ttclid|youtube|yt|taboola|outbrain/i;
const PAID_MEDIUM_RE = /cpc|ppc|paid|paidsocial|ads|advert|remarket|display/i;

function firstString(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function flattenAnswers(answers) {
  const out = {};
  if (!answers) return out;
  if (Array.isArray(answers)) {
    for (const row of answers) {
      if (!row || typeof row !== 'object') continue;
      const key = firstString(row.key, row.id, row.name, row.question);
      const val = firstString(row.value, row.answer, row.label);
      if (key && val) out[key] = val;
    }
    return out;
  }
  if (typeof answers === 'object') {
    for (const [k, v] of Object.entries(answers)) {
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number') out[k] = String(v);
      else if (typeof v === 'object') {
        const val = firstString(v.value, v.answer, v.label, v.text);
        if (val) out[k] = val;
      }
    }
  }
  return out;
}

function pickGrade(...vals) {
  for (const raw of vals) {
    const s = firstString(raw);
    if (!s) continue;
    const inferred = inferGradeProgramFromText(s);
    if (inferred) return inferred;
    const code = normalizeGradeProgram(s);
    if (code && isKnownGradeProgram(code) && code !== 'unspecified') return code;
  }
  return null;
}

export function siteLeadOrigins() {
  const extra = String(process.env.SITE_LEAD_CORS_ORIGIN || process.env.PUBLIC_TEACHERS_CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_SITE_LEAD_ORIGINS, ...extra])];
}

export function isAllowedSiteLeadOrigin(origin) {
  const o = String(origin || '').trim();
  if (!o) return false;
  return siteLeadOrigins().includes(o);
}

export function isSiteLeadHoneypot(body) {
  const b = asObject(body);
  return HONEYPOT_KEYS.some((k) => firstString(b[k]));
}

function utmFromPage(page) {
  const out = {};
  const raw = firstString(page);
  if (!raw) return out;
  try {
    const u = new URL(raw, 'https://www.onlinevipdershane.com');
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = u.searchParams.get(k);
      if (v) out[k] = v;
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function isPaidAdAttribution(utm = {}, extra = {}) {
  const page = firstString(extra.page, extra.landing_url, extra.landingPage, utm.landing_url);
  const fromPage = utmFromPage(page);
  const source = firstString(utm.utm_source, utm.source, extra.utm_source, fromPage.utm_source);
  const medium = firstString(utm.utm_medium, utm.medium, extra.utm_medium, fromPage.utm_medium);
  const campaign = firstString(utm.utm_campaign, utm.campaign, extra.utm_campaign, fromPage.utm_campaign);
  if (PAID_SOURCE_RE.test(source) || PAID_MEDIUM_RE.test(medium)) return true;
  if (/form.?reklam|lead.?ad|instant.?form/i.test(`${campaign} ${source}`)) return true;
  if (/[?&](fbclid|gclid|ttclid|wbraid|gbraid)=/i.test(page)) return true;
  return false;
}

export function parseSiteLeadPayload(raw) {
  const body = asObject(raw);
  const contact = asObject(body.contact);
  const utmIn = asObject(body.utm);
  const answers = flattenAnswers(body.answers);

  const formKind = firstString(
    body.form_kind,
    body.formKind,
    body.kind,
    body.op === 'submit' && body.source ? 'assessment' : '',
    body.program === 'Sizi Arayalım' ? 'callback' : '',
    body.ad_soyad || body.telefon ? 'iletisim' : '',
    'website'
  ).slice(0, 40);

  const name = firstString(
    body.ad_soyad,
    body.full_name,
    body.fullName,
    body.name,
    body.parent_full_name,
    body.parentName,
    contact.parentName,
    contact.parent_name,
    contact.name,
    contact.ad_soyad,
    [body.veli_ad || contact.veli_ad, body.veli_soyad || contact.veli_soyad].filter(Boolean).join(' '),
    [body.ogrenci_ad || contact.ogrenci_ad || body.first_name, body.ogrenci_soyad || contact.ogrenci_soyad || body.last_name]
      .filter(Boolean)
      .join(' ')
  );

  const studentName = firstString(
    body.ogrenci,
    body.ogrenci_ad_soyad,
    body.student_name,
    body.studentName,
    contact.studentName,
    contact.student_name,
    contact.ogrenci,
    [body.ogrenci_ad, body.ogrenci_soyad].filter(Boolean).join(' ')
  );

  const phone = firstString(
    body.telefon,
    body.phone,
    body.tel,
    body.gsm,
    body.whatsapp,
    contact.phone,
    contact.telefon,
    contact.tel
  );

  const email = firstString(body.email, body.e_posta, contact.email);
  const program = firstString(
    body.program,
    body.interested_package,
    body.paket,
    contact.program,
    answers.program
  );
  const sinif = firstString(
    body.sinif,
    body.grade,
    body.class,
    body.sinif_form,
    contact.sinif,
    contact.grade,
    contact.class,
    answers.sinif,
    answers.grade,
    answers.sinif_seviyesi
  );
  const note = firstString(body.not, body.note, body.message, body.mesaj, body.notes, contact.note);
  const page = firstString(
    body.page,
    body.landing_url,
    body.landingPage,
    body.url,
    utmIn.landing_url
  );
  const referrer = firstString(body.referrer, body.ref);

  const fromPage = utmFromPage(page);
  const utm = {
    utm_source: firstString(body.utm_source, utmIn.utm_source, utmIn.source, fromPage.utm_source),
    utm_medium: firstString(body.utm_medium, utmIn.utm_medium, utmIn.medium, fromPage.utm_medium),
    utm_campaign: firstString(body.utm_campaign, utmIn.utm_campaign, utmIn.campaign, fromPage.utm_campaign),
    utm_content: firstString(body.utm_content, utmIn.utm_content, utmIn.content, fromPage.utm_content),
    utm_term: firstString(body.utm_term, utmIn.utm_term, utmIn.term, fromPage.utm_term)
  };

  const gradeProgram =
    pickGrade(sinif, program, body.grade_program, note, studentName, JSON.stringify(answers || {})) || null;
  const paid = isPaidAdAttribution(utm, { page, utm_source: body.utm_source, utm_medium: body.utm_medium });
  const source = paid || /form.?ad|reklam/i.test(formKind) ? 'website_form_ad' : 'website_form';

  const displayName = name || studentName || 'Website Lead';
  const names = splitFullName(displayName);

  return {
    formKind,
    name: displayName,
    firstName: names.first_name,
    lastName: names.last_name,
    studentName: studentName || '',
    phone,
    normalizedPhone: normalizeTrPhone(phone),
    email,
    program,
    sinif,
    gradeProgram,
    note,
    page,
    referrer,
    utm,
    source,
    paidAd: paid,
    answers
  };
}

export function formatSiteLeadMessage(parsed) {
  const lines = [];
  const kindLabel =
    parsed.formKind === 'callback'
      ? 'Sizi Arayalım'
      : parsed.formKind === 'assessment'
        ? 'Ücretsiz öğrenci analizi'
        : parsed.formKind === 'teklif'
          ? 'Teklif formu'
          : parsed.formKind === 'iletisim'
            ? 'İletişim formu'
            : 'Website formu';
  lines.push(`[${parsed.paidAd ? 'Reklam formu' : 'Website formu'} — ${kindLabel}]`);
  if (parsed.name) lines.push(`Ad: ${parsed.name}`);
  if (parsed.studentName && parsed.studentName !== parsed.name) lines.push(`Öğrenci: ${parsed.studentName}`);
  if (parsed.phone) lines.push(`Telefon: ${parsed.phone}`);
  if (parsed.email) lines.push(`E-posta: ${parsed.email}`);
  if (parsed.sinif) lines.push(`Sınıf: ${parsed.sinif}`);
  if (parsed.program) lines.push(`Program: ${parsed.program}`);
  if (parsed.note) lines.push(`Not: ${parsed.note}`);
  if (parsed.page) lines.push(`Sayfa: ${parsed.page}`);
  if (parsed.utm.utm_source) {
    const camp = [parsed.utm.utm_source, parsed.utm.utm_medium, parsed.utm.utm_campaign].filter(Boolean).join(' / ');
    lines.push(`Kampanya: ${camp}`);
  }
  const extraAnswers = Object.entries(parsed.answers || {}).filter(([k, v]) => {
    const key = String(k).toLowerCase();
    if (!v) return false;
    if (/sinif|grade|program|phone|telefon|ad|name|email/.test(key)) return false;
    return String(v).length < 180;
  });
  for (const [k, v] of extraAnswers.slice(0, 8)) {
    lines.push(`${k}: ${v}`);
  }
  return lines.join('\n');
}

/**
 * Aynı gönderim hem tarayıcıdan (crm-site-lead.js) hem site sunucusundan gelebilir.
 * Anahtar telefon + form türü + 30 dakikalık kova olduğu için ikisi aynı kaydı üretir
 * ve ingest katmanı ikincisini yok sayar. Alan adları iki tarafta farklı olsa bile eşleşir.
 */
export function siteLeadIdempotencyKey(parsed) {
  const phone = parsed.normalizedPhone || parsed.phone || 'nophone';
  const kind = String(parsed.formKind || 'form').toLowerCase().slice(0, 24) || 'form';
  const bucket = Math.floor(Date.now() / (30 * 60 * 1000));
  const hash = createHash('sha1').update(`${phone}|${kind}|${bucket}`).digest('hex').slice(0, 16);
  return `siteform:${phone}:${kind}:${hash}`.slice(0, 120);
}

export function siteLeadNotes(parsed) {
  const bits = [
    `Kaynak: ${parsed.source}`,
    parsed.formKind ? `Form: ${parsed.formKind}` : '',
    parsed.page ? `Sayfa: ${parsed.page}` : '',
    parsed.utm.utm_campaign ? `Kampanya: ${parsed.utm.utm_campaign}` : '',
    parsed.utm.utm_source ? `utm_source=${parsed.utm.utm_source}` : ''
  ].filter(Boolean);
  return bits.join(' · ').slice(0, 500);
}

/**
 * @param {object} raw
 * @returns {{ ok: true, skipped?: boolean, reason?: string, lead_id?: string|null } | { ok: false, error: string, status: number }}
 */
export async function ingestSiteLead(raw) {
  if (isSiteLeadHoneypot(raw)) {
    return { ok: true, skipped: true, reason: 'honeypot', lead_id: null };
  }

  const parsed = parseSiteLeadPayload(raw);
  if (!parsed.normalizedPhone) {
    return { ok: false, status: 400, error: 'telefon_zorunlu' };
  }

  const body = formatSiteLeadMessage(parsed);
  const result = await ingestRegistrationChannelMessage({
    channel: 'whatsapp',
    direction: 'inbound',
    phone: parsed.phone,
    contactName: parsed.name,
    body,
    messageType: 'website_form',
    externalMessageId: siteLeadIdempotencyKey(parsed),
    timestamp: Math.floor(Date.now() / 1000),
    payload: {
      source: parsed.source,
      form_kind: parsed.formKind,
      utm: parsed.utm,
      page: parsed.page,
      referrer: parsed.referrer,
      program: parsed.program,
      sinif: parsed.sinif,
      email: parsed.email,
      answers: parsed.answers
    },
    leadSource: parsed.source,
    gradeProgram: parsed.gradeProgram || undefined,
    email: parsed.email || undefined,
    leadNotes: siteLeadNotes(parsed),
    interestedPackage: parsed.program || undefined,
    leadInboundChannel: 'website'
  });

  return {
    ok: true,
    skipped: Boolean(result?.skipped),
    reason: result?.reason || null,
    lead_id: result?.lead_id || null
  };
}
