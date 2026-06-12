import { errorMessage } from '../api/_lib/error-msg.js';
import {
  confirmOrderFromKitapciPortal,
  listOrdersForKitapciPortal,
  resolveBooksellerByPortalToken,
  shipOrderFromKitapciPortal
} from '../api/_lib/kitapci-portal.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function portalToken(req) {
  return String(req.query?.token || '').trim();
}

export default async function handler(req, res) {
  const token = portalToken(req);
  if (!token) {
    return res.status(400).json({ error: 'token_required', hint: 'Geçersiz panel bağlantısı.' });
  }

  let bookseller;
  try {
    bookseller = await resolveBooksellerByPortalToken(token);
  } catch (e) {
    return res.status(500).json({ error: errorMessage(e) });
  }
  if (!bookseller) {
    return res.status(401).json({ error: 'invalid_token', hint: 'Panel bağlantısı geçersiz veya kitapçı pasif.' });
  }

  if (req.method === 'GET') {
    try {
      const orders = await listOrdersForKitapciPortal(bookseller);
      return res.status(200).json({
        bookseller: { name: bookseller.name, city: bookseller.city },
        orders
      });
    } catch (e) {
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const op = String(req.query?.op || '').trim();
  const body = parseBody(req);
  const orderId = String(body.order_id || req.query?.order_id || '').trim();
  if (!orderId) return res.status(400).json({ error: 'order_id_required' });

  try {
    if (op === 'confirm') {
      const out = await confirmOrderFromKitapciPortal(bookseller.id, orderId);
      if (!out.ok) {
        return res.status(400).json({ ok: false, error: out.error, hint: out.hint });
      }
      return res.status(200).json({ ok: true, order: out.data });
    }

    if (op === 'ship') {
      const out = await shipOrderFromKitapciPortal(bookseller.id, orderId, {
        kargoTakipNo: body.kargo_takip_no,
        kitapciNotu: body.kitapci_notu
      });
      if (!out.ok) {
        return res.status(400).json({ ok: false, error: out.error, hint: out.hint });
      }
      return res.status(200).json({ ok: true, order: out.data });
    }

    return res.status(400).json({ error: 'unknown_op' });
  } catch (e) {
    return res.status(500).json({ error: errorMessage(e) });
  }
}
