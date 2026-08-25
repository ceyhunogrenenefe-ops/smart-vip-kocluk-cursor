import { describe, expect, it } from 'vitest';
import {
  customerFieldsFromCheckoutBody,
  normalizeCommerceCheckoutOp,
  wantsCheckoutPayment,
} from './commerce-checkout-op.js';

describe('commerce-checkout-op', () => {
  it('aliases site /odeme/kitap ops onto store ops', () => {
    expect(normalizeCommerceCheckoutOp('resolve')).toBe('checkout.resolve');
    expect(normalizeCommerceCheckoutOp('pay')).toBe('checkout.pay');
    expect(normalizeCommerceCheckoutOp('update_customer')).toBe('checkout.update_customer');
    expect(normalizeCommerceCheckoutOp('checkout.resolve')).toBe('checkout.resolve');
  });

  it('starts payment when provider is present on update_customer', () => {
    expect(wantsCheckoutPayment('checkout.update_customer', { provider: 'paytr' })).toBe(true);
    expect(wantsCheckoutPayment('checkout.update_customer', {})).toBe(false);
    expect(wantsCheckoutPayment('checkout.pay', {})).toBe(true);
  });

  it('reads nested customer payload from the live payment page', () => {
    const fields = customerFieldsFromCheckoutBody({
      customer: {
        parentName: 'Ayşe Yılmaz',
        phone: '05551234567',
        email: 'a@b.com',
        studentInfo: 'kapı kodu',
      },
    });
    expect(fields.name).toBe('Ayşe Yılmaz');
    expect(fields.email).toBe('a@b.com');
    expect(fields.notes).toBe('kapı kodu');
  });
});
