import { JUNIOR_VIP_STUDENT_NAV } from './junior-vip-student-nav.js';
import { juniorVipNavForPanel } from './junior-vip-nav.js';

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}


/** Sesli komutlarda yönlendirme fiilleri (normalize edilmiş). */
const NAV_VERBS = ['nasil', 'nereden', 'gir', 'ac', 'git', 'gotur', 'goster', 'gec'];

function hasNavVerb(t) {
  return NAV_VERBS.some((v) => new RegExp(`(^|\\s)${v}`).test(t));
}

/** En uzun anahtar kelime eşleşmesi kazanır ("deneme takvimi" > "deneme"). */
function matchNav(t, nav) {
  let best = null;
  let bestLen = 0;
  for (const item of nav) {
    for (const kw of item.keywords || []) {
      const k = norm(kw);
      if (k && t.includes(k) && k.length > bestLen) {
        best = item;
        bestLen = k.length;
      }
    }
  }
  return best;
}

function firstName(full, fallback) {
  return full ? String(full).split(/\s+/)[0] : fallback;
}

/** Zaman damgası → İstanbul saati "HH:MM" (UTC saatini göstermesin). */
function timeOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = String(iso || '').match(/T(\d{2}:\d{2})/);
    return m ? m[1] : '';
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
}

/** Çözülen soru kaydı ve plan ekleme junior-vip-assistant.js sunucu araçlarıyla yapılır. */
function studentIntent(_userText, t, ctx) {
  if (t.includes('bugun')) {
    const list = (ctx?.today_entries || [])
      .map((e) => `${e.subject}: ${e.solved_questions || 0} soru (${e.topic || '-'})`)
      .join('; ');
    return {
      reply: list
        ? `Bugün kayıtlarında şunlar var: ${list}`
        : `Bugün için henüz çalışma kaydın yok. İstersen birlikte ekleyebiliriz!`,
      actions: [{ type: 'navigate', path: '/weekly-planner', label: 'Haftalık plan' }],
      proposed_study_log: null
    };
  }
  return null;
}

function coachIntent(t, ctx) {
  if (t.includes('calismayan') || t.includes('kayit girmeyen') || t.includes('kaydi olmayan')) {
    const list = ctx?.students_without_entries_this_week || [];
    return {
      reply: list.length
        ? `Bu hafta çalışma kaydı olmayan öğrencilerin (${list.length}): ${list.slice(0, 10).join(', ')}${list.length > 10 ? '…' : ''}.`
        : 'Bu hafta tüm öğrencilerinin en az bir çalışma kaydı var. 👏',
      actions: [{ type: 'navigate', path: '/students', label: 'Öğrenciler' }],
      proposed_study_log: null
    };
  }
  if (t.includes('bugun')) {
    const list = (ctx?.today_meetings || []).map(
      (m) => `${timeOf(m.start_time)} ${m.student || 'görüşme'}`.trim()
    );
    return {
      reply: list.length
        ? `Bugün ${list.length} görüşmen var: ${list.join('; ')}.`
        : 'Bugün için planlanmış görüşmen görünmüyor.',
      actions: [{ type: 'navigate', path: '/meetings', label: 'Online görüşmeler' }],
      proposed_study_log: null
    };
  }
  if (t.includes('kac ogrenci') || t.includes('ogrenci sayisi')) {
    return {
      reply: `Sana atanmış ${ctx?.student_count ?? 0} öğrenci var.`,
      actions: [{ type: 'navigate', path: '/students', label: 'Öğrenciler' }],
      proposed_study_log: null
    };
  }
  return null;
}

function teacherIntent(t, ctx) {
  if (t.includes('bugun') || t.includes('dersim')) {
    const list = (ctx?.today_sessions || []).map(
      (s) => `${String(s.start_time || '').slice(0, 5)} ${s.class || ''} ${s.subject || ''}`.replace(/\s+/g, ' ').trim()
    );
    return {
      reply: list.length
        ? `Bugün ${list.length} dersin var: ${list.join('; ')}.`
        : 'Bugün için planlanmış grup dersin görünmüyor.',
      actions: [{ type: 'navigate', path: '/class-live-lessons', label: 'Canlı Grup Dersi' }],
      proposed_study_log: null
    };
  }
  if (t.includes('sinif')) {
    const classes = ctx?.classes || [];
    return {
      reply: classes.length ? `Atandığın sınıflar: ${classes.join(', ')}.` : 'Sana atanmış bir sınıf görünmüyor.',
      actions: [{ type: 'navigate', path: '/teacher-panel', label: 'Öğretmen Paneli' }],
      proposed_study_log: null
    };
  }
  return null;
}

/** Basit yerel niyet (OpenAI yokken / hata verdiğinde yönlendirme ve özet). */
export function juniorVipLocalIntent(userText, ctx) {
  const panel = ctx?.panel || 'student';
  const nav = ctx?.panel ? juniorVipNavForPanel(panel) : JUNIOR_VIP_STUDENT_NAV;
  const t = norm(userText);

  const navIntent = () => {
    if (!hasNavVerb(t)) return null;
    const item = matchNav(t, nav);
    if (!item) return null;
    const who =
      panel === 'coach'
        ? firstName(ctx?.coach?.name, '')
        : panel === 'teacher'
          ? firstName(ctx?.teacher?.name, '')
          : firstName(ctx?.student?.name, 'arkadaşım');
    return {
      reply: `Tabii${who ? ` ${who}` : ''}! ${item.label} sayfasını açıyorum.`,
      actions: [{ type: 'navigate', path: item.path, label: item.label }],
      proposed_study_log: null
    };
  };

  // Öğrenci: önceki davranış korunur (önce yönlendirme). Koç/öğretmen: önce özet (bugün, sınıflar…).
  if (panel === 'coach') return coachIntent(t, ctx) || navIntent();
  if (panel === 'teacher') return teacherIntent(t, ctx) || navIntent();
  return navIntent() || studentIntent(userText, t, ctx);
}
