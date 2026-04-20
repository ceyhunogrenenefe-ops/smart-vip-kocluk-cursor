// Türkçe: Haftalık takip — eksik analizi ve takvim için yerel "AI" taslakları (kural tabanlı)
import { WeeklyEntry, Student } from '../types';

export function summarizeTrackingGaps(
  entries: WeeklyEntry[],
  subjects: string[],
  studentLabel: string
): string[] {
  const bullets: string[] = [];
  const recent = entries.filter(e => {
    const t = new Date(e.date).getTime();
    return Date.now() - t < 21 * 24 * 60 * 60 * 1000;
  });

  const bySubject: Record<string, { correct: number; total: number }> = {};
  for (const e of recent) {
    if (!bySubject[e.subject]) bySubject[e.subject] = { correct: 0, total: 0 };
    bySubject[e.subject].correct += e.correctAnswers;
    bySubject[e.subject].total += e.solvedQuestions;
  }

  for (const subj of subjects) {
    const b = bySubject[subj];
    if (!b || b.total === 0) {
      bullets.push(`${subj}: Son 3 haftada kayıt yok veya soru çözülmemiş.`);
      continue;
    }
    const rate = Math.round((b.correct / b.total) * 100);
    if (rate < 65) bullets.push(`${subj}: Başarı ~%${rate} — tekrar / pekiştirme önerilir.`);
  }

  if (recent.length === 0) {
    bullets.unshift(`${studentLabel} için yakın tarihte takip kaydı yok; takvime taslak ekleyebilirsiniz.`);
  }

  return bullets.length ? bullets : ['Genel: Düzenli günlük kayıt eklemek hedef takibini güçlendirir.'];
}

function pickPrioritySubjects(entries: WeeklyEntry[], subjects: string[]): string[] {
  if (subjects.length === 0) return ['Genel'];
  const bySubject: Record<string, { correct: number; total: number }> = {};
  for (const e of entries) {
    if (!subjects.includes(e.subject)) continue;
    if (!bySubject[e.subject]) bySubject[e.subject] = { correct: 0, total: 0 };
    bySubject[e.subject].correct += e.correctAnswers;
    bySubject[e.subject].total += e.solvedQuestions;
  }

  const scored = subjects.map(subj => {
    const b = bySubject[subj];
    if (!b || b.total === 0) return { subj, score: 0 };
    const rate = b.correct / b.total;
    return { subj, score: rate };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.map(s => s.subj);
}

export function generateAiWeeklyDrafts(
  studentId: string,
  student: Student,
  year: number,
  month: number,
  existingEntries: WeeklyEntry[],
  subjects: string[],
  getTopicsFn: (subject: string, classLevel: number | string) => string[]
): WeeklyEntry[] {
  const drafts: WeeklyEntry[] = [];
  const datesWithData = new Set(
    existingEntries.filter(e => e.studentId === studentId).map(e => e.date.split('T')[0])
  );
  const classLevel = student.classLevel;
  const pool = pickPrioritySubjects(existingEntries.filter(e => e.studentId === studentId), subjects);
  const topicFor = (subj: string) => {
    const list = getTopicsFn(subj, classLevel);
    return list[0] || 'Genel tekrar / soru çözümü';
  };

  let idx = 0;
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const wd = new Date(year, month - 1, d).getDay();
    if (wd === 0 || wd === 6) continue;
    if (datesWithData.has(iso)) continue;
    if (drafts.length >= 18) break;

    const subj = pool[idx % pool.length];
    idx++;

    drafts.push({
      id: `ai-draft-${studentId}-${iso}-${drafts.length}`,
      studentId,
      date: iso,
      subject: subj,
      topic: topicFor(subj),
      targetQuestions: 15,
      solvedQuestions: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      blankAnswers: 0,
      coachComment:
        '[AI taslak] Eksik günlere göre önerildi. Soru sayılarını ve konuyu düzenleyebilirsiniz.',
      createdAt: new Date().toISOString()
    });
    datesWithData.add(iso);
  }

  return drafts;
}
