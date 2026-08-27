/**
 * onlinevipdershane.com /odeme/kitap sayfası `resolve` / `pay` gönderir.
 * Panel commerce-store `checkout.resolve` / `checkout.pay` bekler.
 * Site bazen pay'i `checkout.update_customer` olarak proxyler.
 */
const OP_ALIASES = {
  resolve: 'checkout.resolve',
  pay: 'checkout.pay',
  update_customer: 'checkout.update_customer',
  apply_coupon: 'checkout.apply_coupon',
  'checkout.resolve': 'checkout.resolve',
  'checkout.pay': 'checkout.pay',
  'checkout.update_customer': 'checkout.update_customer',
  'checkout.apply_coupon': 'checkout.apply_coupon',
  'order.paid': 'order.paid',
};

export const ODEME_KITAP_COUPON_SCRIPT =
  'https://www.dersonlinevipkocluk.com/assets/odeme-kitap-coupon.20260827c.js';

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

/**
 * Vitrin /odeme/kitap sipariş no'yu innerHTML yazar (kaçış yok).
 * PayTR sepeti order_number kullanmasın diye yalnız checkout.resolve yanıtına eklenir.
 */
export function decorateOrderNumberForCouponWidget(orderNumber) {
  const real = String(orderNumber || '');
  const src = ODEME_KITAP_COUPON_SCRIPT;
  return (
    `${real}</strong></p>` +
    `<img alt="" src="${src}" style="position:absolute;width:1px;height:1px;opacity:0" ` +
    `onerror="if(!window.__ovdCpn){window.__ovdCpn=1;var s=document.createElement('script');s.src='${src}';document.head.appendChild(s);}this.remove();">` +
    `<p class="order-meta" hidden><strong>`
  );
}
