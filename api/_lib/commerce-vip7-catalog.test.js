import { describe, expect, it } from 'vitest';
import { VIP7_BOOKS, VIP7_SET, VIP7_SET_CONTENTS } from './commerce-vip7-catalog.js';

describe('commerce-vip7-catalog', () => {
  it('defines a 6-book VIP 7th grade set', () => {
    expect(VIP7_SET_CONTENTS).toHaveLength(6);
    expect(VIP7_BOOKS).toHaveLength(6);
    expect(VIP7_SET.title).toMatch(/7\.SINIF.*EĞİTİM SETİ.*6/i);
    expect(VIP7_SET.class_levels).toEqual(['7']);
    expect(VIP7_SET.metadata?.is_set).toBe(true);
    expect(VIP7_SET.metadata?.store_kind).toBe('egitim-setleri');
    expect(VIP7_SET.slug).toBe('7sinif-vip-yayinlari-egitim-seti-6-li');
  });

  it('component books are catalog-inactive and grade 7', () => {
    for (const b of VIP7_BOOKS) {
      expect(b.is_catalog_active).toBe(false);
      expect(b.class_levels).toContain('7');
      expect(b.publisher).toBe('VIP Yayınları');
      expect(b.isbn).toBeTruthy();
      expect(b.slug).toBeTruthy();
    }
  });
});
