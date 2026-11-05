import { describe, expect, it } from 'vitest';
import { canSendGift, giftLineFromBody, giftOrderNotes, isGiftOrder } from './commerce-gift.js';

describe('commerce-gift', () => {
  it('only admin and super_admin can send gifts', () => {
    expect(canSendGift(new Set(['super_admin']))).toBe(true);
    expect(canSendGift(new Set(['admin']))).toBe(true);
    expect(canSendGift(new Set(['coach']))).toBe(false);
    expect(canSendGift(new Set(['teacher']))).toBe(false);
    expect(canSendGift(new Set(['student']))).toBe(false);
    expect(canSendGift(null)).toBe(false);
  });

  it('marks the seller note as a gift', () => {
    const notes = giftOrderNotes({ studentName: 'Ali Veli', note: 'Derece ödülü · teşekkürler' });
    expect(notes).toBe('HEDİYE (ücretsiz — kurum gönderiyor) · Öğrenci: Ali Veli · Derece ödülü teşekkürler');
    expect(isGiftOrder({ notes })).toBe(true);
    expect(isGiftOrder({ coupon_code: 'HEDIYE' })).toBe(true);
    expect(isGiftOrder({ notes: 'IBAN havale' })).toBe(false);
  });

  it('builds one gift line', () => {
    expect(giftLineFromBody({ vendor_offer_id: 'o1' })).toMatchObject({ vendor_offer_id: 'o1', quantity: 1 });
    expect(giftLineFromBody({ package_id: 'p1', quantity: 99 })).toMatchObject({ package_id: 'p1', quantity: 20 });
    expect(() => giftLineFromBody({})).toThrow();
  });
});
