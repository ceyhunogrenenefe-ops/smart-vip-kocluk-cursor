import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fetchSolutionLesson } from '../../lib/solutionAppointments/api';
import { isSolutionLessonSubject, slotRangeLabel } from '../../lib/solutionAppointments/utils';
import type { SolutionMyAppointment } from '../../lib/solutionAppointments/utils';
import { SolutionAppointmentModal } from './SolutionAppointmentModal';

type SessionRow = {
  id: string;
  subject: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  teacher_id: string;
  teacher_name?: string;
  status: string;
  join_link?: string;
  meeting_link?: string;
};

export type SolutionLessonStudentActionsProps = {
  session: SessionRow;
  teacherName: string;
  studentDefaults?: { name?: string; class_level?: string };
  onJoin?: (session: SessionRow) => void;
  compact?: boolean;
};

export function SolutionLessonStudentActions({
  session,
  teacherName,
  studentDefaults,
  onJoin,
  compact
}: SolutionLessonStudentActionsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [myAp, setMyAp] = useState<SolutionMyAppointment | null>(null);

  const isSolution = isSolutionLessonSubject(session.subject);

  const refresh = useCallback(async () => {
    if (!isSolution || session.status !== 'scheduled') return;
    setLoading(true);
    try {
      const data = await fetchSolutionLesson(session.id);
      setMyAp(data.my_appointment || null);
    } catch {
      setMyAp(null);
    } finally {
      setLoading(false);
    }
  }, [isSolution, session.id, session.status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isSolution || session.status !== 'scheduled') return null;

  const canJoin = Boolean(myAp?.can_join);
  const sessionLink = String(session.join_link || session.meeting_link || '').trim();

  return (
    <>
      <div className={cn('flex flex-col gap-1.5', compact ? '' : 'mt-2')}>
        {loading && !myAp ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Randevu…
          </span>
        ) : myAp ? (
          <>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 sm:text-xs"
            >
              ✅ Randevum
            </button>
            <div className="rounded-lg bg-white/80 px-2 py-1.5 text-[10px] text-slate-700 ring-1 ring-slate-200/80">
              <p>
                <span className="font-semibold">Saat:</span> {slotRangeLabel(myAp.slot_start, myAp.slot_end)}
              </p>
              <p>
                <span className="font-semibold">Öğretmen:</span> {teacherName}
              </p>
              <p>
                <span className="font-semibold">Durum:</span> {myAp.status_label || myAp.status}
              </p>
            </div>
            <button
              type="button"
              disabled={!canJoin || !sessionLink}
              title={
                canJoin
                  ? 'Derse katıl'
                  : 'Katıl butonu randevu saatinden 10 dakika önce aktif olur'
              }
              onClick={() => onJoin?.(session)}
              className={cn(
                'rounded-lg px-2 py-1 text-[10px] font-semibold sm:text-xs',
                canJoin && sessionLink
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:brightness-110'
                  : 'cursor-not-allowed bg-slate-200 text-slate-500'
              )}
            >
              Katıl
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:brightness-110 sm:text-xs"
          >
            <Calendar className="h-3 w-3 shrink-0" />
            Randevu Al
          </button>
        )}
      </div>

      <SolutionAppointmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        session={session}
        teacherName={teacherName}
        studentDefaults={studentDefaults}
        onSuccess={() => void refresh()}
      />
    </>
  );
}
