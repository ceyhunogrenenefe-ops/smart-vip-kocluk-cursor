import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, Loader2, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { attemptStart, attemptSubmit } from '../../../lib/aiAgents/aiExamsApi';
import type { AttemptStartResponse } from '../../../types/aiExams.types';

export default function TakeExamPage() {
  const { id: assignmentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<AttemptStartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!assignmentId) return;
    (async () => {
      setLoading(true);
      try {
        const r = await attemptStart(assignmentId);
        setState(r);
        setAnswers((r.attempt.answers as Record<string, string>) || {});
        const startedMs = new Date(r.attempt.started_at).getTime();
        const deadline = startedMs + r.paper.duration_minutes * 60 * 1000;
        setSecondsLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [assignmentId]);

  const doSubmit = useCallback(async () => {
    if (!assignmentId || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      await attemptSubmit({ assignment_id: assignmentId, answers });
      navigate(`/exams/result/${assignmentId}`);
    } catch (e) {
      alert((e as Error).message);
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [assignmentId, answers, navigate]);

  useEffect(() => {
    if (!state) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          doSubmit();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [state, doSubmit]);

  const questions = state?.questions || [];
  const current = questions[currentIdx];
  const total = questions.length;
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  const setAnswer = (qid: string, letter: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: letter }));
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin inline" /> Deneme yükleniyor…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
          <AlertTriangle className="w-5 h-5 inline mr-1" /> Hata: {error}
        </div>
      </div>
    );
  }
  if (!state || !current) return null;

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4">
      <div className="bg-white border rounded-xl p-3 mb-3 flex items-center justify-between sticky top-2 z-10 shadow-sm">
        <div>
          <h1 className="font-semibold text-sm sm:text-base">{state.paper.title}</h1>
          <div className="text-xs text-slate-500">
            Soru {currentIdx + 1}/{total} · Cevaplanan {answeredCount}/{total}
          </div>
        </div>
        <div className={`text-lg font-mono ${secondsLeft < 300 ? 'text-rose-600' : 'text-slate-700'}`}>
          <Clock className="w-4 h-4 inline mr-1" />
          {mm}:{ss}
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-3">
        <div className="text-xs text-slate-500 mb-2">
          {current.topic && <span className="mr-2">📚 {current.topic}</span>}
          {current.difficulty && <span>· {current.difficulty}</span>}
        </div>
        <div className="text-base whitespace-pre-wrap mb-4 leading-relaxed">{current.question_text}</div>
        <div className="space-y-2">
          {current.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const checked = answers[current.id] === letter;
            return (
              <button
                key={i}
                onClick={() => setAnswer(current.id, letter)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition ${
                  checked
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                <span className="font-mono font-semibold mr-2">{letter})</span>
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigasyon */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={currentIdx === 0}
          className="px-3 py-2 border rounded-lg disabled:opacity-40 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> Önceki
        </button>
        {currentIdx < total - 1 ? (
          <button
            onClick={() => setCurrentIdx((i) => Math.min(total - 1, i + 1))}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg inline-flex items-center gap-1"
          >
            Sonraki <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => {
              if (confirm(`Toplam ${answeredCount}/${total} soru cevaplandı. Denemeyi bitirip puanını görmek istiyor musun?`)) {
                doSubmit();
              }
            }}
            disabled={submitting}
            className="px-3 py-2 bg-emerald-600 text-white rounded-lg inline-flex items-center gap-1 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" /> {submitting ? 'Gönderiliyor…' : 'Denemeyi bitir'}
          </button>
        )}
      </div>

      {/* Mini soru navigasyon ızgarası */}
      <div className="bg-white border rounded-xl p-3">
        <div className="text-xs text-slate-500 mb-2">Sorular</div>
        <div className="grid grid-cols-10 sm:grid-cols-15 gap-1">
          {questions.map((q, i) => {
            const has = !!answers[q.id];
            return (
              <button
                key={q.id}
                onClick={() => setCurrentIdx(i)}
                className={`aspect-square rounded text-xs font-mono ${
                  i === currentIdx
                    ? 'bg-blue-600 text-white'
                    : has
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
