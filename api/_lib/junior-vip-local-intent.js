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

const SUBJECT_ALIASES = [
  { re: /\b(matematik|mat)\b/i, subject: 'Matematik' },
  { re: /\b(turkce|türkçe)\b/i, subject: 'Türkçe' },
  { re: /\b(fen|fen bilimleri)\b/i, subject: 'Fen Bilimleri' },
  { re: /\b(sosyal|inkilap|inkılap)\b/i, subject: 'Sosyal Bilgiler' },
  { re: /\b(ingilizce|english)\b/i, subject: 'İngilizce' }
];

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

function timeOf(iso) {
  const m = String(iso || '').match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

function studentIntent(userText, t, ctx) {
  const name = firstName(ctx?.student?.name, 'arkadaşım');

  const soruMatch = t.match(/(\d+)\s*soru/);
  if (soruMatch && (t.includes('coz') || t.includes('bitir') || t.includes('yaptim'))) {
    let subject = 'Genel';
    for (const a of SUBJECT_ALIASES) {
      if (a.re.test(userText)) {
        subject = a.subject;
        break;
      }
    }
    const topicMatch = userText.match(/(?:konu[sd]?[uü]?\s+)?([^.,!?\d]{3,80})/i);
    const topic = topicMatch ? String(topicMatch[1]).trim().slice(0, 80) : 'Çalışma';
    const n = Number(soruMatch[1]) || 0;
    if (n > 0 && n <= 500) {
      return {
        reply: `Harika ${name}! ${subject} — "${topic}" için ${n} soru çözdüğünü anladım. Planına kaydetmemi ister misin? Onaylayınca haftalık çalışma kaydına yazacağım.`,
        actions: [],
        proposed_study_log: {
          date: ctx?.today || new Date().toISOString().slice(0, 10),
          subject,
          topic,
          solved_questions: n,
          target_questions: n,
          correct: 0,
          wrong: 0,
          blank: 0
        }
      };
    }
  }

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
      (m) => `${timeOf(m.start_time)} ${m.student || m.title || 'görüşme'}`.trim()
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
