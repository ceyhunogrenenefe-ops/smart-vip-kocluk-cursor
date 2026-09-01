import { describe, expect, it } from 'vitest';
import {
  assertShippingComplete,
  formatShippingOneLine,
  itemsForVendor,
  parseShippingFromBody,
  shippingInsertRow,
  shippingIsComplete
} from './commerce-shipping-address.js';

describe('parseShippingFromBody', () => {
  it('reads nested address + customer from the payment page', () => {
    const ship = parseShippingFromBody({
      customer: { parentName: 'Ayşe Yılmaz', phone: '05551234567', email: 'a@b.com', studentInfo: 'kapı 12' },
      address: { address_line1: 'Bağdat Cad. 10', district: 'Kadıköy', city: 'İstanbul' }
    });
    expect(ship.full_name).toBe('Ayşe Yılmaz');
    expect(ship.address_line1).toBe('Bağdat Cad. 10');
    expect(ship.city).toBe('İstanbul');
    expect(ship.notes).toBe('kapı 12');
  });

  it('reads panel sepet top-level fields', () => {
    const ship = parseShippingFromBody({
      customer_name: 'Mehmet Kaya',
      customer_phone: '05321112233',
      customer_email: 'm@k.com',
      address: { address_line1: 'Atatürk Mah. 5', city: 'Ankara' }
    });
    expect(shippingIsComplete(ship)).toBe(true);
    expect(formatShippingOneLine(ship)).toBe('Atatürk Mah. 5, Ankara');
  });
});

describe('assertShippingComplete', () => {
  it('rejects pay-without-address', () => {
    expect(() =>
      assertShippingComplete(
        { full_name: 'Ayşe Yılmaz', phone: '05551234567', email: 'a@b.com', address_line1: '', city: '' },
        { requireEmail: true }
      )
    ).toThrow(/Teslimat adresi/);
  });

  it('builds an insert row for commerce_order_addresses', () => {
    const row = shippingInsertRow('ord-1', {
      full_name: 'Ayşe',
      phone: '0555',
      address_line1: 'Cadde 1',
      city: 'İzmir'
    });
    expect(row.order_id).toBe('ord-1');
    expect(row.address_type).toBe('shipping');
    expect(row.country).toBe('TR');
  });
});

describe('itemsForVendor', () => {
  it('keeps only that seller books', () => {
    const items = [
      { vendor_id: 'v1', title_snapshot: 'Fen' },
      { vendor_id: 'v2', title_snapshot: 'Mat' }
    ];
    expect(itemsForVendor(items, 'v1').map((i) => i.title_snapshot)).toEqual(['Fen']);
  });
});
