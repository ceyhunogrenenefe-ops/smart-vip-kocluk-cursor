import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, GraduationCap, Loader2, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

type PendingReview = {
  id: string;
  teacher_id: string;
  teacher_name?: string | null;
  lesson?: {
    subject?: string | null;
    lesson_date?: string | null;
    lesson_time?: string | null;
    class_name?: string | null;
  } | null;
  reviewer_type: string;
  reviewer_name: string;
  rating: number;
  comment?: string | null;
  created_at: string;
};

function formatLessonDate(ymd?: string | null) {
  if (!ymd) return '';
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00+03:00`);
  if (Number.isNaN(d.getTime())) return String(ymd);
  return d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long' });
}

export default function AdminTeacherReviewsPanel() {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [teacherFilter, setTeacherFilter] = useState('');

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

  /** Öğretmen seçenekleri: bekleyen yorum sayısıyla */
  const teachers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const r of reviews) {
      const id = String(r.teacher_id);
      const cur = map.get(id) || { id, name: r.teacher_name || 'Öğretmen bilinmiyor', count: 0 };
      cur.count += 1;
      map.set(id, cur);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [reviews]);

  const visible = teacherFilter ? reviews.filter((r) => String(r.teacher_id) === teacherFilter) : reviews;

  useEffect(() => {
    if (teacherFilter && !teachers.some((t) => t.id === teacherFilter)) setTeacherFilter('');
  }, [teachers, teacherFilter]);

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
            Öğrencilerin “Öğretmeni değerlendir” ile yaptığı yorumlar. Onaylanınca öğretmenin profilinde yayınlanır.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {teachers.length > 1 ? (
            <select
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
              aria-label="Öğretmene göre filtrele"
            >
              <option value="">Tüm öğretmenler ({reviews.length})</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.count})
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
          >
            Yenile
          </button>
        </div>
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">Bekleyen yorum yok.</p>
      )}

      {!loading && visible.length > 0 && (
        <ul className="mt-4 space-y-3">
          {visible.map((r) => {
            const lessonParts = [
              r.lesson?.class_name,
              r.lesson?.subject,
              [formatLessonDate(r.lesson?.lesson_date), r.lesson?.lesson_time].filter(Boolean).join(' ')
            ].filter(Boolean);
            return (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-100 pb-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-900">
                    <GraduationCap className="h-4 w-4 text-indigo-600" />
                    {r.teacher_name || 'Öğretmen bilinmiyor'}
                  </span>
                  {lessonParts.length ? (
                    <span className="text-xs text-slate-500">· {lessonParts.join(' · ')}</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-slate-900">{r.reviewer_name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                    {r.reviewer_type === 'PARENT' ? 'Veli' : 'Öğrenci'}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${r.rating} yıldız`}>
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
