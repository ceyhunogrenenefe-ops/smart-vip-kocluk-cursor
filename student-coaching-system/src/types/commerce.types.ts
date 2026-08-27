/**
 * Kitap Mağazası / Kitap Pazaryeri — veritabanı ve API tipleri
 * Tablolar: commerce_* (Supabase migration 2026-08-19)
 */

/** Ticari model: reseller = OVD satış/k tahsilat; marketplace = gelecek faz */
export type CommerceMode = 'reseller' | 'marketplace';

export type CommerceVendorUserRole = 'admin' | 'staff';

export type CommerceOfferStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'inactive'
  | 'correction_requested';

export type CommerceAssignmentType = 'required' | 'recommended' | 'optional';

export type CommerceAssignmentSource =
  | 'teacher'
  | 'coach'
  | 'admin'
  | 'purchase'
  | 'system'
  | 'parent';

export type CommerceAssignmentStatus =
  | 'assigned'
  | 'purchased'
  | 'owned'
  | 'declined';

export type CommerceOrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'confirmed'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'payment_failed'
  | 'cancelled'
  | 'refund_requested'
  | 'partially_refunded'
  | 'refunded';

export type CommerceVendorOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refund_requested'
  | 'refunded';

export type CommercePaymentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export type CommerceShipmentStatus =
  | 'pending'
  | 'shipped'
  | 'in_transit'
  | 'delivered'
  | 'returned'
  | 'cancelled';

export type CommerceRefundStatus = 'pending' | 'approved' | 'rejected' | 'processed';

export type CommercePayoutStatus = 'pending' | 'approved' | 'paid' | 'cancelled';

export type CommerceCouponDiscountType = 'percent' | 'fixed';

export type CommerceAddressType = 'shipping' | 'billing';

/** ISO timestamp alanları */
export interface CommerceTimestamps {
  created_at: string;
  updated_at: string;
}

export interface CommerceVendor extends CommerceTimestamps {
  id: string;
  institution_id: string | null;
  linked_kitapci_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  district: string | null;
  city: string | null;
  postal_code: string | null;
  commission_rate: number;
  payout_iban: string | null;
  payout_notes: string | null;
  is_active: boolean;
  meta: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface CommerceVendorUser extends CommerceTimestamps {
  id: string;
  vendor_id: string;
  user_id: string;
  role: CommerceVendorUserRole;
  is_active: boolean;
  created_by: string | null;
  deleted_at: string | null;
}

export interface CommerceBook extends CommerceTimestamps {
  id: string;
  isbn: string | null;
  slug: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  publisher: string | null;
  subject: string | null;
  class_levels: string[];
  exam_types: string[];
  description: string | null;
  page_count: number | null;
  language: string;
  cover_image_url: string | null;
  is_catalog_active: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface CommerceVendorOffer extends CommerceTimestamps {
  id: string;
  vendor_id: string;
  book_id: string;
  price_kurus: number;
  compare_at_price_kurus: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  shipping_days: number;
  status: CommerceOfferStatus;
  rejection_reason: string | null;
  correction_notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  visibility_scope: Record<string, unknown>;
  is_featured: boolean;
  is_bestseller: boolean;
  is_new_arrival: boolean;
  teacher_recommended: boolean;
  required_for_classes: string[];
  pending_snapshot: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  /** Liste API join */
  book?: CommerceBook | null;
  vendor?: CommerceVendor | null;
}

export interface CommerceBookPackage extends CommerceTimestamps {
  id: string;
  institution_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  class_level: string | null;
  program: string | null;
  price_kurus: number;
  compare_at_price_kurus: number | null;
  is_active: boolean;
  visibility: Record<string, unknown>;
  cover_image_url: string | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  items?: CommerceBookPackageItem[];
}

export interface CommerceBookPackageItem {
  id: string;
  package_id: string;
  book_id: string;
  vendor_offer_id: string | null;
  quantity: number;
  is_required: boolean;
  sort_order: number;
  created_at: string;
  book?: CommerceBook | null;
  offer?: CommerceVendorOffer | null;
}

export interface CommerceStudentBookAssignment extends CommerceTimestamps {
  id: string;
  institution_id: string;
  student_id: string;
  book_id: string;
  vendor_offer_id: string | null;
  assignment_type: CommerceAssignmentType;
  assigned_by: string | null;
  source: CommerceAssignmentSource;
  status: CommerceAssignmentStatus;
  order_item_id: string | null;
  notes: string | null;
  due_date: string | null;
  deleted_at: string | null;
  book?: CommerceBook | null;
}

export interface CommerceCart {
  id: string;
  user_id: string | null;
  institution_id: string | null;
  student_id: string | null;
  session_token: string | null;
  abandoned_notified_at: string | null;
  created_at: string;
  updated_at: string;
  items?: CommerceCartItem[];
}

export interface CommerceCartItem {
  id: string;
  cart_id: string;
  vendor_offer_id: string | null;
  package_id: string | null;
  quantity: number;
  price_kurus_snapshot: number;
  title_snapshot: string | null;
  created_at: string;
  updated_at: string;
  offer?: CommerceVendorOffer | null;
  package?: CommerceBookPackage | null;
}

export interface CommerceOrder extends CommerceTimestamps {
  id: string;
  order_number: string;
  institution_id: string | null;
  user_id: string | null;
  student_id: string | null;
  status: CommerceOrderStatus;
  commerce_mode: CommerceMode;
  subtotal_kurus: number;
  discount_kurus: number;
  shipping_kurus: number;
  total_kurus: number;
  currency: string;
  coupon_id: string | null;
  coupon_code: string | null;
  payment_status: CommercePaymentStatus;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  notes: string | null;
  ip_address: string | null;
  user_agent: string | null;
  garanti_order_id: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  items?: CommerceOrderItem[];
  vendor_orders?: CommerceVendorOrder[];
  addresses?: CommerceOrderAddress[];
}

export interface CommerceVendorOrder extends CommerceTimestamps {
  id: string;
  order_id: string;
  vendor_id: string;
  status: CommerceVendorOrderStatus;
  subtotal_kurus: number;
  commission_kurus: number;
  vendor_net_kurus: number;
  shipping_kurus: number;
  accepted_at: string | null;
  prepared_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  vendor_notes: string | null;
  vendor?: CommerceVendor | null;
  shipments?: CommerceShipment[];
}

export interface CommerceOrderItem {
  id: string;
  order_id: string;
  vendor_order_id: string | null;
  vendor_offer_id: string | null;
  book_id: string;
  package_id: string | null;
  vendor_id: string;
  title_snapshot: string;
  isbn_snapshot: string | null;
  quantity: number;
  unit_price_kurus: number;
  compare_at_price_kurus: number | null;
  line_total_kurus: number;
  created_at: string;
}

export interface CommerceOrderAddress {
  id: string;
  order_id: string;
  address_type: CommerceAddressType;
  full_name: string;
  phone: string | null;
  address_line1: string;
  address_line2: string | null;
  district: string | null;
  city: string;
  postal_code: string | null;
  country: string;
  created_at: string;
}

export interface CommercePayment {
  id: string;
  order_id: string;
  provider: string;
  provider_order_id: string | null;
  garanti_payment_order_id: string | null;
  amount_kurus: number;
  status: CommercePaymentStatus;
  installment: number | null;
  raw_response: Record<string, unknown> | null;
  idempotency_key: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommerceShipment extends CommerceTimestamps {
  id: string;
  vendor_order_id: string;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  status: CommerceShipmentStatus;
  shipped_at: string | null;
  delivered_at: string | null;
  notes: string | null;
}

export interface CommerceRefundRequest extends CommerceTimestamps {
  id: string;
  order_id: string;
  order_item_id: string | null;
  vendor_order_id: string | null;
  requested_by: string | null;
  reason: string;
  status: CommerceRefundStatus;
  amount_kurus: number;
  processed_by: string | null;
  processed_at: string | null;
  notes: string | null;
}

export interface CommerceVendorPayout extends CommerceTimestamps {
  id: string;
  vendor_id: string;
  period_start: string;
  period_end: string;
  gross_sales_kurus: number;
  commission_kurus: number;
  refunds_kurus: number;
  adjustments_kurus: number;
  net_payout_kurus: number;
  status: CommercePayoutStatus;
  paid_at: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
}

export interface CommerceCoupon extends CommerceTimestamps {
  id: string;
  institution_id: string | null;
  code: string;
  description: string | null;
  discount_type: CommerceCouponDiscountType;
  discount_value: number;
  max_discount_kurus: number | null;
  min_order_kurus: number;
  usage_limit: number | null;
  usage_count: number;
  per_user_limit: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  applicable_vendor_ids: string[];
  applicable_book_ids: string[];
  created_by: string | null;
  deleted_at: string | null;
}

export interface CommerceCouponUsage {
  id: string;
  coupon_id: string;
  order_id: string;
  user_id: string | null;
  discount_kurus: number;
  created_at: string;
}

export interface CommerceSettings {
  id: string;
  institution_id: string | null;
  commerce_mode: CommerceMode;
  default_commission_rate: number;
  free_shipping_threshold_kurus: number;
  default_shipping_kurus: number;
  order_number_prefix: string;
  public_store_enabled: boolean;
  student_store_enabled: boolean;
  payment_sandbox: boolean;
  abandoned_cart_hours: number;
  meta: Record<string, unknown>;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Süper admin mağaza menüsü: sınıf kutuları */
export interface StoreBrowseClass {
  key: string;
  label: string;
  sort: number;
  active?: boolean;
  category_count?: number;
  book_count?: number;
}

/** Süper admin mağaza menüsü: sınıf altındaki kitap kategorileri */
export interface StoreBrowseCategory {
  key: string;
  label: string;
  class_keys: string[];
  series: string;
  description: string;
  sort: number;
  active?: boolean;
  book_count?: number;
  priced_count?: number;
}

export interface StoreBrowseNav {
  classes: StoreBrowseClass[];
  categories: StoreBrowseCategory[];
}

export interface CommerceAuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string | null;
  vendor_id: string | null;
  institution_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

/** TRY kuruş → görüntüleme (₺1.234,56) */
export function formatCommerceTry(kurus: number): string {
  const n = Number(kurus);
  if (!Number.isFinite(n)) return '₺0,00';
  const lira = n / 100;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(lira);
}

/** Lira (ondalık) → kuruş */
export function liraToKurus(lira: number): number {
  return Math.round(Number(lira) * 100);
}

/** Onay bekleyen teklif diff (Süper Admin UI) */
export interface CommerceOfferApprovalDiff {
  field: string;
  label: string;
  old_value: unknown;
  new_value: unknown;
}

export const COMMERCE_OFFER_STATUS_LABELS: Record<CommerceOfferStatus, string> = {
  draft: 'Taslak',
  pending_approval: 'Onay Bekliyor',
  approved: 'Yayında',
  rejected: 'Reddedildi',
  inactive: 'Satışta Değil',
  correction_requested: 'Düzeltme İstendi',
};

export const COMMERCE_ORDER_STATUS_LABELS: Record<CommerceOrderStatus, string> = {
  pending_payment: 'Ödeme Bekliyor',
  paid: 'Ödendi',
  confirmed: 'Onaylandı',
  preparing: 'Hazırlanıyor',
  shipped: 'Kargoda',
  delivered: 'Teslim Edildi',
  payment_failed: 'Ödeme Başarısız',
  cancelled: 'İptal',
  refund_requested: 'İade Talebi',
  partially_refunded: 'Kısmi İade',
  refunded: 'İade Edildi',
};

export const COMMERCE_STORAGE_BUCKETS = {
  bookCovers: 'commerce-book-covers',
  vendorAssets: 'commerce-vendor-assets',
} as const;
