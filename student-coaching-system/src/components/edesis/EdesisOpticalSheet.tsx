import { useEffect, useMemo, useState } from 'react';
import { Eraser, Flag, Loader2, Save } from 'lucide-react';
import type { EdesisExamBooklet, EdesisExamStructureLesson } from '../../lib/edesis/edesisApi';

const CHOICES_4 = ['A', 'B', 'C', 'D'] as const;
const CHOICES_5 = ['A', 'B', 'C', 'D', 'E'] as const;
const KITAPCIK_ORDER = ['A', 'B', 'C', 'D'];

export type EdesisBookletMode = 'single' | 'dual-sozel-sayisal';

function detectFamily(examTitle?: string | null, examType?: string | null, examFamily?: string | null): string {
  if (examFamily && examFamily !== 'generic') return examFamily;
  const blob = `${examTitle || ''} ${examType || ''}`.toLocaleLowerCase('tr-TR');
  if (/\blgs\b|ortaokul/.test(blob)) return 'lgs';
  if (/yös|\byos\b/.test(blob)) return 'yos';
  if (/\bayt\b/.test(blob)) return 'ayt';
  if (/\btyt\b|\byks\b/.test(blob)) return 'yks';
  return examFamily || 'generic';
}

function opticalChoices(family: string, choiceCount?: number): readonly string[] {
  if (choiceCount === 5) return CHOICES_5;
  if (choiceCount === 4) return CHOICES_4;
  if (family === 'yks' || family === 'tyt' || family === 'ayt' || family === 'yos') return CHOICES_5;
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

function lessonTabLabel(lesson: EdesisExamStructureLesson, examType?: string | null): string {
  const name = String(lesson.lessonName || 'Ders').trim();
  const prefix = String(examType || '').trim();
  if (prefix && !name.toLocaleUpperCase('tr-TR').includes(prefix.toLocaleUpperCase('tr-TR'))) {
    return `${prefix}-${name}`.toLocaleUpperCase('tr-TR');
  }
  return name.toLocaleUpperCase('tr-TR');
}

function formatTimer(total: number) {
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function ExamTimer({ remainingSeconds }: { remainingSeconds?: number | null }) {
  const start = Number(remainingSeconds) || 0;
  const [left, setLeft] = useState(start);

  useEffect(() => {
    setLeft(start);
    if (start <= 0) return undefined;
    const t = window.setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(t);
  }, [start]);

  if (start <= 0) return null;
  return (
    <div className="rounded-full bg-emerald-500 px-3 py-1 text-sm font-bold tabular-nums text-white">
      {formatTimer(left)}
    </div>
  );
}

function KitapcikCircles({
  value,
  onChange,
  codes
}: {
  value: string;
  onChange?: (code: string) => void;
  codes: string[];
}) {
  return (
    <div className="flex items-center gap-1">
      {codes.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange?.(code)}
          className={`h-8 w-8 rounded-full border text-sm font-bold ${
            value === code
              ? 'border-slate-800 bg-slate-800 text-white'
              : 'border-slate-300 bg-slate-100 text-slate-500 hover:border-slate-500'
          }`}
          aria-label={`Kitapçık ${code}`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

type Props = {
  lessons: EdesisExamStructureLesson[];
  booklets?: EdesisExamBooklet[];
  kitapcik?: string;
  onKitapcikChange?: (kitapcik: string) => void;
  kitapcikSayisal?: string;
  onKitapcikSayisalChange?: (kitapcik: string) => void;
  examTitle?: string;
  examType?: string | null;
  examFamily?: string | null;
  bookletMode?: EdesisBookletMode | string | null;
  choiceCount?: number;
  remainingSeconds?: number | null;
  storageKey?: string;
  busy?: boolean;
  submitLabel?: string;
  pdfUrl?: string | null;
  pdfBusy?: boolean;
  pdfError?: string | null;
  onSubmit: (dersCevaplari: { lessonId: number | null; dersGrupId: number | null; cevaplar: string }[]) => void;
};

/**
 * Edesis Sınav Uygulaması: YKS tek kitapçık (A–E), LGS Sözel/Sayısal (A–D).
 */
export default function EdesisOpticalSheet({
  lessons,
  booklets = [],
  kitapcik = '',
  onKitapcikChange,
  kitapcikSayisal = '',
  onKitapcikSayisalChange,
  examTitle,
  examType,
  examFamily,
  bookletMode,
  choiceCount,
  remainingSeconds,
  storageKey = '',
  busy,
  submitLabel = 'Bitir',
  pdfUrl,
  pdfBusy,
  pdfError,
  onSubmit
}: Props) {
  const family = detectFamily(examTitle, examType, examFamily);
  const dual = bookletMode === 'dual-sozel-sayisal' || family === 'lgs';
  const choices = useMemo(() => opticalChoices(family, choiceCount), [family, choiceCount]);
  const [answers, setAnswers] = useState<Record<string, string>>(() => readSaved(storageKey));
  const [savedFlash, setSavedFlash] = useState(false);
  const [activeLessonKey, setActiveLessonKey] = useState('');

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

  useEffect(() => {
    if (!filled.length) {
      setActiveLessonKey('');
      return;
    }
    if (!filled.some(({ lesson }) => lessonKey(lesson) === activeLessonKey)) {
      setActiveLessonKey(lessonKey(filled[0].lesson));
    }
  }, [filled, activeLessonKey]);

  const activeFilled = filled.find(({ lesson }) => lessonKey(lesson) === activeLessonKey) || filled[0];

  const setChoice = (lesson: EdesisExamStructureLesson, index: number, choice: string) => {
    const key = lessonKey(lesson);
    const current = padAnswers(answers[key] || '', lesson.questionCount, choices).split('');
    current[index] = current[index] === choice ? ' ' : choice;
    setAnswers((prev) => ({ ...prev, [key]: current.join('') }));
  };

  const clearChoice = (lesson: EdesisExamStructureLesson, index: number) => {
    const key = lessonKey(lesson);
    const current = padAnswers(answers[key] || '', lesson.questionCount, choices).split('');
    current[index] = ' ';
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

  const bookletTypes = useMemo(() => {
    const fromBooks = booklets.map((b) => String(b.kitapcikTuru || '').trim()).filter(Boolean);
    const unique = [...new Set(fromBooks.length ? fromBooks : KITAPCIK_ORDER)];
    const ordered = unique.sort(
      (a, b) => KITAPCIK_ORDER.indexOf(a) - KITAPCIK_ORDER.indexOf(b) || a.localeCompare(b, 'tr')
    );
    return ordered.length ? ordered : KITAPCIK_ORDER;
  }, [booklets]);

  const heading = activeFilled?.lesson.lessonName || examTitle || 'Optik';
  const pdfPaneClass = dual ? 'bg-neutral-900' : 'bg-slate-200';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <ExamTimer remainingSeconds={remainingSeconds} />
        <div className="text-sm font-bold text-slate-800">Sınav Uygulaması</div>
        {dual ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600">Sözel:</span>
              <KitapcikCircles value={kitapcik} onChange={onKitapcikChange} codes={KITAPCIK_ORDER} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600">Sayısal:</span>
              <KitapcikCircles
                value={kitapcikSayisal || kitapcik}
                onChange={onKitapcikSayisalChange}
                codes={KITAPCIK_ORDER}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">Kitapçık Türü:</span>
            <KitapcikCircles value={kitapcik} onChange={onKitapcikChange} codes={bookletTypes} />
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
            {submitLabel}
          </button>
        </div>
      </div>

      <div className="flex min-h-[70vh] flex-col md:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white md:w-[22rem] md:border-b-0 md:border-r">
          <div
            className={
              dual
                ? 'grid grid-cols-2 gap-1 border-b border-slate-200 px-2 py-2 sm:grid-cols-3'
                : 'flex gap-1 overflow-x-auto border-b border-slate-200 px-2 pt-2'
            }
          >
            {filled.map(({ lesson, marked }) => {
              const key = lessonKey(lesson);
              const on = key === activeLessonKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveLessonKey(key)}
                  className={
                    dual
                      ? `rounded-md border px-1.5 py-1.5 text-left text-[10px] font-extrabold leading-tight tracking-wide ${
                          on
                            ? 'border-orange-500 bg-orange-50 text-orange-600'
                            : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`
                      : `shrink-0 border-b-2 px-2 pb-2 text-[11px] font-extrabold tracking-wide ${
                          on
                            ? 'border-orange-500 text-orange-600'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`
                  }
                >
                  {lessonTabLabel(lesson, examType)}
                  <span className="ml-1 font-semibold text-slate-400">
                    {marked}/{lesson.questionCount}
                  </span>
                </button>
              );
            })}
          </div>

          {activeFilled ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 border-b border-orange-100 bg-orange-50 px-3 py-2">
                <div className="text-sm font-extrabold uppercase tracking-wide text-orange-600">
                  {lessonTabLabel(activeFilled.lesson, examType)}
                </div>
                <div className="text-xs font-semibold text-orange-800/80">{heading}</div>
              </div>
              <ol className="space-y-1 px-2 py-2">
                {Array.from({ length: activeFilled.lesson.questionCount }, (_, i) => {
                  const selected =
                    activeFilled.cevaplar[i] && activeFilled.cevaplar[i] !== ' ' ? activeFilled.cevaplar[i] : '';
                  return (
                    <li key={i} className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-slate-50">
                      <span className="w-5 shrink-0 text-right text-xs font-bold text-slate-600">{i + 1}</span>
                      <div className="flex flex-wrap gap-0.5">
                        {choices.map((ch) => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => setChoice(activeFilled.lesson, i, ch)}
                            className={`h-7 w-7 rounded-full border text-[11px] font-bold ${
                              selected === ch
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : dual
                                  ? 'border-orange-400 bg-white text-orange-500 hover:border-orange-600'
                                  : 'border-orange-400 bg-white text-orange-500 hover:border-emerald-400'
                            }`}
                            aria-label={`Soru ${i + 1} ${ch}`}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => clearChoice(activeFilled.lesson, i)}
                        className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`Soru ${i + 1} sil`}
                      >
                        <Eraser className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-500">Bu kitapçıkta ders yok.</p>
          )}
        </aside>

        <section className={`flex min-h-[50vh] flex-1 flex-col ${pdfPaneClass}`}>
          <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] text-slate-200">
            <span className="truncate font-medium">{examTitle || 'Kitapçık PDF'}</span>
            {pdfBusy ? <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" /> : null}
          </div>
          <div className="relative min-h-[50vh] flex-1">
            {pdfUrl ? (
              <iframe
                title="Sınav kitapçığı PDF"
                src={pdfUrl}
                className="absolute inset-0 h-full w-full border-0 bg-white"
              />
            ) : (
              <div className="flex h-full min-h-[50vh] items-center justify-center p-6">
                <div className="max-w-md rounded-2xl border border-dashed border-slate-400/70 bg-white/95 px-6 py-10 text-center shadow-sm">
                  <p className="text-sm font-semibold text-slate-800">{examTitle || 'Deneme kitapçığı'}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {pdfBusy
                      ? 'Kitapçık PDF yükleniyor…'
                      : pdfError ||
                        'Bu sınav için sistemde PDF bulunamadı. Soruları basılı kitapçıktan takip edip soldaki optiği doldurun.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
