import React from 'react';
import { BookOpen, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Canlı ders sonrası öğretmen için ödev yönlendirme popup’ı */
export default function EduPostLessonHomeworkModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-r from-amber-50 to-violet-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Dersiniz sona erdi</h3>
              <p className="mt-1 text-sm text-slate-600">
                Öğrencileriniz için hemen ödev oluşturabilirsiniz.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Daha Sonra
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/edu-panel?create_homework=1');
            }}
            className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Ödev Ver
          </button>
        </div>
      </div>
    </div>
  );
}

export const POST_LESSON_HW_FLAG = 'edu_post_lesson_homework_prompt';

export function markPostLessonHomeworkPrompt(): void {
  try {
    sessionStorage.setItem(POST_LESSON_HW_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function consumePostLessonHomeworkPrompt(): boolean {
  try {
    if (sessionStorage.getItem(POST_LESSON_HW_FLAG) === '1') {
      sessionStorage.removeItem(POST_LESSON_HW_FLAG);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
