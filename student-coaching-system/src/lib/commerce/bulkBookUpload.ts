/**
 * Toplu kitap ekleme — istemci doğrulama + kaydet/kapak yükleme orkestrasyonu.
 * Kapaklar mevcut /api/commerce-upload (Supabase Storage) üzerinden gider.
 */
import { caSaveBook, caUploadBookCover, type SaveBookInput } from '../commerceAdminApi';
import { compressCoverImage } from './compressCoverImage';

export type BulkBookRowStatus = 'draft' | 'uploading' | 'success' | 'error';

export type BulkBookRow = {
  localId: string;
  /** Sıkıştırılmış JPEG data URL — yükleme için zorunlu */
  coverDataUrl: string | null;
  coverPreview: string | null;
  coverMeta: string | null;
  title: string;
  publisher: string;
  subject: string;
  series: string;
  priceLira: string;
  stock: string;
  isbn: string;
  description: string;
  classLevels: string[];
  selected: boolean;
  status: BulkBookRowStatus;
  error: string | null;
  savedBookId: string | null;
};

export type BulkBookSubmitResult = {
  ok: number;
  failed: number;
  rows: BulkBookRow[];
};

export const BULK_BOOK_SUBJECTS = [
  'Matematik',
  'Türkçe',
  'Fen Bilimleri',
  'Sosyal Bilgiler',
  'İngilizce',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Tarih',
  'Coğrafya',
  'Din Kültürü',
  'İnkılap Tarihi',
  'Diğer',
] as const;

export const BULK_BOOK_SERIES = [
  { value: '', label: 'Kategori seçin' },
  { value: 'egitim-setleri', label: 'Eğitim Setleri' },
  { value: 'soru-bankalari', label: 'Soru Bankaları' },
  { value: 'denemeler', label: 'Denemeler' },
] as const;

export const BULK_BOOK_CLASS_LEVELS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  'LGS',
  '9',
  '10',
  '11',
  '12',
  'YKS',
  'TYT',
  'AYT',
] as const;

function newLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Dosya adından kabaca kitap adı önerisi */
export function titleFromFileName(name: string): string {
  const base = String(name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '';
  return base.replace(/\b\w/g, (c) => c.toLocaleUpperCase('tr-TR'));
}

export function createEmptyBulkRow(partial?: Partial<BulkBookRow>): BulkBookRow {
  return {
    localId: newLocalId(),
    coverDataUrl: null,
    coverPreview: null,
    coverMeta: null,
    title: '',
    publisher: '',
    subject: '',
    series: '',
    priceLira: '',
    stock: '100',
    isbn: '',
    description: '',
    classLevels: ['LGS'],
    selected: true,
    status: 'draft',
    error: null,
    savedBookId: null,
    ...partial,
  };
}

export async function fileToBulkRow(file: File): Promise<BulkBookRow> {
  if (file.size > 25 * 1024 * 1024) {
    throw new Error(`Dosya çok büyük: ${file.name} (max 25 MB)`);
  }
  const compressed = await compressCoverImage(file);
  return createEmptyBulkRow({
    coverDataUrl: compressed.dataUrl,
    coverPreview: compressed.dataUrl,
    coverMeta: `${compressed.width}×${compressed.height}`,
    title: titleFromFileName(file.name),
  });
}

export function validateBulkRow(row: BulkBookRow): string | null {
  if (!row.coverDataUrl && !row.coverPreview) return 'Kapak görseli gerekli';
  if (!String(row.title || '').trim()) return 'Kitap adı gerekli';
  const price = Number(String(row.priceLira).replace(',', '.'));
  if (row.priceLira !== '' && (!Number.isFinite(price) || price < 0)) return 'Fiyat geçersiz';
  if (row.priceLira === '' || !Number.isFinite(price)) return 'Fiyat gerekli';
  const stock = Number(row.stock);
  if (row.stock !== '' && (!Number.isFinite(stock) || stock < 0)) return 'Stok geçersiz';
  return null;
}

export function validateBulkRows(rows: BulkBookRow[]): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const row of rows) {
    const err = validateBulkRow(row);
    if (err) errors[row.localId] = err;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

function toSaveInput(row: BulkBookRow): SaveBookInput {
  const levels = row.classLevels.length ? row.classLevels : ['LGS'];
  return {
    title: row.title.trim(),
    isbn: row.isbn.trim() || null,
    publisher: row.publisher.trim() || null,
    subject: row.subject.trim() || null,
    description: row.description.trim() || null,
    class_levels: levels,
    exam_types: levels.includes('LGS') ? ['LGS'] : [],
    series: row.series || undefined,
    price_lira: row.priceLira === '' ? 0 : Number(String(row.priceLira).replace(',', '.')),
    stock_quantity: row.stock === '' ? 100 : Number(row.stock),
    is_catalog_active: true,
  };
}

export type BulkSubmitProgress = {
  index: number;
  total: number;
  row: BulkBookRow;
  done: number;
};

/**
 * Satır satır: books.save → kapak upload (Supabase).
 * concurrency=1 varsayılan — Vercel gövde limiti / rate için güvenli.
 */
export async function submitBulkBooks(
  rows: BulkBookRow[],
  opts?: {
    concurrency?: number;
    onProgress?: (p: BulkSubmitProgress) => void;
    onRowUpdate?: (row: BulkBookRow) => void;
  }
): Promise<BulkBookSubmitResult> {
  const concurrency = Math.max(1, Math.min(3, opts?.concurrency ?? 1));
  const working = rows.map((r) => ({ ...r }));
  let cursor = 0;
  let done = 0;
  let ok = 0;
  let failed = 0;

  const runOne = async (index: number) => {
    const row = working[index];
    const validation = validateBulkRow(row);
    if (validation) {
      working[index] = { ...row, status: 'error', error: validation };
      opts?.onRowUpdate?.(working[index]);
      failed += 1;
      done += 1;
      opts?.onProgress?.({ index, total: working.length, row: working[index], done });
      return;
    }

    working[index] = { ...row, status: 'uploading', error: null };
    opts?.onRowUpdate?.(working[index]);
    opts?.onProgress?.({ index, total: working.length, row: working[index], done });

    try {
      if (!row.coverDataUrl) throw new Error('Kapak görseli yok');
      const saved = await caSaveBook(toSaveInput(row));
      const bookId = saved.book?.id;
      if (!bookId) throw new Error('Kitap kaydı oluşmadı');
      await caUploadBookCover(bookId, row.coverDataUrl);
      working[index] = {
        ...working[index],
        status: 'success',
        error: null,
        savedBookId: bookId,
      };
      ok += 1;
    } catch (e) {
      working[index] = {
        ...working[index],
        status: 'error',
        error: e instanceof Error ? e.message : 'Yükleme hatası',
      };
      failed += 1;
    }
    done += 1;
    opts?.onRowUpdate?.(working[index]);
    opts?.onProgress?.({ index, total: working.length, row: working[index], done });
  };

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < working.length) {
      const i = cursor;
      cursor += 1;
      await runOne(i);
    }
  });
  await Promise.all(workers);

  return { ok, failed, rows: working };
}
