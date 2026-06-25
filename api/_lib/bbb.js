import crypto from 'crypto';

function trimSlash(v) {
  return String(v || '').trim().replace(/\/+$/, '');
}

function normalizeBbbApiBase(raw) {
  const base = trimSlash(raw);
  if (!base) return '';
  if (base.includes('/api')) return `${base}/`;
  return `${base}/api/`;
}

function sha1(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function bbbChecksum(callName, query, secret) {
  return sha1(`${callName}${query}${secret}`);
}

function asQuery(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v == null) return;
    sp.set(k, String(v));
  });
  return sp.toString();
}

const BBB_FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.BBB_FETCH_TIMEOUT_MS || 22000) || 22000
);

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

/** GET /api/bbb-health?probe=1 — BBB API erişilebilir mi? */
export async function probeBbbApiReachable() {
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) {
    return { ok: false, error: 'BBB API ayarları eksik.', ms: 0 };
  }
  const started = Date.now();
  const query = asQuery({});
  const checksum = bbbChecksum('getMeetings', query, secret);
  const url = `${apiBase}getMeetings?${query}&checksum=${checksum}`;
  try {
    const res = await bbbFetch(url, { timeoutMs: Math.min(BBB_FETCH_TIMEOUT_MS, 15000) });
    const text = await res.text();
    const ms = Date.now() - started;
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, ms, status: res.status };
    }
    if (!text.includes('<returncode>SUCCESS</returncode>')) {
      return { ok: false, error: 'BBB getMeetings başarısız', ms };
    }
    return { ok: true, ms };
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
    secret: String(secret || '').trim()
  };
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

/** Öğrenciye moderator linki göstermeden join URL seçer. */
export function enrichMeetingRowJoinLink(row, actorRole) {
  if (!row || typeof row !== 'object') return row;
  const isStudent = String(actorRole || '').toLowerCase() === 'student';
  const moderator = String(row.meeting_link_moderator || '').trim();
  const attendee = String(row.meeting_link || '').trim();
  const joinLink = !isStudent && moderator ? moderator : attendee;
  if (isStudent) {
    const { meeting_link_moderator: _drop, ...rest } = row;
    return { ...rest, join_link: joinLink };
  }
  return { ...row, join_link: joinLink };
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
  const attendee = String(row.meet_link || '').trim();
  const moderator = String(row.link_bbb || '').trim();
  const joinLink = !isStudent && moderator ? moderator : attendee;
  if (isStudent) {
    return { ...row, join_link: attendee };
  }
  return { ...row, join_link: joinLink };
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

export function buildBbbAttendeeJoinUrl({ meetingId, attendeePassword, fullName }) {
  const { apiBase, secret } = bbbApiConfig();
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
  const { apiBase, secret } = bbbApiConfig();
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
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) return [];
  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  if (!safeMeetingId) return [];

  const query = asQuery({ meetingID: safeMeetingId });
  const checksum = bbbChecksum('getMeetingInfo', query, secret);
  const url = `${apiBase}getMeetingInfo?${query}&checksum=${checksum}`;

  try {
    const res = await bbbFetch(url, { timeoutMs: 12000 });
    const text = await res.text();
    if (!res.ok || !text.includes('<returncode>SUCCESS</returncode>')) return [];

    const roles = parseXmlTagValues(text, 'role');
    const fullNames = parseXmlTagValues(text, 'fullName');
    const attendees = [];
    const attendeeBlocks = text.match(/<attendee>[\s\S]*?<\/attendee>/gi) || [];
    if (attendeeBlocks.length) {
      for (const block of attendeeBlocks) {
        const role = (parseXmlTagValues(block, 'role')[0] || '').toUpperCase();
        if (role === 'MODERATOR') continue;
        const fn = parseXmlTagValues(block, 'fullName')[0];
        if (fn) attendees.push(fn);
      }
      return attendees;
    }
    for (let i = 0; i < fullNames.length; i++) {
      const role = (roles[i] || '').toUpperCase();
      if (role === 'MODERATOR') continue;
      if (fullNames[i]) attendees.push(fullNames[i]);
    }
    return attendees;
  } catch {
    return [];
  }
}

/**
 * BBB getRecordings — yayımlanmamış kayıtlar dahil (state=any), gerekirse publishRecordings.
 * @returns {Promise<string | null>}
 */
export async function getBbbRecordingPlaybackUrl(meetingId) {
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) throw new Error('BBB API ayarları eksik (BBB_API_ENDPOINT ve BBB_API_SECRET).');
  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  if (!safeMeetingId) return null;

  for (const state of ['published', 'any']) {
    const query = asQuery({ meetingID: safeMeetingId, state });
    const checksum = bbbChecksum('getRecordings', query, secret);
    const url = `${apiBase}getRecordings?${query}&checksum=${checksum}`;

    const res = await bbbFetch(url);
    const text = await res.text();
    if (!res.ok || !text.includes('<returncode>SUCCESS</returncode>')) continue;

    const parsed = parseBbbRecordingsXml(text, safeMeetingId);
    for (const rec of parsed) {
      if (!rec.published && rec.recordId) {
        await bbbPublishRecording(rec.recordId);
      }
      if (rec.playbackUrl && !isBbbAudioOnlyPlaybackUrl(rec.playbackUrl)) return rec.playbackUrl;
    }
  }
  return null;
}

function parseBbbRecordingsXml(text, expectedMeetingId) {
  const results = [];
  const recordingBlocks = text.match(/<recording>[\s\S]*?<\/recording>/gi) || [];
  for (const block of recordingBlocks) {
    const blockMeetingId = sanitizeBbbMeetingId(parseXmlTagValues(block, 'meetingID')[0] || '');
    if (expectedMeetingId && blockMeetingId && blockMeetingId !== expectedMeetingId) continue;
    const recordId = parseXmlTagValues(block, 'recordID')[0] || parseXmlTagValues(block, 'recordId')[0] || '';
    const publishedRaw = (parseXmlTagValues(block, 'published')[0] || '').toLowerCase();
    const published = publishedRaw === 'true';
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
    const chosen = playbackUrl || fallbackUrl || parseXmlTagValues(block, 'url')[0] || null;
    results.push({
      recordId: String(recordId || '').trim(),
      published,
      playbackUrl: chosen && !isBbbAudioOnlyPlaybackUrl(chosen) ? chosen : playbackUrl || null
    });
  }
  return results;
}

async function bbbPublishRecording(recordId) {
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

export async function bbbMeetingExists(meetingId) {
  const { apiBase, secret } = bbbApiConfig();
  if (!apiBase || !secret) return false;
  const safeMeetingId = sanitizeBbbMeetingId(meetingId);
  if (!safeMeetingId) return false;

  const query = asQuery({ meetingID: safeMeetingId });
  const checksum = bbbChecksum('getMeetingInfo', query, secret);
  const url = `${apiBase}getMeetingInfo?${query}&checksum=${checksum}`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    return res.ok && text.includes('<returncode>SUCCESS</returncode>');
  } catch {
    return false;
  }
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
  storedMeetingId
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
      durationMinutes
    });
    return {
      refreshed: true,
      attendeeLink: bbb.attendeeJoinLink,
      moderatorLink: bbb.moderatorJoinLink,
      meetingId: bbb.meetingId,
      attendeePW: bbb.attendeePW,
      moderatorPW: bbb.moderatorPW
    };
  };

  if (isBbbAutoMeetingLink(attendee) || isBbbAutoMeetingLink(moderator)) {
    if (!isBbbConfigured()) {
      throw new Error(
        'BBB otomatik ders ayarlı ancak BBB_API_ENDPOINT / BBB_API_SECRET tanımlı değil.'
      );
    }
    return createWithStableId();
  }

  if (!isBbbJoinUrl(probeUrl)) {
    if (!probeUrl && isBbbConfigured() && meetingKeyPrefix) {
      return createWithStableId();
    }
    return { refreshed: false, attendeeLink: attendee, moderatorLink: moderator || null };
  }

  const rawMeetingId =
    parseBbbMeetingIdFromJoinUrl(moderator) || parseBbbMeetingIdFromJoinUrl(attendee) || stableMeetingId;
  let exists = false;
  if (rawMeetingId) {
    exists = await bbbMeetingExists(rawMeetingId);
    if (!exists && rawMeetingId !== sanitizeBbbMeetingId(rawMeetingId)) {
      exists = await bbbMeetingExists(sanitizeBbbMeetingId(rawMeetingId));
    }
  }

  if (exists) {
    return {
      refreshed: false,
      attendeeLink: attendee,
      moderatorLink: moderator || null,
      meetingId: sanitizeBbbMeetingId(rawMeetingId)
    };
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
  durationMinutes = 60
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
    ...lockParams
  });
  const createChecksum = bbbChecksum('create', createQuery, secret);
  const createUrl = `${apiBase}create?${createQuery}&checksum=${createChecksum}`;

  const createRes = await fetch(createUrl);
  const createText = await createRes.text();
  if (!createRes.ok || !createText.includes('<returncode>SUCCESS</returncode>')) {
    throw new Error(`BBB create başarısız: ${createText.slice(0, 280)}`);
  }

  const joinQuery = asQuery({
    fullName: attendeeName || moderatorName || 'Katılımcı',
    meetingID: safeMeetingId,
    password: attendeePW,
    redirect: true
  });
  const joinChecksum = bbbChecksum('join', joinQuery, secret);
  const attendeeJoinLink = `${apiBase}join?${joinQuery}&checksum=${joinChecksum}`;

  const coachJoinQuery = asQuery({
    fullName: moderatorName || attendeeName || 'Koç',
    meetingID: safeMeetingId,
    password: moderatorPW,
    redirect: true
  });
  const coachJoinChecksum = bbbChecksum('join', coachJoinQuery, secret);
  const moderatorJoinLink = `${apiBase}join?${coachJoinQuery}&checksum=${coachJoinChecksum}`;

  return {
    attendeeJoinLink,
    moderatorJoinLink,
    meetingId: safeMeetingId,
    attendeePW,
    moderatorPW
  };
}
