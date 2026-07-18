import React, { useMemo } from 'react';
import { ExternalLink, HelpCircle, PlayCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  STUDENT_HELP_VIDEOS,
  TEACHER_COACH_HELP_VIDEOS,
  type HelpVideo
} from '../content/helpVideos';

function helpVideosForRoles(roles: string[]): HelpVideo[] {
  const tags = new Set(roles.map((r) => String(r || '').trim().toLowerCase()).filter(Boolean));
  const isStaff = ['teacher', 'coach', 'admin', 'super_admin'].some((r) => tags.has(r));
  const isStudentOnly = tags.has('student') && !isStaff;
  if (isStudentOnly) return STUDENT_HELP_VIDEOS;
  if (isStaff) return TEACHER_COACH_HELP_VIDEOS;
  return STUDENT_HELP_VIDEOS;
}

export default function StudentHelpPage() {
  const { user } = useAuth();
  const videos = useMemo(() => {
    const roles = [
      ...(Array.isArray(user?.roles) ? user.roles : []),
      user?.role
    ].filter(Boolean) as string[];
    return helpVideosForRoles(roles);
  }, [user?.role, user?.roles]);

  const isStaffVideos = videos === TEACHER_COACH_HELP_VIDEOS;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md">
            <HelpCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Yardım</h1>
            <p className="text-sm text-slate-600">
              {isStaffVideos
                ? 'Ödev verme ve animasyon ekleme için kısa video rehberler'
                : 'Panel kullanımını kolaylaştıran kısa video rehberler'}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-5">
        {videos.map((item) => (
          <article
            key={item.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-100 bg-gradient-to-r from-teal-50 to-emerald-50 px-4 py-4 sm:px-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
                  <PlayCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-slate-900">{item.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
                </div>
              </div>
            </div>

            {item.embedUrl ? (
              <div className="relative aspect-video w-full bg-slate-900">
                <iframe
                  title={item.title}
                  src={item.embedUrl}
                  className="absolute inset-0 h-full w-full border-0"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
              <a
                href={item.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] touch-manipulation items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
              >
                Videoyu yeni sekmede aç
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
