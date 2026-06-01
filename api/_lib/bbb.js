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

  const safeMeetingId = String(meetingId || '').trim();
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
