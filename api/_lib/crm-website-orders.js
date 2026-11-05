/**
 * CRM «Web Sitesinden Gelen Siparişler» — kaynak sistemlerden tek tabloya upsert.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { formatShippingOneLine } from './commerce-shipping-address.js';

export const CRM_WEBSITE_ORDERS_TABLE = 'crm_website_orders';

export const CRM_WEBSITE_ORDERS_SETUP_SQL = `
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
`.trim();

function isSchemaMissing(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('relation') && msg.includes('does not exist')) ||
    msg.includes('crm_website_orders')
  );
}

export function inferProductCategory(text, hints = {}) {
  const t = String(text || '').toLowerCase();
  if (hints.product_category) return hints.product_category;
  if (t.includes('deneme') || t.includes('kulüb') || t.includes('kulub')) return 'deneme';
  if (t.includes('koçluk') || t.includes('kocluk')) return 'kocluk';
  if (t.includes('özel ders') || t.includes('ozel ders')) return 'ozel_ders';
  if (
    t.includes('eğitim') ||
    t.includes('egitim') ||
    t.includes('lgs') ||
    t.includes('yks') ||
    t.includes('kamp') ||
    t.includes('yazılı') ||
    t.includes('yazili')
  ) {
    return 'egitim';
  }
  if (t.includes('kitap') || hints.requires_shipping) return 'kitap';
  return 'diger';
}

export function computeAddressFields({ requiresShipping, line1, line2, district, city }) {
  if (!requiresShipping) {
    return { address_status: 'not_required', address_missing: false };
  }
  const ok =
    String(line1 || '').trim() &&
    String(city || '').trim() &&
    String(district || '').trim();
  return ok
    ? { address_status: 'complete', address_missing: false }
    : { address_status: 'missing', address_missing: true };
}

export function formatAddressDisplay(row) {
  if (!row || row.address_status === 'not_required') return '';
  if (row.address_status === 'missing') return 'Adres Eksik';
  return formatShippingOneLine(row) || 'Adres Eksik';
}

function normalizePhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d || null;
}

function buildDatabaseUrl() {
  const direct =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.SUPABASE_DATABASE_URL?.trim();
  if (direct) return direct;
  const password =
    process.env.SUPABASE_DB_PASSWORD?.trim() ||
    process.env.POSTGRES_PASSWORD?.trim() ||
    process.env.SUPABASE_DATABASE_PASSWORD?.trim();
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const ref = m?.[1] || '';
  if (!password || !ref) return '';
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

export async function ensureCrmWebsiteOrdersSchema() {
  const { error } = await supabaseAdmin.from(CRM_WEBSITE_ORDERS_TABLE).select('id').limit(1);
  if (!error) return { ok: true, created: false };
  if (error && !isSchemaMissing(error)) throw error;

  const dbUrl = buildDatabaseUrl();
  if (!dbUrl) {
    return { ok: false, code: 'schema_missing', sql: CRM_WEBSITE_ORDERS_SETUP_SQL };
  }
  const postgres = (await import('postgres')).default;
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
  try {
    await sql.unsafe(CRM_WEBSITE_ORDERS_SETUP_SQL);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS crm_website_orders_payment_idx
        ON public.crm_website_orders (payment_status, order_placed_at DESC);
      CREATE INDEX IF NOT EXISTS crm_website_orders_category_idx
        ON public.crm_website_orders (product_category, order_placed_at DESC);
    `);
    return { ok: true, created: true, via: 'postgres' };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

/** PayTR student_info içindeki «Teslimat: …» satırından adres okur. */
export function parseShippingFromStudentInfo(text) {
  const raw = String(text || '');
  const m = raw.match(/Teslimat:\s*([^·\n]+)/i);
  if (!m) return null;
  const parts = m[1]
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    return {
      address_line1: parts.slice(0, -2).join(', ') || parts[0],
      district: parts[parts.length - 2],
      city: parts[parts.length - 1],
    };
  }
  if (parts.length === 2) {
    return { address_line1: parts[0], district: null, city: parts[1] };
  }
  return { address_line1: m[1].trim(), district: null, city: null };
}

function productTextFromOzelDersRow(row) {
  return [row.package_title, row.package_id, row.student_info, row.source].filter(Boolean).join(' ');
}

async function upsertCrmWebsiteOrder(row) {
  const now = new Date().toISOString();
  const payload = {
    ...row,
    customer_phone: normalizePhone(row.customer_phone),
    updated_at: now,
  };
  const { data, error } = await supabaseAdmin
    .from(CRM_WEBSITE_ORDERS_TABLE)
    .upsert(payload, { onConflict: 'source_system,source_id' })
    .select('id, source_system, source_id')
    .single();
  if (error) throw error;
  return data;
}

export async function syncCommerceOrderById(orderId) {
  const id = String(orderId || '').trim();
  if (!id) return null;

  const { data: order, error: oErr } = await supabaseAdmin
    .from('commerce_orders')
    .select(
      'id, order_number, status, payment_status, total_kurus, currency, customer_name, customer_email, customer_phone, paid_at, created_at, notes'
    )
    .eq('id', id)
    .maybeSingle();
  if (oErr) throw oErr;
  if (!order) return null;

  const [{ data: items }, { data: addr }, { data: pay }] = await Promise.all([
    supabaseAdmin
      .from('commerce_order_items')
      .select('title_snapshot, quantity, package_id, vendor_offer_id')
      .eq('order_id', id),
    supabaseAdmin
      .from('commerce_order_addresses')
      .select('full_name, phone, address_line1, address_line2, district, city, postal_code')
      .eq('order_id', id)
      .eq('address_type', 'shipping')
      .maybeSingle(),
    supabaseAdmin
      .from('commerce_payments')
      .select('provider, status, paid_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const requiresShipping = (items || []).some((it) => it.vendor_offer_id || it.package_id);
  const productSummary = (items || [])
    .map((it) => `${it.title_snapshot || 'Ürün'} × ${it.quantity || 1}`)
    .join('; ');
  const addrFields = computeAddressFields({
    requiresShipping,
    line1: addr?.address_line1,
    district: addr?.district,
    city: addr?.city,
  });

  const row = {
    source_system: 'commerce',
    source_id: order.id,
    order_number: order.order_number,
    customer_name: order.customer_name || addr?.full_name || null,
    customer_phone: order.customer_phone || addr?.phone || null,
    customer_email: order.customer_email || null,
    address_line1: addr?.address_line1 || null,
    address_line2: addr?.address_line2 || null,
    district: addr?.district || null,
    city: addr?.city || null,
    address_status: addrFields.address_status,
    product_summary: productSummary || 'Kitap mağazası siparişi',
    product_category: inferProductCategory(productSummary, { requires_shipping: requiresShipping }),
    amount_kurus: order.total_kurus,
    currency: order.currency || 'TRY',
    payment_status: order.payment_status || 'pending',
    order_status: order.status || 'pending_payment',
    payment_provider: pay?.provider || null,
    requires_shipping: requiresShipping,
    order_placed_at: order.created_at,
    paid_at: order.paid_at || pay?.paid_at || null,
    metadata: {
      commerce_order_id: order.id,
      address_missing: addrFields.address_missing,
    },
  };

  return upsertCrmWebsiteOrder(row);
}

export async function syncKitapSiparisById(siparisId) {
  const id = String(siparisId || '').trim();
  if (!id) return null;

  const { data: row, error } = await supabaseAdmin
    .from('kitap_siparisleri')
    .select(
      'id, veli_ad_soyad, telefon, adres, ilce, il, status, ucret_durumu, created_at, form_payload, source'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const payload = row.form_payload && typeof row.form_payload === 'object' ? row.form_payload : {};
  const sets = Array.isArray(payload.set_names) ? payload.set_names.join(', ') : '';
  const productSummary = sets || payload.kitap_adi || 'Kitap siparişi (form)';
  const addrFields = computeAddressFields({
    requiresShipping: true,
    line1: row.adres,
    district: row.ilce,
    city: row.il,
  });

  let paymentStatus = 'pending';
  const u = String(row.ucret_durumu || '').toLowerCase();
  if (u.includes('ödendi') || u.includes('odendi')) paymentStatus = 'paid';

  return upsertCrmWebsiteOrder({
    source_system: 'kitap_form',
    source_id: row.id,
    order_number: `KITAP-${String(row.id).slice(0, 8)}`,
    customer_name: row.veli_ad_soyad,
    customer_phone: row.telefon,
    customer_email: null,
    address_line1: row.adres,
    address_line2: null,
    district: row.ilce,
    city: row.il,
    address_status: addrFields.address_status,
    product_summary: productSummary,
    product_category: inferProductCategory(productSummary, { requires_shipping: true }),
    amount_kurus: null,
    currency: 'TRY',
    payment_status: paymentStatus,
    order_status: row.status || 'pending',
    payment_provider: null,
    requires_shipping: true,
    order_placed_at: row.created_at,
    paid_at: paymentStatus === 'paid' ? row.created_at : null,
    metadata: { kitap_siparis_id: row.id, source: row.source, address_missing: addrFields.address_missing },
  });
}

export async function syncGarantiPaymentOrderById(garantiRowId) {
  const id = String(garantiRowId || '').trim();
  if (!id) return null;

  const { data: row, error } = await supabaseAdmin
    .from('garanti_payment_orders')
    .select(
      'id, order_id, title, amount_kurus, currency, customer_name, customer_email, customer_phone, status, paid_at, created_at, callback_json'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const title = row.title || 'Web sitesi ödemesi';
  const isPaid = row.status === 'paid';

  return upsertCrmWebsiteOrder({
    source_system: 'garanti',
    source_id: row.id,
    order_number: row.order_id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_email: row.customer_email,
    address_line1: null,
    address_line2: null,
    district: null,
    city: null,
    address_status: 'not_required',
    product_summary: title,
    product_category: inferProductCategory(title),
    amount_kurus: row.amount_kurus,
    currency: row.currency || 'TRY',
    payment_status: isPaid ? 'paid' : row.status === 'failed' ? 'failed' : 'pending',
    order_status: row.status,
    payment_provider: 'garanti',
    requires_shipping: false,
    order_placed_at: row.created_at,
    paid_at: row.paid_at,
    metadata: { garanti_payment_order_id: row.id, address_missing: false },
  });
}

export async function syncOzelDersTalepById(talepId) {
  const id = String(talepId || '').trim();
  if (!id) return null;

  const { data: row, error } = await supabaseAdmin.from('ozel_ders_talepleri').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const productSummary =
    row.package_title || row.package_id || row.student_info?.slice(0, 120) || 'Web sitesi siparişi';
  const isPaid = row.status === 'paid';
  const productBlob = productTextFromOzelDersRow(row);
  const category = inferProductCategory(productBlob);
  const requiresShipping =
    category === 'deneme' || category === 'kitap' || String(row.package_id || '').toLowerCase().startsWith('deneme');
  const ship = parseShippingFromStudentInfo(row.student_info) || {};
  const addrFields = computeAddressFields({
    requiresShipping,
    line1: ship.address_line1,
    district: ship.district,
    city: ship.city,
  });

  return upsertCrmWebsiteOrder({
    source_system: 'ozel_ders',
    source_id: row.id,
    order_number: row.merchant_oid || `OZEL-${String(row.id).slice(0, 8)}`,
    customer_name: row.parent_name,
    customer_phone: row.phone,
    customer_email: row.email,
    address_line1: ship.address_line1 || null,
    address_line2: null,
    district: ship.district || null,
    city: ship.city || null,
    address_status: addrFields.address_status,
    product_summary: productSummary,
    product_category: category === 'diger' && requiresShipping ? 'deneme' : category,
    amount_kurus: row.amount_kurus,
    currency: 'TRY',
    payment_status: isPaid ? 'paid' : 'pending',
    order_status: row.status || 'pending',
    payment_provider: 'paytr',
    requires_shipping: requiresShipping,
    order_placed_at: row.created_at,
    paid_at: row.paid_at,
    metadata: {
      ozel_ders_id: row.id,
      source: row.source,
      address_missing: addrFields.address_missing,
    },
  });
}

async function backfillSiteRegistrationLeads(cursor = null, limit = BACKFILL_BATCH) {
  let q = supabaseAdmin
    .from('registration_leads')
    .select('id, created_at')
    .is('deleted_at', null)
    .or(
      'source.ilike.%website%,source.ilike.%onlinevip%,source.eq.website_form,source.eq.website_form_ad'
    )
    .order('created_at', { ascending: true })
    .limit(limit);
  if (cursor) q = q.gt('created_at', cursor);
  const { data, error } = await q;
  if (error) throw error;
  for (const row of data || []) {
    await syncRegistrationLeadById(row.id);
  }
  const next =
    data && data.length === limit ? data[data.length - 1].created_at : null;
  return { synced: (data || []).length, next_cursor: next, done: !data || data.length < limit };
}

export async function syncRegistrationLeadById(leadId) {
  const id = String(leadId || '').trim();
  if (!id) return null;

  const { data: row, error } = await supabaseAdmin
    .from('registration_leads')
    .select(
      'id, first_name, last_name, parent_full_name, phone, email, grade_program, interested_package, source, stage, primary_status, final_offer_amount, offered_price, notes, confirmed_at, created_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const src = String(row.source || '').toLowerCase();
  if (!src.includes('website') && !src.includes('onlinevip') && src !== 'website_form' && src !== 'website_form_ad') {
    return null;
  }

  const customerName =
    row.parent_full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || null;
  const productSummary = [row.interested_package, row.grade_program, 'Web sitesi kaydı']
    .filter(Boolean)
    .join(' · ');
  const amountKurus =
    row.final_offer_amount != null
      ? Math.round(Number(row.final_offer_amount) * 100)
      : row.offered_price != null
        ? Math.round(Number(row.offered_price) * 100)
        : null;
  const isPaid = row.primary_status === 'confirmed' || row.stage === 'confirmed';

  return upsertCrmWebsiteOrder({
    source_system: 'site_registration',
    source_id: row.id,
    order_number: `WEB-LEAD-${String(row.id).slice(0, 8)}`,
    customer_name: customerName,
    customer_phone: row.phone,
    customer_email: row.email,
    address_line1: null,
    address_line2: null,
    district: null,
    city: null,
    address_status: 'not_required',
    product_summary: productSummary,
    product_category: inferProductCategory(productSummary),
    amount_kurus: Number.isFinite(amountKurus) ? amountKurus : null,
    currency: 'TRY',
    payment_status: isPaid ? 'paid' : 'pending',
    order_status: row.stage || row.primary_status || 'new_lead',
    payment_provider: null,
    requires_shipping: false,
    order_placed_at: row.created_at,
    paid_at: row.confirmed_at,
    metadata: { registration_lead_id: row.id, source: row.source, address_missing: false },
  });
}

/** Ödeme akışını bozmamak için arka planda çağırın. */
export function queueCrmWebsiteOrderSync(fn) {
  Promise.resolve()
    .then(fn)
    .catch((e) => {
      if (!isSchemaMissing(e)) {
        console.warn('[crm-website-orders] sync failed', e?.message || e);
      }
    });
}

const BACKFILL_BATCH = 150;

async function backfillCommerceOrders(cursor = null, limit = BACKFILL_BATCH) {
  let q = supabaseAdmin
    .from('commerce_orders')
    .select('id, created_at')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (cursor) q = q.gt('created_at', cursor);
  const { data, error } = await q;
  if (error) throw error;
  let synced = 0;
  for (const row of data || []) {
    await syncCommerceOrderById(row.id);
    synced += 1;
  }
  const next =
    data && data.length === limit ? data[data.length - 1].created_at : null;
  return { synced, next_cursor: next, done: !data || data.length < limit };
}

async function backfillKitapSiparisleri(cursor = null, limit = BACKFILL_BATCH) {
  let q = supabaseAdmin
    .from('kitap_siparisleri')
    .select('id, created_at')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (cursor) q = q.gt('created_at', cursor);
  const { data, error } = await q;
  if (error) throw error;
  for (const row of data || []) {
    await syncKitapSiparisById(row.id);
  }
  const next =
    data && data.length === limit ? data[data.length - 1].created_at : null;
  return { synced: (data || []).length, next_cursor: next, done: !data || data.length < limit };
}

async function backfillGaranti(cursor = null, limit = BACKFILL_BATCH) {
  let q = supabaseAdmin
    .from('garanti_payment_orders')
    .select('id, created_at')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (cursor) q = q.gt('created_at', cursor);
  const { data, error } = await q;
  if (error) throw error;
  for (const row of data || []) {
    await syncGarantiPaymentOrderById(row.id);
  }
  const next =
    data && data.length === limit ? data[data.length - 1].created_at : null;
  return { synced: (data || []).length, next_cursor: next, done: !data || data.length < limit };
}

async function backfillOzelDers(cursor = null, limit = BACKFILL_BATCH) {
  let q = supabaseAdmin
    .from('ozel_ders_talepleri')
    .select('id, created_at')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (cursor) q = q.gt('created_at', cursor);
  const { data, error } = await q;
  if (error) throw error;
  for (const row of data || []) {
    await syncOzelDersTalepById(row.id);
  }
  const next =
    data && data.length === limit ? data[data.length - 1].created_at : null;
  return { synced: (data || []).length, next_cursor: next, done: !data || data.length < limit };
}

/**
 * @param {{ source?: string, cursor?: string|null }} opts
 * source: commerce | kitap_form | garanti | ozel_ders | all
 */
export async function backfillCrmWebsiteOrders(opts = {}) {
  const source = String(opts.source || 'all').toLowerCase();
  const cursor = opts.cursor || null;

  if (source === 'commerce') return { source, ...(await backfillCommerceOrders(cursor)) };
  if (source === 'kitap_form') return { source, ...(await backfillKitapSiparisleri(cursor)) };
  if (source === 'garanti') return { source, ...(await backfillGaranti(cursor)) };
  if (source === 'ozel_ders') return { source, ...(await backfillOzelDers(cursor)) };
  if (source === 'site_registration') return { source, ...(await backfillSiteRegistrationLeads(cursor)) };

  const commerce = await backfillCommerceOrders(cursor);
  if (!commerce.done) {
    return { source: 'all', phase: 'commerce', ...commerce };
  }
  const kitap = await backfillKitapSiparisleri(null);
  if (!kitap.done) {
    return { source: 'all', phase: 'kitap_form', ...kitap };
  }
  const garanti = await backfillGaranti(null);
  if (!garanti.done) {
    return { source: 'all', phase: 'garanti', ...garanti };
  }
  const ozel = await backfillOzelDers(null);
  if (!ozel.done) {
    return { source: 'all', phase: 'ozel_ders', ...ozel };
  }
  const siteReg = await backfillSiteRegistrationLeads(null);
  return { source: 'all', phase: 'site_registration', ...siteReg, done: siteReg.done };
}

export async function listCrmWebsiteOrders(filters = {}) {
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 100));
  const offset = Math.max(0, Number(filters.offset) || 0);

  let q = supabaseAdmin
    .from(CRM_WEBSITE_ORDERS_TABLE)
    .select('*', { count: 'exact' })
    .order('order_placed_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const qtext = String(filters.q || '').trim();
  if (qtext) {
    const like = `%${qtext.replace(/%/g, '')}%`;
    q = q.or(
      `customer_name.ilike.${like},customer_phone.ilike.${like},order_number.ilike.${like},product_summary.ilike.${like}`
    );
  }
  if (filters.payment_status) {
    q = q.eq('payment_status', String(filters.payment_status));
  }
  if (filters.product_category) {
    q = q.eq('product_category', String(filters.product_category));
  }
  if (filters.address_status) {
    q = q.eq('address_status', String(filters.address_status));
  }
  if (filters.date_from) {
    q = q.gte('order_placed_at', String(filters.date_from));
  }
  if (filters.date_to) {
    q = q.lte('order_placed_at', String(filters.date_to));
  }

  const { data, error, count } = await q;
  if (error) throw error;

  const rows = (data || []).map((r) => ({
    ...r,
    address_display: formatAddressDisplay(r),
  }));

  return { rows, total: count ?? rows.length, limit, offset };
}

export { isSchemaMissing };
