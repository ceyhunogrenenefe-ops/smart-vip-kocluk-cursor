/**
 * LGS A/B/E/F örnek akşam programı → canlı sınıflar 8A/8B/8E/8F.
 * Kaynak: kurum görsel program (Pzt–Cum 17:00–21:20 + Cmt deneme 10:00–12:30).
 *
 * day_of_week: 1=Pazartesi … 6=Cumartesi
 */

/** @typedef {{ day_of_week: number, start_time: string, end_time: string, subject: string, duration_minutes: number, meeting_link?: string }} SlotDef */

/** 8A/8B/8E/8F akşam etütleri — ortak Zoom (BBB değil). */
export const LGS_8ABEF_ETUT_ZOOM_URL =
  'https://us06web.zoom.us/j/6946337643?pwd=SHkwQzNnaEkrOXVNajJMR1Z6UCtCUT09';

const ETUT = [
  {
    start_time: '17:00:00',
    end_time: '17:40:00',
    subject: 'Etüt',
    duration_minutes: 40,
    meeting_link: LGS_8ABEF_ETUT_ZOOM_URL
  },
  {
    start_time: '17:50:00',
    end_time: '18:30:00',
    subject: 'Etüt',
    duration_minutes: 40,
    meeting_link: LGS_8ABEF_ETUT_ZOOM_URL
  }
];

/** @param {number} day @param {Array<{start:string,end:string,subject:string}>} lessons */
function weekday(day, lessons) {
  /** @type {SlotDef[]} */
  const out = [];
  for (const e of ETUT) {
    out.push({
      day_of_week: day,
      start_time: e.start_time,
      end_time: e.end_time,
      subject: e.subject,
      duration_minutes: e.duration_minutes,
      ...(e.meeting_link ? { meeting_link: e.meeting_link } : {})
    });
  }
  for (const l of lessons) {
    if (!l?.subject) continue;
    const start = `${l.start}:00`;
    const end = `${l.end}:00`;
    const [sh, sm] = l.start.split(':').map(Number);
    const [eh, em] = l.end.split(':').map(Number);
    const duration_minutes = Math.max(15, eh * 60 + em - (sh * 60 + sm));
    out.push({
      day_of_week: day,
      start_time: start,
      end_time: end,
      subject: l.subject,
      duration_minutes
    });
  }
  return out;
}

function saturdayDeneme() {
  return [
    {
      day_of_week: 6,
      start_time: '10:00:00',
      end_time: '12:30:00',
      subject: 'DENEME SINAVI',
      duration_minutes: 150
    }
  ];
}

/** LGS E → 8E */
const SCHEDULE_8E = [
  ...weekday(1, [
    { start: '19:00', end: '19:40', subject: 'MATEMATİK' },
    { start: '19:50', end: '20:30', subject: 'MATEMATİK' }
  ]),
  ...weekday(2, [
    { start: '19:00', end: '19:40', subject: 'MATEMATİK' },
    { start: '19:50', end: '20:30', subject: 'MATEMATİK' }
  ]),
  ...weekday(3, [
    { start: '19:00', end: '19:40', subject: 'İNKILAP TARİHİ' },
    { start: '19:50', end: '20:30', subject: 'İNGİLİZCE' },
    { start: '20:40', end: '21:20', subject: 'İNGİLİZCE' }
  ]),
  ...weekday(4, [
    { start: '19:00', end: '19:40', subject: 'FEN BİLİMLERİ' },
    { start: '19:50', end: '20:30', subject: 'TÜRKÇE' },
    { start: '20:40', end: '21:20', subject: 'TÜRKÇE' }
  ]),
  ...weekday(5, [
    { start: '19:00', end: '19:40', subject: 'FEN BİLİMLERİ' },
    { start: '19:50', end: '20:30', subject: 'FEN BİLİMLERİ' },
    { start: '20:40', end: '21:20', subject: 'DİN KÜLTÜRÜ' }
  ]),
  ...saturdayDeneme()
];

/** LGS F → 8F */
const SCHEDULE_8F = [
  ...weekday(1, [
    { start: '19:00', end: '19:40', subject: 'TÜRKÇE' },
    { start: '19:50', end: '20:30', subject: 'TÜRKÇE' }
  ]),
  ...weekday(2, [
    { start: '19:00', end: '19:40', subject: 'MATEMATİK' },
    { start: '19:50', end: '20:30', subject: 'MATEMATİK' }
  ]),
  ...weekday(3, [
    { start: '19:00', end: '19:40', subject: 'FEN BİLİMLERİ' },
    { start: '19:50', end: '20:30', subject: 'FEN BİLİMLERİ' },
    { start: '20:40', end: '21:20', subject: 'İNKILAP TARİHİ' }
  ]),
  ...weekday(4, [
    { start: '19:00', end: '19:40', subject: 'MATEMATİK' },
    { start: '19:50', end: '20:30', subject: 'MATEMATİK' },
    { start: '20:40', end: '21:20', subject: 'FEN BİLİMLERİ' }
  ]),
  ...weekday(5, [
    { start: '19:00', end: '19:40', subject: 'İNGİLİZCE' },
    { start: '19:50', end: '20:30', subject: 'İNGİLİZCE' },
    { start: '20:40', end: '21:20', subject: 'DİN KÜLTÜRÜ' }
  ]),
  ...saturdayDeneme()
];

/** LGS B → 8B */
const SCHEDULE_8B = [
  ...weekday(1, [
    { start: '19:00', end: '19:40', subject: 'İNKILAP TARİHİ' },
    { start: '19:50', end: '20:30', subject: 'İNGİLİZCE' },
    { start: '20:40', end: '21:20', subject: 'İNGİLİZCE' }
  ]),
  ...weekday(2, [
    { start: '19:00', end: '19:40', subject: 'MATEMATİK' },
    { start: '19:50', end: '20:30', subject: 'MATEMATİK' }
  ]),
  ...weekday(3, [
    { start: '19:00', end: '19:40', subject: 'TÜRKÇE' },
    { start: '19:50', end: '20:30', subject: 'TÜRKÇE' },
    { start: '20:40', end: '21:20', subject: 'DİN KÜLTÜRÜ' }
  ]),
  ...weekday(4, [
    { start: '19:00', end: '19:40', subject: 'MATEMATİK' },
    { start: '19:50', end: '20:30', subject: 'MATEMATİK' },
    { start: '20:40', end: '21:20', subject: 'FEN BİLİMLERİ' }
  ]),
  ...weekday(5, [
    { start: '19:00', end: '19:40', subject: 'FEN BİLİMLERİ' },
    { start: '19:50', end: '20:30', subject: 'FEN BİLİMLERİ' }
  ]),
  ...saturdayDeneme()
];

/** LGS A → 8A */
const SCHEDULE_8A = [
  ...weekday(1, [
    { start: '19:00', end: '19:40', subject: 'FEN BİLİMLERİ' },
    { start: '19:50', end: '20:30', subject: 'FEN BİLİMLERİ' },
    { start: '20:40', end: '21:20', subject: 'İNKILAP TARİHİ' }
  ]),
  ...weekday(2, [
    { start: '19:00', end: '19:40', subject: 'TÜRKÇE' },
    { start: '19:50', end: '20:30', subject: 'TÜRKÇE' },
    { start: '20:40', end: '21:20', subject: 'FEN BİLİMLERİ' }
  ]),
  ...weekday(3, [
    { start: '19:00', end: '19:40', subject: 'MATEMATİK' },
    { start: '19:50', end: '20:30', subject: 'MATEMATİK' },
    { start: '20:40', end: '21:20', subject: 'DİN KÜLTÜRÜ' }
  ]),
  ...weekday(4, [
    { start: '19:00', end: '19:40', subject: 'İNGİLİZCE' },
    { start: '19:50', end: '20:30', subject: 'İNGİLİZCE' }
  ]),
  ...weekday(5, [
    { start: '19:00', end: '19:40', subject: 'MATEMATİK' },
    { start: '19:50', end: '20:30', subject: 'MATEMATİK' }
  ]),
  ...saturdayDeneme()
];

/** @type {Record<string, SlotDef[]>} */
export const LGS_8ABEF_SCHEDULE = {
  '8A': SCHEDULE_8A,
  '8B': SCHEDULE_8B,
  '8E': SCHEDULE_8E,
  '8F': SCHEDULE_8F
};

/** Canlı sınıf adı eşleştirme (büyük harf / içerir) */
export const CLASS_NAME_MATCHERS = {
  '8A': ['8A YAZ', '8-A YAZ', '8A'],
  '8B': ['8B YAZ', '8-B YAZ', '8B'],
  '8E': ['8E YAZ', '8-E YAZ', '8E'],
  '8F': ['8F YAZ', '8-F YAZ', '8F']
};
