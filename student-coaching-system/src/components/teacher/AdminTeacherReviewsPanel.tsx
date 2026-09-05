import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

type PendingReview = {
  id: string;
  teacher_id: string;
  reviewer_type: string;
  reviewer_name: string;
  rating: number;
  comment?: string | null;
  created_at: string;
};

export default function AdminTeacherReviewsPanel() {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [reviews, setReviews] = useState<PendingReview[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/reviews/admin');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.hint || j.message || j.error || `HTTP ${res.status}`);
      setReviews(Array.isArray(j.reviews) ? j.reviews : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yorumlar yüklenemedi');
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, op: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      const res = await apiFetch('/api/reviews/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, review_id: id })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.hint || j.message || j.error || `HTTP ${res.status}`);
      toast.success(op === 'approve' ? 'Yorum yayınlandı' : 'Yorum reddedildi');
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Öğretmen yorum onayları</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Onaylanınca öğrenci/veli adıyla sitede yayınlanır.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
        >
          Yenile
        </button>
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">Bekleyen yorum yok.</p>
      )}

      {!loading && reviews.length > 0 && (
        <ul className="mt-4 space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-slate-900">{r.reviewer_name}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                  {r.reviewer_type === 'PARENT' ? 'Veli' : 'Öğrenci'}
                </span>
                <span className="inline-flex items-center gap-0.5 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${i < Number(r.rating) ? 'fill-current' : 'text-slate-300'}`}
                    />
                  ))}
                </span>
              </div>
              {r.comment ? (
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{r.comment}</p>
              ) : (
                <p className="mt-2 text-xs italic text-slate-500">Yalnızca puan</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => void act(r.id, 'approve')}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Onayla ve yayınla
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => void act(r.id, 'reject')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" /> Reddet
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
