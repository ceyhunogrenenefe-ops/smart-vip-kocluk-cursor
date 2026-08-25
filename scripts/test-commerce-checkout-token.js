/**
 * Unit checks for commerce checkout handoff (no network).
 * Run: node scripts/test-commerce-checkout-token.js
 */
import assert from 'assert';
import {
  isCommercePaymentRef,
  orderIdFromPaymentRef,
  paymentRefFromOrderId,
  signCheckoutToken,
  verifyCheckoutToken,
} from '../api/_lib/commerce-checkout-token.js';

process.env.COMMERCE_CHECKOUT_SECRET = 'test-secret-verify';

const orderId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ref = paymentRefFromOrderId(orderId);
assert.ok(isCommercePaymentRef(ref), 'payment ref format');
assert.strictEqual(orderIdFromPaymentRef(ref), orderId, 'roundtrip order id');

const token = signCheckoutToken({
  orderId,
  orderNumber: 'VIP-KTP-2026-000001',
  totalKurus: 19900,
  userId: 'user-1',
});
const payload = verifyCheckoutToken(token);
assert.strictEqual(payload.oid, orderId);
assert.strictEqual(payload.tot, 19900);

let forged = false;
try {
  verifyCheckoutToken(token.slice(0, -4) + 'xxxx');
} catch {
  forged = true;
}
assert.ok(forged, 'forged token rejected');

assert.strictEqual(isCommercePaymentRef('OVD123'), false, 'non-kitap oid');
assert.strictEqual(orderIdFromPaymentRef('OVD123'), null);

console.log('OK commerce-checkout-token');
