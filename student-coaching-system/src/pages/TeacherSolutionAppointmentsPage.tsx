import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, ExternalLink, Loader2, Play, RefreshCw } from 'lucide-react';
import {
  completeTeacherSession,
  fetchTeacherAppointments,
  patchTeacherAppointmentNote,
  startTeacherSession
} from '../lib/solutionAppointments/api';
import type { TeacherAppointmentRow } from '../lib/solutionAppointments/utils';
import { slotRangeLabel, slotTimeLabel } from '../lib/solutionAppointments/utils';
import { cn } from '../lib/utils';

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function TeacherSolutionAppointmentsPage() {
  const [date, setDate] = useState(todayIsoLocal);
  const [rows, setRows] = useState<TeacherAppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [sessionDoneMsg, setSessionDoneMsg] = useState('');
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchTeacherAppointments(date);
      setRows(list);
      const running = list.find((r) => r.status === 'in_progress');
      if (running) {
        setActiveId(running.id);
        setRemaining(running.session_remaining_seconds || 600);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeId || remaining <= 0) return;
    timerRef.current = window.setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [activeId, remaining]);

  useEffect(() => {
    if (activeId && remaining === 0) {
      void (async () => {
        try {
          await completeTeacherSession(activeId);
          setSessionDoneMsg('Oturum tamamlandı');
          setActiveId(null);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    }
  }, [activeId, remaining, load]);

  const grouped = useMemo(() => {
    const map = new Map<string, TeacherAppointmentRow[]>();
    for (const r of rows) {
      const key = `${r.lesson_subject || 'Ders'}|${r.lesson_start || ''}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  const startSession = async (id: string) => {
    setBusyId(id);
    setSessionDoneMsg('');
    try {
      const res = await startTeacherSession(id);
      setActiveId(id);
      const secs = Number((res as { duration_minutes?: number }).duration_minutes || 10) * 60;
      setRemaining(secs);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId('');
    }
  };

  const completeSession = async (id: string) => {
    setBusyId(id);
    try {
      await completeTeacherSession(id);
      setSessionDoneMsg('Oturum tamamlandı');
      setActiveId(null);
      setRemaining(0);
      const list = await fetchTeacherAppointments(date);
      setRows(list);
      const next = list.find((r) => r.status === 'scheduled');
      if (next) {
        setSessionDoneMsg(
          `Oturum tamamlandı. Sıradaki: ${next.student_name} (${slotRangeLabel(next.slot_start, next.slot_end)})`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId('');
    }
  };

  const saveNote = async (id: string, teacher_note: string) => {
    try {
      await patchTeacherAppointmentNote(id, { teacher_note });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white shadow-sm">
        <h1 className="text-xl font-bold sm:text-2xl">Bugünkü Randevular</h1>
        <p className="mt-1 text-sm text-indigo-100">
          Soru çözümü derslerindeki öğrenci randevularını görüntüleyin ve oturumları yönetin.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-medium text-slate-700">
          Tarih
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Yenile
        </button>
        {activeId ? (
          <div className="ml-auto flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
            <Clock className="h-4 w-4" />
            Aktif oturum: {formatCountdown(remaining)}
          </div>
        ) : null}
      </div>

      {sessionDoneMsg ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {sessionDoneMsg}
        </div>
      ) : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Yükleniyor…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Bu tarih için randevu bulunamadı.
        </div>
      ) : (
        grouped.map(([key, list]) => {
          const [subject, start] = key.split('|');
          return (
            <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
                <p className="text-sm font-bold text-slate-800">{subject}</p>
                <p className="text-xs text-slate-500">Ders başlangıcı: {slotTimeLabel(start)}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Saat</th>
                      <th className="px-3 py-2">Öğrenci</th>
                      <th className="px-3 py-2">Sınıf</th>
                      <th className="px-3 py-2">Soru</th>
                      <th className="px-3 py-2">Dosyalar</th>
                      <th className="px-3 py-2">Not</th>
                      <th className="px-3 py-2">Durum</th>
                      <th className="px-3 py-2">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr
                        key={r.id}
                        className={cn(
                          'border-t border-slate-100',
                          r.status === 'in_progress' ? 'bg-amber-50/60' : '',
                          r.status === 'completed' ? 'opacity-75' : ''
                        )}
                      >
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                          {slotRangeLabel(r.slot_start, r.slot_end)}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.student_name}</td>
                        <td className="px-3 py-2">{r.student_class_level || '—'}</td>
                        <td className="px-3 py-2">{r.question_count}</td>
                        <td className="px-3 py-2">
                          <ul className="space-y-0.5">
                            {(r.files || []).map((f) => (
                              <li key={f.id}>
                                <a
                                  href={f.file_url || '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-xs text-indigo-600 hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {f.original_name || 'Dosya'}
                                </a>
                              </li>
                            ))}
                            {!r.files?.length ? <span className="text-xs text-slate-400">—</span> : null}
                          </ul>
                        </td>
                        <td className="max-w-[180px] px-3 py-2">
                          <p className="truncate text-xs text-slate-600" title={r.note?.student_note || ''}>
                            {r.note?.student_note || '—'}
                          </p>
                          <input
                            type="text"
                            defaultValue={r.note?.teacher_note || ''}
                            placeholder="Öğretmen notu"
                            onBlur={(e) => void saveNote(r.id, e.target.value)}
                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-xs">{r.status_label || r.status}</td>
                        <td className="px-3 py-2">
                          {r.status === 'scheduled' ? (
                            <button
                              type="button"
                              disabled={Boolean(activeId) || busyId === r.id}
                              onClick={() => void startSession(r.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {busyId === r.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                              Öğrenciyi Başlat
                            </button>
                          ) : r.status === 'in_progress' ? (
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => void completeSession(r.id)}
                              className="rounded-lg bg-slate-700 px-2 py-1 text-xs font-semibold text-white"
                            >
                              Bitir
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
