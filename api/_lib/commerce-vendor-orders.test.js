import { describe, expect, it } from 'vitest';
import {
  buildVendorOwnedOrderPatch,
  filterPaidVendorOrders,
  isPaidParentOrder,
} from './commerce-vendor-orders.js';

describe('commerce-vendor-orders', () => {
  it('patches customer fields and vendor status for kitapçı edit', () => {
    const { parent, vendor } = buildVendorOwnedOrderPatch({
      customer_name: '  Ayşe Veli  ',
      customer_phone: '',
      notes: 'adres değişti',
      status: 'preparing',
      vendor_notes: 'paket hazır',
    });
    expect(parent.customer_name).toBe('Ayşe Veli');
    expect(parent.customer_phone).toBe(null);
    expect(parent.notes).toBe('adres değişti');
    expect(vendor.status).toBe('preparing');
    expect(vendor.vendor_notes).toBe('paket hazır');
  });

  it('rejects unknown statuses', () => {
    expect(() => buildVendorOwnedOrderPatch({ status: 'hack' })).toThrow(/kitapçı sipariş durumu/);
    expect(() => buildVendorOwnedOrderPatch({ order_status: 'nope' })).toThrow(/sipariş durumu/);
  });

  it('hides unpaid parent orders from the seller channel', () => {
    expect(isPaidParentOrder({ payment_status: 'pending_payment', status: 'pending_payment' })).toBe(false);
    expect(isPaidParentOrder({ payment_status: 'paid', status: 'paid' })).toBe(true);
    expect(isPaidParentOrder({ commerce_orders: { payment_status: 'pending_payment' } })).toBe(false);
    expect(isPaidParentOrder({ commerce_orders: [{ payment_status: 'paid' }] })).toBe(true);
    const rows = filterPaidVendorOrders([
      { id: 'a', commerce_orders: { payment_status: 'pending_payment' } },
      { id: 'b', commerce_orders: { payment_status: 'paid' } },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['b']);
  });
});
