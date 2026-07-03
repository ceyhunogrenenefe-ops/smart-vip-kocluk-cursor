import React from 'react';
import { X } from 'lucide-react';
import type {
  ClassLivePresenceModalKind,
  ClassLivePresenceSnapshot
} from '../../lib/classLivePresence';

type Props = {
  open: boolean;
  className: string;
  kind: ClassLivePresenceModalKind;
  presence: ClassLivePresenceSnapshot | null;
  onClose: () => void;
};

const TITLES: Record<ClassLivePresenceModalKind, string> = {
  active: '🟢 Aktif öğrenciler',
  passive: '🔴 Pasif öğrenciler',
  absent: '⚪ Derse katılmayan öğrenciler'
};

function boolLabel(v: boolean | undefined) {
  if (v === true) return 'Açık';
  if (v === false) return 'Kapalı';
  return '—';
}

export default function ClassLivePresenceModal({ open, className, kind, presence, onClose }: Props) {
  if (!open || !presence) return null;

  const rows =
    kind === 'active'
      ? presence.active_students
      : kind === 'passive'
        ? presence.passive_students
        : presence.absent_students;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="class-live-presence-title"
      onClick={onClose}
    >
      <div
        className="max-h-[min(85vh,640px)] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <h3 id="class-live-presence-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
              {TITLES[kind]}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{className}</p>
            {presence.subject ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Ders: {presence.subject}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[min(60vh,480px)] overflow-y-auto p-4">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Liste boş.</p>
          ) : kind === 'absent' ? (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.student_id}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-100"
                >
                  {r.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.student_id}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{r.name}</p>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                    <div>
                      <dt className="inline">Giriş: </dt>
                      <dd className="inline font-medium text-slate-800 dark:text-slate-200">
                        {r.joined_at_label || '—'}
                      </dd>
                    </div>
                    {kind === 'passive' ? (
                      <div>
                        <dt className="inline">Pasif süre: </dt>
                        <dd className="inline font-medium text-slate-800 dark:text-slate-200">
                          {r.passive_minutes != null ? `${r.passive_minutes} dk` : '—'}
                        </dd>
                      </div>
                    ) : (
                      <>
                        <div>
                          <dt className="inline">Kamera: </dt>
                          <dd className="inline font-medium text-slate-800 dark:text-slate-200">
                            {boolLabel(r.camera_on)}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline">Mikrofon: </dt>
                          <dd className="inline font-medium text-slate-800 dark:text-slate-200">
                            {boolLabel(r.microphone_on)}
                          </dd>
                        </div>
                      </>
                    )}
                    <div className="col-span-2">
                      <dt className="inline">Son aktif: </dt>
                      <dd className="inline font-medium text-slate-800 dark:text-slate-200">
                        {r.last_active_label || '—'}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400 dark:border-slate-800">
          Son güncelleme: {new Date(presence.polled_at).toLocaleTimeString('tr-TR')} · Pasif eşiği:{' '}
          {presence.idle_seconds} sn
        </div>
      </div>
    </div>
  );
}
