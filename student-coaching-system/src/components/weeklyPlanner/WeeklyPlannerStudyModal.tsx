import React, { useEffect, useMemo, useState } from 'react';
import { BookMarked, CheckCircle2, Clock3, Target } from 'lucide-react';
import type { WeeklyPlannerEntryRow } from '../../lib/weeklyPlannerApi';
import { patchWeeklyEntryApi, patchWeeklyPlannerEntry, submitPlannerDailyLog } from '../../lib/weeklyPlannerApi';
import { useApp } from '../../context/AppContext';
import { completedQuantityForGoalUnit, goalUnitLabel, normalizeGoalUnit } from '../../lib/coachGoalUnits';
import { isKitapOkumaContext } from '../../lib/studyTrackSubjects';
import {
  isTopicMarkedCompleted,
  resolveTopicLabelForTracking
} from '../../lib/topicProgressSync';
import { findSameDayFieldOwner } from '../../lib/dailyReportTracking';
import { subjectPlannerStyle } from './subjectPlannerStyle';
import { AppModal, AppModalBody, AppModalFooter, AppModalHeader } from '../ui/AppModal';

type Props = {
  plannerEntry: WeeklyPlannerEntryRow;
  quantityUnit?: string | null;
  onClose: () => void;
  onSaved: () => void;
  /** Öğrenci blok zamanını düzenlemek için üst bileşen modalını açar */
  onEditPlanner?: (entry: WeeklyPlannerEntryRow) => void;
};

function clampNonNeg(n: number) {
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export function WeeklyPlannerStudyModal({
  plannerEntry,
  quantityUnit,
  onClose,
  onSaved,
  onEditPlanner
}: Props) {
  const {
    weeklyEntries,
    books,
    students,
    getTopics,
    addBook,
    updateBook,
    markTopicCompleted,
    getStudentTopicProgress,
    refreshTopicProgress,
    refreshBooks
  } = useApp();
  const goalUnit = normalizeGoalUnit(quantityUnit);
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
  const [markBookFinished, setMarkBookFinished] = useState(false);
  const [markTopicFinished, setMarkTopicFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const subject = plannerEntry.subject?.trim() || 'Genel';
  const rawTopic = plannerEntry.title?.trim() || subject;
  const studentRow = students.find((s) => s.id === plannerEntry.student_id);
  const topicPool = useMemo(() => {
    const cl = studentRow?.classLevel;
    if (cl === undefined || cl === null) return [];
    return getTopics(subject, cl);
  }, [studentRow, subject, getTopics]);
  const topic = useMemo(
    () => resolveTopicLabelForTracking(rawTopic, topicPool),
    [rawTopic, topicPool]
  );

  const topicAlreadyDone = useMemo(() => {
    const sid = plannerEntry.student_id;
    return isTopicMarkedCompleted(getStudentTopicProgress(sid), sid, subject, topic);
  }, [plannerEntry.student_id, subject, topic, getStudentTopicProgress]);

  const entryDateYmd = String(plannerEntry.planner_date || linked?.date || '').slice(0, 10);
  const currentEntryId = linked?.id || plannerEntry.weekly_entry_id || null;

  const readingOwner = useMemo(
    () =>
      findSameDayFieldOwner(
        weeklyEntries,
        plannerEntry.student_id,
        entryDateYmd,
        currentEntryId,
        'reading'
      ),
    [weeklyEntries, plannerEntry.student_id, entryDateYmd, currentEntryId]
  );
  const screenOwner = useMemo(
    () =>
      findSameDayFieldOwner(
        weeklyEntries,
        plannerEntry.student_id,
        entryDateYmd,
        currentEntryId,
        'screen'
      ),
    [weeklyEntries, plannerEntry.student_id, entryDateYmd, currentEntryId]
  );
  const readingLocked = Boolean(readingOwner);
  const screenLocked = Boolean(screenOwner);

  useEffect(() => {
    if (linked) {
      setCorrect(clampNonNeg(linked.correctAnswers ?? 0));
      setWrong(clampNonNeg(linked.wrongAnswers ?? 0));
      setBlank(clampNonNeg(linked.blankAnswers ?? 0));
      const linkedTitle = linked.bookTitle ?? '';
      const plannerTitle = plannerEntry.title?.trim() || '';
      if (readingLocked) {
        setBookTitle('');
        setPagesRead('');
        setMarkBookFinished(false);
      } else {
        setBookTitle(
          linkedTitle ||
            (isKitapOkumaContext(subject, plannerTitle) && plannerTitle !== subject ? plannerTitle : '')
        );
        const pages =
          (linked as { pagesRead?: number }).pagesRead ??
          (linked.readingMinutes != null ? linked.readingMinutes : undefined);
        setPagesRead(pages != null && pages >= 0 ? pages : '');
      }
      const stm = (linked as { screenTimeMinutes?: number }).screenTimeMinutes;
      if (screenLocked) {
        setScreenH('');
        setScreenM('');
      } else if (stm != null && stm >= 0) {
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
      setMarkBookFinished(false);
    }
  }, [
    linked,
    plannerEntry.id,
    plannerEntry.weekly_entry_id,
    plannerEntry.title,
    subject,
    readingLocked,
    screenLocked
  ]);

  const st = useMemo(() => subjectPlannerStyle(subject, goalUnit), [subject, goalUnit]);

  const screenTotalMin = useMemo(() => {
    const h = screenH === '' ? 0 : clampNonNeg(Number(screenH));
    const m = screenM === '' ? 0 : clampNonNeg(Number(screenM));
    return h * 60 + m;
  }, [screenH, screenM]);

  const solvedPreview = correct + wrong + blank;

  const progressAmount = useMemo(
    () =>
      completedQuantityForGoalUnit(goalUnit, {
        solvedQuestions: solvedPreview,
        pagesRead: pagesRead === '' ? 0 : clampNonNeg(Number(pagesRead)),
        screenMinutes: screenTotalMin
      }),
    [goalUnit, solvedPreview, pagesRead, screenTotalMin]
  );

  const topicGoalMet = targetQuestions > 0 && progressAmount >= targetQuestions;

  useEffect(() => {
    if (topicAlreadyDone) {
      setMarkTopicFinished(false);
      return;
    }
    if (topicGoalMet) setMarkTopicFinished(true);
  }, [topicAlreadyDone, topicGoalMet]);

  const submit = async () => {
    setSaving(true);
    setError('');
    const warnings: string[] = [];
    try {
      const solved = solvedPreview;
      const pages = readingLocked
        ? null
        : pagesRead === ''
          ? null
          : clampNonNeg(Number(pagesRead));
      const screen_time_minutes = screenLocked
        ? null
        : screenTotalMin > 0
          ? screenTotalMin
          : null;
      const bookTitleToSave = readingLocked ? '' : bookTitle.trim();
      const sid = plannerEntry.student_id;
      const today = new Date().toISOString().split('T')[0];

      const shouldMarkTopic =
        !topicAlreadyDone &&
        topic.trim() &&
        (markTopicFinished || topicGoalMet);

      if (!readingLocked && markBookFinished && !bookTitleToSave) {
        throw new Error('Kitabı bitirdim için kitap adı girin.');
      }

      // Konu / kitap senkronu — günlük kayıt API hatası bunları engellemesin
      if (shouldMarkTopic) {
        try {
          await markTopicCompleted(sid, subject, topic, plannerEntry.weekly_entry_id || plannerEntry.id);
        } catch (topicErr) {
          throw topicErr instanceof Error
            ? topicErr
            : new Error('Konu takibine kaydedilemedi');
        }
      }

      const titleNorm = bookTitleToSave.toLowerCase();
      if (!readingLocked && markBookFinished && titleNorm) {
        try {
          const pagesDone = pages ?? 0;
          const match =
            books.find(
              (b) =>
                b.studentId === sid &&
                b.title.trim().toLowerCase() === titleNorm &&
                b.status !== 'completed'
            ) ||
            books.find(
              (b) =>
                b.studentId === sid &&
                (b.title.trim().toLowerCase().includes(titleNorm) ||
                  titleNorm.includes(b.title.trim().toLowerCase())) &&
                b.status !== 'completed'
            );
          if (match) {
            await updateBook(match.id, {
              status: 'completed',
              endDate: today,
              pagesRead: Math.max(match.pagesRead ?? 0, pagesDone)
            });
          } else {
            const inst =
              studentRow?.institutionId ??
              students.find((s) => s.id === sid)?.institutionId;
            await addBook({
              id: '',
              studentId: sid,
              title: bookTitleToSave,
              pagesRead: pagesDone,
              startDate: plannerEntry.planner_date || today,
              endDate: today,
              status: 'completed',
              institutionId: inst,
              createdAt: new Date().toISOString()
            });
          }
          await refreshBooks();
        } catch (bookErr) {
          throw bookErr instanceof Error
            ? bookErr
            : new Error('Kitap takibine kaydedilemedi');
        }
      }

      let weeklyEntryId = linked?.id || plannerEntry.weekly_entry_id || undefined;

      const hasStudyMetrics =
        solved > 0 ||
        (pages != null && pages > 0) ||
        (screen_time_minutes != null && screen_time_minutes > 0) ||
        Boolean(bookTitleToSave);

      if (linked?.id || plannerEntry.weekly_entry_id) {
        if (hasStudyMetrics) {
          try {
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
              book_title: bookTitleToSave || null,
              notes: notes.trim() || null,
            });
          } catch (patchErr) {
            warnings.push(
              patchErr instanceof Error
                ? patchErr.message
                : 'Günlük çalışma kaydı güncellenemedi'
            );
          }
        }
      } else if (hasStudyMetrics || targetQuestions > 0) {
        try {
          const created = await submitPlannerDailyLog(plannerEntry.id, {
            subject,
            topic,
            target_questions: targetQuestions,
            correct,
            wrong,
            blank,
            solved_questions: solved,
            pages_read: pages,
            screen_time_minutes,
            book_title: bookTitleToSave || null,
            notes: notes.trim() || null,
          });
          weeklyEntryId =
            created?.planner_entry?.weekly_entry_id ||
            (created?.weekly_entry as { id?: string } | undefined)?.id ||
            weeklyEntryId;
        } catch (logErr) {
          if (shouldMarkTopic || markBookFinished) {
            warnings.push(
              logErr instanceof Error
                ? logErr.message
                : 'Takvim kaydı oluşturulamadı; konu/kitap işaretlendi'
            );
          } else {
            throw logErr;
          }
        }
      }

      if (shouldMarkTopic) {
        await refreshTopicProgress();
      }

      if (hasStudyMetrics) {
        try {
          const doneQty = progressAmount;
          const plannedN = targetQuestions;
          await patchWeeklyPlannerEntry(plannerEntry.id, {
            completed_quantity: doneQty,
            status:
              plannedN > 0 && doneQty >= plannedN
                ? 'completed'
                : doneQty > 0
                  ? 'partial'
                  : plannerEntry.status,
          });
        } catch {
          warnings.push('Takvim bloğundaki yapılan miktar güncellenemedi');
        }
      }

      if (warnings.length) {
        setError(warnings.join(' · '));
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
    <AppModal open onClose={onClose} panelClassName="max-w-lg">
      <AppModalHeader className="items-start gap-3 p-5">
        <div>
          <p id="study-modal-title" className="text-lg font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
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
      </AppModalHeader>

      <AppModalBody className="space-y-5 p-5">
          <div className={`rounded-xl border px-4 py-3 ${st.bar}`}>
            <p className="text-xs font-medium opacity-80">{subject}</p>
            <p className="font-semibold leading-snug">{topic}</p>
            <p className="text-sm mt-2 opacity-90">
              Hedef: <strong>{targetQuestions}</strong> {goalUnitLabel(goalUnit)}
              {linked ? (
                <span className="ml-2 text-xs opacity-80">· Kayıt bağlı</span>
              ) : (
                <span className="ml-2 text-xs opacity-80">· İlk kayıt oluşturulacak</span>
              )}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold flex items-center gap-2 text-violet-900 dark:text-violet-200 mb-2 -mt-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Konu takibi
            </p>
            {topicAlreadyDone ? (
              <p className="text-sm text-violet-800 dark:text-violet-300 mb-4 rounded-lg border border-violet-200 dark:border-violet-800/60 bg-violet-50/80 dark:bg-violet-950/40 px-3 py-2">
                Bu konu Konu Takibi sayfasında zaten <strong>tamamlandı</strong> olarak işaretli.
              </p>
            ) : (
              <div className="mb-4 rounded-lg border border-violet-200 dark:border-violet-800/60 bg-violet-50/80 dark:bg-violet-950/40 px-3 py-2">
                {topicGoalMet ? (
                  <p className="text-xs text-violet-700 dark:text-violet-300 mb-2">
                    Planlanan hedefe ulaşıldı; kayıtla birlikte konu otomatik tamamlanır.
                  </p>
                ) : null}
                <label className="flex items-start gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={markTopicFinished}
                    onChange={(e) => setMarkTopicFinished(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                  />
                  <span>
                    Konuyu bitirdim — <strong>{subject}</strong> / {topic} Konu Takibi&apos;ne işlenir.
                  </span>
                </label>
              </div>
            )}
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

          <div
            className={`rounded-xl border p-4 space-y-3 ${
              readingLocked
                ? 'border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/40 opacity-80'
                : 'border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50'
            }`}
          >
            <p className="text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <BookMarked className="w-4 h-4" />
              Kitap okuma
            </p>
            {readingLocked ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300/90">
                Bu gün kitap okuma zaten{' '}
                <strong>
                  {[readingOwner?.subject, readingOwner?.topic].filter(Boolean).join(' · ') || 'başka bir kayıtta'}
                </strong>{' '}
                girilmiş. Değiştirmek için o kaydı açın.
              </p>
            ) : null}
            <label className="block">
              <span className="text-[11px] text-slate-500">Kitap adı</span>
              <input
                value={readingLocked ? String(readingOwner?.bookTitle || '') : bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
                disabled={readingLocked}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-900/60"
                placeholder="Opsiyonel"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">Okunan sayfa</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={
                  readingLocked
                    ? readingOwner?.pagesRead ?? readingOwner?.readingMinutes ?? ''
                    : pagesRead
                }
                onChange={(e) =>
                  setPagesRead(e.target.value === '' ? '' : clampNonNeg(Number(e.target.value)))
                }
                disabled={readingLocked}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-900/60"
              />
            </label>
            {!readingLocked && bookTitle.trim() ? (
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={markBookFinished}
                  onChange={(e) => setMarkBookFinished(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Kitabı bitirdim (bitirilen kitaplar listesine eklenir)
              </label>
            ) : null}
          </div>

          <div
            className={`rounded-xl border p-4 space-y-3 ${
              screenLocked
                ? 'border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/40 opacity-80'
                : 'border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50'
            }`}
          >
            <p className="text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Clock3 className="w-4 h-4" />
              Ekran süresi (telefon / tablet)
            </p>
            {screenLocked ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300/90">
                Bu gün ekran süresi zaten{' '}
                <strong>
                  {[screenOwner?.subject, screenOwner?.topic].filter(Boolean).join(' · ') || 'başka bir kayıtta'}
                </strong>{' '}
                girilmiş. Değiştirmek için o kaydı açın.
              </p>
            ) : null}
            <div className="flex gap-2 items-center">
              <label className="flex-1">
                <span className="text-[11px] text-slate-500">Saat</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={
                    screenLocked
                      ? Math.floor((screenOwner?.screenTimeMinutes || 0) / 60)
                      : screenH
                  }
                  onChange={(e) =>
                    setScreenH(e.target.value === '' ? '' : clampNonNeg(Number(e.target.value)))
                  }
                  disabled={screenLocked}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-900/60"
                />
              </label>
              <label className="flex-1">
                <span className="text-[11px] text-slate-500">Dakika</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  inputMode="numeric"
                  value={
                    screenLocked ? (screenOwner?.screenTimeMinutes || 0) % 60 : screenM
                  }
                  onChange={(e) =>
                    setScreenM(e.target.value === '' ? '' : Math.min(59, clampNonNeg(Number(e.target.value))))
                  }
                  disabled={screenLocked}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-900/60"
                />
              </label>
            </div>
            {!screenLocked && screenTotalMin > 0 ? (
              <p className="text-xs text-slate-500">Toplam {screenTotalMin} dk</p>
            ) : null}
            {screenLocked && (screenOwner?.screenTimeMinutes || 0) > 0 ? (
              <p className="text-xs text-slate-500">Toplam {screenOwner?.screenTimeMinutes} dk</p>
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
      </AppModalBody>

      <AppModalFooter className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {onEditPlanner ? (
            <button
              type="button"
              onClick={() => {
                onEditPlanner(plannerEntry);
                onClose();
              }}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline-offset-2 hover:underline"
            >
              Zaman veya miktarı düzenle
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300 sm:flex-none sm:px-4 sm:py-2"
            >
              İptal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="flex-[1.4] rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 sm:flex-none sm:px-5 sm:py-2"
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </AppModalFooter>
    </AppModal>
  );
}
