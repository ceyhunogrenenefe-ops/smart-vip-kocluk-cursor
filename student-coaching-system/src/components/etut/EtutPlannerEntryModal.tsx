import React, { useState } from 'react';
import { Loader2, PlayCircle, ClipboardList } from 'lucide-react';
import type { WeeklyPlannerEntryRow } from '../../lib/weeklyPlannerApi';
import { joinEtutStudyRoom } from '../../lib/etutSession';
import type { ClassLevel } from '../../types';

type Props = {
  entry: WeeklyPlannerEntryRow;
  studentId: string;
  classLevel?: ClassLevel | null;
  institutionId?: string | null;
  onStudyLog: () => void;
  onClose: () => void;
};

export function EtutPlannerEntryModal({
  entry,
  studentId,
  classLevel,
  institutionId,
  onStudyLog,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const joinEtut = async () => {
    setBusy(true);
    setError('');
    try {
      await joinEtutStudyRoom({
        studentId,
        classLevel,
        institutionId,
        plannerEntryId: entry.id,
        plannerDate: entry.planner_date,
        startTime: entry.start_time,
        endTime: entry.end_time,
        topic: entry.title || 'Etüt',
        date: entry.planner_date,
        source: 'planner',
        busy: setBusy,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Etüt odasına girilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl border border-violet-200 bg-white p-5 shadow-xl sm:rounded-2xl dark:border-violet-800 dark:bg-slate-900">
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">Etüt planın</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {entry.planner_date} · {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)}
        </p>
        <p className="mt-2 font-medium text-violet-800 dark:text-violet-200">{entry.title || 'Etüt'}</p>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void joinEtut()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Etüte katıl
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onStudyLog();
            }}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
          >
            <ClipboardList className="h-4 w-4" />
            Çalışma kaydı / rapor
          </button>
          <button type="button" onClick={onClose} className="py-2 text-sm text-slate-500 hover:text-slate-800">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
