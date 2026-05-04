import React from 'react';
import { Video, Link2, Copy, ExternalLink, Presentation, PlayCircle } from 'lucide-react';
import type { TeacherLesson, TeacherLessonPlatform } from '../../types';
import { isApproaching, isOngoing, PLATFORM_LABEL } from '../../lib/liveLessonUtils';

type Props = {
  lesson: TeacherLesson;
  /** Öğrenci adı (öğretmen listesinde) */
  studentName?: string;
  showApproaching?: boolean;
  onCopy?: () => void;
  onJoin?: () => void;
  /** Planlı dersi tamamlandı işaretle (öğretmen/koç) */
  onMarkComplete?: () => void;
  extraActions?: React.ReactNode;
  /**
   * Öğrenci paneli: tamamlanan derslerde toplantı linki tekrar kullanılmasın (yeni ders yeni link).
   */
  lockCompletedLink?: boolean;
};

function PlatformIcon({ platform }: { platform: TeacherLessonPlatform }) {
  const wrap = (node: React.ReactNode) => <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-50 border border-slate-100">{node}</span>;
  switch (platform) {
    case 'zoom':
      return wrap(<Video className="w-5 h-5 text-blue-600" aria-label="Zoom" />);
    case 'meet':
      return wrap(<Video className="w-5 h-5 text-emerald-600" aria-label="Google Meet" />);
    case 'bbb':
      return wrap(<Presentation className="w-5 h-5 text-violet-600" aria-label="BigBlueButton" />);
    default:
      return wrap(<Link2 className="w-5 h-5 text-slate-600" aria-label="Bağlantı" />);
  }
}

export default function LiveLessonCard({
  lesson,
  studentName,
  showApproaching = true,
  onCopy,
  onJoin,
  onMarkComplete,
  extraActions,
  lockCompletedLink = false
}: Props) {
  const approaching = showApproaching && isApproaching(lesson);
  const ongoing = isOngoing(lesson);

  const joinInactive =
    lesson.status === 'cancelled' || (lockCompletedLink && lesson.status === 'completed');

  const bbbRecordingAvailable =
    lockCompletedLink &&
    lesson.status === 'completed' &&
    lesson.platform === 'bbb' &&
    Boolean(lesson.meeting_link?.trim());

  /** Öğrenci paneli: BBB tamamlanınca aynı URL kayıt için de kullanılabilir; kopyalamayı açık bırak */
  const copyInactive =
    lesson.status === 'cancelled' ||
    (lockCompletedLink && lesson.status === 'completed' && !bbbRecordingAvailable);

  const badgeClass =
    lesson.status === 'completed'
      ? 'bg-slate-100 text-slate-700'
      : lesson.status === 'cancelled'
        ? 'bg-red-50 text-red-700'
        : approaching
          ? 'bg-amber-100 text-amber-900'
          : ongoing
            ? 'bg-sky-100 text-sky-800'
            : 'bg-indigo-50 text-indigo-800';

  const badgeText =
    lesson.status === 'completed'
      ? 'Tamamlandı'
      : lesson.status === 'cancelled'
        ? 'İptal'
        : approaching
          ? 'Yaklaşıyor'
          : ongoing
            ? 'Devam ediyor'
            : 'Planlandı';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-stretch gap-4">
      <div className="flex gap-3 flex-1 min-w-0">
        <PlatformIcon platform={lesson.platform} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h4 className="font-semibold text-slate-900 truncate">{lesson.title}</h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {PLATFORM_LABEL[lesson.platform] || lesson.platform}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>{badgeText}</span>
          </div>
          <p className="text-sm text-slate-600">
            {new Date(lesson.date + 'T12:00:00').toLocaleDateString('tr-TR', {
              weekday: 'short',
              day: 'numeric',
              month: 'short'
            })}{' '}
            · {lesson.start_time?.slice(0, 5)} – {lesson.end_time?.slice(0, 5)}
          </p>
          {studentName && <p className="text-sm text-slate-500 mt-0.5">Öğrenci: {studentName}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:justify-center">
        {lesson.status === 'scheduled' && onMarkComplete ? (
          <button
            type="button"
            onClick={onMarkComplete}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            Ders yapıldı
          </button>
        ) : null}
        {extraActions}
        <div className="flex flex-col items-end gap-1">
          {joinInactive && lesson.status === 'completed' && lockCompletedLink ? (
            bbbRecordingAvailable ? (
              <span className="text-[11px] text-slate-500 text-right max-w-[240px]">
                Ders tamamlandı; BigBlueButton kaydına aynı oturum bağlantısından ulaşabilirsiniz.
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 text-right max-w-[220px]">
                Ders tamamlandı; yeni oturum için paylaşılan güncel bağlantıyı kullanın.
              </span>
            )
          ) : null}
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={onCopy}
              disabled={copyInactive}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Copy className="w-4 h-4" />
              Linki kopyala
            </button>
            {bbbRecordingAvailable ? (
              <button
                type="button"
                onClick={() => window.open(lesson.meeting_link, '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
              >
                <PlayCircle className="w-4 h-4" />
                Ders kaydını izle
              </button>
            ) : null}
            <button
              type="button"
              onClick={onJoin}
              disabled={joinInactive}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ExternalLink className="w-4 h-4" />
              Derse katıl
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
