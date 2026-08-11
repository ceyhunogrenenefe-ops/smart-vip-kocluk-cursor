import crypto from 'crypto';

function trimSlash(v) {
  return String(v || '').trim().replace(/\/+$/, '');
}

function normalizeBbbApiBase(raw) {
  let base = trimSlash(raw);
  if (!base) return '';
  // Özel BBB alan adı kök URL ile verilmişse /bigbluebutton/api yolunu tamamla.
  if (/dersonlinevipkocluk\.com/i.test(base) && !/\/bigbluebutton\b/i.test(base)) {
    base = `${base}/bigbluebutton`;
  }
  if (base.includes('/api')) return `${base}/`;
  return `${base}/api/`;
}

function sha1(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function sanitizeBbbSecret(raw) {
  return String(raw || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
}

function bbbChecksum(callName, query, secret) {
  return sha1(`${callName}${query}${sanitizeBbbSecret(secret)}`);
}

function bbbApiUrl(apiBase, action, query, checksum) {
  const q = String(query || '').trim();
  return q ? `${apiBase}${action}?${q}&checksum=${checksum}` : `${apiBase}${action}?checksum=${checksum}`;
}

function parseBbbXmlError(text) {
  const body = String(text || '');
  const pick = (tag) => {
    const m =
      body.match(new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`, 'i')) ||
      body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
    return m ? String(m[1] || '').trim() : '';
  };
  const returncode = pick('returncode');
  const messageKey = pick('messageKey');
  const message = pick('message');
  if (!returncode && !messageKey && !message) return null;
  return { returncode, messageKey, message };
}

function asQuery(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v == null) return;
    sp.set(k, String(v));
  });
  return sp.toString();
}

/** Ortam tabanlı uygulama kök URL’si (BBB logout dönüşleri). */
export function publicAppBaseForBbb() {
  const u =
    process.env.PUBLIC_APP_URL ||
    process.env.VITE_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    '';
  return String(u || '').trim().replace(/\/+$/, '');
}

/** Öğretmen canlı ders sonrası ödev paneli. */
export function bbbTeacherPostLessonLogoutUrl() {
  const base = publicAppBaseForBbb();
  if (!base) return null;
  return `${base}/edu-panel?post_lesson=1`;
}

/** Öğrenci etüt sonrası rapor ekranı (öğretmen ödev popup’ı gibi). */
export function bbbStudentEtutReportLogoutUrl() {
  const base = publicAppBaseForBbb();
  if (!base) return null;
  return `${base}/weekly-planner?etut_report=1`;
}

const BBB_FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.BBB_FETCH_TIMEOUT_MS || 22000) || 22000
);
const BBB_JOIN_INFO_TIMEOUT_MS = Math.max(
  3000,
  Number(process.env.BBB_JOIN_INFO_TIMEOUT_MS || 8000) || 8000
);
const BBB_CREATE_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.BBB_CREATE_TIMEOUT_MS || 15000) || 15000
);
const BBB_ROOM_CACHE_MS = Math.max(
  60000,
  Number(process.env.BBB_ROOM_CACHE_MS || 300000) || 300000
);

/** @type {Map<string, { meetingId: string, attendeePW: string, moderatorPW: string | null, expiresAt: number }>} */
const bbbRoomCredentialCache = new Map();

function getCachedBbbRoom(meetingId) {
  const key = sanitizeBbbMeetingId(meetingId);
  if (!key) return null;
  const hit = bbbRoomCredentialCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    bbbRoomCredentialCache.delete(key);
    return null;
  }
  return hit;
}

function setCachedBbbRoom(meetingId, creds) {
  const key = sanitizeBbbMeetingId(meetingId);
  if (!key || !creds?.attendeePW) return;
  bbbRoomCredentialCache.set(key, {
    meetingId: key,
    attendeePW: creds.attendeePW,
    moderatorPW: creds.moderatorPW || null,
    expiresAt: Date.now() + BBB_ROOM_CACHE_MS
  });
}

function clearCachedBbbRoom(meetingId) {
  const key = sanitizeBbbMeetingId(meetingId);
  if (key) bbbRoomCredentialCache.delete(key);
}

function joinLinksFromRoomCreds({ meetingId, attendeePW, moderatorPW, attendeeName, moderatorName }) {
  const attendeeJoinLink = buildBbbAttendeeJoinUrl({
    meetingId,
    attendeePassword: attendeePW,
    fullName: attendeeName
  });
  const moderatorJoinLink = moderatorPW
    ? buildBbbModeratorJoinUrl({
        meetingId,
        moderatorPassword: moderatorPW,
        fullName: moderatorName
      })
    : null;
  return { attendeeJoinLink, moderatorJoinLink };
}

export class BbbApiTimeoutError extends Error {
  constructor(message = 'BBB sunucusu zaman aşımına uğradı.') {
    super(message);
    this.name = 'BbbApiTimeoutError';
    this.code = 'bbb_timeout';
  }
}

async function bbbFetch(url, { timeoutMs = BBB_FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new BbbApiTimeoutError();
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** getMeetings sonucu — canlı oturum poll’larında tekrarlı BBB çağrısını azaltır. */
let runningMeetingIdsCache = { at: 0, ids: /** @type {Set<string>} */ (new Set()) };
const RUNNING_MEETINGS_CACHE_MS = Math.max(
  3000,
  Number(process.env.BBB_RUNNING_MEETINGS_CACHE_MS || 6000) || 6000
);

function parseRunningMeetingIdsFromGetMeetingsXml(text) {
  const ids = new Set();
  const blocks = String(text || '').match(/<meeting>[\s\S]*?<\/meeting>/gi) || [];
  for (const block of blocks) {
    const id = sanitizeBbbMeetingId(parseXmlTagValues(block, 'meetingID')[0] || '');
    if (id) ids.add(id);
  }
  return ids;
}

/** Tek getMeetings ile çalışan meetingID kümesi (kısa TTL önbellek). */
export async function bbbGetRunningMeetingIdSet() {
  const now = Date.now();
  if (now - runningMeetingIdsCache.at < RUNNING_MEETINGS_CACHE_MS) {
    return runningMeetingIdsCache.ids;
  }

  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) {
    runningMeetingIdsCache = { at: now, ids: new Set() };
    return runningMeetingIdsCache.ids;
  }

  const query = asQuery({});
  const checksum = bbbChecksum('getMeetings', query, secret);
  const url = bbbApiUrl(apiBase, 'getMeetings', query, checksum);
  try {
    const res = await bbbFetch(url, { timeoutMs: Math.min(BBB_FETCH_TIMEOUT_MS, 10000) });
    const text = await res.text();
    if (!res.ok || !text.includes('<returncode>SUCCESS</returncode>')) {
      runningMeetingIdsCache = { at: now, ids: new Set() };
      return runningMeetingIdsCache.ids;
    }
    runningMeetingIdsCache = { at: now, ids: parseRunningMeetingIdsFromGetMeetingsXml(text) };
    return runningMeetingIdsCache.ids;
  } catch {
    runningMeetingIdsCache = { at: now, ids: new Set() };
    return runningMeetingIdsCache.ids;
  }
}

/** GET /api/bbb-health?probe=1 — BBB API erişilebilir mi? */
export async function probeBbbApiReachable() {
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) {
    return { ok: false, error: 'BBB API ayarları eksik.', ms: 0 };
  }
  const started = Date.now();
  const query = asQuery({});
  const checksum = bbbChecksum('getMeetings', query, secret);
  const url = bbbApiUrl(apiBase, 'getMeetings', query, checksum);
  try {
    const res = await bbbFetch(url, { timeoutMs: Math.min(BBB_FETCH_TIMEOUT_MS, 15000) });
    const text = await res.text();
    const ms = Date.now() - started;
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, ms, status: res.status };
    }
    if (!text.includes('<returncode>SUCCESS</returncode>')) {
      const bbbErr = parseBbbXmlError(text);
      const err =
        bbbErr?.messageKey === 'checksumError'
          ? 'checksumError'
          : bbbErr?.messageKey || bbbErr?.message || 'BBB getMeetings başarısız';
      return {
        ok: false,
        error: err,
        ms,
        bbb: bbbErr,
        endpoint: describeBbbApiEndpoint()
      };
    }
    return { ok: true, ms, endpoint: describeBbbApiEndpoint() };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof BbbApiTimeoutError ? 'zaman_aşımı' : String(e?.message || e),
      ms: Date.now() - started,
      code: e instanceof BbbApiTimeoutError ? 'bbb_timeout' : undefined
    };
  }
}

function bbbApiConfig() {
  const endpoint =
    process.env.BBB_API_ENDPOINT ||
    process.env.BBB_URL ||
    process.env.BIGBLUEBUTTON_URL ||
    '';
  const secret =
    process.env.BBB_API_SECRET ||
    process.env.BBB_SECRET ||
    process.env.BIGBLUEBUTTON_SECRET ||
    '';
  return {
    apiBase: normalizeBbbApiBase(endpoint),
    secret: sanitizeBbbSecret(secret),
    endpointRaw: String(endpoint || '').trim()
  };
}

/** Teşhis için güvenli endpoint özeti (secret yok). */
export function describeBbbApiEndpoint() {
  const { apiBase, endpointRaw } = bbbApiConfig();
  if (!apiBase) return { host: null, path: null, raw: endpointRaw || null };
  try {
    const u = new URL(apiBase);
    return { host: u.host, path: u.pathname, raw: endpointRaw || apiBase };
  } catch {
    return { host: null, path: null, raw: endpointRaw || apiBase };
  }
}

export function isBbbConfigured() {
  const { apiBase, secret } = bbbApiConfig();
  return Boolean(apiBase && secret);
}

/** BBB oda süresi (dk): ders planından uzun tutulur; Vercel'de BBB_MEETING_DURATION_MINUTES ile ayarlanır. */
export function resolveBbbMeetingDurationMinutes(plannedMinutes) {
  const configured = Number(process.env.BBB_MEETING_DURATION_MINUTES || 120);
  const floor = Math.max(15, Number.isFinite(configured) && configured > 0 ? configured : 120);
  const planned = Math.max(0, Number(plannedMinutes) || 0);
  return Math.max(floor, planned);
}

/** Kayıt özelliği açık, otomatik başlangıç varsayılan açık (BBB'de kayıt başlamazsa «Kaydı izle» boş kalır). */
export function bbbRecordingCreateParams() {
  const record = String(process.env.BBB_RECORD ?? 'true').toLowerCase() !== 'false';
  const autoStartRecording =
    String(process.env.BBB_AUTO_START_RECORDING ?? 'true').toLowerCase() !== 'false';
  const allowStartStopRecording =
    String(process.env.BBB_ALLOW_START_STOP_RECORDING ?? 'true').toLowerCase() !== 'false';
  const recordFullDurationMedia =
    String(process.env.BBB_RECORD_FULL_DURATION_MEDIA ?? 'true').toLowerCase() !== 'false';
  return {
    record,
    autoStartRecording,
    allowStartStopRecording: record && allowStartStopRecording,
    recordFullDurationMedia: record && recordFullDurationMedia
  };
}

/** Ekran paylaşımı, anket ve sohbet kilitlerini öğretmen için açık tutar. */
export function bbbMeetingLockParams() {
  return {
    lockSettingsDisableCam: false,
    lockSettingsDisableMic: false,
    lockSettingsDisablePrivateChat: false,
    lockSettingsDisablePublicChat: false,
    lockSettingsDisableNote: false,
    lockSettingsHideUserList: false,
    lockSettingsLockOnJoin: false,
    lockSettingsLockOnJoinConfigurable: false,
    lockSettingsHideViewersCursor: false,
    lockSettingsDisableScreenshare: false
  };
}

/** Tüm öğrenci (viewer) katılımcılar için kamera/mikrofon erişimi — birleşik sınıf odaları dahil. */
export function bbbMeetingViewerAccessParams() {
  return {
    webcamsOnlyForModerator: false,
    guestPolicy: 'ALWAYS_ACCEPT',
    muteOnStart: false
  };
}

/** Etüt gibi paylaşımlı odalarda viewer kamera erişimini işaretler (getMeetingInfo metadata). */
export const BBB_VIEWER_CAMERAS_META_KEY = 'viewerCameras';
export const BBB_VIEWER_CAMERAS_META_VALUE = 'enabled';

/** Birleşik etüt odası meetingID öneki — sabit oda yeniden kullanımında kamera ayarı doğrulanır. */
export function isSharedViewerCameraMeetingId(meetingId) {
  return String(meetingId || '')
    .toLowerCase()
    .startsWith('etut');
}

function parseBbbBoolXmlTag(xml, tagName) {
  const raw = parseXmlTagValues(xml, tagName)[0];
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).toLowerCase() === 'true';
}

function parseBbbMetadataXml(xml) {
  const meta = {};
  const block = String(xml || '').match(/<metadata>[\s\S]*?<\/metadata>/i)?.[0] || '';
  if (!block) return meta;
  const tagRe = /<([a-zA-Z0-9_]+)>(?:<!\[CDATA\[(.*?)\]\]>|([^<]*))<\/\1>/gi;
  let match;
  while ((match = tagRe.exec(block))) {
    const key = String(match[1] || '').trim();
    const val = String(match[2] ?? match[3] ?? '').trim();
    if (key && val) meta[key] = val;
  }
  return meta;
}

function sharedViewerCameraRoomReady(live) {
  if (!live?.attendeePW) return false;
  if (live.webcamsOnlyForModerator === true) return false;
  if (live.metadata?.[BBB_VIEWER_CAMERAS_META_KEY] === BBB_VIEWER_CAMERAS_META_VALUE) return true;
  if (live.webcamsOnlyForModerator === false) return true;
  // Metadata eksik eski oda ama içeride katılımcı var — her girişte kapatma (join kırılır)
  if (live.running && live.participantCount > 0) return true;
  return false;
}

function resolveBbbCreateCredentials(createText, fallback = {}) {
  const attendeePW =
    String(parseXmlTagValues(createText, 'attendeePW')[0] || '').trim() ||
    String(fallback.attendeePW || '').trim();
  const moderatorPW =
    String(parseXmlTagValues(createText, 'moderatorPW')[0] || '').trim() ||
    String(fallback.moderatorPW || '').trim() ||
    null;
  return { attendeePW, moderatorPW };
}

async function waitForBbbMeetingEnded(meetingId, { maxWaitMs = 10000 } = {}) {
  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  if (!safeMeetingId) return true;
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    runningMeetingIdsCache = { at: 0, ids: new Set() };
    const runningSet = await bbbGetRunningMeetingIdSet();
    if (!runningSet.has(safeMeetingId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Ortak BBB odasında peer oturumların eski bbb_attendee_pw / meeting_link değerleri canlı odayı gölgeler.
 * ensureBbbMeetingAlive sonrası ensured.* her zaman önceliklidir.
 */
export function resolveBbbAttendeeCredentials({ ensured = {}, row = {} } = {}) {
  const ensuredLink = String(ensured.attendeeLink || '').trim();
  const rowLink = String(row.meeting_link || '').trim();
  const meetingId =
    String(ensured.meetingId || '').trim() ||
    String(row.bbb_meeting_id || '').trim() ||
    parseBbbMeetingIdFromJoinUrl(ensuredLink) ||
    parseBbbMeetingIdFromJoinUrl(rowLink) ||
    '';

  let attendeePw =
    String(ensured.attendeePW || '').trim() ||
    parseBbbJoinCredentials(ensuredLink)?.attendeePassword ||
    '';

  if (!attendeePw) {
    const rowStoredPw = String(row.bbb_attendee_pw || '').trim();
    const rowLinkPw = parseBbbJoinCredentials(rowLink)?.attendeePassword || '';
    const rowMid = String(row.bbb_meeting_id || '').trim() || parseBbbMeetingIdFromJoinUrl(rowLink) || '';
    if (rowStoredPw && (!meetingId || !rowMid || rowMid === meetingId)) {
      attendeePw = rowStoredPw;
    } else if (rowLinkPw && rowMid && meetingId && rowMid === meetingId) {
      attendeePw = rowLinkPw;
    } else if (!meetingId) {
      attendeePw = rowStoredPw || rowLinkPw;
    }
  }

  return { meetingId, attendeePw };
}

/** Canlı getMeetingInfo ile attendee şifresini doğrular (birleşik sınıf peer satırları). */
export async function resolveLiveBbbAttendeeCredentials(opts) {
  const base = resolveBbbAttendeeCredentials(opts);
  if (base.meetingId && base.attendeePw) return base;
  if (!base.meetingId) return base;
  try {
    const live = await fetchBbbMeetingInfo(base.meetingId);
    if (live?.attendeePW) {
      return { meetingId: base.meetingId, attendeePw: live.attendeePW };
    }
  } catch {
    /* yoksay */
  }
  return base;
}

/** Öğrenciye moderator linki göstermeden join URL seçer. */
export function enrichMeetingRowJoinLink(row, actorRole) {
  if (!row || typeof row !== 'object') return row;
  const isStudent = String(actorRole || '').toLowerCase() === 'student';
  const moderator = rewriteBbbJoinUrlToConfiguredHost(String(row.meeting_link_moderator || '').trim());
  const attendee = rewriteBbbJoinUrlToConfiguredHost(String(row.meeting_link || '').trim());
  const joinLink = !isStudent && moderator ? moderator : attendee;
  if (isStudent) {
    const { meeting_link_moderator: _drop, ...rest } = row;
    return {
      ...rest,
      meeting_link: attendee || rest.meeting_link,
      join_link: joinLink
    };
  }
  return {
    ...row,
    meeting_link: attendee || row.meeting_link,
    ...(moderator ? { meeting_link_moderator: moderator } : {}),
    join_link: joinLink
  };
}

export function enrichMeetingRowsJoinLink(rows, actorRole) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => enrichMeetingRowJoinLink(row, actorRole));
}

/** BBB meetingID: yalnızca harf/rakam (UUID tireleri bazı sunucularda hata verir). */
export function sanitizeBbbMeetingId(raw) {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 80);
  return cleaned || `m${Date.now()}`;
}

/** Online görüşme (meetings tablosu): öğrenci meet_link, personel link_bbb (moderatör). */
export function enrichCoachingMeetingRow(row, actorRole) {
  if (!row || typeof row !== 'object') return row;
  const isStudent = String(actorRole || '').toLowerCase() === 'student';
  const attendee = rewriteBbbJoinUrlToConfiguredHost(String(row.meet_link || '').trim());
  const moderator = rewriteBbbJoinUrlToConfiguredHost(String(row.link_bbb || '').trim());
  const joinLink = !isStudent && moderator ? moderator : attendee;
  if (isStudent) {
    return { ...row, meet_link: attendee || row.meet_link, join_link: attendee };
  }
  return {
    ...row,
    meet_link: attendee || row.meet_link,
    ...(moderator ? { link_bbb: moderator } : {}),
    join_link: joinLink
  };
}

export function enrichCoachingMeetingRows(rows, actorRole) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => enrichCoachingMeetingRow(row, actorRole));
}

export function applyAutoBbbMeetingLinks(bbb) {
  return {
    meetLink: bbb.attendeeJoinLink,
    linkBbb: bbb.moderatorJoinLink,
    autoBbb: { ok: true, provider: 'bbb', meetingId: bbb.meetingId }
  };
}

export function isBbbJoinUrl(url) {
  const s = String(url || '').trim();
  return /meetingID=/i.test(s) && /\/join/i.test(s);
}

/**
 * Yapılandırılmış BBB API kökü (join URL üretimi / host rewrite).
 * Öncelik: BBB_PUBLIC_API_BASE → BBB_API_ENDPOINT → özel alan adı varsayılanı.
 */
export function resolveBbbJoinApiBase() {
  const explicit = trimSlash(
    process.env.BBB_PUBLIC_API_BASE ||
      process.env.BBB_JOIN_HOST_REWRITE ||
      process.env.BBB_CUSTOM_DOMAIN_API ||
      ''
  );
  if (explicit) return normalizeBbbApiBase(explicit);
  const { apiBase } = bbbApiConfig();
  // Join URL'leri API ile aynı kökü kullanmalı (örn. /bigbluebutton/Ceyhun01/api/).
  if (apiBase) return apiBase;
  return '';
}

/**
 * Kayıtlı join URL host'unu güncel BBB alan adına taşır (checksum host içermez).
 * Örn. biggerbluebutton.com → ders.dersonlinevipkocluk.com
 */
export function rewriteBbbJoinUrlToConfiguredHost(url, apiBaseOverride = null) {
  const s = String(url || '').trim();
  if (!s || isBbbAutoMeetingLink(s)) return s;
  const apiBase = normalizeBbbApiBase(apiBaseOverride || resolveBbbJoinApiBase());
  if (!apiBase) return s;
  if (!isBbbJoinUrl(s) && !isLikelyBbbJoinUrl(s)) return s;
  try {
    const u = new URL(s);
    const hasMeeting = Boolean(u.searchParams.get('meetingID'));
    const looksJoin = /\/join/i.test(u.pathname) || hasMeeting;
    if (!looksJoin) return s;
    const target = new URL(apiBase);
    const currentOrigin = u.origin.toLowerCase();
    const targetOrigin = target.origin.toLowerCase();
    const currentPathBase = `${u.origin}${u.pathname.replace(/\/?join\/?$/i, '')}/`.toLowerCase();
    const targetPathBase = apiBase.toLowerCase();
    if (currentOrigin === targetOrigin && currentPathBase === targetPathBase) return s;
    const qs = u.searchParams.toString();
    return qs ? `${apiBase}join?${qs}` : `${apiBase}join`;
  } catch {
    return s;
  }
}

/** Eksik parametreli veya biggerbluebutton host join URL'leri (ham açılınca şifre hatası verir). */
export function isLikelyBbbJoinUrl(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  if (isBbbAutoMeetingLink(s)) return true;
  if (isBbbJoinUrl(s)) return true;
  if (/bigbluebutton|biggerbluebutton|dersonlinevipkocluk/i.test(s) && /\/join/i.test(s)) return true;
  return false;
}

export function isCompleteBbbJoinUrl(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return Boolean(
      u.searchParams.get('meetingID') &&
        u.searchParams.get('password') &&
        (u.searchParams.get('checksum') || /\/join/i.test(u.pathname))
    );
  } catch {
    return false;
  }
}

/** Oda henüz açılmadı — ilk «Katıl»da BBB create çalışır (eski link süresi dolmasın diye). */
export const BBB_AUTO_MEETING_LINK = 'bbb:auto';

export function isBbbAutoMeetingLink(url) {
  return String(url || '').trim() === BBB_AUTO_MEETING_LINK;
}

/** Oturum/ ders başına sabit meetingID — yeniden oluşturmada kayıt kaybolmasın. */
export function resolveStableBbbMeetingId({ meetingKeyPrefix, storedMeetingId, attendeeLink, moderatorLink }) {
  const stored = sanitizeBbbMeetingId(String(storedMeetingId || '').trim());
  if (stored) return stored;
  const fromUrl =
    parseBbbMeetingIdFromJoinUrl(String(moderatorLink || '')) ||
    parseBbbMeetingIdFromJoinUrl(String(attendeeLink || ''));
  if (fromUrl) return sanitizeBbbMeetingId(fromUrl);
  return sanitizeBbbMeetingId(String(meetingKeyPrefix || '').trim());
}

/** Kayıt araması için olası meetingID listesi (eski link + sabit önek). */
export function collectBbbMeetingIdsForRecording(row, meetingKeyPrefix) {
  const ids = [];
  const push = (v) => {
    const id = sanitizeBbbMeetingId(String(v || '').trim());
    if (id && !ids.includes(id)) ids.push(id);
  };
  push(row?.bbb_meeting_id);
  push(parseBbbMeetingIdFromJoinUrl(String(row?.meeting_link_moderator || '')));
  push(parseBbbMeetingIdFromJoinUrl(String(row?.meeting_link || '')));
  if (meetingKeyPrefix) push(meetingKeyPrefix);
  return ids;
}

export function isBbbPlaybackUrl(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  if (/\/playback\//i.test(s)) return true;
  return /presentation/i.test(s) && !isBbbJoinUrl(s);
}

/** Kayıtlı BBB join URL'sinden meetingID çıkarır. */
export function parseBbbMeetingIdFromJoinUrl(joinUrl) {
  const s = String(joinUrl || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const id = u.searchParams.get('meetingID');
    return id ? String(id).trim() : null;
  } catch {
    return null;
  }
}

/** Kayıtlı BBB join URL'sinden meetingID ve attendee şifresi. */
export function parseBbbJoinCredentials(joinUrl) {
  const s = String(joinUrl || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const meetingID = u.searchParams.get('meetingID');
    const password = u.searchParams.get('password');
    if (!meetingID || !password) return null;
    let apiBase = `${u.origin}${u.pathname.replace(/\/?join\/?$/i, '')}/`;
    if (!apiBase.includes('/api/')) {
      apiBase = `${u.origin}/bigbluebutton/api/`;
    }
    return {
      meetingId: String(meetingID).trim(),
      attendeePassword: String(password).trim(),
      apiBase
    };
  } catch {
    return null;
  }
}

export function parseBbbPasswordFromJoinUrl(joinUrl) {
  return parseBbbJoinCredentials(joinUrl)?.attendeePassword || null;
}

export function buildStaffBbbJoinUrl({
  actorName,
  meetingId,
  moderatorPassword,
  attendeePassword,
  preferModerator = true
}) {
  const name = String(actorName || 'Öğretmen').trim().slice(0, 64) || 'Öğretmen';
  const mid = String(meetingId || '').trim();
  const modPw = String(moderatorPassword || '').trim();
  const attPw = String(attendeePassword || '').trim();
  if (!mid) return null;
  if (preferModerator && modPw) {
    return buildBbbModeratorJoinUrl({ meetingId: mid, moderatorPassword: modPw, fullName: name });
  }
  if (modPw) {
    return buildBbbModeratorJoinUrl({ meetingId: mid, moderatorPassword: modPw, fullName: name });
  }
  if (attPw) {
    return buildBbbAttendeeJoinUrl({ meetingId: mid, attendeePassword: attPw, fullName: name });
  }
  return null;
}

export function buildBbbAttendeeJoinUrl({ meetingId, attendeePassword, fullName }) {
  const { secret } = bbbApiConfig();
  const apiBase = resolveBbbJoinApiBase();
  if (!apiBase || !secret) throw new Error('BBB API ayarları eksik.');
  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  const joinQuery = asQuery({
    fullName: String(fullName || 'Öğrenci').trim().slice(0, 64) || 'Öğrenci',
    meetingID: safeMeetingId,
    password: attendeePassword,
    redirect: true
  });
  const joinChecksum = bbbChecksum('join', joinQuery, secret);
  return `${apiBase}join?${joinQuery}&checksum=${joinChecksum}`;
}

export function buildBbbModeratorJoinUrl({ meetingId, moderatorPassword, fullName }) {
  const { secret } = bbbApiConfig();
  const apiBase = resolveBbbJoinApiBase();
  if (!apiBase || !secret) throw new Error('BBB API ayarları eksik.');
  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  const joinQuery = asQuery({
    fullName: String(fullName || 'Moderatör').trim().slice(0, 64) || 'Moderatör',
    meetingID: safeMeetingId,
    password: moderatorPassword,
    redirect: true
  });
  const joinChecksum = bbbChecksum('join', joinQuery, secret);
  return `${apiBase}join?${joinQuery}&checksum=${joinChecksum}`;
}

export function isBbbAudioOnlyPlaybackUrl(url) {
  const s = String(url || '').toLowerCase();
  return /podcast|\.mp3(?:\?|$)|audioonly|audio_only|\/audio\//.test(s);
}

/**
 * BBB getRecordings bazen &lt;format&gt;&lt;url&gt; döndürmez; recordID ile playback URL üret.
 * Örn. https://ders.dersonlinevipkocluk.com/playback/presentation/2.3/{recordID}
 */
export function buildBbbPresentationPlaybackUrl(recordId) {
  const rid = String(recordId || '').trim();
  if (!rid || /[<>\s]/.test(rid)) return null;
  let origin = '';
  try {
    const joinBase = resolveBbbJoinApiBase();
    if (joinBase) origin = new URL(joinBase).origin;
  } catch {
    /* ignore */
  }
  if (!origin) {
    try {
      const { apiBase } = bbbApiConfig();
      if (apiBase) origin = new URL(apiBase).origin;
    } catch {
      /* ignore */
    }
  }
  if (!origin || /biggerbluebutton\.com/i.test(origin)) {
    origin = 'https://ders.dersonlinevipkocluk.com';
  }
  return `${origin.replace(/\/$/, '')}/playback/presentation/2.3/${encodeURIComponent(rid)}`;
}

/** Playback media kökleri — player data.biggerbluebutton.com veya özel alan adı kullanır. */
export function bbbRecordingMediaProbeUrls(recordId) {
  const rid = String(recordId || '').trim();
  if (!rid) return [];
  const enc = encodeURIComponent(rid);
  return [
    `https://data.biggerbluebutton.com/presentation/${enc}/metadata.xml`,
    `https://ders.dersonlinevipkocluk.com/presentation/${enc}/metadata.xml`,
    `https://biggerbluebutton.com/presentation/${enc}/metadata.xml`
  ];
}

/**
 * Kayıt dosyaları CDN'de gerçekten yayında mı? (playback HTML 200 olsa bile media 404 olabilir)
 */
export async function isBbbRecordingMediaReady(recordId, { timeoutMs = 8000 } = {}) {
  const urls = bbbRecordingMediaProbeUrls(recordId);
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { Accept: 'application/xml,text/xml,*/*' }
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const ct = String(res.headers.get('content-type') || '').toLowerCase();
      const text = (await res.text()).slice(0, 200);
      if (ct.includes('xml') || text.includes('<?xml') || text.includes('<recording')) {
        return { ok: true, metadataUrl: url };
      }
    } catch {
      /* sonraki host */
    }
  }
  return { ok: false, metadataUrl: null };
}

/**
 * Yayınla + media hazır olana kadar kısa poll.
 * BiggerBlueButton bazen published=true der ama /presentation altında dosya yoktur.
 * Not: Vercel timeout için attempts düşük tutulmalı; uzun bekleme client script'te yapılır.
 */
export async function ensureBbbRecordingPublishedAndReady(recordId, { attempts = 2, waitMs = 800 } = {}) {
  const rid = String(recordId || '').trim();
  if (!rid) return { ok: false, published: false, ready: false };
  let published = false;
  for (let i = 0; i < attempts; i += 1) {
    published = (await bbbPublishRecording(rid)) || published;
    const ready = await isBbbRecordingMediaReady(rid, { timeoutMs: 5000 });
    if (ready.ok) return { ok: true, published: true, ready: true, metadataUrl: ready.metadataUrl };
    if (i < attempts - 1 && waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  }
  const ready = await isBbbRecordingMediaReady(rid, { timeoutMs: 5000 });
  return { ok: ready.ok, published, ready: ready.ok, metadataUrl: ready.metadataUrl };
}

export function extractBbbRecordIdFromPlaybackUrl(url) {
  const s = String(url || '').trim();
  const m = s.match(/\/playback\/presentation\/[0-9.]+\/([A-Za-z0-9-]+)/i);
  return m?.[1] || null;
}

function parseXmlTagValues(xml, tagName) {
  const names = [];
  const cdataRe = new RegExp(`<${tagName}><!\\[CDATA\\[(.*?)\\]\\]></${tagName}>`, 'gi');
  const plainRe = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'gi');
  let m;
  while ((m = cdataRe.exec(xml))) {
    const v = String(m[1] || '').trim();
    if (v) names.push(v);
  }
  while ((m = plainRe.exec(xml))) {
    const v = String(m[1] || '').trim();
    if (v) names.push(v);
  }
  return names;
}

/**
 * Aktif toplantıdaki katılımcı isimleri (MODERATOR hariç).
 * @returns {Promise<string[]>}
 */
export async function bbbGetMeetingAttendeeNames(meetingId) {
  const detailed = await bbbGetMeetingAttendeesDetailed(meetingId);
  if (!detailed.running) return [];
  return detailed.attendees.map((a) => a.fullName).filter(Boolean);
}

/**
 * getMeetingInfo — katılımcı detayları (MODERATOR hariç).
 * @returns {Promise<{ running: boolean, attendees: Array<{ userId: string, fullName: string, hasVideo: boolean, hasJoinedVoice: boolean, isListeningOnly: boolean }> }>}
 */
export async function bbbGetMeetingAttendeesDetailed(meetingId) {
  const empty = { running: false, attendees: [] };
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) return empty;
  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  if (!safeMeetingId) return empty;

  const query = asQuery({ meetingID: safeMeetingId });
  const checksum = bbbChecksum('getMeetingInfo', query, secret);
  const url = `${apiBase}getMeetingInfo?${query}&checksum=${checksum}`;

  try {
    const res = await bbbFetch(url, { timeoutMs: BBB_JOIN_INFO_TIMEOUT_MS });
    const text = await res.text();
    if (!res.ok || !text.includes('<returncode>SUCCESS</returncode>')) return empty;

    const runningVal = String(parseXmlTagValues(text, 'running')[0] || '').toLowerCase();
    const running = runningVal === 'true';
    if (!running) return { running: false, attendees: [] };

    const attendees = [];
    const attendeeBlocks = text.match(/<attendee>[\s\S]*?<\/attendee>/gi) || [];
    for (const block of attendeeBlocks) {
      const role = (parseXmlTagValues(block, 'role')[0] || '').toUpperCase();
      if (role === 'MODERATOR') continue;
      const fullName = String(parseXmlTagValues(block, 'fullName')[0] || '').trim();
      if (!fullName) continue;
      const bool = (tag) => String(parseXmlTagValues(block, tag)[0] || '').toLowerCase() === 'true';
      attendees.push({
        userId: String(parseXmlTagValues(block, 'userID')[0] || '').trim(),
        fullName,
        hasVideo: bool('hasVideo'),
        hasJoinedVoice: bool('hasJoinedVoice'),
        isListeningOnly: bool('isListeningOnly')
      });
    }
    return { running: true, attendees };
  } catch {
    return empty;
  }
}

/**
 * Aday meetingID listesinde çalışan oturumu bulur.
 * getMeetings listesinde yok diye hemen boş dönme — meetingID adaylarını
 * getMeetingInfo ile dene (stale getMeetings / ID sanitize uyumsuzluğu).
 * @param {string[]} candidateIds
 */
export async function bbbFindRunningMeetingAttendees(candidateIds) {
  const empty = { meetingId: null, running: false, attendees: [] };
  const seen = new Set();
  const candidates = [];
  for (const raw of candidateIds || []) {
    const id = sanitizeBbbMeetingId(String(raw || '').trim());
    if (!id || seen.has(id)) continue;
    seen.add(id);
    candidates.push(id);
  }
  if (!candidates.length) return empty;

  const runningSet = await bbbGetRunningMeetingIdSet();
  const ordered = [];
  if (runningSet.size > 0) {
    for (const id of candidates) {
      if (runningSet.has(id)) ordered.push(id);
    }
  }
  for (const id of candidates) {
    if (!ordered.includes(id)) ordered.push(id);
  }

  for (const id of ordered) {
    const info = await bbbGetMeetingAttendeesDetailed(id);
    if (info.running) {
      return { meetingId: id, running: true, attendees: info.attendees || [] };
    }
  }
  return empty;
}

const BBB_RECORDING_STATES = ['published', 'unpublished', 'processed', 'processing', 'any'];

/**
 * BBB getRecordings — yayımlanmamış / işlenen kayıtlar dahil; gerekirse publishRecordings.
 * Media CDN'de yoksa URL döndürmez (boş player / 404 önlenir).
 * @returns {Promise<string | null>}
 */
export async function getBbbRecordingPlaybackUrl(meetingId) {
  const list = await listBbbRecordingsForMeetingId(meetingId);
  for (const rec of list) {
    if (!rec.recordId) {
      if (rec.playbackUrl && !isBbbAudioOnlyPlaybackUrl(rec.playbackUrl) && rec.hasFormatUrl) {
        return rec.playbackUrl;
      }
      continue;
    }
    if (!rec.published || !rec.hasFormatUrl) {
      await ensureBbbRecordingPublishedAndReady(rec.recordId, { attempts: 2, waitMs: 500 });
    } else {
      const ready = await isBbbRecordingMediaReady(rec.recordId, { timeoutMs: 5000 });
      if (!ready.ok) {
        await ensureBbbRecordingPublishedAndReady(rec.recordId, { attempts: 2, waitMs: 500 });
      }
    }
    const ready = await isBbbRecordingMediaReady(rec.recordId, { timeoutMs: 5000 });
    if (!ready.ok) continue;
    const url =
      (rec.playbackUrl && !isBbbAudioOnlyPlaybackUrl(rec.playbackUrl) && rec.hasFormatUrl
        ? rec.playbackUrl
        : null) || buildBbbPresentationPlaybackUrl(rec.recordId);
    if (url && !isBbbAudioOnlyPlaybackUrl(url)) return url;
  }
  return null;
}

/** meetingID ile kayıt listesi (zengin alanlar). */
export async function listBbbRecordingsForMeetingId(meetingId) {
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) throw new Error('BBB API ayarları eksik (BBB_API_ENDPOINT ve BBB_API_SECRET).');
  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  if (!safeMeetingId) return [];

  const out = [];
  const seen = new Set();
  for (const state of BBB_RECORDING_STATES) {
    const query = asQuery({ meetingID: safeMeetingId, state });
    const checksum = bbbChecksum('getRecordings', query, secret);
    const url = `${apiBase}getRecordings?${query}&checksum=${checksum}`;
    try {
      const res = await bbbFetch(url, { timeoutMs: 25000 });
      const text = await res.text();
      if (!res.ok || !text.includes('<returncode>SUCCESS</returncode>')) continue;
      for (const rec of parseBbbRecordingsXml(text, safeMeetingId)) {
        const key = rec.recordId || rec.playbackUrl || `${rec.meetingId}|${rec.startTimeMs}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(rec);
      }
    } catch {
      /* state denemeye devam */
    }
  }
  return out;
}

/**
 * Tarih aralığındaki BBB kayıtlarını listeler (meetingID şart değil).
 * BBB startTime/endTime: epoch ms.
 */
export async function listBbbRecordingsBetween(startMs, endMs) {
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) throw new Error('BBB API ayarları eksik (BBB_API_ENDPOINT ve BBB_API_SECRET).');
  const from = Number(startMs);
  const to = Number(endMs);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];

  const out = [];
  const seen = new Set();
  for (const state of ['published', 'any', 'processed', 'unpublished']) {
    const query = asQuery({
      state,
      startTime: String(Math.floor(from)),
      endTime: String(Math.floor(to))
    });
    const checksum = bbbChecksum('getRecordings', query, secret);
    const url = `${apiBase}getRecordings?${query}&checksum=${checksum}`;
    try {
      const res = await bbbFetch(url, { timeoutMs: 45000 });
      const text = await res.text();
      if (!res.ok || !text.includes('<returncode>SUCCESS</returncode>')) continue;
      for (const rec of parseBbbRecordingsXml(text, null)) {
        const key = rec.recordId || rec.playbackUrl || `${rec.meetingId}|${rec.startTimeMs}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(rec);
      }
      if (out.length) break;
    } catch {
      /* sonraki state */
    }
  }
  return out;
}

function normRecName(s) {
  return String(s || '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, ' ');
}

/**
 * Oturum satırı için kayıt URL'si: önce meetingID, yoksa gün+saat+branş eşlemesi.
 * @param {{ bbb_meeting_id?: string, meeting_link?: string, meeting_link_moderator?: string, subject?: string, lesson_date?: string, start_time?: string, end_time?: string }} row
 * @param {string[]} extraMeetingIds
 */
export async function resolveBbbRecordingPlaybackForSessionRow(row, extraMeetingIds = []) {
  const ids = [];
  const push = (v) => {
    const id = sanitizeBbbMeetingId(String(v || '').trim());
    if (id && !ids.includes(id)) ids.push(id);
  };
  for (const x of extraMeetingIds || []) push(x);
  push(row?.bbb_meeting_id);
  push(parseBbbMeetingIdFromJoinUrl(String(row?.meeting_link_moderator || '')));
  push(parseBbbMeetingIdFromJoinUrl(String(row?.meeting_link || '')));

  for (const id of ids.slice(0, 6)) {
    const url = await getBbbRecordingPlaybackUrl(id);
    if (url) return { playbackUrl: url, matchedBy: 'meeting_id', meetingId: id };
  }

  // meetingID biliniyorsa ama media hazır değilse gün boyu tarama yapma (Vercel timeout)
  if (ids.length) return null;

  const date = String(row?.lesson_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const startHm = String(row?.start_time || '00:00:00').slice(0, 8);
  const endHm = String(row?.end_time || startHm).slice(0, 8);
  const dayStart = Date.parse(`${date}T00:00:00+03:00`);
  const dayEnd = Date.parse(`${date}T23:59:59+03:00`);
  if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd)) return null;

  const lessonStart = Date.parse(`${date}T${/^\d{2}:\d{2}$/.test(startHm) ? `${startHm}:00` : startHm}+03:00`);
  const lessonEnd = Date.parse(`${date}T${/^\d{2}:\d{2}$/.test(endHm) ? `${endHm}:00` : endHm}+03:00`);
  const subject = normRecName(row?.subject);
  const range = await listBbbRecordingsBetween(dayStart - 3600_000, dayEnd + 3600_000);
  if (!range.length) return null;

  const scored = [];
  for (const rec of range) {
    if (!rec.playbackUrl || isBbbAudioOnlyPlaybackUrl(rec.playbackUrl)) continue;
    // Ham skor — media probe sadece ilk adaylarda
    let score = 0;
    if (ids.includes(rec.meetingId)) score += 100;
    const name = normRecName(rec.name);
    if (subject && name && (name.includes(subject) || subject.includes(name))) score += 40;
    if (Number.isFinite(lessonStart) && Number.isFinite(rec.startTimeMs) && rec.startTimeMs > 0) {
      const delta = Math.abs(rec.startTimeMs - lessonStart);
      if (delta <= 20 * 60_000) score += 35;
      else if (delta <= 90 * 60_000) score += 15;
      else if (delta <= 4 * 3600_000) score += 5;
      else score -= 20;
    }
    if (Number.isFinite(lessonEnd) && Number.isFinite(rec.endTimeMs) && rec.endTimeMs > 0) {
      if (rec.endTimeMs >= lessonStart - 10 * 60_000 && rec.startTimeMs <= lessonEnd + 10 * 60_000) {
        score += 10;
      }
    }
    if (rec.hasFormatUrl) score += 5;
    if (score > 0) scored.push({ rec, score });
  }
  scored.sort((a, b) => b.score - a.score);

  for (const { rec, score } of scored.slice(0, 5)) {
    if (score < 40) break;
    if (rec.recordId) {
      let ready = await isBbbRecordingMediaReady(rec.recordId, { timeoutMs: 4000 });
      if (!ready.ok && !rec.hasFormatUrl) {
        await ensureBbbRecordingPublishedAndReady(rec.recordId, { attempts: 2, waitMs: 500 });
        ready = await isBbbRecordingMediaReady(rec.recordId, { timeoutMs: 4000 });
      }
      if (!ready.ok) continue;
    }
    if (!rec.published && rec.recordId) {
      await bbbPublishRecording(rec.recordId);
    }
    const playbackUrl =
      (rec.hasFormatUrl && rec.playbackUrl) || buildBbbPresentationPlaybackUrl(rec.recordId);
    if (!playbackUrl || isBbbAudioOnlyPlaybackUrl(playbackUrl)) continue;
    return {
      playbackUrl,
      matchedBy: 'time_name',
      meetingId: rec.meetingId || null,
      score,
      name: rec.name || null
    };
  }
  return null;
}

function parseBbbRecordingsXml(text, expectedMeetingId) {
  const results = [];
  const recordingBlocks = text.match(/<recording>[\s\S]*?<\/recording>/gi) || [];
  for (const block of recordingBlocks) {
    const blockMeetingId = sanitizeBbbMeetingId(parseXmlTagValues(block, 'meetingID')[0] || '');
    if (expectedMeetingId && blockMeetingId && blockMeetingId !== expectedMeetingId) continue;
    const recordId = String(
      parseXmlTagValues(block, 'recordID')[0] || parseXmlTagValues(block, 'recordId')[0] || ''
    ).trim();
    const publishedRaw = (parseXmlTagValues(block, 'published')[0] || '').toLowerCase();
    const published = publishedRaw === 'true';
    const name =
      parseXmlTagValues(block, 'name')[0] ||
      parseXmlTagValues(block, 'meetingName')[0] ||
      parseXmlTagValues(block, 'meeting_name')[0] ||
      '';
    const startTimeMs = Number(parseXmlTagValues(block, 'startTime')[0] || 0) || 0;
    const endTimeMs = Number(parseXmlTagValues(block, 'endTime')[0] || 0) || 0;
    const formatBlocks = block.match(/<format>[\s\S]*?<\/format>/gi) || [];
    let playbackUrl = null;
    let fallbackUrl = null;
    for (const fb of formatBlocks) {
      const type = (parseXmlTagValues(fb, 'type')[0] || '').toLowerCase();
      const playback = parseXmlTagValues(fb, 'url')[0];
      if (!playback) continue;
      if (type === 'presentation') {
        playbackUrl = playback;
        break;
      }
      if (type === 'video' && !playbackUrl) playbackUrl = playback;
      if ((type === 'podcast' || type === 'audio') && !fallbackUrl) fallbackUrl = playback;
      else if (!fallbackUrl && !isBbbAudioOnlyPlaybackUrl(playback)) fallbackUrl = playback;
    }
    // Bazı sunucular format/url yerine doğrudan playback linki veya boş format döner
    if (!playbackUrl && !fallbackUrl) {
      const hrefMatch = String(block).match(
        /https?:\/\/[^\s"'<>]+\/playback\/presentation\/[0-9.]+\/[A-Za-z0-9-]+/i
      );
      if (hrefMatch?.[0]) playbackUrl = hrefMatch[0];
    }
    let chosen = playbackUrl || fallbackUrl || parseXmlTagValues(block, 'url')[0] || null;
    if (chosen && isBbbAudioOnlyPlaybackUrl(chosen)) {
      chosen = playbackUrl && !isBbbAudioOnlyPlaybackUrl(playbackUrl) ? playbackUrl : null;
    }
    const hasFormatUrl = Boolean(chosen);
    // format/url yoksa URL uydurma — CDN'de dosya olmayabilir; publish+probe sonrası eklenir
    if (!chosen && recordId) {
      chosen = buildBbbPresentationPlaybackUrl(recordId);
    }
    results.push({
      meetingId: blockMeetingId || null,
      recordId,
      published,
      name: String(name || '').trim(),
      startTimeMs,
      endTimeMs,
      hasFormatUrl,
      playbackUrl: chosen || null
    });
  }
  return results;
}

export async function bbbPublishRecording(recordId) {
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret || !recordId) return false;
  const query = asQuery({ recordID: recordId, publish: 'true' });
  const checksum = bbbChecksum('publishRecordings', query, secret);
  const url = `${apiBase}publishRecordings?${query}&checksum=${checksum}`;
  try {
    const res = await bbbFetch(url, { timeoutMs: 12000 });
    const text = await res.text();
    return res.ok && text.includes('<returncode>SUCCESS</returncode>');
  } catch {
    return false;
  }
}

/** Birden fazla meetingID dene (oda yenilense bile eski kayıt). */
export async function getBbbRecordingPlaybackUrlForMeetingIds(meetingIds) {
  const list = (Array.isArray(meetingIds) ? meetingIds : []).slice(0, 4);
  for (const raw of list) {
    const playbackUrl = await getBbbRecordingPlaybackUrl(raw);
    if (playbackUrl) return playbackUrl;
  }
  return null;
}

export async function fetchBbbMeetingInfo(meetingId, { timeoutMs = BBB_JOIN_INFO_TIMEOUT_MS } = {}) {
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) return null;
  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  if (!safeMeetingId) return null;

  const query = asQuery({ meetingID: safeMeetingId });
  const checksum = bbbChecksum('getMeetingInfo', query, secret);
  const url = `${apiBase}getMeetingInfo?${query}&checksum=${checksum}`;

  try {
    const res = await bbbFetch(url, { timeoutMs });
    const text = await res.text();
    if (!res.ok || !text.includes('<returncode>SUCCESS</returncode>')) return null;
    const attendeePW = String(parseXmlTagValues(text, 'attendeePW')[0] || '').trim();
    if (!attendeePW) return null;
    const moderatorPW = String(parseXmlTagValues(text, 'moderatorPW')[0] || '').trim() || null;
    const runningRaw = (parseXmlTagValues(text, 'running')[0] || '').toLowerCase();
    const participantCount = Math.max(0, Number(parseXmlTagValues(text, 'participantCount')[0]) || 0);
    return {
      meetingId: safeMeetingId,
      attendeePW,
      moderatorPW,
      running: runningRaw === 'true',
      participantCount,
      webcamsOnlyForModerator: parseBbbBoolXmlTag(text, 'webcamsOnlyForModerator'),
      metadata: parseBbbMetadataXml(text)
    };
  } catch {
    return null;
  }
}

/** Çalışan veya kayıtlı BBB oturumunu sonlandırır (yeni create için). */
export async function bbbEndMeeting(meetingId, { moderatorPW = null, timeoutMs = BBB_FETCH_TIMEOUT_MS } = {}) {
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) return false;
  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  if (!safeMeetingId) return false;

  const params = { meetingID: safeMeetingId };
  const modPw = String(moderatorPW || '').trim();
  if (modPw) params.password = modPw;
  const query = asQuery(params);
  const checksum = bbbChecksum('end', query, secret);
  const url = `${apiBase}end?${query}&checksum=${checksum}`;

  try {
    const res = await bbbFetch(url, { timeoutMs });
    const text = await res.text();
    return res.ok && text.includes('<returncode>SUCCESS</returncode>');
  } catch {
    return false;
  }
}

/**
 * Eski etüt odaları webcamsOnlyForModerator=true ile oluşturulmuş olabilir; viewer kamerası açılmaz.
 * Metadata işareti yoksa veya kamera kısıtlıysa oturumu kapatıp yeniden create edilir.
 */
async function refreshSharedViewerCameraRoom(stableMeetingId, live) {
  if (!isSharedViewerCameraMeetingId(stableMeetingId) || !live?.attendeePW) return live;
  if (sharedViewerCameraRoomReady(live)) return live;

  clearCachedBbbRoom(stableMeetingId);
  await bbbEndMeeting(stableMeetingId, { moderatorPW: live.moderatorPW });
  runningMeetingIdsCache = { at: 0, ids: new Set() };
  await waitForBbbMeetingEnded(stableMeetingId);
  return null;
}

function ensuredFromRoomCreds(creds, { attendeeName, moderatorName, refreshed = false }) {
  const { attendeeJoinLink, moderatorJoinLink } = joinLinksFromRoomCreds({
    meetingId: creds.meetingId,
    attendeePW: creds.attendeePW,
    moderatorPW: creds.moderatorPW,
    attendeeName,
    moderatorName
  });
  return {
    refreshed,
    attendeeLink: attendeeJoinLink,
    moderatorLink: moderatorJoinLink,
    meetingId: creds.meetingId,
    attendeePW: creds.attendeePW,
    moderatorPW: creds.moderatorPW
  };
}

export async function bbbMeetingExists(meetingId) {
  const info = await fetchBbbMeetingInfo(meetingId, { timeoutMs: BBB_JOIN_INFO_TIMEOUT_MS });
  return Boolean(info?.attendeePW);
}

/**
 * BBB join linki varsa odanın sunucuda hâlâ var olduğunu doğrular; yoksa yeni oda açar.
 * @returns {Promise<{ refreshed: boolean, attendeeLink: string, moderatorLink: string | null, meetingId?: string }>}
 */
export async function ensureBbbMeetingAlive({
  attendeeLink,
  moderatorLink,
  meetingName,
  attendeeName,
  moderatorName,
  durationMinutes,
  meetingKeyPrefix,
  storedMeetingId,
  logoutUrl = null
}) {
  const attendee = String(attendeeLink || '').trim();
  const moderator = String(moderatorLink || '').trim();
  const probeUrl = moderator || attendee;
  const stableMeetingId = resolveStableBbbMeetingId({
    meetingKeyPrefix,
    storedMeetingId,
    attendeeLink: attendee,
    moderatorLink: moderator
  });

  const createWithStableId = async () => {
    const bbb = await createBbbMeetingAndJoinLink({
      meetingId: stableMeetingId,
      meetingName,
      attendeeName,
      moderatorName,
      durationMinutes,
      logoutUrl
    });
    setCachedBbbRoom(stableMeetingId, bbb);
    return {
      refreshed: true,
      attendeeLink: bbb.attendeeJoinLink,
      moderatorLink: bbb.moderatorJoinLink,
      meetingId: bbb.meetingId,
      attendeePW: bbb.attendeePW,
      moderatorPW: bbb.moderatorPW
    };
  };

  const tryReuseStableRoom = async () => {
    const needsViewerCameraCheck = isSharedViewerCameraMeetingId(stableMeetingId);
    if (!needsViewerCameraCheck) {
      const cached = getCachedBbbRoom(stableMeetingId);
      if (cached?.attendeePW) {
        return ensuredFromRoomCreds(cached, { attendeeName, moderatorName });
      }
    }

    const live = await fetchBbbMeetingInfo(stableMeetingId);
    if (!live?.attendeePW) return null;

    const validated = await refreshSharedViewerCameraRoom(stableMeetingId, live);
    if (!validated) return null;

    setCachedBbbRoom(stableMeetingId, validated);
    return ensuredFromRoomCreds(validated, { attendeeName, moderatorName });
  };

  if (isBbbAutoMeetingLink(attendee) || isBbbAutoMeetingLink(moderator)) {
    if (!isBbbConfigured()) {
      throw new Error(
        'BBB otomatik ders ayarlı ancak BBB_API_ENDPOINT / BBB_API_SECRET tanımlı değil.'
      );
    }
    const reused = await tryReuseStableRoom();
    if (reused) return reused;
    return createWithStableId();
  }

  if (!isBbbJoinUrl(probeUrl)) {
    const brokenBbb = isLikelyBbbJoinUrl(probeUrl) && !isCompleteBbbJoinUrl(probeUrl);
    if ((!probeUrl || brokenBbb) && isBbbConfigured() && meetingKeyPrefix) {
      const reused = await tryReuseStableRoom();
      if (reused) return reused;
      return createWithStableId();
    }
    return {
      refreshed: false,
      attendeeLink: rewriteBbbJoinUrlToConfiguredHost(attendee),
      moderatorLink: moderator ? rewriteBbbJoinUrlToConfiguredHost(moderator) : null
    };
  }

  const rawMeetingId =
    parseBbbMeetingIdFromJoinUrl(moderator) || parseBbbMeetingIdFromJoinUrl(attendee) || stableMeetingId;
  if (rawMeetingId) {
    let live = await fetchBbbMeetingInfo(rawMeetingId);
    if (!live?.attendeePW && rawMeetingId !== sanitizeBbbMeetingId(rawMeetingId)) {
      live = await fetchBbbMeetingInfo(sanitizeBbbMeetingId(rawMeetingId));
    }
    if (live?.attendeePW) {
      setCachedBbbRoom(live.meetingId, live);
      return ensuredFromRoomCreds(live, { attendeeName, moderatorName });
    }
  }

  if (!isBbbConfigured()) {
    throw new Error(
      'BBB toplantısı sunucuda bulunamadı (süresi dolmuş veya silinmiş). BBB_API_ENDPOINT ayarlarını kontrol edin.'
    );
  }

  return createWithStableId();
}

export async function createBbbMeetingAndJoinLink({
  meetingId,
  meetingName,
  attendeeName,
  moderatorName,
  durationMinutes = 60,
  logoutUrl = null,
  meetingMetadata = null
}) {
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) {
    throw new Error('BBB API ayarları eksik (BBB_API_ENDPOINT ve BBB_API_SECRET).');
  }

  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  if (!safeMeetingId) throw new Error('BBB meeting ID boş olamaz.');

  const attendeePW = `a-${crypto.randomBytes(5).toString('hex')}`;
  const moderatorPW = `m-${crypto.randomBytes(5).toString('hex')}`;
  const recording = bbbRecordingCreateParams();
  const lockParams = bbbMeetingLockParams();
  const viewerAccess = bbbMeetingViewerAccessParams();
  const resolvedLogout = String(logoutUrl || '').trim() || null;

  const metaEntries = {
    ...(meetingMetadata && typeof meetingMetadata === 'object' ? meetingMetadata : {})
  };
  if (isSharedViewerCameraMeetingId(safeMeetingId)) {
    metaEntries[BBB_VIEWER_CAMERAS_META_KEY] = BBB_VIEWER_CAMERAS_META_VALUE;
  }

  const createQuery = asQuery({
    name: meetingName || 'Koçluk görüşmesi',
    meetingID: safeMeetingId,
    attendeePW,
    moderatorPW,
    duration: resolveBbbMeetingDurationMinutes(durationMinutes),
    record: recording.record,
    allowStartStopRecording: recording.allowStartStopRecording,
    autoStartRecording: recording.autoStartRecording,
    recordFullDurationMedia: recording.recordFullDurationMedia,
    ...(resolvedLogout ? { logoutURL: resolvedLogout } : {}),
    ...Object.fromEntries(
      Object.entries(metaEntries)
        .filter(([, v]) => v != null && String(v).trim() !== '')
        .map(([k, v]) => [`meta_${k}`, String(v).trim()])
    ),
    ...lockParams,
    ...viewerAccess
  });
  const createChecksum = bbbChecksum('create', createQuery, secret);
  const createUrl = `${apiBase}create?${createQuery}&checksum=${createChecksum}`;

  const createRes = await bbbFetch(createUrl, { timeoutMs: BBB_CREATE_TIMEOUT_MS });
  const createText = await createRes.text();
  if (!createRes.ok || !createText.includes('<returncode>SUCCESS</returncode>')) {
    const bbbErr = parseBbbXmlError(createText);
    if (bbbErr?.messageKey === 'checksumError') {
      const ep = describeBbbApiEndpoint();
      throw new Error(
        'BBB API secret uyuşmuyor (checksumError). Vercel → BBB_API_SECRET değerini BBB panelindeki Salt/API Secret ile birebir güncelleyin. ' +
          `Endpoint: ${ep.host || '?'}${ep.path || ''}`
      );
    }
    throw new Error(`BBB create başarısız: ${createText.slice(0, 280)}`);
  }

  let resolvedAttendeePW = attendeePW;
  let resolvedModeratorPW = moderatorPW;
  const fromCreate = resolveBbbCreateCredentials(createText, { attendeePW, moderatorPW });
  if (fromCreate.attendeePW) resolvedAttendeePW = fromCreate.attendeePW;
  if (fromCreate.moderatorPW) resolvedModeratorPW = fromCreate.moderatorPW;
  if (!fromCreate.attendeePW || !fromCreate.moderatorPW) {
    const live = await fetchBbbMeetingInfo(safeMeetingId);
    if (live?.attendeePW) resolvedAttendeePW = live.attendeePW;
    if (live?.moderatorPW) resolvedModeratorPW = live.moderatorPW;
  }

  const joinQuery = asQuery({
    fullName: attendeeName || moderatorName || 'Katılımcı',
    meetingID: safeMeetingId,
    password: resolvedAttendeePW,
    redirect: true
  });
  const joinBase = resolveBbbJoinApiBase() || apiBase;
  const joinChecksum = bbbChecksum('join', joinQuery, secret);
  const attendeeJoinLink = `${joinBase}join?${joinQuery}&checksum=${joinChecksum}`;

  const coachJoinQuery = asQuery({
    fullName: moderatorName || attendeeName || 'Koç',
    meetingID: safeMeetingId,
    password: resolvedModeratorPW,
    redirect: true
  });
  const coachJoinChecksum = bbbChecksum('join', coachJoinQuery, secret);
  const moderatorJoinLink = `${joinBase}join?${coachJoinQuery}&checksum=${coachJoinChecksum}`;

  return {
    attendeeJoinLink,
    moderatorJoinLink,
    meetingId: safeMeetingId,
    attendeePW: resolvedAttendeePW,
    moderatorPW: resolvedModeratorPW
  };
}
