/** Kitap Mağazası — ortak sabitler (API + migration ile uyumlu) */

export const COMMERCE_MODES = ['reseller', 'marketplace'];

export const COMMERCE_OFFER_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'inactive',
  'correction_requested',
];

export const COMMERCE_ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'payment_failed',
  'cancelled',
  'refund_requested',
  'partially_refunded',
  'refunded',
];

export const COMMERCE_VENDOR_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
  'refund_requested',
  'refunded',
];

export const COMMERCE_PAYMENT_STATUSES = [
  'pending',
  'processing',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
];

export const COMMERCE_ASSIGNMENT_TYPES = ['required', 'recommended', 'optional'];

export const COMMERCE_ASSIGNMENT_STATUSES = ['assigned', 'purchased', 'owned', 'declined'];

export const COMMERCE_STORAGE_BUCKETS = {
  bookCovers: 'commerce-book-covers',
  vendorAssets: 'commerce-vendor-assets',
};

export const COMMERCE_DEFAULT_SETTINGS = {
  commerce_mode: 'reseller',
  default_commission_rate: 15,
  free_shipping_threshold_kurus: 50000,
  default_shipping_kurus: 9900,
  order_number_prefix: 'VIP-KTP',
  public_store_enabled: true,
  student_store_enabled: true,
  payment_sandbox: false,
  abandoned_cart_hours: 72,
};
