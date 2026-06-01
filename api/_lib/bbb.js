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

/** BBB create: kayıt özelliği açık, otomatik başlangıç kapalı (öğretmen manuel başlatır). */
export function bbbRecordingCreateParams() {
  const record = String(process.env.BBB_RECORD ?? 'true').toLowerCase() !== 'false';
  const autoStartRecording =
    String(process.env.BBB_AUTO_START_RECORDING || 'false').toLowerCase() === 'true';
  const allowStartStopRecording =
    String(process.env.BBB_ALLOW_START_STOP_RECORDING ?? 'true').toLowerCase() !== 'false';
  return {
    record,
    autoStartRecording,
    allowStartStopRecording: record && allowStartStopRecording
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
  meetingKeyPrefix
}) {
  const attendee = String(attendeeLink || '').trim();
  const moderator = String(moderatorLink || '').trim();
  const probeUrl = moderator || attendee;

  if (!isBbbJoinUrl(probeUrl)) {
    return { refreshed: false, attendeeLink: attendee, moderatorLink: moderator || null };
  }

  const rawMeetingId =
    parseBbbMeetingIdFromJoinUrl(moderator) || parseBbbMeetingIdFromJoinUrl(attendee);
  let exists = false;
  if (rawMeetingId) {
    exists = await bbbMeetingExists(rawMeetingId);
    if (!exists && rawMeetingId !== sanitizeBbbMeetingId(rawMeetingId)) {
      exists = await bbbMeetingExists(sanitizeBbbMeetingId(rawMeetingId));
    }
  }

  if (exists) {
    return { refreshed: false, attendeeLink: attendee, moderatorLink: moderator || null };
  }

  if (!isBbbConfigured()) {
    throw new Error(
      'BBB toplantısı sunucuda bulunamadı (süresi dolmuş veya silinmiş). BBB_API_ENDPOINT ayarlarını kontrol edin.'
    );
  }

  const bbb = await createBbbMeetingAndJoinLink({
    meetingId: sanitizeBbbMeetingId(`${meetingKeyPrefix}${Date.now()}`),
    meetingName,
    attendeeName,
    moderatorName,
    durationMinutes
  });

  return {
    refreshed: true,
    attendeeLink: bbb.attendeeJoinLink,
    moderatorLink: bbb.moderatorJoinLink,
    meetingId: bbb.meetingId
  };
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

  const createQuery = asQuery({
    name: meetingName || 'Koçluk görüşmesi',
    meetingID: safeMeetingId,
    attendeePW,
    moderatorPW,
    duration: Math.max(15, Number(durationMinutes) || 60),
    record: recording.record,
    allowStartStopRecording: recording.allowStartStopRecording,
    autoStartRecording: recording.autoStartRecording
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
    meetingId: safeMeetingId
  };
}
