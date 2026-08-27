import { describe, expect, it } from 'vitest';
import { computeCouponDiscount } from './commerce-coupon-discount.js';

describe('computeCouponDiscount', () => {
  it('percent with max cap', () => {
    expect(
      computeCouponDiscount(
        { discount_type: 'percent', discount_value: 20, max_discount_kurus: 5000, min_order_kurus: 0 },
        100000
      )
    ).toBe(5000);
  });

  it('fixed amount', () => {
    expect(
      computeCouponDiscount({ discount_type: 'fixed', discount_value: 1500, min_order_kurus: 0 }, 10000)
    ).toBe(1500);
  });

  it('below min order is 0', () => {
    expect(
      computeCouponDiscount({ discount_type: 'percent', discount_value: 10, min_order_kurus: 20000 }, 10000)
    ).toBe(0);
  });

  it('cannot exceed subtotal', () => {
    expect(
      computeCouponDiscount({ discount_type: 'fixed', discount_value: 99999, min_order_kurus: 0 }, 2500)
    ).toBe(2500);
  });
});
