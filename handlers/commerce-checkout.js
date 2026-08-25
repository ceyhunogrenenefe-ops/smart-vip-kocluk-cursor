/**
 * /api/commerce-checkout — onlinevipdershane.com /odeme/kitap ile aynı sözleşme
 * (resolve / pay / update_customer). Asıl iş commerce-store.
 */
import storeHandler from './commerce-store.js';
import { normalizeCommerceCheckoutOp } from '../api/_lib/commerce-checkout-op.js';

export default async function handler(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const op = normalizeCommerceCheckoutOp(body.op);
  req.body = { ...body, op };
  return storeHandler(req, res);
}
