import { describe, expect, it } from 'vitest';
import {
  createEmptyBulkRow,
  titleFromFileName,
  validateBulkRow,
  validateBulkRows,
} from './bulkBookUpload.ts';

describe('bulkBookUpload helpers', () => {
  it('titleFromFileName cleans extension and separators', () => {
    expect(titleFromFileName('matematik_soru-bankasi.jpg')).toMatch(/Matematik/i);
    expect(titleFromFileName('')).toBe('');
  });

  it('validateBulkRow requires cover, title, price', () => {
    const empty = createEmptyBulkRow();
    expect(validateBulkRow(empty)).toMatch(/Kapak|ad|Fiyat/i);

    const withCover = createEmptyBulkRow({
      coverDataUrl: 'data:image/jpeg;base64,xxx',
      coverPreview: 'data:image/jpeg;base64,xxx',
      title: 'Deneme Kitabı',
      priceLira: '199.90',
    });
    expect(validateBulkRow(withCover)).toBeNull();
  });

  it('validateBulkRows maps errors by localId', () => {
    const a = createEmptyBulkRow({ localId: 'a' });
    const b = createEmptyBulkRow({
      localId: 'b',
      coverDataUrl: 'data:image/jpeg;base64,x',
      coverPreview: 'data:image/jpeg;base64,x',
      title: 'OK',
      priceLira: '10',
    });
    const r = validateBulkRows([a, b]);
    expect(r.ok).toBe(false);
    expect(r.errors.a).toBeTruthy();
    expect(r.errors.b).toBeUndefined();
  });
});
