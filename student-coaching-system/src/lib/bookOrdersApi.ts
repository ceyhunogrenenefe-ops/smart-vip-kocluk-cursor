import { apiFetch } from './session';

export type BooksellerRow = {
  id: string;
  institution_id: string;
  name: string;
  phone: string;
  city?: string | null;
  bolge?: string | null;
  is_active: boolean;
  notes?: string | null;
  portal_token?: string | null;
  created_at?: string;
};

export type BookOrderSetRow = {
  id: string;
  institution_id: string;
  name: string;
  kitap_icerigi: string;
  siniflar: string[];
  sort_order: number;
  is_active: boolean;
  product_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BookOrderRow = {
  id: string;
  institution_id: string;
  veli_ad_soyad: string;
  ogrenci_ad_soyad: string;
  /** Eski şema uyumu */
  veli_adi?: string | null;
  ogrenci_adi?: string | null;
  telefon: string;
  sinif?: string | null;
  ucret_durumu?: string | null;
  adres?: string | null;
  ilce?: string | null;
  il?: string | null;
  siparis_notu?: string | null;
  notlar?: string | null;
  kitaplar?: string | null;
  kitap_set_id?: string | null;
  kitap_set_ids?: string[] | null;
  kitapci_id?: string | null;
  kitapci_adi?: string | null;
  kitapci_phone?: string | null;
  kargo_takip_no?: string | null;
  kitapci_notu?: string | null;
  kitapci_confirmed_at?: string | null;
  shipped_at?: string | null;
  status: string;
  whatsapp_status: string;
  whatsapp_sent_at?: string | null;
  whatsapp_error?: string | null;
  meta_message_id?: string | null;
  meta_delivery_status?: string | null;
  source?: string;
  created_at: string;
};

function qs(parts: Record<string, string | undefined>) {
  const p = Object.entries(parts)
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
    .join('&');
  return p ? `?${p}` : '';
}

export type BookOrderStats = {
  totals: { booksellers: number; orders: number; sets: number };
  by_institution: Array<{
    institution_id: string;
    booksellers: number;
    orders: number;
    sets: number;
  }>;
};

export async function fetchBookOrderStats(): Promise<BookOrderStats> {
  const res = await apiFetch('/api/book-orders?scope=stats');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'İstatistik alınamadı');
  }
  return (j as { data: BookOrderStats }).data;
}

export async function listBookOrders(institutionId?: string): Promise<BookOrderRow[]> {
  const res = await apiFetch(`/api/book-orders${qs({ institution_id: institutionId })}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Liste alınamadı');
  return Array.isArray((j as { data?: unknown }).data) ? ((j as { data: BookOrderRow[] }).data) : [];
}

export async function listBookOrderSets(institutionId?: string): Promise<BookOrderSetRow[]> {
  const res = await apiFetch(
    `/api/book-orders?scope=kitap-sets${institutionId ? `&institution_id=${encodeURIComponent(institutionId)}` : ''}`
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string; hint?: string }).hint || (j as { error?: string }).error || 'Setler alınamadı');
  return Array.isArray((j as { data?: unknown }).data) ? ((j as { data: BookOrderSetRow[] }).data) : [];
}

export async function createBookOrderSet(payload: {
  institution_id: string;
  name: string;
  kitap_icerigi: string;
  siniflar: string[] | string;
  sort_order?: number;
  is_active?: boolean;
  product_url?: string | null;
}): Promise<BookOrderSetRow> {
  const res = await apiFetch('/api/book-orders?op=kitap-set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'Set eklenemedi');
  return (j as { data: BookOrderSetRow }).data;
}

export async function patchBookOrderSet(id: string, patch: Partial<BookOrderSetRow>): Promise<BookOrderSetRow> {
  const res = await apiFetch(`/api/book-orders?op=kitap-set&id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'Set güncellenemedi');
  return (j as { data: BookOrderSetRow }).data;
}

export async function deleteBookOrderSet(id: string): Promise<void> {
  const res = await apiFetch(`/api/book-orders?op=kitap-set&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || 'Set silinemedi');
  }
}

export async function listBooksellers(institutionId?: string): Promise<BooksellerRow[]> {
  const res = await apiFetch(`/api/book-orders?scope=booksellers${institutionId ? `&institution_id=${encodeURIComponent(institutionId)}` : ''}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Kitapçılar alınamadı');
  }
  return Array.isArray((j as { data?: unknown }).data) ? ((j as { data: BooksellerRow[] }).data) : [];
}

export async function createBookseller(payload: {
  institution_id: string;
  name: string;
  phone: string;
  city?: string;
  bolge?: string;
  notes?: string;
}): Promise<BooksellerRow> {
  const res = await apiFetch('/api/book-orders?op=bookseller', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Kitapçı eklenemedi');
  }
  return (j as { data: BooksellerRow }).data;
}

export async function patchBookseller(id: string, patch: Partial<BooksellerRow>): Promise<BooksellerRow> {
  const res = await apiFetch(`/api/book-orders?op=bookseller&id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'Güncellenemedi');
  return (j as { data: BooksellerRow }).data;
}

export async function ensureBooksellerPortalToken(id: string): Promise<BooksellerRow> {
  const res = await apiFetch(`/api/book-orders?op=bookseller-portal-token&id=${encodeURIComponent(id)}`, {
    method: 'POST'
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'Panel linki oluşturulamadı');
  return (j as { data: BooksellerRow }).data;
}

export async function deleteBookseller(id: string): Promise<void> {
  const res = await apiFetch(`/api/book-orders?op=bookseller&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || 'Silinemedi');
  }
}

export class BookOrderApproveError extends Error {
  approved: boolean;
  constructor(message: string, approved: boolean) {
    super(message);
    this.name = 'BookOrderApproveError';
    this.approved = approved;
  }
}

export async function approveBookOrder(id: string, kitapciId?: string): Promise<BookOrderRow> {
  const kitapciQs = kitapciId ? `&kitapci_id=${encodeURIComponent(kitapciId)}` : '';
  const res = await apiFetch(`/api/book-orders?op=approve&id=${encodeURIComponent(id)}${kitapciQs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(kitapciId ? { kitapci_id: kitapciId } : {})
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errBody = j as { hint?: string; error?: string };
    if (res.status === 403 && errBody.error === 'super_admin_required') {
      throw new BookOrderApproveError(
        errBody.hint || 'Kitap siparişi onayı yalnızca süper admin tarafından yapılır.',
        false
      );
    }
    throw new BookOrderApproveError(
      errBody.hint || errBody.error || 'Onaylanamadı',
      false
    );
  }
  if ((j as { whatsapp_ok?: boolean }).whatsapp_ok === false) {
    throw new BookOrderApproveError(
      (j as { hint?: string; error?: string }).hint ||
        (j as { error?: string }).error ||
        'Sipariş onaylandı ancak WhatsApp gönderilemedi.',
      true
    );
  }
  return (j as { data: BookOrderRow }).data;
}

export type CreateBookOrderPayload = {
  institution_id?: string;
  veli_ad_soyad: string;
  ogrenci_ad_soyad: string;
  telefon: string;
  sinif?: string | null;
  adres?: string | null;
  ilce?: string | null;
  il?: string | null;
  ucret_durumu?: string | null;
  siparis_notu?: string | null;
  kitap_set_id?: string | null;
  kitap_set_ids?: string[] | null;
  kitaplar?: string | null;
};

export async function createBookOrder(payload: CreateBookOrderPayload): Promise<BookOrderRow> {
  const res = await apiFetch('/api/book-orders?op=create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Sipariş eklenemedi');
  }
  return (j as { data: BookOrderRow }).data;
}

export type BookOrderPatch = {
  veli_ad_soyad?: string;
  ogrenci_ad_soyad?: string;
  telefon?: string;
  sinif?: string | null;
  adres?: string | null;
  ilce?: string | null;
  il?: string | null;
  ucret_durumu?: string | null;
  siparis_notu?: string | null;
  kitap_set_id?: string | null;
  kitap_set_ids?: string[] | null;
  kitaplar?: string | null;
};

export type PatchBookOrderResult = {
  data: BookOrderRow;
  warning?: string;
  hint?: string;
};

export async function patchBookOrder(id: string, patch: BookOrderPatch): Promise<PatchBookOrderResult> {
  const res = await apiFetch(`/api/book-orders?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Güncellenemedi');
  }
  return {
    data: (j as { data: BookOrderRow }).data,
    warning: (j as { warning?: string }).warning,
    hint: (j as { hint?: string }).hint
  };
}

export async function cancelBookOrder(id: string): Promise<BookOrderRow> {
  const res = await apiFetch(`/api/book-orders?op=cancel&id=${encodeURIComponent(id)}`, { method: 'POST' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'İptal edilemedi');
  return (j as { data: BookOrderRow }).data;
}

export async function deleteBookOrder(id: string): Promise<void> {
  const res = await apiFetch(`/api/book-orders?op=order&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Silinemedi');
  }
}

export type BookOrderWhatsAppSendResult = {
  phone?: string;
  bookseller_name?: string | null;
  meta_message_id?: string | null;
  whatsapp_status?: string | null;
  hint?: string | null;
  channel?: string;
};

export async function resendBookOrderWhatsApp(
  id: string,
  kitapciId?: string
): Promise<BookOrderWhatsAppSendResult> {
  const kitapciQs = kitapciId ? `&kitapci_id=${encodeURIComponent(kitapciId)}` : '';
  const res = await apiFetch(`/api/book-orders?op=resend&id=${encodeURIComponent(id)}${kitapciQs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(kitapciId ? { kitapci_id: kitapciId } : {})
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const wa = (j as { whatsapp?: { hint?: string; error?: string } }).whatsapp;
    throw new Error(
      (j as { hint?: string; error?: string }).hint ||
        wa?.hint ||
        wa?.error ||
        (j as { error?: string }).error ||
        'WhatsApp gönderilemedi'
    );
  }
  const row = (j as { data?: BookOrderRow }).data;
  const wa = (j as { whatsapp?: BookOrderWhatsAppSendResult }).whatsapp || {};
  const out: BookOrderWhatsAppSendResult = {
    phone: wa.phone || row?.kitapci_phone,
    bookseller_name: wa.bookseller_name,
    meta_message_id: wa.meta_message_id || row?.meta_message_id,
    whatsapp_status: row?.whatsapp_status || wa.whatsapp_status,
    hint: wa.hint,
    channel: (wa as { channel?: string }).channel
  };
  if ((j as { whatsapp_ok?: boolean }).whatsapp_ok === false) {
    throw new Error(
      (j as { hint?: string }).hint ||
        wa.hint ||
        (j as { error?: string }).error ||
        'WhatsApp gönderilemedi'
    );
  }
  return out;
}

export type BookOrderWhatsAppTemplateDiag = {
  ok: boolean;
  template_name: string;
  template_name_resolved?: string;
  language?: string;
  language_candidates?: string[];
  waba_id?: string | null;
  approved?: Array<{ name: string; language: string; status: string }>;
  error?: string;
  hint?: string;
  send_via?: 'gateway' | 'meta';
  gateway?: { configured?: boolean; hint?: string; session_id_suffix?: string | null };
  gateway_session?: { ok?: boolean; status?: string };
};

export type BookOrderGatewayConfig = {
  session_id: string | null;
  /** Sunucunun kitap siparişi gönderiminde kullandığı oturum (env veya kullanıcı id). */
  send_session_id?: string | null;
  env_session_id: string | null;
  env_configured: boolean;
  gateway?: { configured?: boolean; hint?: string; session_id_suffix?: string | null };
  gateway_health?: { ok?: boolean; error?: string };
  gateway_session?: { ok?: boolean; status?: string; error?: string | null };
  webhook?: { configured?: boolean; hint?: string; webhook_url?: string };
  hint?: string;
};

export async function fetchBookOrderGatewayConfig(): Promise<BookOrderGatewayConfig> {
  const res = await apiFetch('/api/book-orders?scope=gateway-config');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Gateway ayarı alınamadı');
  }
  return (j as { data: BookOrderGatewayConfig }).data;
}

export async function checkBookOrderWhatsAppTemplate(): Promise<BookOrderWhatsAppTemplateDiag> {
  const res = await apiFetch('/api/book-orders?scope=whatsapp-template');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Kontrol edilemedi');
  }
  return j as BookOrderWhatsAppTemplateDiag;
}

export async function processPendingBookOrders(): Promise<{ processed: number }> {
  const res = await apiFetch('/api/book-orders?op=process-pending', { method: 'POST' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'İşlenemedi');
  return j as { processed: number };
}
