import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Clock, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { getClassHomeworkOverview, type ClassHomeworkRow } from './homeworkApi';

function fmtDate(v?: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('tr-TR');
  } catch {
    return String(v);
  }
}

/** Ödev kontrol ekranı: hangi ödevi kim yaptı, kaç soru çözdü, ne kadar sürdü. */
export default function HomeworkCheckModal({
  open,
  classId,
  className,
  onClose
}: {
  open: boolean;
  classId: string;
  className?: string | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ClassHomeworkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState('');

  useEffect(() => {
    if (!open || !classId) return;
    let cancelled = false;
    setLoading(true);
    void getClassHomeworkOverview(classId)
      .then((r) => {
        if (cancelled) return;
        setRows(r.data.homework || []);
        setOpenId(r.data.homework?.[0]?.id || '');
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Ödevler alınamadı');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, classId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">Ödev kontrol</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{className || 'Sınıf'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          </div>
        ) : !rows.length ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            Bu sınıfa henüz ödev verilmemiş.
          </p>
        ) : (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {rows.map((hw) => {
              const expanded = openId === hw.id;
              const pct = hw.total_count ? Math.round((hw.done_count / hw.total_count) * 100) : 0;
              return (
                <div key={hw.id} className="rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setOpenId(expanded ? '' : hw.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{hw.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Teslim: {fmtDate(hw.due_date)}
                        {hw.target_question_count ? ` · ${hw.target_question_count} soru` : ''}
                        {hw.target_minutes ? ` · ${hw.target_minutes} dk` : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        pct === 100
                          ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                          : pct === 0
                            ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                      }`}
                    >
                      {hw.done_count}/{hw.total_count}
                    </span>
                  </button>

                  {expanded ? (
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {hw.roster.map((st) => (
                        <li key={st.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="flex min-w-0 items-center gap-2">
                            {st.done ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            ) : (
                              <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                            )}
                            <span
                              className={`truncate text-sm ${st.done ? 'text-slate-900' : 'text-slate-500'}`}
                            >
                              {st.name}
                            </span>
                          </span>
                          {st.done ? (
                            <span className="shrink-0 text-[11px] text-slate-500">
                              {st.solved_question_count != null ? `${st.solved_question_count} soru` : ''}
                              {st.solved_question_count != null && st.spent_minutes != null ? ' · ' : ''}
                              {st.spent_minutes != null ? (
                                <span className="inline-flex items-center gap-0.5">
                                  <Clock className="h-3 w-3" />
                                  {st.spent_minutes} dk
                                </span>
                              ) : null}
                              {st.solved_question_count == null && st.spent_minutes == null
                                ? fmtDate(st.submitted_at)
                                : ''}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[11px] text-rose-600">yapmadı</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
