/**
 * Süper Admin — Kitap Pazaryeri API istemcisi
 */
import { apiFetch } from './session';
import type {
  CommerceVendor,
  CommerceVendorUser,
  CommerceBook,
  CommerceVendorOffer,
  CommerceBookPackage,
  CommerceOrder,
  CommerceVendorOrder,
  CommerceShipment,
  CommerceVendorPayout,
  CommerceCoupon,
  CommerceSettings,
} from '../types/commerce.types';

async function post<T = unknown>(op: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await apiFetch('/api/commerce-admin', { method: 'POST', body: JSON.stringify({ op, ...params }) });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? op);
  return data as T;
}

// ── Satıcılar ──────────────────────────────────────
export const caListVendors = () => post<{ vendors: CommerceVendor[] }>('vendors.list');
export const caGetVendor = (id: string) => post<{ vendor: CommerceVendor }>('vendors.get', { id });
export const caCreateVendor = (fields: Partial<CommerceVendor>) => post<{ vendor: CommerceVendor }>('vendors.create', fields);
export const caUpdateVendor = (id: string, fields: Partial<CommerceVendor>) => post<{ vendor: CommerceVendor }>('vendors.update', { id, ...fields });
export const caDeleteVendor = (id: string) => post('vendors.delete', { id });

export type VendorUserRow = CommerceVendorUser & {
  users: { id: string; name: string; email: string; role: string; is_active: boolean; last_login_at: string | null } | null;
};

export const caListVendorUsers = (vendor_id: string) => post<{ users: VendorUserRow[] }>('vendor_users.list', { vendor_id });

export const caCreateVendorAccount = (vendor_id: string, fields: { name: string; email: string; password: string; phone?: string }) =>
  post<{ user: { id: string; name: string; email: string; role: string }; password_set: string }>('vendor_users.create_account', { vendor_id, ...fields });

export const caResetVendorPassword = (user_id: string, new_password: string) =>
  post('vendor_users.reset_password', { user_id, new_password });

export const caToggleVendorActive = (user_id: string, is_active: boolean) =>
  post('vendor_users.toggle_active', { user_id, is_active });

export const caAddVendorUser = (vendor_id: string, user_id: string, role = 'admin') => post('vendor_users.add', { vendor_id, user_id, role });
export const caRemoveVendorUser = (id: string) => post('vendor_users.remove', { id });

// ── Kitaplar ──────────────────────────────────────
export const caListBooks = (params?: { search?: string; publisher?: string; limit?: number; offset?: number }) =>
  post<{ books: CommerceBook[] }>('books.list', params ?? {});
export const caGetBook = (id: string) => post<{ book: CommerceBook & { commerce_vendor_offers: CommerceVendorOffer[] } }>('books.get', { id });
export const caCreateBook = (fields: Partial<CommerceBook>) => post<{ book: CommerceBook }>('books.create', fields);
export const caUpdateBook = (id: string, fields: Partial<CommerceBook>) => post<{ book: CommerceBook }>('books.update', { id, ...fields });
export const caDeleteBook = (id: string) => post('books.delete', { id });

// ── Teklifler & Onay ─────────────────────────────
export type OfferListParams = { status?: string; vendor_id?: string; book_id?: string; limit?: number };
export const caListOffers = (params?: OfferListParams) => post<{ offers: CommerceVendorOffer[] }>('offers.list', params ?? {});
export const caGetOffer = (id: string) => post<{ offer: CommerceVendorOffer }>('offers.get', { id });
export const caApproveOffer = (id: string) => post<{ offer: CommerceVendorOffer }>('offers.approve', { id });
export const caRejectOffer = (id: string, reason: string) => post<{ offer: CommerceVendorOffer }>('offers.reject', { id, reason });
export const caRequestCorrection = (id: string, notes: string) => post<{ offer: CommerceVendorOffer }>('offers.request_correction', { id, notes });
export const caSetOfferInactive = (id: string) => post<{ offer: CommerceVendorOffer }>('offers.inactive', { id });
export const caUpdateOfferFlags = (id: string, flags: { is_featured?: boolean; is_bestseller?: boolean; is_new_arrival?: boolean; teacher_recommended?: boolean; required_for_classes?: string[] }) =>
  post<{ offer: CommerceVendorOffer }>('offers.update', { id, ...flags });

// ── Siparişler ────────────────────────────────────
export type OrderListParams = { status?: string; student_id?: string; search?: string; limit?: number; offset?: number };
export const caListOrders = (params?: OrderListParams) => post<{ orders: CommerceOrder[] }>('orders.list', params ?? {});
export const caGetOrder = (id: string) => post<{ order: CommerceOrder }>('orders.get', { id });
export const caUpdateOrderStatus = (id: string, status: string, notes?: string) =>
  post<{ order: CommerceOrder }>('orders.update_status', { id, status, notes });
export const caUpdateVendorOrderStatus = (id: string, status: string) =>
  post<{ vendor_order: CommerceVendorOrder }>('vendor_orders.update_status', { id, status });

// ── Kargo ─────────────────────────────────────────
export const caCreateShipment = (fields: { vendor_order_id: string; carrier?: string; tracking_number?: string; tracking_url?: string; invoice_number?: string; notes?: string }) =>
  post<{ shipment: CommerceShipment }>('shipments.create', fields);
export const caUpdateShipment = (id: string, fields: Partial<CommerceShipment>) =>
  post<{ shipment: CommerceShipment }>('shipments.update', { id, ...fields });

// ── Hakedişler ────────────────────────────────────
export const caListPayouts = (params?: { vendor_id?: string; status?: string }) =>
  post<{ payouts: CommerceVendorPayout[] }>('payouts.list', params ?? {});
export const caCreatePayout = (vendor_id: string, period_start: string, period_end: string) =>
  post<{ payout: CommerceVendorPayout }>('payouts.create', { vendor_id, period_start, period_end });
export const caApprovePayout = (id: string) => post<{ payout: CommerceVendorPayout }>('payouts.approve', { id });
export const caMarkPayoutPaid = (id: string, payment_reference?: string) =>
  post<{ payout: CommerceVendorPayout }>('payouts.mark_paid', { id, payment_reference });

// ── Kuponlar ─────────────────────────────────────
export const caListCoupons = () => post<{ coupons: CommerceCoupon[] }>('coupons.list');
export const caCreateCoupon = (fields: Partial<CommerceCoupon>) => post<{ coupon: CommerceCoupon }>('coupons.create', fields);
export const caUpdateCoupon = (id: string, fields: Partial<CommerceCoupon>) => post<{ coupon: CommerceCoupon }>('coupons.update', { id, ...fields });
export const caDeleteCoupon = (id: string) => post('coupons.delete', { id });

// ── Ayarlar ──────────────────────────────────────
export const caGetSettings = () => post<{ settings: CommerceSettings }>('settings.get');
export const caUpdateSettings = (fields: Partial<CommerceSettings>) => post<{ settings: CommerceSettings }>('settings.update', fields);

// ── Raporlar ─────────────────────────────────────
export const caReportSales = (from_date?: string, to_date?: string) =>
  post<{ orders: CommerceOrder[]; total_kurus: number; count: number }>('reports.sales', { from_date, to_date });
export const caReportLowStock = () =>
  post<{ offers: CommerceVendorOffer[] }>('reports.low_stock');
export const caReportVendors = () =>
  post<{ vendor_orders: CommerceVendorOrder[] }>('reports.vendors');
