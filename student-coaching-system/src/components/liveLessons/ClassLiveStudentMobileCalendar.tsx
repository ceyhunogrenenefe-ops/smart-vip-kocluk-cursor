import React, { useEffect, useMemo, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { liveSubjectAccent } from './liveSubjectAccent';
import { hasClassSessionRecordingAccess } from '../../lib/liveLessonUtils';
import { cn } from '../../lib/utils';

type SessionRow = {
  id: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_id: string;
  teacher_name?: string;
  status: string;
  meeting_link?: string;
  join_link?: string;
  recording_link?: string | null;
  bbb_meeting_id?: string | null;
};

type SlotRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_id: string;
  teacher_name?: string;
  meeting_link: string;
};

type TeacherOption = { id: string; name: string };

const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export type ClassLiveStudentMobileCalendarProps = {
  weekColumnDates: string[];
  weekSessions: SessionRow[];
  classSlots: SlotRow[];
  teacherCandidates: TeacherOption[];
  formatDateDots: (iso: string) => string;
  dowFromIso: (iso: string) => number;
  todayIso: string;
  onJoinSession?: (s: SessionRow) => void;
  onWatchSession?: (s: SessionRow) => void;
};

/** Öğrenci mobil — haftalık grid yerine gün seçimi + ders listesi */
export function ClassLiveStudentMobileCalendar({
  weekColumnDates,
  weekSessions,
  classSlots,
  teacherCandidates,
  formatDateDots,
  dowFromIso,
  todayIso,
  onJoinSession,
  onWatchSession
}: ClassLiveStudentMobileCalendarProps) {
  const [dayIdx, setDayIdx] = useState(() => {
    const idx = weekColumnDates.indexOf(todayIso);
    return idx >= 0 ? idx : 0;
  });

  useEffect(() => {
    const idx = weekColumnDates.indexOf(todayIso);
    if (idx >= 0) setDayIdx(idx);
  }, [weekColumnDates, todayIso]);

  const dayIso = weekColumnDates[Math.min(dayIdx, Math.max(weekColumnDates.length - 1, 0))] ?? weekColumnDates[0];

  const sessions = useMemo(
    () =>
      weekSessions
        .filter((s) => s.lesson_date === dayIso)
        .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
    [weekSessions, dayIso]
  );

  const templates = useMemo(
    () =>
      classSlots
        .filter((s) => s.day_of_week === dowFromIso(dayIso))
        .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
    [classSlots, dayIso, dowFromIso]
  );

  const hasAny = sessions.length > 0 || templates.length > 0;

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {weekColumnDates.map((iso, i) => {
          const isToday = iso === todayIso;
          const active = dayIdx === i;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setDayIdx(i)}
              className={cn(
                'flex min-w-[3.25rem] shrink-0 flex-col items-center rounded-xl border px-2 py-2 text-center transition-colors touch-manipulation',
                active
                  ? 'border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-900/20'
                  : isToday
                    ? 'border-amber-300 bg-amber-50 text-amber-950'
                    : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50'
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-90">{DAY_SHORT[i]}</span>
              <span className="text-sm font-bold tabular-nums">{iso.slice(8, 10)}</span>
              <span className="text-[9px] tabular-nums opacity-80">{formatDateDots(iso).slice(3, 5)}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs font-medium text-slate-600">
        {formatDateDots(dayIso)} · {sessions.length} oturum
        {templates.length > 0 ? ` · ${templates.length} şablon` : ''}
      </p>

      {!hasAny ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
          Bu gün için planlı grup dersi yok.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {sessions.map((s) => {
            const teacher = teacherCandidates.find((t) => t.id === s.teacher_id);
            const accent = liveSubjectAccent(s.subject);
            const sessionLink = String(s.join_link || s.meeting_link || '').trim();
            const canJoin = s.status === 'scheduled' && Boolean(sessionLink);
            const canWatch = hasClassSessionRecordingAccess(s);
            return (
              <li
                key={s.id}
                className={cn(
                  'rounded-xl border border-slate-200/80 px-3 py-3 shadow-sm',
                  accent.leftBar,
                  accent.bg
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn('text-sm font-bold leading-tight', accent.title)}>{s.subject}</p>
                    <p className="mt-0.5 text-xs text-slate-700">
                      {teacher?.name || s.teacher_name || 'Öğretmen'}
                    </p>
                    <p className="text-xs tabular-nums text-slate-500">
                      {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                    </p>
                  </div>
                  {s.status === 'scheduled' ? (
                    <span className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                      Planlı
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {canJoin ? (
                    <button
                      type="button"
                      onClick={() =>
                        onJoinSession
                          ? onJoinSession(s)
                          : window.open(sessionLink, '_blank', 'noopener,noreferrer')
                      }
                      className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Katıl
                    </button>
                  ) : null}
                  {canWatch ? (
                    <button
                      type="button"
                      onClick={() =>
                        onWatchSession
                          ? onWatchSession(s)
                          : window.open(sessionLink, '_blank', 'noopener,noreferrer')
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                      Kaydı izle
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
          {templates.map((s) => {
            const teacher = teacherCandidates.find((t) => t.id === s.teacher_id);
            const accent = liveSubjectAccent(s.subject);
            return (
              <li
                key={`tpl-${s.id}`}
                className="rounded-xl border border-dashed border-indigo-300/80 bg-indigo-50/60 px-3 py-3"
              >
                <p className={cn('text-sm font-bold', accent.title)}>{s.subject}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">Haftalık şablon</p>
                <p className="text-xs text-slate-600">
                  {teacher?.name || s.teacher_name || 'Öğretmen'} · {String(s.start_time).slice(0, 5)}
                </p>
                {(s.join_link || s.meeting_link) ? (
                  <button
                    type="button"
                    onClick={() => window.open(String(s.join_link || s.meeting_link || ''), '_blank', 'noopener,noreferrer')}
                    className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Derse git
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
