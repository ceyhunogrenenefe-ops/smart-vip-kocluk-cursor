import React, { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ETUT_RATING_LABELS, type PendingEtutSession, clearPendingEtutSession } from '../../lib/etutSession';
import {
  etutLineKey,
  listEtutReportSubjects,
  solvedFromLine,
  type EtutReportLine,
} from '../../lib/etutTopicPool';
import { submitEtutSessionReport, mapWeeklyEntryApiRow, type WeeklyEntryApiRow } from '../../lib/weeklyPlannerApi';
import { cn } from '../../lib/utils';

type Props = {
  session: PendingEtutSession;
  onClose: () => void;
  onSaved: () => void;
};

function clampNonNeg(n: number) {
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function emptyLine(subject: string, topic: string): EtutReportLine {
  return { key: etutLineKey(subject, topic), subject, topic, correct: '', wrong: '', blank: '' };
}

export function EtutSessionReportModal({ session, onClose, onSaved }: Props) {
  const { mergeWeeklyEntries, students, getTopics, getTopicsByClass } = useApp();
  const studentRow = students.find((s) => s.id === session.studentId);
  const classLevel = studentRow?.classLevel;

  const poolSubjects = useMemo(() => {
    if (classLevel === undefined || classLevel === null) return [] as string[];
    return listEtutReportSubjects(classLevel, getTopicsByClass(classLevel));
  }, [classLevel, getTopicsByClass]);

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(() => new Set());
  const [lines, setLines] = useState<EtutReportLine[]>([]);
  const seededFromSession = React.useRef(false);

  React.useEffect(() => {
    if (seededFromSession.current || poolSubjects.length === 0) return;
    const sub = String(session.subject || '').trim();
    const top = String(session.topic || '').trim();
    if (sub && top && !sub.toLowerCase().includes('etüt') && poolSubjects.includes(sub)) {
      seededFromSession.current = true;
      setSelectedSubjects([sub]);
      setSelectedTopics(new Set([etutLineKey(sub, top)]));
      setLines([emptyLine(sub, top)]);
    }
  }, [poolSubjects, session.subject, session.topic]);

  const [rating, setRating] = useState<number | null>(3);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const topicsBySubject = useMemo(() => {
    const out: Record<string, string[]> = {};
    if (classLevel === undefined || classLevel === null) return out;
    for (const sub of selectedSubjects) {
      out[sub] = getTopics(sub, classLevel);
    }
    return out;
  }, [selectedSubjects, classLevel, getTopics]);

  const toggleSubject = (sub: string) => {
    setSelectedSubjects((prev) => {
      const on = prev.includes(sub);
      if (on) {
        const next = prev.filter((s) => s !== sub);
        setSelectedTopics((tprev) => {
          const n = new Set(tprev);
          for (const k of n) if (k.startsWith(`${sub}::`)) n.delete(k);
          return n;
        });
        setLines((lprev) => lprev.filter((l) => l.subject !== sub));
        return next;
      }
      return [...prev, sub];
    });
  };

  const toggleTopic = (subject: string, topic: string) => {
    const key = etutLineKey(subject, topic);
    setSelectedTopics((prev) => {
      const n = new Set(prev);
      if (n.has(key)) {
        n.delete(key);
        setLines((lprev) => lprev.filter((l) => l.key !== key));
      } else {
        n.add(key);
        setLines((lprev) => (lprev.some((l) => l.key === key) ? lprev : [...lprev, emptyLine(subject, topic)]));
      }
      return n;
    });
  };

  const updateLine = (key: string, patch: Partial<EtutReportLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addManualLine = () => {
    const sub = selectedSubjects[0] || poolSubjects[0];
    if (!sub) return;
    const topics = topicsBySubject[sub] || getTopics(sub, classLevel);
    const topic = topics[0] || 'Genel tekrar';
    const key = etutLineKey(sub, topic);
    if (lines.some((l) => l.key === key)) return;
    setSelectedSubjects((p) => (p.includes(sub) ? p : [...p, sub]));
    setSelectedTopics((p) => new Set(p).add(key));
    setLines((p) => [...p, emptyLine(sub, topic)]);
  };

  const ratingLabel = rating != null ? ETUT_RATING_LABELS[rating] : '';
  const summaryPrefix = useMemo(() => {
    const bits: string[] = [];
    if (ratingLabel) bits.push(`Etüt: ${ratingLabel}`);
    if (notes.trim()) bits.push(notes.trim());
    return bits.join(' · ');
  }, [ratingLabel, notes]);

  const submit = async () => {
    setError('');
    if (!lines.length) {
      setError('En az bir ders ve konu seç.');
      return;
    }

    for (const line of lines) {
      const c = line.correct === '' ? 0 : clampNonNeg(Number(line.correct));
      const w = line.wrong === '' ? 0 : clampNonNeg(Number(line.wrong));
      const b = line.blank === '' ? 0 : clampNonNeg(Number(line.blank));
      const solved = c + w + b;
      if (solved === 0) {
        setError(`${line.subject} / ${line.topic}: soru sayısı gir (doğru, yanlış veya boş).`);
        return;
      }
      if (c + w + b !== solved) {
        setError(`${line.subject} / ${line.topic}: doğru + yanlış + boş tutarsız.`);
        return;
      }
    }

    setSaving(true);
    try {
      const linePayloads = lines.map((line, i) => {
        const correctN = line.correct === '' ? 0 : clampNonNeg(Number(line.correct));
        const wrongN = line.wrong === '' ? 0 : clampNonNeg(Number(line.wrong));
        const blankN = line.blank === '' ? 0 : clampNonNeg(Number(line.blank));
        const coachComment = i === 0 ? summaryPrefix || null : summaryPrefix ? `[Etüt] ${summaryPrefix}` : null;
        return {
          subject: line.subject,
          topic: line.topic,
          correct: correctN,
          wrong: wrongN,
          blank: blankN,
          notes: coachComment,
        };
      });

      const result = await submitEtutSessionReport({
        planner_entry_id: session.plannerEntryId,
        planner_date: session.plannerDate || session.date,
        start_time: session.startTime,
        end_time: session.endTime,
        notes: summaryPrefix || null,
        lines: linePayloads,
      });

      const mapped = (result.weekly_entries || []).map((row) =>
        mapWeeklyEntryApiRow(row as WeeklyEntryApiRow)
      );
      if (mapped.length) mergeWeeklyEntries(mapped);

      window.dispatchEvent(
        new CustomEvent('coaching:etut-report-saved', {
          detail: { studentId: session.studentId, date: session.plannerDate || session.date, entries: mapped },
        })
      );

      clearPendingEtutSession();
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-emerald-200/80 bg-white shadow-2xl sm:rounded-2xl dark:border-emerald-900/50 dark:bg-slate-900"
        role="dialog"
        aria-labelledby="etut-report-title"
      >
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 dark:border-emerald-900/40 dark:from-emerald-950/40 dark:to-teal-950/30">
          <p id="etut-report-title" className="flex items-center gap-2 text-lg font-semibold text-emerald-950 dark:text-emerald-100">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            Etüt raporu
          </p>
          <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-200/80">
            Konu havuzundan ders ve konu seç; her biri için ayrı soru girişi yap.
          </p>
        </div>

        <div className="space-y-4 p-5">
          {poolSubjects.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Sınıf bilgisi veya konu havuzu bulunamadı. Yöneticinize başvurun.
            </p>
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">Hangi dersleri çalıştın?</p>
                <div className="flex flex-wrap gap-2">
                  {poolSubjects.map((sub) => {
                    const on = selectedSubjects.includes(sub);
                    return (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => toggleSubject(sub)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                          on
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-600 dark:bg-slate-950'
                        )}
                      >
                        {sub}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedSubjects.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Hangi konuları çalıştın?</p>
                  {selectedSubjects.map((sub) => {
                    const topics = topicsBySubject[sub] || [];
                    if (!topics.length) {
                      return (
                        <p key={sub} className="text-xs text-slate-500">
                          {sub}: konu havuzunda kayıt yok.
                        </p>
                      );
                    }
                    return (
                      <div key={sub} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <p className="mb-2 text-xs font-bold text-indigo-800 dark:text-indigo-200">{sub}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {topics.map((topic) => {
                            const key = etutLineKey(sub, topic);
                            const on = selectedTopics.has(key);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => toggleTopic(sub, topic)}
                                className={cn(
                                  'rounded-lg border px-2 py-1 text-[11px] font-medium transition',
                                  on
                                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40'
                                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-950'
                                )}
                              >
                                {topic}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {lines.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Soru girişleri</p>
                    <button
                      type="button"
                      onClick={addManualLine}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline"
                    >
                      <Plus className="h-3 w-3" />
                      Satır ekle
                    </button>
                  </div>
                  {lines.map((line) => {
                    const solved = solvedFromLine(line);
                    return (
                      <div
                        key={line.key}
                        className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/40"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-indigo-800 dark:text-indigo-200">{line.subject}</p>
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{line.topic}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTopics((p) => {
                                const n = new Set(p);
                                n.delete(line.key);
                                return n;
                              });
                              setLines((p) => p.filter((l) => l.key !== line.key));
                            }}
                            className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Kaldır"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {(
                            [
                              ['correct', 'Doğru', line.correct],
                              ['wrong', 'Yanlış', line.wrong],
                              ['blank', 'Boş', line.blank],
                            ] as const
                          ).map(([field, label, val]) => (
                            <div key={field}>
                              <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">{label}</label>
                              <input
                                type="number"
                                min={0}
                                value={val}
                                onChange={(e) =>
                                  updateLine(line.key, {
                                    [field]: e.target.value === '' ? '' : Number(e.target.value),
                                  } as Partial<EtutReportLine>)
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                              />
                            </div>
                          ))}
                          <div>
                            <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Toplam</label>
                            <div className="flex h-[34px] items-center rounded-lg bg-white px-2 text-sm font-bold tabular-nums text-emerald-700 dark:bg-slate-900">
                              {solved}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">Etüt nasıl geçti?</p>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    rating === n
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-md'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 dark:border-slate-600 dark:bg-slate-950'
                  )}
                >
                  {n} · {ETUT_RATING_LABELS[n]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Kısa not (isteğe bağlı)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              placeholder="Örn. Problemlerde zorlandım."
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                clearPendingEtutSession();
                onClose();
              }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Şimdilik atla
            </button>
            <button
              type="button"
              disabled={saving || poolSubjects.length === 0}
              onClick={() => void submit()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
