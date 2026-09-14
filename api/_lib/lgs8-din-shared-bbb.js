const BBB_AUTO_MEETING_LINK = 'bbb:auto';

function sanitizeBbbMeetingId(raw) {
  return String(raw || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 80);
}

/** 8A+8C ve 8B+8F Din Kültürü — tek öğretmen, tek BBB odası. */
export const LGS8_DIN_PAIRS = [
  ['8A', '8C'],
  ['8B', '8F']
];

function normTr(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDinKulturuSubject(subject) {
  const s = normTr(subject);
  if (!s) return false;
  if (s.includes('analiz')) return false;
  if (s.includes('din') && s.includes('kultur')) return true;
  return s === 'din';
}

/** 8A / 8-B / 8C / 8F */
export function extractLgs8Section(className, classLevel) {
  const blob = `${className || ''} ${classLevel || ''}`
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I');
  const m = blob.match(/(?:^|[^\d])8\s*[-.]?\s*([ABCEF])\b/);
  return m ? `8${m[1]}` : null;
}

export function lgs8DinPairId(className, classLevel) {
  const section = extractLgs8Section(className, classLevel);
  if (!section) return null;
  for (const pair of LGS8_DIN_PAIRS) {
    if (pair.includes(section)) return pair.map((x) => x.toLowerCase()).join('');
  }
  return null;
}

function startHmm(startTime) {
  const raw = String(startTime || '').trim();
  if (/^\d{2}:\d{2}/.test(raw)) return raw.slice(0, 5).replace(':', '');
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(0, 4);
  return '0000';
}

/**
 * Aynı çift + aynı gün/saat → aynı meetingID.
 * Tarihli oturumda tarihe göre; haftalık şablonda gün+saat.
 */
export function lgs8DinSharedMeetingKeyPrefix({
  subject,
  className,
  classLevel,
  lessonDate,
  dayOfWeek,
  startTime
} = {}) {
  if (!isDinKulturuSubject(subject)) return null;
  const pairId = lgs8DinPairId(className, classLevel);
  if (!pairId) return null;
  const start = startHmm(startTime);
  const date = String(lessonDate || '')
    .slice(0, 10)
    .replace(/-/g, '');
  if (/^\d{8}$/.test(date)) return `lgs8din${pairId}${date}${start}`;
  const dow = Number(dayOfWeek);
  const d = Number.isInteger(dow) && dow >= 1 && dow <= 7 ? String(dow) : '0';
  return `lgs8din${pairId}d${d}t${start}`;
}

export function lgs8DinSharedMeetingFields(opts = {}) {
  const meetingKeyPrefix = lgs8DinSharedMeetingKeyPrefix(opts);
  if (!meetingKeyPrefix) return null;
  return {
    meetingKeyPrefix,
    bbbMeetingId: sanitizeBbbMeetingId(meetingKeyPrefix)
  };
}

/** Katıl: eski sınıfa özel BBB id varsa ortak odaya çek. */
export function applyLgs8DinSharedJoinContext(base, opts = {}) {
  if (!base) return base;
  const fields = lgs8DinSharedMeetingFields(opts);
  if (!fields) return base;
  const rowMid = sanitizeBbbMeetingId(String(opts.row?.bbb_meeting_id || '').trim());
  base.meetingKeyPrefix = fields.meetingKeyPrefix;
  base.storedMeetingId = fields.bbbMeetingId;
  if (rowMid !== fields.bbbMeetingId) {
    base.attendeeLinkOverride = BBB_AUTO_MEETING_LINK;
    base.moderatorLinkOverride = null;
  }
  return base;
}
