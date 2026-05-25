import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Loader2, Clock, CheckCircle2, PlayCircle, ArrowRight } from 'lucide-react';
import { myAssignments } from '../../../lib/aiAgents/aiExamsApi';
import type { ExamAssignmentMine } from '../../../types/aiExams.types';

export default function MyExamsPage() {
  const [rows, setRows] = useState<ExamAssignmentMine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setRows(await myAssignments());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pending = rows.filter((r) => r.attempt?.status !== 'graded');
  const done = rows.filter((r) => r.attempt?.status === 'graded');

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-blue-600" /> Denemelerim
        </h1>
        <p className="text-sm text-slate-500">Sana atanan AI denemelerini çözebilir, sonuçlarını görebilirsin.</p>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-10">
          <Loader2 className="w-5 h-5 animate-spin inline" /> Yükleniyor…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">
          Henüz sana atanmış bir deneme yok.
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <Section title="Bekleyen denemeler" items={pending} />
          )}
          {done.length > 0 && <Section title="Tamamlanan denemeler" items={done} />}
        </div>
      )}
    </div>
  );
}

function Section(props: { title: string; items: ExamAssignmentMine[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-600 mb-2">{props.title}</h2>
      <div className="space-y-2">
        {props.items.map((r) => (
          <ExamCard key={r.id} a={r} />
        ))}
      </div>
    </div>
  );
}

function ExamCard(props: { a: ExamAssignmentMine }) {
  const a = props.a;
  const done = a.attempt?.status === 'graded';
  const inProgress = a.attempt?.status === 'in_progress';
  const score = a.attempt?.score;

  return (
    <Link
      to={done ? `/exams/result/${a.id}` : `/exams/take/${a.id}`}
      className="block bg-white border rounded-xl p-4 hover:shadow-md hover:border-blue-300 transition"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold flex items-center gap-2">
            {a.paper?.title || 'Deneme'}
            {done && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            {inProgress && <PlayCircle className="w-4 h-4 text-amber-500" />}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
            <span>{a.agent?.name} · {a.agent?.subject}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" /> {a.paper?.duration_minutes} dk
            </span>
            <span>{a.paper?.question_count} soru</span>
            {done && <span className="text-emerald-700 font-medium">Puan: {score}</span>}
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-slate-300 shrink-0" />
      </div>
    </Link>
  );
}
