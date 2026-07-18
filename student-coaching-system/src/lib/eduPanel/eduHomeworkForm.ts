/** EduPanel ödev formu — kurum kitaplarından sayfa aralığı ile ödev */

export type EduHomeworkDraft = {
  title: string;
  book_name: string;
  /** Sayfa aralığı: 45-48, 45–60 vb. */
  question_range: string;
  due_date?: string;
  description?: string;
  assignee_mode: 'class' | 'students';
  assignee_student_ids: string[];
  /** Çoklu animasyon seçimi */
  pool_animations: { id: string; title: string }[];
  /** @deprecated tekil alan — geriye uyum */
  pool_animation_id?: string;
  pool_animation_title?: string;
  /** Öğretmen PDF eki (yayınlama anında yüklenir) */
  pdf_file?: File | null;
};

export const EMPTY_HOMEWORK_DRAFT: EduHomeworkDraft = {
  title: '',
  book_name: '',
  question_range: '',
  due_date: '',
  description: '',
  assignee_mode: 'class',
  assignee_student_ids: [],
  pool_animations: [],
  pool_animation_id: undefined,
  pool_animation_title: undefined,
  pdf_file: null
};

export function formatEduHomeworkLabel(hw: {
  title?: string | null;
  book_name?: string | null;
  question_range?: string | null;
}): string {
  const book = String(hw.book_name || '').trim();
  const pages = String(hw.question_range || '').trim();
  const title = String(hw.title || '').trim();
  if (book && pages) return `${book} — s. ${pages}`;
  if (book) return book;
  if (pages) return `Sayfa ${pages}`;
  return title || 'Ödev';
}

export function homeworkTitleForApi(draft: EduHomeworkDraft): string {
  const title = draft.title.trim();
  if (title) return title;
  const pdfName = draft.pdf_file?.name?.trim();
  if (pdfName) return pdfName.replace(/\.pdf$/i, '') || 'PDF Ödev';
  return formatEduHomeworkLabel(draft) || 'Ödev';
}

export function validateHomeworkDraft(draft: EduHomeworkDraft): string | null {
  const book = draft.book_name.trim();
  const pages = draft.question_range.trim();
  const title = draft.title.trim();
  const hasPdf = Boolean(draft.pdf_file);
  if (!book && !title && !hasPdf) return 'Kitap adı, kısa not veya PDF ekleyin';
  if (!pages && !title && !hasPdf) return 'Sayfa aralığı, kısa not veya PDF ekleyin';
  if (draft.assignee_mode === 'students' && !draft.assignee_student_ids.length) {
    return 'En az bir öğrenci seçin';
  }
  return null;
}

export function draftPoolAnimationIds(draft: EduHomeworkDraft): string[] {
  const fromList = (draft.pool_animations || []).map((a) => a.id).filter(Boolean);
  if (fromList.length) return [...new Set(fromList)];
  const one = String(draft.pool_animation_id || '').trim();
  return one ? [one] : [];
}
