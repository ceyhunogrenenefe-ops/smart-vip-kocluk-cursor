-- CRM: onlinevipdershane.com ve mağaza siparişlerinin tek görünümü
-- Supabase SQL Editor'de bir kez çalıştırın (veya /api/setup-crm-website-orders-schema).

CREATE TABLE IF NOT EXISTS public.crm_website_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  source_id text NOT NULL,
  order_number text NULL,
  customer_name text NULL,
  customer_phone text NULL,
  customer_email text NULL,
  address_line1 text NULL,
  address_line2 text NULL,
  district text NULL,
  city text NULL,
  address_status text NOT NULL DEFAULT 'not_required'
    CHECK (address_status IN ('complete', 'missing', 'not_required')),
  product_summary text NOT NULL DEFAULT '',
  product_category text NOT NULL DEFAULT 'diger'
    CHECK (product_category IN ('deneme', 'kitap', 'egitim', 'kocluk', 'ozel_ders', 'diger')),
  amount_kurus bigint NULL,
  currency text NOT NULL DEFAULT 'TRY',
  payment_status text NOT NULL DEFAULT 'pending',
  order_status text NOT NULL DEFAULT 'pending',
  payment_provider text NULL,
  requires_shipping boolean NOT NULL DEFAULT false,
  order_placed_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_website_orders_source_unique UNIQUE (source_system, source_id)
);

CREATE INDEX IF NOT EXISTS crm_website_orders_placed_idx
  ON public.crm_website_orders (order_placed_at DESC);

CREATE INDEX IF NOT EXISTS crm_website_orders_payment_idx
  ON public.crm_website_orders (payment_status, order_placed_at DESC);

CREATE INDEX IF NOT EXISTS crm_website_orders_category_idx
  ON public.crm_website_orders (product_category, order_placed_at DESC);

CREATE INDEX IF NOT EXISTS crm_website_orders_phone_idx
  ON public.crm_website_orders (customer_phone)
  WHERE customer_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_website_orders_search_idx
  ON public.crm_website_orders USING gin (
    to_tsvector(
      'simple',
      coalesce(customer_name, '') || ' ' ||
      coalesce(customer_phone, '') || ' ' ||
      coalesce(order_number, '') || ' ' ||
      coalesce(product_summary, '')
    )
  );

COMMENT ON TABLE public.crm_website_orders IS
  'Web sitesi / kitap mağazası siparişleri — CRM Web Sitesinden Gelen Siparişler ekranı';
