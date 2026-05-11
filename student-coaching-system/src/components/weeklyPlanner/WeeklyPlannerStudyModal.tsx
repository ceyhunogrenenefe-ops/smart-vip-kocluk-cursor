import React, { useEffect, useMemo, useState } from 'react';
import { BookMarked, Clock3, Target } from 'lucide-react';
import type { WeeklyPlannerEntryRow } from '../../lib/weeklyPlannerApi';
import { patchWeeklyEntryApi, submitPlannerDailyLog } from '../../lib/weeklyPlannerApi';
import { useApp } from '../../context/AppContext';
import { subjectPlannerStyle } from './subjectPlannerStyle';

type Props = {
  plannerEntry: WeeklyPlannerEntryRow;
  onClose: () => void;
  onSaved: () => void;
  /** Öğrenci blok zamanını düzenlemek için üst bileşen modalını açar */
  onEditPlanner?: (entry: WeeklyPlannerEntryRow) => void;
};

function clampNonNeg(n: number) {
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export function WeeklyPlannerStudyModal({ plannerEntry, onClose, onSaved, onEditPlanner }: Props) {
  const { weeklyEntries } = useApp();
  const linked = plannerEntry.weekly_entry_id
    ? weeklyEntries.find((e) => e.id === plannerEntry.weekly_entry_id)
    : undefined;

  const targetQuestions = Math.max(0, Number(plannerEntry.planned_quantity || 0));

  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [blank, setBlank] = useState(0);
  const [bookTitle, setBookTitle] = useState('');
  const [pagesRead, setPagesRead] = useState<number | ''>('');
  const [screenH, setScreenH] = useState<number | ''>('');
  const [screenM, setScreenM] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (linked) {
      setCorrect(clampNonNeg(linked.correctAnswers ?? 0));
      setWrong(clampNonNeg(linked.wrongAnswers ?? 0));
      setBlank(clampNonNeg(linked.blankAnswers ?? 0));
      setBookTitle(linked.bookTitle ?? '');
      const pages =
        (linked as { pagesRead?: number }).pagesRead ??
        (linked.readingMinutes != null ? linked.readingMinutes : undefined);
      setPagesRead(pages != null && pages >= 0 ? pages : '');
      const stm = (linked as { screenTimeMinutes?: number }).screenTimeMinutes;
      if (stm != null && stm >= 0) {
        setScreenH(Math.floor(stm / 60));
        setScreenM(stm % 60);
      } else {
        setScreenH('');
        setScreenM('');
      }
      setNotes(linked.coachComment ?? '');
    } else {
      setCorrect(0);
      setWrong(0);
      setBlank(0);
      setBookTitle('');
      setPagesRead('');
      setScreenH('');
      setScreenM('');
      setNotes('');
    }
  }, [linked, plannerEntry.id, plannerEntry.weekly_entry_id]);

  const subject = plannerEntry.subject?.trim() || 'Genel';
  const topic = plannerEntry.title?.trim() || subject;
  const st = useMemo(() => subjectPlannerStyle(subject), [subject]);

  const screenTotalMin = useMemo(() => {
    const h = screenH === '' ? 0 : clampNonNeg(Number(screenH));
    const m = screenM === '' ? 0 : clampNonNeg(Number(screenM));
    return h * 60 + m;
  }, [screenH, screenM]);

  const solvedPreview = correct + wrong + blank;

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const solved = solvedPreview;
      const pages =
        pagesRead === '' ? null : clampNonNeg(Number(pagesRead));
      const screen_time_minutes = screenTotalMin > 0 ? screenTotalMin : null;

      if (linked?.id || plannerEntry.weekly_entry_id) {
        const wid = linked?.id || plannerEntry.weekly_entry_id!;
        await patchWeeklyEntryApi(wid, {
          subject,
          topic,
          date: plannerEntry.planner_date,
          target_questions: targetQuestions,
          solved_questions: solved,
          correct,
          wrong,
          blank,
          reading_minutes: pages,
          pages_read: pages,
          screen_time_minutes,
          book_title: bookTitle.trim() || null,
          notes: notes.trim() || null,
        });
      } else {
        await submitPlannerDailyLog(plannerEntry.id, {
          subject,
          topic,
          target_questions: targetQuestions,
          correct,
          wrong,
          blank,
          solved_questions: solved,
          pages_read: pages,
          screen_time_minutes,
          book_title: bookTitle.trim() || null,
          notes: notes.trim() || null,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700 w-full max-w-lg max-h-[92vh] overflow-y-auto transition-transform duration-200"
        role="dialog"
        aria-labelledby="study-modal-title"
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start gap-3">
          <div>
            <p id="study-modal-title" className="text-lg font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-red-500" />
              Çalışma kaydı
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {plannerEntry.planner_date} · {plannerEntry.start_time} – {plannerEntry.end_time}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none px-2"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className={`rounded-xl border px-4 py-3 ${st.bar}`}>
            <p className="text-xs font-medium opacity-80">{subject}</p>
            <p className="font-semibold leading-snug">{topic}</p>
            <p className="text-sm mt-2 opacity-90">
              Hedef: <strong>{targetQuestions}</strong> soru
              {linked ? (
                <span className="ml-2 text-xs opacity-80">· Kayıt bağlı</span>
              ) : (
                <span className="ml-2 text-xs opacity-80">· İlk kayıt oluşturulacak</span>
              )}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Sonuçlar</p>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[11px] text-slate-500">Doğru</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={correct}
                  onChange={(e) => setCorrect(clampNonNeg(Number(e.target.value)))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500">Yanlış</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={wrong}
                  onChange={(e) => setWrong(clampNonNeg(Number(e.target.value)))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500">Boş</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={blank}
                  onChange={(e) => setBlank(clampNonNeg(Number(e.target.value)))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
              </label>
            </div>
            <p className="text-xs text-slate-500 mt-2">Çözülen toplam: {solvedPreview}</p>
          </div>

          <div className="rounded-xl border border-slate-100 dark:border-slate-700 p-4 space-y-3 bg-slate-50/80 dark:bg-slate-800/50">
            <p className="text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <BookMarked className="w-4 h-4" />
              Kitap okuma
            </p>
            <label className="block">
              <span className="text-[11px] text-slate-500">Kitap adı</span>
              <input
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                placeholder="Opsiyonel"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">Okunan sayfa</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={pagesRead}
                onChange={(e) =>
                  setPagesRead(e.target.value === '' ? '' : clampNonNeg(Number(e.target.value)))
                }
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-100 dark:border-slate-700 p-4 space-y-3 bg-slate-50/80 dark:bg-slate-800/50">
            <p className="text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Clock3 className="w-4 h-4" />
              Ekran süresi (telefon / tablet)
            </p>
            <div className="flex gap-2 items-center">
              <label className="flex-1">
                <span className="text-[11px] text-slate-500">Saat</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={screenH}
                  onChange={(e) =>
                    setScreenH(e.target.value === '' ? '' : clampNonNeg(Number(e.target.value)))
                  }
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
              </label>
              <label className="flex-1">
                <span className="text-[11px] text-slate-500">Dakika</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  inputMode="numeric"
                  value={screenM}
                  onChange={(e) =>
                    setScreenM(e.target.value === '' ? '' : Math.min(59, clampNonNeg(Number(e.target.value))))
                  }
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
              </label>
            </div>
            {screenTotalMin > 0 ? (
              <p className="text-xs text-slate-500">Toplam {screenTotalMin} dk</p>
            ) : null}
          </div>

          <label className="block">
            <span className="text-[11px] text-slate-500">Not</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm resize-none"
            />
          </label>

          {error ? (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-2 justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            {onEditPlanner ? (
              <button
                type="button"
                onClick={() => {
                  onEditPlanner(plannerEntry);
                  onClose();
                }}
                className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline-offset-2 hover:underline order-2 sm:order-1"
              >
                Zaman veya miktarı düzenle
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2 order-1 sm:order-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit()}
                className="px-5 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-60"
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
