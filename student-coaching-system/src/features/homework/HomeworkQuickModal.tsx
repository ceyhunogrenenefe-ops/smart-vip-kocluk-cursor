import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, ListChecks, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../../context/AppContext';
import { createQuickHomework } from './homeworkApi';

const field =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Sade ödev verme penceresi.
 * Ders ve konu sınıfın düzeyine göre konu havuzundan gelir; kaydedilince ödev
 * yayımlanır ve öğrencilerin haftalık planına düşer.
 */
export default function HomeworkQuickModal({
  open,
  classId,
  className,
  classLevel,
  onClose,
  onSaved
}: {
  open: boolean;
  classId: string;
  className?: string | null;
  classLevel?: string | number | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { getTopicsByClass } = useApp();
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState('');
  const [minutes, setMinutes] = useState('');
  const [dueDate, setDueDate] = useState(todayYmd());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /** Sınıfın dersleri ve her dersin konuları */
  const subjectTopics = useMemo(() => {
    try {
      return getTopicsByClass(classLevel ?? null) || {};
    } catch {
      return {};
    }
  }, [getTopicsByClass, classLevel]);

  const subjects = useMemo(
    () => Object.keys(subjectTopics).filter((k) => (subjectTopics[k] || []).length > 0).sort((a, b) => a.localeCompare(b, 'tr')),
    [subjectTopics]
  );
  const topics = useMemo(() => (subject ? subjectTopics[subject] || [] : []), [subject, subjectTopics]);

  useEffect(() => {
    if (!open) return;
    setSubject('');
    setTopic('');
    setQuestions('');
    setMinutes('');
    setDueDate(todayYmd());
    setNote('');
  }, [open, classId]);

  useEffect(() => {
    setTopic('');
  }, [subject]);

  if (!open) return null;

  const save = async () => {
    if (!subject) {
      toast.error('Ders seçin');
      return;
    }
    setBusy(true);
    try {
      const r = await createQuickHomework({
        class_id: classId,
        subject,
        topic: topic || undefined,
        target_question_count: questions ? Number(questions) || null : null,
        target_minutes: minutes ? Number(minutes) || null : null,
        due_date: dueDate || undefined,
        description: note.trim() || undefined
      });
      const planned = r.plan?.created ?? 0;
      toast.success(
        planned > 0
          ? `Ödev verildi — ${planned} öğrencinin haftalık planına eklendi`
          : 'Ödev verildi'
      );
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ödev verilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">Ödev ver</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {className || 'Sınıf'}
              {classLevel ? ` · ${classLevel}. sınıf` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600">Ders</span>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className={field} disabled={busy}>
              <option value="">— Ders seçin</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {!subjects.length ? (
              <span className="mt-1 block text-[11px] text-amber-700">
                Bu sınıf düzeyi için konu havuzu boş. Dersi elle yazmak yerine Konu Havuzu sayfasından
                ekleyebilirsiniz.
              </span>
            ) : null}
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600">Konu</span>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className={field}
              disabled={busy || !subject}
            >
              <option value="">— Konu seçin (isteğe bağlı)</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                <ListChecks className="h-3.5 w-3.5 text-amber-600" />
                Soru sayısı
              </span>
              <input
                type="number"
                min={1}
                max={1000}
                inputMode="numeric"
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                placeholder="25"
                className={field}
                disabled={busy}
              />
            </label>
            <label className="block text-sm">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                Süre (dk)
              </span>
              <input
                type="number"
                min={5}
                max={600}
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="40"
                className={field}
                disabled={busy}
              />
            </label>
            <label className="block text-sm">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                <CalendarDays className="h-3.5 w-3.5 text-amber-600" />
                Teslim
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={field}
                disabled={busy}
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600">Açıklama (isteğe bağlı)</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Kısa not — örn. yanlışlarını deftere yaz"
              className={field}
              disabled={busy}
            />
          </label>

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Kaydedince ödev sınıftaki her öğrencinin haftalık planına teslim tarihine eklenir.
          </p>

          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !subject}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? 'Kaydediliyor…' : 'Ödevi ver'}
          </button>
        </div>
      </div>
    </div>
  );
}
