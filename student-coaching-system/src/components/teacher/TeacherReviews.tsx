import { useCallback, useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { apiFetch } from '../../lib/session';

export type TeacherReviewItem = {
  id: string;
  teacher_id: string;
  reviewer_type: 'STUDENT' | 'PARENT' | string;
  reviewer_name: string;
  rating: number;
  comment?: string | null;
  created_at: string;
};

type Props = {
  teacherId?: string | null;
  slug?: string | null;
  title?: string;
  className?: string;
  refreshKey?: number | string;
};

function formatDate(iso?: string) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Istanbul'
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${v} yıldız`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= Math.round(v) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
        />
      ))}
    </span>
  );
}

export default function TeacherReviews({
  teacherId,
  slug,
  title = 'Öğrenci ve Veli Yorumları',
  className = '',
  refreshKey
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [average, setAverage] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [reviews, setReviews] = useState<TeacherReviewItem[]>([]);

  const load = useCallback(async () => {
    const tid = String(teacherId || '').trim();
    const s = String(slug || '').trim();
    if (!tid && !s) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = tid
        ? `/api/teachers/reviews?teacher_id=${encodeURIComponent(tid)}`
        : `/api/teachers/reviews?slug=${encodeURIComponent(s)}`;
      const res = await apiFetch(q);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
      setAverage(j.average_rating != null ? Number(j.average_rating) : null);
      setTotal(Number(j.total_reviews) || 0);
      setReviews(Array.isArray(j.reviews) ? j.reviews : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yorumlar yüklenemedi');
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId, slug]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
        {!loading && !error && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            {average != null && total > 0 ? (
              <>
                <span className="text-xl font-bold text-slate-900 dark:text-white">{average.toFixed(1)}</span>
                <Stars value={average} />
                <span className="text-slate-500">· {total} değerlendirme</span>
              </>
            ) : (
              <span className="text-slate-500">Henüz herkese açık değerlendirme yok</span>
            )}
          </p>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && reviews.length > 0 && (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/60"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-900 dark:text-white">{r.reviewer_name}</span>
                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  {r.reviewer_type === 'PARENT' ? 'Veli' : 'Öğrenci'}
                </span>
                <Stars value={r.rating} />
                <span className="ml-auto text-[11px] text-slate-400">{formatDate(r.created_at)}</span>
              </div>
              {r.comment ? (
                <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{r.comment}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
