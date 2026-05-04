import { errorMessage } from './error-msg.js';

/**
 * Gerçekten `teacher_lessons` ilişkisi / PostgREST şema önbelleği eksik mi?
 * FK ihlali (23503) mesajlarında tablo adı geçtiği için geniş `teacher_lessons` eşleşmesi kullanılmaz —
 * aksi halde tablo varken yanlışlıkla "tablo oluşturun" döner.
 */
export function isTeacherLessonsRelationMissingError(err) {
  if (!err) return false;
  const msg = String(errorMessage(err) || '');
  const code = err && typeof err === 'object' && err.code != null ? String(err.code) : '';

  if (code === '23503' || code === '23505' || code === '23502') return false;

  if (code === 'PGRST205') return true;

  if (code === '42P01' && /teacher_lessons/i.test(msg)) return true;

  if (/relation\s+[`"']public\.teacher_lessons[`"']\s+does\s+not\s+exist/i.test(msg)) return true;
  if (/relation\s+[`"']teacher_lessons[`"']\s+does\s+not\s+exist/i.test(msg)) return true;

  if (/could\s+not\s+find\s+the\s+table[^'\n]*teacher_lessons/i.test(msg)) return true;

  if (/schema\s+cache/i.test(msg) && /teacher_lessons/i.test(msg) && /not\s+find|could\s+not\s+find/i.test(msg)) {
    return true;
  }

  return false;
}
