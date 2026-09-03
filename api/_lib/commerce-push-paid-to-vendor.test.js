import { describe, expect, it } from 'vitest';
import {
  normalizePersonQuery,
  orderLooksIbanPaid,
  personNameMatches,
} from './commerce-push-paid-to-vendor.js';

describe('commerce-push-paid-to-vendor helpers', () => {
  it('matches Turkish names with partial tokens', () => {
    expect(personNameMatches('Muhammed Talha Çevik', 'Talha Çevik')).toBe(true);
    expect(personNameMatches('Muhammed Talha Cevik', 'muhammed talha çevik')).toBe(true);
    expect(personNameMatches('Ali Veli', 'Talha')).toBe(false);
  });

  it('normalizes whitespace', () => {
    expect(normalizePersonQuery('  Muhammed   Talha  ')).toBe('muhammed talha');
  });

  it('detects IBAN paid from notes and receipt', () => {
    expect(
      orderLooksIbanPaid(
        { notes: 'IBAN havale · X · dekont yüklendi', payment_status: 'pending', status: 'pending_payment' },
        { provider: 'iban', raw_response: { receipt_url: 'https://x/dekont.jpg' } }
      )
    ).toBe(true);
    expect(
      orderLooksIbanPaid(
        { notes: null, payment_status: 'pending', status: 'pending_payment' },
        { provider: 'paytr' }
      )
    ).toBe(false);
    expect(
      orderLooksIbanPaid({ payment_status: 'paid', status: 'paid' }, null)
    ).toBe(true);
  });
});
