import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Loader2, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';
import { AppModal, AppModalBody, AppModalFooter, AppModalHeader } from '../ui/AppModal';

type Props = {
  open: boolean;
  /** Özel ders (teacher_lessons) id — classSessionId yoksa zorunlu */
  lessonId?: string;
  /** Grup canlı ders (class_sessions) id */
  classSessionId?: string;
  teacherName?: string;
  lessonTitle?: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

export default function TeacherReviewModal({
  open,
  lessonId = '',
  classSessionId = '',
  teacherName,
  lessonTitle,
  onClose,
  onSubmitted
}: Props) {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentId = useId();
  const targetKey = classSessionId || lessonId;

  useEffect(() => {
    if (!open) return;
    setRating(5);
    setHover(0);
    setComment('');
    const t = window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, targetKey]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (rating < 1 || rating > 5) {
      toast.error('Lütfen 1-5 arası puan seçin');
      return;
    }
    const sid = String(classSessionId || '').trim();
    const lid = String(lessonId || '').trim();
    if (!sid && !lid) {
      toast.error('Ders bilgisi eksik');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        rating,
        comment: comment.trim() || null
      };
      if (sid) body.class_session_id = sid;
      else body.lesson_id = lid;

      const res = await apiFetch('/api/reviews/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
      toast.success('Değerlendirmeniz alındı. Admin onayından sonra sitede yayınlanır.');
      onSubmitted?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal open={open} onClose={onClose} align="center" panelClassName="max-w-md">
      <AppModalHeader className="items-start gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900 dark:text-white">Öğretmeni Değerlendir</h3>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">
            {teacherName || 'Öğretmen'}
            {lessonTitle ? ` · ${lessonTitle}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          aria-label="Yorumu kapat"
        >
          <X className="h-4 w-4" />
          Kapat
        </button>
      </AppModalHeader>

      <form
        onSubmit={(ev) => {
          void submit(ev);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <AppModalBody className="space-y-4 p-4 sm:p-5">
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
            <label htmlFor={commentId} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Yorumunuz (isteğe bağlı)
            </label>
            <textarea
              ref={textareaRef}
              id={commentId}
              name="teacher_review_comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              rows={4}
              maxLength={2000}
              autoComplete="off"
              placeholder="Ders hakkında kısa bir yorum yazabilirsiniz…"
              className="relative z-10 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </AppModalBody>

        <AppModalFooter className="gap-2 p-4 sm:p-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            Yorumu kapat
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Gönder
          </button>
        </AppModalFooter>
      </form>
    </AppModal>
  );
}
