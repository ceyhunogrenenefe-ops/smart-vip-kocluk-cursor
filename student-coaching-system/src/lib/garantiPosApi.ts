import { apiFetch } from './session';

export type GarantiPaymentOrder = {
  id?: string;
  order_id: string;
  public_token: string;
  title: string;
  amount_kurus: number;
  amount_try?: number;
  currency?: string;
  installment_max?: number;
  customer_name?: string | null;
  status: string;
  paid_at?: string | null;
  created_at?: string;
  gateway_ready?: boolean;
  pay_url?: string;
};

export async function createGarantiPaymentLink(body: {
  amount_try: number;
  title?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  installment_max?: number;
  student_payment_record_id?: string;
  institution_id?: string | null;
}) {
  const res = await apiFetch('/api/garanti-pos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'garanti_create_failed');
  return json as { data: GarantiPaymentOrder; pay_url: string };
}

export async function fetchGarantiPublicOrder(token: string) {
  const res = await fetch(`/api/garanti-pos/public?token=${encodeURIComponent(token)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'not_found');
  return json.data as GarantiPaymentOrder;
}

export async function startGarantiPayment(token: string, installment_count = 0) {
  const res = await fetch('/api/garanti-pos/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, installment_count })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'start_failed');
  return json as {
    gateway_url: string;
    fields: Record<string, string>;
    order_id: string;
    amount_try: number;
  };
}

/** Tarayıcıda Garanti’ye otomatik form POST */
export function postToGarantiGateway(gatewayUrl: string, fields: Record<string, string>) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = gatewayUrl;
  form.acceptCharset = 'UTF-8';
  form.style.display = 'none';
  for (const [name, value] of Object.entries(fields || {})) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value == null ? '' : String(value);
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
