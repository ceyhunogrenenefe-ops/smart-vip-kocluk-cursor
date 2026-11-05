import { apiFetch } from './session';

export type CrmWebsiteOrderRow = {
  id: string;
  source_system: string;
  source_id: string;
  order_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  district: string | null;
  city: string | null;
  address_status: 'complete' | 'missing' | 'not_required';
  address_display?: string;
  product_summary: string;
  product_category: string;
  amount_kurus: number | null;
  currency: string;
  payment_status: string;
  order_status: string;
  payment_provider: string | null;
  requires_shipping: boolean;
  order_placed_at: string;
  paid_at: string | null;
};

export type CrmWebsiteOrdersListParams = {
  q?: string;
  payment_status?: string;
  product_category?: string;
  address_status?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
};

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  sp.set('op', 'list');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  return sp.toString();
}

export async function crmWebsiteOrdersList(params: CrmWebsiteOrdersListParams = {}) {
  const res = await apiFetch(`/api/crm-website-orders?${qs(params)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Liste alınamadı');
  return data as { ok: boolean; rows: CrmWebsiteOrderRow[]; total: number; limit: number; offset: number };
}

export async function crmWebsiteOrdersExport(params: CrmWebsiteOrdersListParams = {}) {
  const sp = new URLSearchParams({ op: 'export' });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const res = await apiFetch(`/api/crm-website-orders?${sp.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Dışa aktarım alınamadı');
  return data.rows as CrmWebsiteOrderRow[];
}

export async function crmWebsiteOrdersBackfill(opts: { source?: string; cursor?: string | null } = {}) {
  const res = await apiFetch('/api/crm-website-orders?op=backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Aktarım başarısız');
  return data;
}
