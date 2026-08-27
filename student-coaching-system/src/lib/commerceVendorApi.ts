/**
 * Satıcı paneli — Kitap Pazaryeri API istemcisi
 */
import { apiFetch } from './session';
import type { CommerceBook, CommerceVendor, CommerceVendorOffer, CommerceVendorOrder, CommerceVendorPayout } from '../types/commerce.types';
import { getActingVendorId } from './commerceActingVendor';

async function post<T = unknown>(op: string, params: Record<string, unknown> = {}): Promise<T> {
  const actingId = getActingVendorId();
  const payload =
    actingId && !params.vendor_id ? { op, vendor_id: actingId, ...params } : { op, ...params };
  const res = await apiFetch('/api/commerce-vendor', { method: 'POST', body: JSON.stringify(payload) });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? op);
  return data as T;
}

export type VendorStats = {
  total_orders: number;
  pending_orders: number;
  active_offers: number;
  pending_approval: number;
  low_stock: number;
  total_net_kurus: number;
  pending_payout_kurus: number;
};

export const cvGetMyVendor = (vendor_id?: string) => post<{ vendor: CommerceVendor }>('my_vendor.get', vendor_id ? { vendor_id } : {});
export const cvGetStats = (vendor_id?: string) => post<{ stats: VendorStats }>('stats.overview', vendor_id ? { vendor_id } : {});

// Kitaplar
export const cvListBooks = (params?: { search?: string; limit?: number; vendor_id?: string }) =>
  post<{ books: (CommerceBook & { my_offer: CommerceVendorOffer | null })[] }>('books.list', params ?? {});
export const cvCreateBook = (fields: Partial<CommerceBook>) => post<{ book: CommerceBook }>('books.create', fields);
export const cvUpdateBook = (book_id: string, fields: Partial<CommerceBook>) =>
  post<{ book: CommerceBook }>('books.update', { book_id, ...fields });

// Teklifler
export const cvListOffers = (vendor_id?: string) =>
  post<{ offers: CommerceVendorOffer[] }>('offers.list', vendor_id ? { vendor_id } : {});
export const cvGetOffer = (id: string, vendor_id?: string) =>
  post<{ offer: CommerceVendorOffer }>('offers.get', { id, ...(vendor_id ? { vendor_id } : {}) });
export const cvCreateOffer = (fields: { book_id: string; price_kurus: number; stock_quantity?: number; shipping_days?: number; vendor_id?: string }) =>
  post<{ offer: CommerceVendorOffer }>('offers.create', fields);
export const cvUpdateOffer = (id: string, fields: Partial<CommerceVendorOffer> & { vendor_id?: string }) =>
  post<{ offer: CommerceVendorOffer }>('offers.update', { id, ...fields });
export const cvSubmitOffer = (id: string, vendor_id?: string) =>
  post<{ offer: CommerceVendorOffer }>('offers.submit', { id, ...(vendor_id ? { vendor_id } : {}) });

// Siparişler
export const cvListOrders = (params?: { status?: string; limit?: number; vendor_id?: string }) =>
  post<{ vendor_orders: CommerceVendorOrder[] }>('orders.list', params ?? {});
export const cvGetOrder = (id: string, vendor_id?: string) =>
  post<{ vendor_order: CommerceVendorOrder }>('orders.get', { id, ...(vendor_id ? { vendor_id } : {}) });
export const cvAcceptOrder = (id: string, vendor_id?: string) =>
  post<{ vendor_order: CommerceVendorOrder }>('orders.accept', { id, ...(vendor_id ? { vendor_id } : {}) });
export const cvMarkPreparing = (id: string, vendor_id?: string) =>
  post<{ vendor_order: CommerceVendorOrder }>('orders.preparing', { id, ...(vendor_id ? { vendor_id } : {}) });
export const cvShipOrder = (id: string, shipFields: { carrier?: string; tracking_number?: string; tracking_url?: string; invoice_number?: string; vendor_id?: string }) =>
  post('orders.ship', { id, ...shipFields });

// Stok güncelleme (onaylı teklif için)
export const cvUpdateStock = (id: string, stock_quantity: number, vendor_id?: string) =>
  post<{ offer: CommerceVendorOffer }>('offers.update', { id, stock_quantity, ...(vendor_id ? { vendor_id } : {}) });

// Hakedişler
export const cvListPayouts = (vendor_id?: string) =>
  post<{ payouts: CommerceVendorPayout[] }>('payouts.list', vendor_id ? { vendor_id } : {});
