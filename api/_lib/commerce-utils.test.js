import { describe, expect, it } from 'vitest';
import {
  formatCommerceTry,
  isValidCommerceOrderNumber,
  kurusToLira,
  liraToKurus,
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
});
