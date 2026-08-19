-- Kitap Mağazası / Kitap Pazaryeri (commerce_*)
-- Aşama 2: tablolar, indeksler, RPC, RLS
-- Supabase SQL Editor'da bir kez çalıştırın.

-- =============================================================================
-- 1) Satıcılar (kitapçılar)
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NULL REFERENCES institutions(id) ON DELETE SET NULL,
  linked_kitapci_id uuid NULL REFERENCES kitapcilar(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text NULL,
  logo_url text NULL,
  contact_email text NULL,
  contact_phone text NULL,
  address_line1 text NULL,
  address_line2 text NULL,
  district text NULL,
  city text NULL,
  postal_code text NULL,
  commission_rate numeric(5,2) NOT NULL DEFAULT 15.00
    CHECK (commission_rate >= 0 AND commission_rate <= 100),
  payout_iban text NULL,
  payout_notes text NULL,
  is_active boolean NOT NULL DEFAULT true,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT commerce_vendors_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_commerce_vendors_institution
  ON commerce_vendors (institution_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_vendors_active
  ON commerce_vendors (is_active, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_vendors_kitapci
  ON commerce_vendors (linked_kitapci_id) WHERE linked_kitapci_id IS NOT NULL;

-- =============================================================================
-- 2) Satıcı panel kullanıcıları (vendor_admin)
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_vendor_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES commerce_vendors(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin'
    CHECK (role IN ('admin', 'staff')),
  is_active boolean NOT NULL DEFAULT true,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT commerce_vendor_users_unique UNIQUE (vendor_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_commerce_vendor_users_user
  ON commerce_vendor_users (user_id) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_commerce_vendor_users_vendor
  ON commerce_vendor_users (vendor_id) WHERE deleted_at IS NULL;

-- Yardımcı: kullanıcının vendor_admin vendor id listesi (gelecek RLS / API)
CREATE OR REPLACE FUNCTION commerce_vendor_ids_for_user(p_user_id text)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(vu.vendor_id) FILTER (WHERE vu.vendor_id IS NOT NULL),
    '{}'::uuid[]
  )
  FROM commerce_vendor_users vu
  WHERE vu.user_id = p_user_id
    AND vu.is_active = true
    AND vu.deleted_at IS NULL;
$$;

-- =============================================================================
-- 3) Merkezi kitap kataloğu (ISBN benzersiz)
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn text NULL,
  slug text NOT NULL,
  title text NOT NULL,
  subtitle text NULL,
  author text NULL,
  publisher text NULL,
  subject text NULL,
  class_levels jsonb NOT NULL DEFAULT '[]'::jsonb,
  exam_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text NULL,
  page_count int NULL CHECK (page_count IS NULL OR page_count > 0),
  language text NOT NULL DEFAULT 'tr',
  cover_image_url text NULL,
  is_catalog_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT commerce_books_slug_unique UNIQUE (slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_books_isbn
  ON commerce_books (isbn) WHERE isbn IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_commerce_books_title
  ON commerce_books (lower(title)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_books_publisher
  ON commerce_books (publisher) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_books_created
  ON commerce_books (created_at DESC) WHERE deleted_at IS NULL;

-- =============================================================================
-- 4) Satıcı teklifleri (vendor + book → tek aktif teklif)
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_vendor_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES commerce_vendors(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES commerce_books(id) ON DELETE CASCADE,
  price_kurus integer NOT NULL CHECK (price_kurus >= 0),
  compare_at_price_kurus integer NULL CHECK (compare_at_price_kurus IS NULL OR compare_at_price_kurus >= 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  shipping_days integer NOT NULL DEFAULT 3 CHECK (shipping_days >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'pending_approval', 'approved', 'rejected', 'inactive', 'correction_requested'
    )),
  rejection_reason text NULL,
  correction_notes text NULL,
  submitted_at timestamptz NULL,
  approved_at timestamptz NULL,
  approved_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  visibility_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_featured boolean NOT NULL DEFAULT false,
  is_bestseller boolean NOT NULL DEFAULT false,
  is_new_arrival boolean NOT NULL DEFAULT false,
  teacher_recommended boolean NOT NULL DEFAULT false,
  required_for_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_snapshot jsonb NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT commerce_vendor_offers_vendor_book_unique UNIQUE (vendor_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_commerce_offers_vendor
  ON commerce_vendor_offers (vendor_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_offers_book
  ON commerce_vendor_offers (book_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_offers_status
  ON commerce_vendor_offers (status, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_offers_pending
  ON commerce_vendor_offers (submitted_at DESC)
  WHERE deleted_at IS NULL AND status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_commerce_offers_approved_list
  ON commerce_vendor_offers (is_featured, is_bestseller, is_new_arrival)
  WHERE deleted_at IS NULL AND status = 'approved';

-- =============================================================================
-- 5) Kitap paketleri
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_book_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NULL REFERENCES institutions(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text NULL,
  class_level text NULL,
  program text NULL,
  price_kurus integer NOT NULL CHECK (price_kurus >= 0),
  compare_at_price_kurus integer NULL CHECK (compare_at_price_kurus IS NULL OR compare_at_price_kurus >= 0),
  is_active boolean NOT NULL DEFAULT false,
  visibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  cover_image_url text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT commerce_book_packages_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_commerce_packages_institution
  ON commerce_book_packages (institution_id, is_active) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS commerce_book_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES commerce_book_packages(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES commerce_books(id) ON DELETE RESTRICT,
  vendor_offer_id uuid NULL REFERENCES commerce_vendor_offers(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_package_items_unique UNIQUE (package_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_commerce_package_items_package
  ON commerce_book_package_items (package_id, sort_order);

-- =============================================================================
-- 6) Öğrenci kitap atamaları (zorunlu / önerilen / satın alınan)
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_student_book_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES commerce_books(id) ON DELETE RESTRICT,
  vendor_offer_id uuid NULL REFERENCES commerce_vendor_offers(id) ON DELETE SET NULL,
  assignment_type text NOT NULL DEFAULT 'recommended'
    CHECK (assignment_type IN ('required', 'recommended', 'optional')),
  assigned_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'system'
    CHECK (source IN ('teacher', 'coach', 'admin', 'purchase', 'system', 'parent')),
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'purchased', 'owned', 'declined')),
  order_item_id uuid NULL,
  notes text NULL,
  due_date date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_student_book_active
  ON commerce_student_book_assignments (student_id, book_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_commerce_student_assignments_student
  ON commerce_student_book_assignments (student_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_student_assignments_institution
  ON commerce_student_book_assignments (institution_id, assignment_type) WHERE deleted_at IS NULL;

-- =============================================================================
-- 7) Sepet
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  institution_id text NULL REFERENCES institutions(id) ON DELETE SET NULL,
  student_id text NULL REFERENCES students(id) ON DELETE SET NULL,
  session_token text NULL,
  abandoned_notified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_carts_user
  ON commerce_carts (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_carts_session
  ON commerce_carts (session_token) WHERE session_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS commerce_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES commerce_carts(id) ON DELETE CASCADE,
  vendor_offer_id uuid NULL REFERENCES commerce_vendor_offers(id) ON DELETE SET NULL,
  package_id uuid NULL REFERENCES commerce_book_packages(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price_kurus_snapshot integer NOT NULL CHECK (price_kurus_snapshot >= 0),
  title_snapshot text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_cart_items_offer_or_package
    CHECK (vendor_offer_id IS NOT NULL OR package_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_cart_items_offer
  ON commerce_cart_items (cart_id, vendor_offer_id) WHERE vendor_offer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_cart_items_package
  ON commerce_cart_items (cart_id, package_id) WHERE package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commerce_cart_items_cart
  ON commerce_cart_items (cart_id);

-- =============================================================================
-- 8) Sipariş numarası sayaç
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_order_number_counters (
  prefix text NOT NULL,
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year)
);

CREATE OR REPLACE FUNCTION commerce_next_order_number(p_prefix text DEFAULT 'VIP-KTP')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_next integer;
  v_prefix text := upper(trim(coalesce(p_prefix, 'VIP-KTP')));
BEGIN
  INSERT INTO commerce_order_number_counters (prefix, year, last_value)
  VALUES (v_prefix, v_year, 1)
  ON CONFLICT (prefix, year)
  DO UPDATE SET last_value = commerce_order_number_counters.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 6, '0');
END;
$$;

-- =============================================================================
-- 9) Siparişler
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  institution_id text NULL REFERENCES institutions(id) ON DELETE SET NULL,
  user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  student_id text NULL REFERENCES students(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN (
      'pending_payment', 'paid', 'confirmed', 'preparing', 'shipped', 'delivered',
      'payment_failed', 'cancelled', 'refund_requested', 'partially_refunded', 'refunded'
    )),
  commerce_mode text NOT NULL DEFAULT 'reseller'
    CHECK (commerce_mode IN ('reseller', 'marketplace')),
  subtotal_kurus integer NOT NULL DEFAULT 0 CHECK (subtotal_kurus >= 0),
  discount_kurus integer NOT NULL DEFAULT 0 CHECK (discount_kurus >= 0),
  shipping_kurus integer NOT NULL DEFAULT 0 CHECK (shipping_kurus >= 0),
  total_kurus integer NOT NULL DEFAULT 0 CHECK (total_kurus >= 0),
  currency text NOT NULL DEFAULT 'TRY',
  coupon_id uuid NULL,
  coupon_code text NULL,
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded', 'partially_refunded')),
  customer_name text NULL,
  customer_email text NULL,
  customer_phone text NULL,
  notes text NULL,
  ip_address text NULL,
  user_agent text NULL,
  garanti_order_id text NULL,
  paid_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_orders_order_number_unique UNIQUE (order_number)
);

CREATE INDEX IF NOT EXISTS idx_commerce_orders_user
  ON commerce_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_student
  ON commerce_orders (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_status
  ON commerce_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_institution
  ON commerce_orders (institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_garanti
  ON commerce_orders (garanti_order_id) WHERE garanti_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS commerce_vendor_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES commerce_vendors(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'confirmed', 'preparing', 'shipped', 'delivered',
      'cancelled', 'refund_requested', 'refunded'
    )),
  subtotal_kurus integer NOT NULL DEFAULT 0 CHECK (subtotal_kurus >= 0),
  commission_kurus integer NOT NULL DEFAULT 0 CHECK (commission_kurus >= 0),
  vendor_net_kurus integer NOT NULL DEFAULT 0 CHECK (vendor_net_kurus >= 0),
  shipping_kurus integer NOT NULL DEFAULT 0 CHECK (shipping_kurus >= 0),
  accepted_at timestamptz NULL,
  prepared_at timestamptz NULL,
  shipped_at timestamptz NULL,
  delivered_at timestamptz NULL,
  vendor_notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerce_vendor_orders_order
  ON commerce_vendor_orders (order_id);
CREATE INDEX IF NOT EXISTS idx_commerce_vendor_orders_vendor
  ON commerce_vendor_orders (vendor_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  vendor_order_id uuid NULL REFERENCES commerce_vendor_orders(id) ON DELETE SET NULL,
  vendor_offer_id uuid NULL REFERENCES commerce_vendor_offers(id) ON DELETE SET NULL,
  book_id uuid NOT NULL REFERENCES commerce_books(id) ON DELETE RESTRICT,
  package_id uuid NULL REFERENCES commerce_book_packages(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES commerce_vendors(id) ON DELETE RESTRICT,
  title_snapshot text NOT NULL,
  isbn_snapshot text NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_kurus integer NOT NULL CHECK (unit_price_kurus >= 0),
  compare_at_price_kurus integer NULL CHECK (compare_at_price_kurus IS NULL OR compare_at_price_kurus >= 0),
  line_total_kurus integer NOT NULL CHECK (line_total_kurus >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerce_order_items_order
  ON commerce_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_commerce_order_items_vendor_order
  ON commerce_order_items (vendor_order_id);
CREATE INDEX IF NOT EXISTS idx_commerce_order_items_book
  ON commerce_order_items (book_id);

-- FK: student assignments → order items (tablo oluştuktan sonra)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commerce_student_assignments_order_item_fk'
  ) THEN
    ALTER TABLE commerce_student_book_assignments
      ADD CONSTRAINT commerce_student_assignments_order_item_fk
      FOREIGN KEY (order_item_id) REFERENCES commerce_order_items(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS commerce_order_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  address_type text NOT NULL DEFAULT 'shipping'
    CHECK (address_type IN ('shipping', 'billing')),
  full_name text NOT NULL,
  phone text NULL,
  address_line1 text NOT NULL,
  address_line2 text NULL,
  district text NULL,
  city text NOT NULL,
  postal_code text NULL,
  country text NOT NULL DEFAULT 'TR',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerce_order_addresses_order
  ON commerce_order_addresses (order_id);

-- =============================================================================
-- 10) Ödemeler
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'garanti',
  provider_order_id text NULL,
  garanti_payment_order_id uuid NULL REFERENCES garanti_payment_orders(id) ON DELETE SET NULL,
  amount_kurus integer NOT NULL CHECK (amount_kurus > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'refunded', 'partially_refunded')),
  installment integer NULL CHECK (installment IS NULL OR installment BETWEEN 0 AND 12),
  raw_response jsonb NULL,
  idempotency_key text NULL,
  paid_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_payments_idempotency
  ON commerce_payments (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commerce_payments_order
  ON commerce_payments (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_payments_provider
  ON commerce_payments (provider, provider_order_id);

-- =============================================================================
-- 11) Kargo / sevkiyat
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_order_id uuid NOT NULL REFERENCES commerce_vendor_orders(id) ON DELETE CASCADE,
  carrier text NULL,
  tracking_number text NULL,
  tracking_url text NULL,
  invoice_number text NULL,
  invoice_url text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'shipped', 'in_transit', 'delivered', 'returned', 'cancelled')),
  shipped_at timestamptz NULL,
  delivered_at timestamptz NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerce_shipments_vendor_order
  ON commerce_shipments (vendor_order_id);
CREATE INDEX IF NOT EXISTS idx_commerce_shipments_tracking
  ON commerce_shipments (tracking_number) WHERE tracking_number IS NOT NULL;

-- =============================================================================
-- 12) İade talepleri
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  order_item_id uuid NULL REFERENCES commerce_order_items(id) ON DELETE SET NULL,
  vendor_order_id uuid NULL REFERENCES commerce_vendor_orders(id) ON DELETE SET NULL,
  requested_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
  amount_kurus integer NOT NULL DEFAULT 0 CHECK (amount_kurus >= 0),
  processed_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  processed_at timestamptz NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerce_refunds_order
  ON commerce_refund_requests (order_id, status);

-- =============================================================================
-- 13) Satıcı hakediş / ödemeleri
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_vendor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES commerce_vendors(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_sales_kurus integer NOT NULL DEFAULT 0 CHECK (gross_sales_kurus >= 0),
  commission_kurus integer NOT NULL DEFAULT 0 CHECK (commission_kurus >= 0),
  refunds_kurus integer NOT NULL DEFAULT 0 CHECK (refunds_kurus >= 0),
  adjustments_kurus integer NOT NULL DEFAULT 0,
  net_payout_kurus integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  paid_at timestamptz NULL,
  payment_reference text NULL,
  notes text NULL,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerce_payouts_vendor
  ON commerce_vendor_payouts (vendor_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_payouts_status
  ON commerce_vendor_payouts (status, created_at DESC);

-- =============================================================================
-- 14) Kuponlar
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NULL REFERENCES institutions(id) ON DELETE SET NULL,
  code text NOT NULL,
  description text NULL,
  discount_type text NOT NULL
    CHECK (discount_type IN ('percent', 'fixed')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  max_discount_kurus integer NULL CHECK (max_discount_kurus IS NULL OR max_discount_kurus >= 0),
  min_order_kurus integer NOT NULL DEFAULT 0 CHECK (min_order_kurus >= 0),
  usage_limit integer NULL CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  is_active boolean NOT NULL DEFAULT true,
  applicable_vendor_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicable_book_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT commerce_coupons_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_commerce_coupons_active
  ON commerce_coupons (is_active, starts_at, ends_at) WHERE deleted_at IS NULL;

-- FK: orders.coupon_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commerce_orders_coupon_fk'
  ) THEN
    ALTER TABLE commerce_orders
      ADD CONSTRAINT commerce_orders_coupon_fk
      FOREIGN KEY (coupon_id) REFERENCES commerce_coupons(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS commerce_coupon_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES commerce_coupons(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  discount_kurus integer NOT NULL CHECK (discount_kurus >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_coupon_usages_unique UNIQUE (coupon_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_commerce_coupon_usages_user
  ON commerce_coupon_usages (coupon_id, user_id);

-- =============================================================================
-- 15) Mağaza ayarları (commerce_mode: reseller | marketplace)
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NULL REFERENCES institutions(id) ON DELETE CASCADE,
  commerce_mode text NOT NULL DEFAULT 'reseller'
    CHECK (commerce_mode IN ('reseller', 'marketplace')),
  default_commission_rate numeric(5,2) NOT NULL DEFAULT 15.00
    CHECK (default_commission_rate >= 0 AND default_commission_rate <= 100),
  free_shipping_threshold_kurus integer NOT NULL DEFAULT 0 CHECK (free_shipping_threshold_kurus >= 0),
  default_shipping_kurus integer NOT NULL DEFAULT 0 CHECK (default_shipping_kurus >= 0),
  order_number_prefix text NOT NULL DEFAULT 'VIP-KTP',
  public_store_enabled boolean NOT NULL DEFAULT true,
  student_store_enabled boolean NOT NULL DEFAULT true,
  payment_sandbox boolean NOT NULL DEFAULT false,
  abandoned_cart_hours integer NOT NULL DEFAULT 72 CHECK (abandoned_cart_hours > 0),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_settings_institution
  ON commerce_settings (institution_id) WHERE institution_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_settings_global
  ON commerce_settings ((institution_id IS NULL)) WHERE institution_id IS NULL;

-- Varsayılan global ayar (reseller modeli)
INSERT INTO commerce_settings (
  institution_id,
  commerce_mode,
  default_commission_rate,
  free_shipping_threshold_kurus,
  default_shipping_kurus,
  order_number_prefix
)
SELECT NULL, 'reseller', 15.00, 50000, 9900, 'VIP-KTP'
WHERE NOT EXISTS (
  SELECT 1 FROM commerce_settings WHERE institution_id IS NULL
);

-- =============================================================================
-- 16) Denetim günlüğü
-- =============================================================================
CREATE TABLE IF NOT EXISTS commerce_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  vendor_id uuid NULL REFERENCES commerce_vendors(id) ON DELETE SET NULL,
  institution_id text NULL REFERENCES institutions(id) ON DELETE SET NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  ip_address text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerce_audit_entity
  ON commerce_audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_audit_vendor
  ON commerce_audit_logs (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_audit_institution
  ON commerce_audit_logs (institution_id, created_at DESC);

-- =============================================================================
-- 17) Kitap Takibi (book_readings) entegrasyonu
-- =============================================================================
ALTER TABLE book_readings
  ADD COLUMN IF NOT EXISTS commerce_book_id uuid NULL REFERENCES commerce_books(id) ON DELETE SET NULL;

ALTER TABLE book_readings
  ADD COLUMN IF NOT EXISTS commerce_order_item_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'book_readings_commerce_order_item_fk'
  ) THEN
    ALTER TABLE book_readings
      ADD CONSTRAINT book_readings_commerce_order_item_fk
      FOREIGN KEY (commerce_order_item_id) REFERENCES commerce_order_items(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_book_readings_commerce_book
  ON book_readings (commerce_book_id) WHERE commerce_book_id IS NOT NULL;

-- =============================================================================
-- 18) Row Level Security — API service role üzerinden; doğrudan istemci erişimi kapalı
-- =============================================================================
ALTER TABLE commerce_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_vendor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_vendor_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_book_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_book_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_student_book_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_vendor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_order_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_vendor_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_coupon_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_order_number_counters ENABLE ROW LEVEL SECURITY;

DO $rls$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'commerce_vendors', 'commerce_vendor_users', 'commerce_books', 'commerce_vendor_offers',
      'commerce_book_packages', 'commerce_book_package_items', 'commerce_student_book_assignments',
      'commerce_carts', 'commerce_cart_items', 'commerce_orders', 'commerce_vendor_orders',
      'commerce_order_items', 'commerce_order_addresses', 'commerce_payments', 'commerce_shipments',
      'commerce_refund_requests', 'commerce_vendor_payouts', 'commerce_coupons',
      'commerce_coupon_usages', 'commerce_settings', 'commerce_audit_logs',
      'commerce_order_number_counters'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS commerce_%I_deny_anon ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY commerce_%I_deny_anon ON %I FOR ALL TO anon USING (false)',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS commerce_%I_deny_auth ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY commerce_%I_deny_auth ON %I FOR ALL TO authenticated USING (false)',
      t, t
    );
  END LOOP;
END
$rls$;

COMMENT ON TABLE commerce_vendors IS 'Kitap mağazası satıcıları (kitapçılar)';
COMMENT ON TABLE commerce_books IS 'Merkezi kitap kataloğu; ISBN benzersiz';
COMMENT ON TABLE commerce_vendor_offers IS 'Satıcı teklifleri; Süper Admin onayı sonrası yayında';
COMMENT ON TABLE commerce_orders IS 'Müşteri siparişleri; VIP-KTP-YYYY-000001 formatı';
COMMENT ON TABLE commerce_settings IS 'commerce_mode: reseller (varsayılan) | marketplace';

NOTIFY pgrst, 'reload schema';
