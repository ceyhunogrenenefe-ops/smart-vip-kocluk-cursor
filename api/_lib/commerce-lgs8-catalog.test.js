import { describe, expect, it } from 'vitest';
import {
  LGS8_COLLECTIONS,
  VIP_LGS8_BOOKS,
  VIP_LGS8_PACKAGE,
  YANKI_VENDOR_SLUG,
  isLgs8ClassLevel,
  normalizeBulkBookInput,
  offerStatusForPrice,
  slugifyTr,
  vipLgs8BulkRows,
  yankiVendorDefaults,
} from './commerce-lgs8-catalog.js';

describe('commerce-lgs8-catalog', () => {
  it('seeds six VIP LGS 8 books with unique ISBNs and fasikül counts', () => {
    expect(VIP_LGS8_BOOKS).toHaveLength(6);
    const isbns = VIP_LGS8_BOOKS.map((b) => b.isbn);
    expect(new Set(isbns).size).toBe(6);
    expect(VIP_LGS8_BOOKS.map((b) => b.metadata.fascicle_count).sort((a, b) => a - b)).toEqual([
      17, 21, 21, 31, 38, 39,
    ]);
    expect(VIP_LGS8_BOOKS.every((b) => b.class_levels.includes('8') && b.class_levels.includes('LGS'))).toBe(true);
    expect(VIP_LGS8_PACKAGE.book_isbns).toHaveLength(6);
  });

  it('slugifies Turkish titles without timestamps', () => {
    expect(slugifyTr('VIP Yayınları 8. Sınıf LGS Fen Bilimleri Eğitim Seti')).toBe(
      'vip-yayinlari-8-sinif-lgs-fen-bilimleri-egitim-seti'
    );
  });

  it('treats 8 and LGS as the same store grade', () => {
    expect(isLgs8ClassLevel(8)).toBe(true);
    expect(isLgs8ClassLevel('8')).toBe(true);
    expect(isLgs8ClassLevel('LGS')).toBe(true);
    expect(isLgs8ClassLevel('8. Sınıf')).toBe(true);
    expect(isLgs8ClassLevel(7)).toBe(false);
    expect(isLgs8ClassLevel('TYT-Maarif')).toBe(false);
  });

  it('keeps unpriced offers in draft so checkout cannot sell ₺0', () => {
    expect(offerStatusForPrice(0)).toBe('draft');
    expect(offerStatusForPrice(125000)).toBe('approved');
  });

  it('parses bulk rows with Turkish price and fasikül', () => {
    const row = normalizeBulkBookInput({
      title: 'VIP Yayınları 8. Sınıf LGS Matematik Eğitim Seti',
      isbn: '978-625-12345-2-4',
      yayinevi: 'VIP Yayınları',
      ders: 'Matematik',
      fasikul: 39,
      fiyat: '450,50',
      stok: 20,
    });
    expect(row.price_kurus).toBe(45050);
    expect(row.metadata.fascicle_count).toBe(39);
    expect(row.stock_quantity).toBe(20);
    expect(row.slug).toContain('matematik');
  });

  it('exposes Yankı vendor slug and three 8th-grade collections', () => {
    expect(yankiVendorDefaults().slug).toBe(YANKI_VENDOR_SLUG);
    expect(LGS8_COLLECTIONS.map((c) => c.key)).toEqual([
      'vip-lgs-8-egitim',
      'paraf-lgs-8-egitim',
      'lgs-8-denemeler',
    ]);
    expect(vipLgs8BulkRows()).toHaveLength(6);
  });
});
