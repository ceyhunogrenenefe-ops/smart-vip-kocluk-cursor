import type { Book } from '../types';

type BookRowLike = { status?: string | null; end_date?: string | null };

export function bookStatusFromRow(row: BookRowLike): Book['status'] {
  const raw = String(row.status || '')
    .trim()
    .toLowerCase();
  if (raw === 'completed' || raw === 'reading' || raw === 'planned') return raw;
  if (row.end_date && String(row.end_date).trim()) return 'completed';
  return 'reading';
}

/** Tamamlandı işaretinde bitiş tarihi; geri alınca bitiş temizlenir */
export function mergeBookStatusPatch(
  patch: Partial<Book>,
  current?: Pick<Book, 'status' | 'endDate'>
): Partial<Book> {
  if (patch.status === 'completed') {
    const end =
      patch.endDate ||
      current?.endDate ||
      new Date().toISOString().split('T')[0];
    return { ...patch, status: 'completed', endDate: end };
  }
  if (patch.status === 'reading' || patch.status === 'planned') {
    return { ...patch, endDate: patch.endDate ?? undefined };
  }
  return patch;
}

export function bookRowPatchFromBook(patch: Partial<Book>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.book_title = patch.title;
  if (patch.author !== undefined) body.author = patch.author ?? null;
  if (patch.pagesRead !== undefined) body.pages_read = patch.pagesRead;
  if (patch.notes !== undefined) body.notes = patch.notes ?? null;
  if (patch.startDate !== undefined) body.start_date = patch.startDate || null;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.endDate !== undefined) body.end_date = patch.endDate || null;
  return body;
}
