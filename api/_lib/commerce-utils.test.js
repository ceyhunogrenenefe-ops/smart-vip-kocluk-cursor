import { describe, expect, it } from 'vitest';
import {
  formatCommerceTry,
  isValidCommerceOrderNumber,
  kurusToLira,
  liraToKurus,
  attachOfferRelations,
} from './commerce-utils.js';

describe('commerce-utils', () => {
  it('liraToKurus rounds to integer kuruş', () => {
    expect(liraToKurus(99.99)).toBe(9999);
    expect(liraToKurus(0)).toBe(0);
  });

  it('kurusToLira converts back', () => {
    expect(kurusToLira(12345)).toBe(123.45);
  });

  it('formatCommerceTry uses Turkish locale', () => {
    const formatted = formatCommerceTry(12345);
    expect(formatted).toContain('123');
    expect(formatted).toMatch(/₺|TRY/);
  });

  it('isValidCommerceOrderNumber accepts VIP-KTP pattern', () => {
    expect(isValidCommerceOrderNumber('VIP-KTP-2026-000001')).toBe(true);
    expect(isValidCommerceOrderNumber('vip-ktp-2026-1')).toBe(false);
    expect(isValidCommerceOrderNumber('')).toBe(false);
  });

  it('attachOfferRelations copies commerce_books to book', () => {
    const row = attachOfferRelations({
      id: '1',
      commerce_books: { id: 'b1', title: 'Matematik', cover_image_url: 'https://cdn/x.jpg' },
      commerce_vendors: { id: 'v1', name: 'Ocak Kitabevi' },
    });
    expect(row.book.title).toBe('Matematik');
    expect(row.book.cover_image_url).toContain('cdn');
    expect(row.vendor.name).toBe('Ocak Kitabevi');
  });
});
