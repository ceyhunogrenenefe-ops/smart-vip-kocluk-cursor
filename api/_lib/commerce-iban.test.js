import { describe, expect, it } from 'vitest';
import {
  COMMERCE_IBAN_ACCOUNT,
  decorateOrderWithIbanReceipt,
  formatIbanDisplay,
  normalizeIban,
  parseIbanReceipt,
  receiptFromPayments,
  resolveIbanAccount,
} from './commerce-iban.js';

describe('commerce-iban', () => {
  it('normalizes and groups the live IBAN', () => {
    expect(normalizeIban('TR87 0003 2000 0000 0066 7920 70')).toBe('TR870003200000000066792070');
    expect(formatIbanDisplay(COMMERCE_IBAN_ACCOUNT.iban)).toBe('TR87 0003 2000 0000 0066 7920 70');
  });

  it('uses Songül Öğrenenefe account unless settings override', () => {
    const def = resolveIbanAccount(null);
    expect(def.enabled).toBe(true);
    expect(def.holder).toBe('Songül Öğrenenefe');
    expect(def.iban).toBe('TR870003200000000066792070');
    expect(def.note).toContain('Ödemeyi buraya');
    const custom = resolveIbanAccount({
      meta: { iban_payment: { holder: 'Test', iban: 'tr00 1111', note: 'x', enabled: false } },
    });
    expect(custom.enabled).toBe(false);
    expect(custom.holder).toBe('Test');
    expect(custom.iban).toBe('TR001111');
  });

  it('rejects missing or oversized dekont', () => {
    expect(() => parseIbanReceipt({})).toThrow(/Dekont yükleyin/);
    expect(() => parseIbanReceipt({ file_base64: 'AAAA', mime_type: 'text/plain' })).toThrow(/jpeg/);
    const tiny = parseIbanReceipt({ file_base64: Buffer.from('hi').toString('base64'), mime_type: 'image/jpeg' });
    expect(tiny.ext).toBe('jpg');
    expect(tiny.buffer.byteLength).toBe(2);
  });

  it('exposes dekont URL from payment raw_response for staff orders', () => {
    const extra = receiptFromPayments([
      { provider: 'paytr', raw_response: {} },
      { provider: 'iban', raw_response: { receipt_url: 'https://cdn.example/dekont.jpg', holder: 'Songül Öğrenenefe', iban: 'TR870003200000000066792070' } },
    ]);
    expect(extra.receipt_url).toBe('https://cdn.example/dekont.jpg');
    expect(extra.payment_method).toBe('iban');
    const decorated = decorateOrderWithIbanReceipt({
      id: 'o1',
      notes: 'IBAN havale',
      commerce_payments: [{ provider: 'iban', raw_response: { receipt_url: 'https://cdn.example/d.pdf' } }],
    });
    expect(decorated.receipt_url).toBe('https://cdn.example/d.pdf');
    expect(decorated.payment_method).toBe('iban');
  });
});
