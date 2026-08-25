/**
 * onlinevipdershane.com /odeme/kitap sayfası `resolve` / `pay` gönderir.
 * Panel commerce-store `checkout.resolve` / `checkout.pay` bekler.
 * Site bazen pay'i `checkout.update_customer` olarak proxyler.
 */
const OP_ALIASES = {
  resolve: 'checkout.resolve',
  pay: 'checkout.pay',
  update_customer: 'checkout.update_customer',
  'checkout.resolve': 'checkout.resolve',
  'checkout.pay': 'checkout.pay',
  'checkout.update_customer': 'checkout.update_customer',
  'order.paid': 'order.paid',
};

export function normalizeCommerceCheckoutOp(raw) {
  const op = String(raw || '').trim();
  if (!op) return '';
  if (OP_ALIASES[op]) return OP_ALIASES[op];
  if (op.startsWith('checkout.') || op.startsWith('order.')) return op;
  return `checkout.${op}`;
}

export function customerFieldsFromCheckoutBody(body) {
  const c = body?.customer && typeof body.customer === 'object' ? body.customer : {};
  return {
    name: String(body?.customer_name || body?.parentName || c.parentName || c.name || '').trim(),
    email: String(body?.customer_email || body?.email || c.email || '').trim().toLowerCase(),
    phone: String(body?.customer_phone || body?.phone || c.phone || '').trim(),
    notes: String(body?.notes || body?.studentInfo || c.studentInfo || '').trim(),
  };
}

export function wantsCheckoutPayment(op, body) {
  if (op === 'checkout.pay' || op === 'pay') return true;
  const provider = String(body?.provider || '').trim().toLowerCase();
  return provider === 'paytr' || provider === 'garanti';
}
