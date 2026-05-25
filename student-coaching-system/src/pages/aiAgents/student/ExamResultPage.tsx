import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  XCircle,
  CircleDashed,
  ArrowLeft,
  Clock,
  Loader2,
  BookOpen
} from 'lucide-react';
import { attemptResult } from '../../../lib/aiAgents/aiExamsApi';
import type { AttemptResultResponse } from '../../../types/aiExams.types';

export default function ExamResultPage() {
  const { id: assignmentId } = useParams<{ id: string }>();
  const [data, setData] = useState<AttemptResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assignmentId) return;
    (async () => {
      setLoading(true);
      try {
        setData(await attemptResult(assignmentId));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [assignmentId]);

  const stats = useMemo(() => {
    const a = data?.attempt;
    return {
      score: a?.score ?? 0,
      total: data?.questions.length ?? 0,
      correct: a?.correct_count ?? 0,
      wrong: a?.wrong_count ?? 0,
      empty: a?.empty_count ?? 0,
      duration: a?.duration_seconds ?? 0
    };
  }, [data]);

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin inline" /> Sonuç yükleniyor…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
          Sonuç yüklenemedi: {error}
        </div>
      </div>
    );
  }

  const dur = stats.duration
    ? `${Math.floor(stats.duration / 60)}dk ${stats.duration % 60}sn`
    : '-';

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4">
      <Link to="/exams" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="w-4 h-4" /> Denemelerim
      </Link>

      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl p-6 mb-4">
        <Award className="w-10 h-10 mb-2" />
        <h1 className="text-xl font-bold">{data.paper?.title}</h1>
        <p className="text-sm opacity-90 mt-0.5">Deneme tamamlandı.</p>
        <div className="mt-4 flex items-end gap-3">
          <div>
            <div className="text-xs opacity-80">Puanın</div>
            <div className="text-4xl font-bold">{stats.score}</div>
          </div>
          <div className="text-sm opacity-90 pb-1">/ {data.paper?.total_score ?? 100}</div>
        </div>
        <div className="mt-3 text-xs opacity-90 flex items-center gap-3">
          <span><Clock className="w-3 h-3 inline mr-1" /> {dur}</span>
          <span>{stats.correct} doğru · {stats.wrong} yanlış · {stats.empty} boş</span>
        </div>
      </div>

      {/* Konu dağılımı */}
      {data.attempt.topic_breakdown && Object.keys(data.attempt.topic_breakdown).length > 0 && (
        <div className="bg-white border rounded-xl p-4 mb-4">
          <h3 className="font-semibold mb-3">Konu Analizi</h3>
          <div className="space-y-2">
            {Object.entries(data.attempt.topic_breakdown).map(([topic, s]) => {
              const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
              const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
              return (
                <div key={topic}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{topic}</span>
                    <span>
                      {s.correct}/{s.total} doğru · %{pct}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded overflow-hidden">
                    <div className={`h-2 ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sorular ve çözümleri */}
      <div className="bg-white border rounded-xl p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4" /> Soruların İncelenmesi
        </h3>
        <div className="space-y-3">
          {data.questions.map((q, idx) => {
            const userAns = String(data.attempt.answers[q.id] || '').trim().toUpperCase();
            const correct = String(q.answer_key || '').trim().toUpperCase();
            const isRight = userAns && userAns === correct;
            const isEmpty = !userAns;
            return (
              <details key={q.id} className="border rounded-lg">
                <summary className="cursor-pointer px-3 py-2 flex items-center gap-2 text-sm">
                  {isRight ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : isEmpty ? (
                    <CircleDashed className="w-4 h-4 text-slate-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500" />
                  )}
                  <span className="font-medium">Soru {idx + 1}</span>
                  {q.topic && <span className="text-xs text-slate-500">· {q.topic}</span>}
                  <span className="ml-auto text-xs text-slate-500">
                    Senin: {userAns || '—'} · Doğru: {correct || '?'}
                  </span>
                </summary>
                <div className="px-3 py-2 border-t text-sm">
                  <div className="whitespace-pre-wrap mb-2">{q.question_text}</div>
                  <div className="space-y-1">
                    {q.options.map((opt, i) => {
                      const letter = String.fromCharCode(65 + i);
                      const isUserChoice = userAns === letter;
                      const isCorrectChoice = correct === letter;
                      return (
                        <div
                          key={i}
                          className={`px-2 py-1 rounded text-sm ${
                            isCorrectChoice
                              ? 'bg-emerald-50 border border-emerald-200'
                              : isUserChoice
                              ? 'bg-rose-50 border border-rose-200'
                              : 'bg-slate-50'
                          }`}
                        >
                          <span className="font-mono mr-2">{letter})</span>
                          {opt}
                          {isCorrectChoice && <span className="ml-2 text-xs text-emerald-700">✓ doğru</span>}
                          {isUserChoice && !isCorrectChoice && (
                            <span className="ml-2 text-xs text-rose-700">senin cevabın</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {q.solution && (
                    <div className="mt-2 p-2 rounded bg-blue-50 border border-blue-200 text-xs">
                      <strong>Çözüm:</strong>
                      <div className="whitespace-pre-wrap mt-1">{q.solution}</div>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
