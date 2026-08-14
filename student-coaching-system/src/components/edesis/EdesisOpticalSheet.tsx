import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import type { EdesisExamStructureLesson } from '../../lib/edesis/edesisApi';

const CHOICES_4 = ['A', 'B', 'C', 'D'] as const;
const CHOICES_5 = ['A', 'B', 'C', 'D', 'E'] as const;

function opticalChoices(examTitle?: string | null, examType?: string | null): readonly string[] {
  const blob = `${examTitle || ''} ${examType || ''}`.toLocaleLowerCase('tr-TR');
  if (/tyt|ayt|yks|yös|yos/.test(blob)) return CHOICES_5;
  return CHOICES_4;
}

function padAnswers(raw: string, questionCount: number, allowed: readonly string[]): string {
  const set = new Set(allowed);
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/[^ABCDE\s.\-]/g, '')
    .replace(/[.\-]/g, ' ');
  const chars = cleaned.split('');
  const out: string[] = [];
  for (let i = 0; i < questionCount; i += 1) {
    const ch = chars[i];
    out.push(ch && set.has(ch) ? ch : ' ');
  }
  return out.join('');
}

function readSaved(storageKey: string): Record<string, string> {
  if (!storageKey) return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

type Props = {
  lessons: EdesisExamStructureLesson[];
  examTitle?: string;
  examType?: string | null;
  storageKey?: string;
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (dersCevaplari: { lessonId: number | null; dersGrupId: number | null; cevaplar: string }[]) => void;
};

/**
 * Eski sanal optik / Sınav Uygulaması yerleşimi: solda dikey optik, sağda kitapçık alanı.
 */
export default function EdesisOpticalSheet({
  lessons,
  examTitle,
  examType,
  storageKey = '',
  busy,
  submitLabel = 'Bitir',
  onSubmit
}: Props) {
  const choices = useMemo(() => opticalChoices(examTitle, examType), [examTitle, examType]);
  const [answers, setAnswers] = useState<Record<string, string>>(() => readSaved(storageKey));
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setAnswers(readSaved(storageKey));
  }, [storageKey]);

  const lessonKey = (lesson: EdesisExamStructureLesson) => `${lesson.lessonId}:${lesson.dersGrupId}`;

  const filled = useMemo(() => {
    return lessons.map((lesson) => {
      const key = lessonKey(lesson);
      const cevaplar = padAnswers(answers[key] || '', lesson.questionCount, choices);
      const marked = cevaplar.replace(/ /g, '').length;
      return { lesson, cevaplar, marked };
    });
  }, [lessons, answers, choices]);

  const setChoice = (lesson: EdesisExamStructureLesson, index: number, choice: string) => {
    const key = lessonKey(lesson);
    const current = padAnswers(answers[key] || '', lesson.questionCount, choices).split('');
    current[index] = current[index] === choice ? ' ' : choice;
    setAnswers((prev) => ({ ...prev, [key]: current.join('') }));
  };

  const persist = () => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(answers));
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const handleSubmit = () => {
    persist();
    onSubmit(
      filled.map(({ lesson, cevaplar }) => ({
        lessonId: lesson.lessonId,
        dersGrupId: lesson.dersGrupId,
        cevaplar
      }))
    );
  };

  const activeLesson = filled[0]?.lesson;
  const heading = activeLesson?.lessonName || examTitle || 'Optik';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="text-sm font-bold text-slate-800">Sınav Uygulaması</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={persist}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            <Save className="h-3.5 w-3.5" />
            {savedFlash ? 'Kaydedildi' : 'Kaydet'}
          </button>
          <button
            type="button"
            disabled={busy || !lessons.length}
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {submitLabel}
          </button>
        </div>
      </div>

      <div className="flex min-h-[70vh] flex-col md:flex-row">
        <aside className="w-full shrink-0 overflow-y-auto border-b border-slate-200 bg-white md:w-72 md:border-b-0 md:border-r">
          <div className="sticky top-0 border-b border-orange-100 bg-orange-50 px-3 py-2">
            <div className="text-sm font-extrabold uppercase tracking-wide text-orange-600">{heading}</div>
            {filled.length > 1 ? (
              <p className="mt-0.5 text-[11px] text-orange-800/80">{filled.length} ders</p>
            ) : null}
          </div>
          {filled.map(({ lesson, cevaplar, marked }) => (
            <section key={lessonKey(lesson)} className="border-b border-slate-100 px-2 py-2 last:border-b-0">
              {filled.length > 1 ? (
                <div className="mb-1 px-1 text-xs font-bold text-orange-600">{lesson.lessonName || 'Ders'}</div>
              ) : (
                <div className="mb-1 px-1 text-xs font-semibold text-slate-500">
                  {marked}/{lesson.questionCount} işaretli
                </div>
              )}
              <ol className="space-y-1">
                {Array.from({ length: lesson.questionCount }, (_, i) => {
                  const selected = cevaplar[i] && cevaplar[i] !== ' ' ? cevaplar[i] : '';
                  return (
                    <li key={i} className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-slate-50">
                      <span className="w-5 shrink-0 text-right text-xs font-bold text-slate-600">{i + 1}</span>
                      <div className="flex flex-wrap gap-0.5">
                        {choices.map((ch) => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => setChoice(lesson, i, ch)}
                            className={`h-7 w-7 rounded-full border text-[11px] font-bold ${
                              selected === ch
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400'
                            }`}
                            aria-label={`Soru ${i + 1} ${ch}`}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </aside>

        <section className="flex min-h-[50vh] flex-1 flex-col bg-slate-100">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500">
            <span className="truncate font-medium text-slate-700">{examTitle || 'Kitapçık'}</span>
            <span className="ml-auto">1 / 1</span>
            <span>100%</span>
          </div>
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-md rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-800">{examTitle || 'Deneme kitapçığı'}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Soruları basılı veya PDF kitapçığınızdan takip edin. Cevapları soldaki optik forma işaretleyip{' '}
                <strong>Kaydet</strong> / <strong>Bitir</strong> kullanın.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
