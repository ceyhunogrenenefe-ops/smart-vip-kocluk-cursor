import { JUNIOR_VIP_STUDENT_NAV } from './junior-vip-student-nav.js';

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

/** Basit yerel niyet (OpenAI yokken yönlendirme / kayıt önerisi). */
export function juniorVipLocalIntent(userText, ctx) {
  const t = norm(userText);
  const name = ctx?.student?.name ? String(ctx.student.name).split(/\s+/)[0] : 'arkadaşım';

  for (const item of JUNIOR_VIP_STUDENT_NAV) {
    for (const kw of item.keywords || []) {
      if (t.includes(norm(kw)) && (t.includes('nasil') || t.includes('nasıl') || t.includes('nereden') || t.includes('gir'))) {
        return {
          reply: `Tabii ${name}! ${item.label} için seni oraya götürebilirim. Hazırsan birlikte açalım.`,
          actions: [{ type: 'navigate', path: item.path, label: item.label }],
          proposed_study_log: null
        };
      }
    }
  }

  const soruMatch = t.match(/(\d+)\s*soru/);
  if (soruMatch && (t.includes('coz') || t.includes('çöz') || t.includes('bitir') || t.includes('yaptim') || t.includes('yaptım'))) {
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

  if (t.includes('bugun') || t.includes('bugün')) {
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
