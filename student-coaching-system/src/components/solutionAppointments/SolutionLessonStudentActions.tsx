import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, Loader2, Video } from 'lucide-react';
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

const btnBase =
  'inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold sm:text-xs touch-manipulation';

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
  const joinReady = canJoin && Boolean(sessionLink);
  const hasFiles = (myAp?.files?.length || 0) > 0;

  const joinTitle = !myAp
    ? 'Önce randevu alın'
    : !sessionLink
      ? 'Ders bağlantısı henüz hazır değil'
      : canJoin
        ? 'Canlı derse katıl'
        : 'Derse katıl, randevu saatinden 10 dakika önce açılır';

  return (
    <>
      <div className={cn('flex flex-col gap-1.5', compact ? '' : 'mt-2')}>
        {loading && !myAp ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Randevu…
          </span>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className={cn(
                  btnBase,
                  myAp
                    ? 'border border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm hover:brightness-110'
                )}
              >
                {myAp ? (
                  <>✅ Randevum</>
                ) : (
                  <>
                    <Calendar className="h-3 w-3 shrink-0" />
                    Randevu Al
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={!joinReady}
                title={joinTitle}
                onClick={() => joinReady && onJoin?.(session)}
                className={cn(
                  btnBase,
                  joinReady
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:brightness-110'
                    : 'cursor-not-allowed bg-slate-200 text-slate-500'
                )}
              >
                <Video className="h-3 w-3 shrink-0" />
                Derse Katıl
              </button>
            </div>

            {myAp ? (
              <div className="rounded-lg bg-white/80 px-2 py-1.5 text-[10px] text-slate-700 ring-1 ring-slate-200/80">
                <p>
                  <span className="font-semibold">Randevu saati:</span>{' '}
                  {slotRangeLabel(myAp.slot_start, myAp.slot_end)}
                </p>
                <p className="mt-0.5 text-slate-600">
                  {hasFiles
                    ? 'Sorularınız yüklendi — «Randevum»dan düzenleyebilirsiniz.'
                    : '«Randevum»a tıklayıp soru fotoğrafı veya PDF yükleyin.'}
                </p>
                {!joinReady ? (
                  <p className="mt-0.5 text-amber-800">
                    «Derse Katıl» randevu saatinden 10 dk önce aktif olur.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-[10px] leading-snug text-violet-800">
                1) Randevu al → 2) Sorularını yükle → 3) Saat gelince «Derse Katıl»
              </p>
            )}
          </>
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
