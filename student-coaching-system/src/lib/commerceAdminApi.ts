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
  StoreBrowseNav,
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
  post<{ books: (CommerceBook & { commerce_vendor_offers?: CommerceVendorOffer[] })[] }>('books.list', params ?? {});
export const caGetBook = (id: string) => post<{ book: CommerceBook & { commerce_vendor_offers: CommerceVendorOffer[] } }>('books.get', { id });
export const caCreateBook = (fields: Partial<CommerceBook>) => post<{ book: CommerceBook }>('books.create', fields);
export const caUpdateBook = (id: string, fields: Partial<CommerceBook>) => post<{ book: CommerceBook }>('books.update', { id, ...fields });
export const caDeleteBook = (id: string) => post('books.delete', { id });

export type SaveBookInput = Partial<CommerceBook> & {
  id?: string;
  price_lira?: number | string;
  price_kurus?: number;
  stock?: number;
  stock_quantity?: number;
  shipping_days?: number;
  fascicle_count?: number;
  series?: string;
  series_label?: string;
  approve_if_priced?: boolean;
};

export const caSaveBook = (fields: SaveBookInput) =>
  post<{ book: CommerceBook & { commerce_vendor_offers?: CommerceVendorOffer[] }; offer: CommerceVendorOffer | null }>('books.save', fields);

export const caRequestBookCorrection = (id: string, notes: string) =>
  post<{ offer: CommerceVendorOffer }>('books.request_correction', { id, notes });

export async function caUploadBookCover(bookId: string, dataUrl: string): Promise<string> {
  const res = await apiFetch('/api/commerce-upload', {
    method: 'POST',
    body: JSON.stringify({
      op: 'book_cover',
      file_base64: dataUrl,
      mime_type: 'image/jpeg',
      book_id: bookId,
      save_to_db: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error((data as { error?: string }).error ?? 'Kapak yüklenemedi');
  return (data as { url: string }).url;
}

export type BulkBookInput = Partial<CommerceBook> & {
  price_lira?: number | string;
  price_kurus?: number;
  stock?: number;
  fascicle_count?: number;
  series?: string;
  features?: string[];
};

export const caBulkUpsertBooks = (books: BulkBookInput[], vendor_id?: string) =>
  post<{
    vendor: { id: string; name: string; slug: string };
    count: number;
    books: { id: string; title: string; isbn: string | null; offer_id: string; price_kurus: number; status: string; created: boolean }[];
  }>('books.bulk_upsert', { books, vendor_id, approve_if_priced: true });

export const caSeedLgs8Vip = (fields?: { contact_phone?: string; package_price_kurus?: number; prices?: Record<string, { price_kurus?: number; stock_quantity?: number }> }) =>
  post<{
    vendor: CommerceVendor;
    vendor_created: boolean;
    books: { id: string; title: string; isbn: string | null; offer_id: string; price_kurus: number; status: string }[];
    package: CommerceBookPackage | null;
  }>('books.seed_lgs8_vip', fields ?? {});

export const caSeedLgs8ParafIq = (fields?: { contact_phone?: string; price_kurus?: number; stock_quantity?: number }) =>
  post<{
    vendor: CommerceVendor;
    vendor_created: boolean;
    book: { id: string; title: string; isbn: string | null; slug: string; offer_id: string; price_kurus: number; status: string };
    offer: CommerceVendorOffer | null;
  }>('books.seed_lgs8_paraf_iq', fields ?? {});

export const caSeedLgs8DenemeKulubu = (fields?: { contact_phone?: string; price_kurus?: number; stock_quantity?: number }) =>
  post<{
    vendor: CommerceVendor;
    vendor_created: boolean;
    book: { id: string; title: string; isbn: string | null; slug: string; offer_id: string; price_kurus: number; status: string };
    offer: CommerceVendorOffer | null;
  }>('books.seed_lgs8_deneme_kulubu', fields ?? {});

export const caEnsureYankiVendor = (fields?: { contact_phone?: string; institution_id?: string }) =>
  post<{ vendor: CommerceVendor; created: boolean }>('vendors.ensure_yanki', fields ?? {});

export const caSyncVendorOrderTemplate = () =>
  post<{
    template: {
      name?: string;
      language?: string;
      is_active?: boolean;
      channel?: string;
      meta_configured?: boolean;
    };
  }>('orders.sync_whatsapp_template', {});

// ── Teklifler & Onay ─────────────────────────────
export type OfferListParams = { status?: string; vendor_id?: string; book_id?: string; limit?: number };
export const caListOffers = (params?: OfferListParams) => post<{ offers: CommerceVendorOffer[] }>('offers.list', params ?? {});
export const caGetOffer = (id: string) => post<{ offer: CommerceVendorOffer }>('offers.get', { id });
export const caApproveOffer = (id: string) => post<{ offer: CommerceVendorOffer }>('offers.approve', { id });
export const caRejectOffer = (id: string, reason: string) => post<{ offer: CommerceVendorOffer }>('offers.reject', { id, reason });
export const caRequestCorrection = (id: string, notes: string) => post<{ offer: CommerceVendorOffer }>('offers.request_correction', { id, notes });
export const caSetOfferInactive = (id: string) => post<{ offer: CommerceVendorOffer }>('offers.inactive', { id });
export const caUpdateOfferFlags = (id: string, flags: { is_featured?: boolean; is_bestseller?: boolean; is_new_arrival?: boolean; teacher_recommended?: boolean; required_for_classes?: string[]; price_kurus?: number; stock_quantity?: number; shipping_days?: number; status?: string }) =>
  post<{ offer: CommerceVendorOffer }>('offers.update', { id, ...flags });

// ── Siparişler ────────────────────────────────────
export type OrderListParams = { status?: string; student_id?: string; search?: string; limit?: number; offset?: number };
export const caListOrders = (params?: OrderListParams) => post<{ orders: CommerceOrder[] }>('orders.list', params ?? {});
export const caGetOrder = (id: string) => post<{ order: CommerceOrder }>('orders.get', { id });
export const caUpdateOrderStatus = (id: string, status: string, notes?: string) =>
  post<{ order: CommerceOrder }>('orders.update_status', { id, status, notes });
export const caUpdateOrder = (
  id: string,
  fields: {
    customer_name?: string | null;
    customer_email?: string | null;
    customer_phone?: string | null;
    notes?: string | null;
    status?: string;
  }
) => post<{ order: CommerceOrder }>('orders.update', { id, ...fields });
export const caDeleteOrder = (id: string) => post<{ deleted: boolean; order_number?: string }>('orders.delete', { id });

export type KitapFormImportResult = {
  ok: boolean;
  deployMarker?: string;
  since: string;
  dry_run: boolean;
  vendor: { id: string; name: string; slug: string };
  repair?: { repaired: number; skipped_ok: number; failed: number; errors: Array<{ order_id: string; form_id: string; error: string }> } | null;
  scanned: number;
  skipped_already_imported: number;
  imported: number;
  failed: number;
  items: Array<Record<string, unknown>>;
  errors: Array<{ form_id: string; ogrenci?: string; error: string }>;
};

export const caImportKitapFormOrders = (params?: { since?: string; dry_run?: boolean; limit?: number; repair?: boolean }) =>
  post<KitapFormImportResult>('orders.import_kitap_form', params ?? {});

export type PushToYankiResult = {
  ok: boolean;
  deployMarker?: string;
  query?: string | null;
  vendor: { id: string; name: string; slug: string };
  commerce: {
    scanned: number;
    pushed: number;
    failed: number;
    items: Array<Record<string, unknown>>;
  };
  form?: Record<string, unknown> | null;
};

export const caPushPaidToYanki = (params: { query?: string; order_id?: string; dry_run?: boolean; since?: string }) =>
  post<PushToYankiResult>('orders.push_to_yanki', params);

export type AssignVendorResult = {
  ok: boolean;
  deployMarker?: string;
  order_id: string;
  order_number?: string;
  customer_name?: string | null;
  vendor: { id: string; name: string; slug?: string };
  vendor_order_id?: string;
  item_count?: number;
  whatsapp?: { ok?: boolean; reason?: string; error?: string } | null;
  actions?: string[];
};

export const caAssignOrderToVendor = (params: {
  order_id?: string;
  form_order_id?: string;
  vendor_id?: string;
  kitapci_id?: string;
  notify_wa?: boolean;
}) => post<AssignVendorResult>('orders.assign_vendor', params);

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
export const caGetSettings = () => post<{ settings: CommerceSettings; store_browse?: StoreBrowseNav }>('settings.get');
export const caUpdateSettings = (fields: Partial<CommerceSettings> & { store_browse?: StoreBrowseNav | null }) =>
  post<{ settings: CommerceSettings; store_browse?: StoreBrowseNav }>('settings.update', fields);

// ── Raporlar ─────────────────────────────────────
export const caReportSales = (from_date?: string, to_date?: string) =>
  post<{ orders: CommerceOrder[]; total_kurus: number; count: number }>('reports.sales', { from_date, to_date });
export const caReportLowStock = () =>
  post<{ offers: CommerceVendorOffer[] }>('reports.low_stock');
export const caReportVendors = () =>
  post<{ vendor_orders: CommerceVendorOrder[] }>('reports.vendors');
