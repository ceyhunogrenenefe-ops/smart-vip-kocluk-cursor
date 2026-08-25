/**
 * Run: node scripts/test-commerce-checkout-op.js
 */
import assert from 'assert';
import {
  customerFieldsFromCheckoutBody,
  normalizeCommerceCheckoutOp,
  wantsCheckoutPayment,
} from '../api/_lib/commerce-checkout-op.js';

assert.strictEqual(normalizeCommerceCheckoutOp('resolve'), 'checkout.resolve');
assert.strictEqual(normalizeCommerceCheckoutOp('pay'), 'checkout.pay');
assert.strictEqual(normalizeCommerceCheckoutOp('update_customer'), 'checkout.update_customer');
assert.strictEqual(normalizeCommerceCheckoutOp('checkout.resolve'), 'checkout.resolve');
assert.strictEqual(normalizeCommerceCheckoutOp('order.paid'), 'order.paid');

assert.strictEqual(wantsCheckoutPayment('checkout.pay', {}), true);
assert.strictEqual(wantsCheckoutPayment('checkout.update_customer', { provider: 'paytr' }), true);
assert.strictEqual(wantsCheckoutPayment('checkout.update_customer', {}), false);

const fields = customerFieldsFromCheckoutBody({
  customer: { parentName: 'Ayşe Yılmaz', phone: '05551234567', email: 'a@b.com', studentInfo: 'not' },
  address: { address_line1: 'Cadde 1', city: 'İstanbul' },
});
assert.strictEqual(fields.name, 'Ayşe Yılmaz');
assert.strictEqual(fields.email, 'a@b.com');
assert.ok(fields.phone.includes('555'));

console.log('OK commerce-checkout-op');
