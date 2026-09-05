import { useEffect, useState } from 'react';
import { Loader2, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

type Props = {
  open: boolean;
  lessonId: string;
  teacherName?: string;
  lessonTitle?: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

export default function TeacherReviewModal({
  open,
  lessonId,
  teacherName,
  lessonTitle,
  onClose,
  onSubmitted
}: Props) {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(5);
      setHover(0);
      setComment('');
    }
  }, [open, lessonId]);

  if (!open) return null;

  const submit = async () => {
    if (rating < 1 || rating > 5) {
      toast.error('Lütfen 1-5 arası puan seçin');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/reviews/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: lessonId,
          rating,
          comment: comment.trim() || null
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.error === 'already_reviewed') {
          toast.message('Bu ders için zaten değerlendirme yaptınız');
          onSubmitted?.();
          onClose();
          return;
        }
        throw new Error(j.hint || j.message || j.error || `HTTP ${res.status}`);
      }
      toast.success('Değerlendirmeniz kaydedildi');
      onSubmitted?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Öğretmeni Değerlendir</h3>
            <p className="text-xs text-slate-500">
              {teacherName || 'Öğretmen'}
              {lessonTitle ? ` · ${lessonTitle}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Puanınız</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = n <= (hover || rating);
                return (
                  <button
                    key={n}
                    type="button"
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setRating(n)}
                    className="rounded-lg p-1 transition hover:scale-110"
                    aria-label={`${n} yıldız`}
                  >
                    <Star className={`h-8 w-8 ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Yorumunuz (isteğe bağlı)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Ders hakkında kısa bir yorum yazabilirsiniz…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800"
            />
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Gönder
          </button>
        </div>
      </div>
    </div>
  );
}
