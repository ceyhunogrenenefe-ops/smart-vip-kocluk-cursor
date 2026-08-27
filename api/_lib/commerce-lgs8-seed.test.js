import { describe, expect, it } from 'vitest';
import {
  isbnDigits,
  isUniqueViolation,
  retiredBookSlug,
  selectBookMatch,
} from './commerce-lgs8-seed-keys.js';

describe('commerce-lgs8-seed unique revive', () => {
  it('strips ISBN punctuation to digits', () => {
    expect(isbnDigits('978-625-12345-6-2')).toBe('9786251234562');
    expect(isbnDigits('9786251234562')).toBe('9786251234562');
  });

  it('detects postgres unique violations', () => {
    expect(isUniqueViolation({ code: '23505', message: 'duplicate key' })).toBe(true);
    expect(
      isUniqueViolation({
        message: 'duplicate key value violates unique constraint "commerce_books_slug_unique"',
      }),
    ).toBe(true);
    expect(isUniqueViolation({ message: 'column missing' })).toBe(false);
  });

  it('prefers a live row over a soft-deleted slug occupier', () => {
    const live = {
      id: 'live',
      isbn: '978-625-12345-6-2',
      slug: 'vip-yayinlari-8-sinif-lgs-set',
      deleted_at: null,
    };
    const deleted = {
      id: 'gone',
      isbn: '978-625-12345-6-2',
      slug: 'vip-yayinlari-8-sinif-lgs-t-c-inkilap-tarihi-ve-ataturkculuk-egitim-se',
      deleted_at: '2026-08-01T00:00:00Z',
    };
    const hit = selectBookMatch(
      [deleted, live],
      '978-625-12345-6-2',
      'vip-yayinlari-8-sinif-lgs-t-c-inkilap-tarihi-ve-ataturkculuk-egitim-se',
    );
    expect(hit.id).toBe('live');
  });

  it('still matches a soft-deleted slug when that is the only occupier', () => {
    const deleted = {
      id: 'gone',
      isbn: '978-625-00000-0-0',
      slug: 'vip-yayinlari-8-sinif-lgs-fen-bilimleri-egitim-seti',
      deleted_at: '2026-08-01T00:00:00Z',
    };
    const hit = selectBookMatch(
      [deleted],
      '978-625-12345-1-7',
      'vip-yayinlari-8-sinif-lgs-fen-bilimleri-egitim-seti',
    );
    expect(hit.id).toBe('gone');
  });

  it('builds a retired slug that cannot collide with the canonical 80-char slug', () => {
    const slug = 'vip-yayinlari-8-sinif-lgs-t-c-inkilap-tarihi-ve-ataturkculuk-egitim-se';
    const retired = retiredBookSlug(slug, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(retired).not.toBe(slug);
    expect(retired).toContain('-x-aaaaaaaa');
    expect(retired.length).toBeLessThanOrEqual(80);
  });
});
