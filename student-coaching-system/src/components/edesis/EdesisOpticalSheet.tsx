import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { EdesisExamStructureLesson } from '../../lib/edesis/edesisApi';

const CHOICES = ['A', 'B', 'C', 'D', 'E'] as const;

function padAnswers(raw: string, questionCount: number): string {
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/[^ABCDE\s.\-]/g, '')
    .replace(/[.\-]/g, ' ');
  const chars = cleaned.split('');
  const out: string[] = [];
  for (let i = 0; i < questionCount; i += 1) {
    const ch = chars[i];
    out.push(ch && CHOICES.includes(ch as (typeof CHOICES)[number]) ? ch : ' ');
  }
  return out.join('');
}

type Props = {
  lessons: EdesisExamStructureLesson[];
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (dersCevaplari: { lessonId: number | null; dersGrupId: number | null; cevaplar: string }[]) => void;
};

export default function EdesisOpticalSheet({ lessons, busy, submitLabel = 'Cevapları gönder', onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const lessonKey = (lesson: EdesisExamStructureLesson) => `${lesson.lessonId}:${lesson.dersGrupId}`;

  const filled = useMemo(() => {
    return lessons.map((lesson) => {
      const key = lessonKey(lesson);
      const cevaplar = padAnswers(answers[key] || '', lesson.questionCount);
      const marked = cevaplar.replace(/ /g, '').length;
      return { lesson, cevaplar, marked };
    });
  }, [lessons, answers]);

  const setChoice = (lesson: EdesisExamStructureLesson, index: number, choice: string) => {
    const key = lessonKey(lesson);
    const current = padAnswers(answers[key] || '', lesson.questionCount).split('');
    current[index] = current[index] === choice ? ' ' : choice;
    setAnswers((prev) => ({ ...prev, [key]: current.join('') }));
  };

  const handleSubmit = () => {
    onSubmit(
      filled.map(({ lesson, cevaplar }) => ({
        lessonId: lesson.lessonId,
        dersGrupId: lesson.dersGrupId,
        cevaplar
      }))
    );
  };

  return (
    <div className="space-y-5">
      {filled.map(({ lesson, cevaplar, marked }) => (
        <section key={lessonKey(lesson)} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-slate-900">{lesson.lessonName || 'Ders'}</h3>
            <p className="text-xs text-slate-500">
              {marked}/{lesson.questionCount} işaretli · boşlar otomatik boş bırakılır
            </p>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
            {Array.from({ length: lesson.questionCount }, (_, i) => {
              const selected = cevaplar[i] && cevaplar[i] !== ' ' ? cevaplar[i] : '';
              return (
                <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-1.5">
                  <div className="mb-1 text-center text-[10px] font-bold text-slate-500">{i + 1}</div>
                  <div className="flex justify-center gap-0.5">
                    {CHOICES.map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setChoice(lesson, i, ch)}
                        className={`h-6 w-6 rounded-full text-[10px] font-bold ${
                          selected === ch
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white text-slate-600 hover:bg-emerald-50'
                        }`}
                        aria-label={`Soru ${i + 1} ${ch}`}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <button
        type="button"
        disabled={busy || !lessons.length}
        onClick={handleSubmit}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 sm:w-auto"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {submitLabel}
      </button>
    </div>
  );
}
