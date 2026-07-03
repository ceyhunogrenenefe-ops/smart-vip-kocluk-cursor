/** EduPanel ödev formu — kurum kitaplarından sayfa aralığı ile ödev */

export type EduHomeworkDraft = {
  title: string;
  book_name: string;
  /** Sayfa aralığı: 45-48, 45–60 vb. */
  question_range: string;
};

export const EMPTY_HOMEWORK_DRAFT: EduHomeworkDraft = {
  title: '',
  book_name: '',
  question_range: ''
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
  return formatEduHomeworkLabel(draft);
}

export function validateHomeworkDraft(draft: EduHomeworkDraft): string | null {
  const book = draft.book_name.trim();
  const pages = draft.question_range.trim();
  const title = draft.title.trim();
  if (!book && !title) return 'Kitap adı veya ödev başlığı girin';
  if (!pages && !title) return 'Sayfa aralığı girin (örn. 45-48)';
  return null;
}
