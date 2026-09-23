import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, CalendarDays, Clock, ListChecks, Loader2, Link2 } from 'lucide-react';
import { getPublicHomework, type PublicHomework } from '../features/homework/homeworkApi';

/**
 * /odev/:token — gruba atılan bağlantıdan gelen ekran.
 * Ödevin ne olduğunu gösterir; teslim için öğrencinin panele girmesi gerekir.
 */
export default function HomeworkSharePage() {
  const { token } = useParams<{ token: string }>();
  const [hw, setHw] = useState<PublicHomework | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getPublicHomework(String(token || ''))
      .then((r) => {
        if (!cancelled) setHw(r.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ödev bulunamadı');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-sky-50 px-4 py-10">
      <div className="mx-auto max-w-lg">
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
            <p className="font-semibold text-rose-700">{error}</p>
            <p className="mt-2 text-sm text-slate-600">
              Bağlantının süresi dolmuş veya ödev yayından kaldırılmış olabilir. Öğretmeninizden
              yeni bağlantı isteyin.
            </p>
          </div>
        ) : hw ? (
          <article className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
            {hw.institution_name ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                {hw.institution_name}
              </p>
            ) : null}
            <h1 className="mt-1 font-serif text-2xl font-semibold text-slate-900">{hw.title}</h1>
            {hw.subject_name || hw.topic_label ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-600">
                <BookOpen className="h-4 w-4 text-amber-600" />
                {[hw.subject_name, hw.topic_label].filter(Boolean).join(' · ')}
              </p>
            ) : null}

            {hw.description ? (
              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{hw.description}</p>
            ) : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {hw.target_question_count ? (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                  <ListChecks className="mb-1 h-4 w-4" />
                  {hw.target_question_count} soru
                </div>
              ) : null}
              {hw.target_minutes ? (
                <div className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">
                  <Clock className="mb-1 h-4 w-4" />
                  {hw.target_minutes} dakika
                </div>
              ) : null}
              {hw.due_date ? (
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
                  <CalendarDays className="mb-1 h-4 w-4" />
                  {new Date(hw.due_date).toLocaleDateString('tr-TR')}
                </div>
              ) : null}
            </div>

            {hw.resource_url ? (
              <a
                href={hw.resource_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:underline"
              >
                <Link2 className="h-4 w-4" />
                Kaynağı aç
              </a>
            ) : null}

            <Link
              to="/login"
              className="mt-6 block rounded-xl bg-amber-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-amber-700"
            >
              Panele gir ve tamamladım olarak işaretle
            </Link>
            <p className="mt-2 text-center text-xs text-slate-500">
              Ödevi teslim etmek için kendi hesabınızla giriş yapmanız gerekir.
            </p>
          </article>
        ) : null}
      </div>
    </div>
  );
}
