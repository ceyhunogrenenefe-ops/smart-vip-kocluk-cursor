import { describe, expect, it } from 'vitest';
import {
  computeAddressFields,
  formatAddressDisplay,
  inferProductCategory,
} from './crm-website-orders.js';

describe('computeAddressFields', () => {
  it('marks physical orders missing district as Adres Eksik', () => {
    const r = computeAddressFields({
      requiresShipping: true,
      line1: 'Cadde 1',
      city: 'İstanbul',
      district: '',
    });
    expect(r.address_status).toBe('missing');
    expect(r.address_missing).toBe(true);
  });

  it('accepts complete shipping address', () => {
    const r = computeAddressFields({
      requiresShipping: true,
      line1: 'Cadde 1',
      city: 'Ankara',
      district: 'Çankaya',
    });
    expect(r.address_status).toBe('complete');
  });

  it('skips address for digital products', () => {
    const r = computeAddressFields({ requiresShipping: false, line1: '', city: '' });
    expect(r.address_status).toBe('not_required');
  });
});

describe('formatAddressDisplay', () => {
  it('shows Adres Eksik label without inventing data', () => {
    expect(
      formatAddressDisplay({
        address_status: 'missing',
        address_line1: null,
        city: null,
      })
    ).toBe('Adres Eksik');
  });
});

describe('inferProductCategory', () => {
  it('detects deneme kulübü', () => {
    expect(inferProductCategory('Deneme Kulübü 40+ Paketi')).toBe('deneme');
  });

  it('detects eğitim programs', () => {
    expect(inferProductCategory('YKS Canlı Eğitim Paketi')).toBe('egitim');
  });
});
