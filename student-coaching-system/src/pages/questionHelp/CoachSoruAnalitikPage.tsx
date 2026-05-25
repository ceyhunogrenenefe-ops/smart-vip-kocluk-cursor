import React, { useEffect, useMemo, useState } from 'react';
import { fetchCoachQuestionAnalytics } from '../../lib/questionHelp/questionHelpApi';
import type { QuestionRow } from '../../lib/questionHelp/types';

export default function CoachSoruAnalitikPage() {
  const [questions, setQuestions] = useState<QuestionRow[]>([]);

  useEffect(() => {
    void fetchCoachQuestionAnalytics()
      .then((d) => setQuestions(d.questions || []))
      .catch(() => setQuestions([]));
  }, []);

  const bySubject = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of questions) {
      m.set(q.subject, (m.get(q.subject) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [questions]);

  const byTopic = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of questions) {
      const k = q.topic?.trim() || '(konu belirtilmedi)';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [questions]);

  const avgSolveHours = useMemo(() => {
    const solved = questions.filter((q) => q.solved_at && q.claimed_at);
    if (!solved.length) return null;
    const sum = solved.reduce((acc, q) => {
      return acc + (Date.parse(q.solved_at!) - Date.parse(q.claimed_at!));
    }, 0);
    return Math.round(sum / solved.length / 3600000) / 10;
  }, [questions]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Soru Sor — Koç Analitiği</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Öğrencilerinizin hangi branş ve konularda daha çok soru sorduğunu görün.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 dark:bg-slate-900 dark:border-slate-700">
          <p className="text-xs text-slate-500">Toplam soru</p>
          <p className="text-2xl font-bold">{questions.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:bg-slate-900 dark:border-slate-700">
          <p className="text-xs text-slate-500">Çözülen</p>
          <p className="text-2xl font-bold">{questions.filter((q) => q.status === 'solved').length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:bg-slate-900 dark:border-slate-700">
          <p className="text-xs text-slate-500">Ort. çözüm süresi (saat)</p>
          <p className="text-2xl font-bold">{avgSolveHours ?? '—'}</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 dark:bg-slate-900 dark:border-slate-700">
          <h2 className="font-semibold mb-3">Branş dağılımı</h2>
          <ul className="space-y-2 text-sm">
            {bySubject.map(([s, n]) => (
              <li key={s} className="flex justify-between">
                <span>{s}</span>
                <span className="font-medium">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:bg-slate-900 dark:border-slate-700">
          <h2 className="font-semibold mb-3">Zorlanılan konular</h2>
          <ul className="space-y-2 text-sm">
            {byTopic.map(([t, n]) => (
              <li key={t} className="flex justify-between gap-2">
                <span className="truncate">{t}</span>
                <span className="font-medium shrink-0">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
