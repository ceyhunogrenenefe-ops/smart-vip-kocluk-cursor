import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { resolveApiUrl } from '../lib/session';

type Karne = {
  student_name: string;
  exam_title: string;
  exam_date: string;
  result: {
    exam_name: string | null;
    date: string;
    net_score: number | null;
    raw_score: number | null;
    correct: number | null;
    wrong: number | null;
    blank: number | null;
  } | null;
};

export default function DenemeKarnePublicPage() {
  const { token } = useParams();
  const [data, setData] = useState<Karne | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let gone = false;
    void fetch(resolveApiUrl(`/api/deneme-exam-karne?token=${encodeURIComponent(token)}`))
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Karne bulunamadı');
        if (!gone) setData(j);
      })
      .catch((e) => {
        if (!gone) setError(e instanceof Error ? e.message : 'Karne bulunamadı');
      });
    return () => {
      gone = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <article className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Deneme Kulübü</p>
        <h1 className="mt-1 text-xl font-semibold">Sonuç karnesi</h1>
        {!data && !error && (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Karne açılıyor
          </p>
        )}
        {error && <p className="mt-6 text-sm text-rose-700">Bu bağlantıya ait karne bulunamadı.</p>}
        {data && (
          <div className="mt-4 space-y-3">
            <p className="text-lg font-medium">{data.student_name}</p>
            <p className="text-sm text-slate-600">
              {data.exam_title}
              {data.exam_date ? ` · ${data.exam_date}` : ''}
            </p>
            {data.result ? (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Net</dt>
                  <dd className="text-lg font-semibold">{data.result.net_score ?? '—'}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Ham puan</dt>
                  <dd className="text-lg font-semibold">{data.result.raw_score ?? '—'}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Doğru</dt>
                  <dd className="font-semibold">{data.result.correct ?? '—'}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Yanlış</dt>
                  <dd className="font-semibold">{data.result.wrong ?? '—'}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Boş</dt>
                  <dd className="font-semibold">{data.result.blank ?? '—'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-600">Sonuç satırı henüz yayımlanmadı. Bağlantı yalnız bu öğrenciye aittir.</p>
            )}
          </div>
        )}
      </article>
    </main>
  );
}
