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
  created_at?: string;
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
  kitapci_id?: string | null;
  kitapci_adi?: string | null;
  kitapci_phone?: string | null;
  status: string;
  whatsapp_status: string;
  whatsapp_sent_at?: string | null;
  whatsapp_error?: string | null;
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

export async function listBookOrders(institutionId?: string): Promise<BookOrderRow[]> {
  const res = await apiFetch(`/api/book-orders${qs({ institution_id: institutionId })}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Liste alınamadı');
  return Array.isArray((j as { data?: unknown }).data) ? ((j as { data: BookOrderRow[] }).data) : [];
}

export async function listBooksellers(institutionId?: string): Promise<BooksellerRow[]> {
  const res = await apiFetch(`/api/book-orders?scope=booksellers${institutionId ? `&institution_id=${encodeURIComponent(institutionId)}` : ''}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'Kitapçılar alınamadı');
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
  if (!res.ok) throw new Error((j as { error?: string }).error || 'Kitapçı eklenemedi');
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

export async function deleteBookseller(id: string): Promise<void> {
  const res = await apiFetch(`/api/book-orders?op=bookseller&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || 'Silinemedi');
  }
}

export async function approveBookOrder(id: string): Promise<BookOrderRow> {
  const res = await apiFetch(`/api/book-orders?op=approve&id=${encodeURIComponent(id)}`, { method: 'POST' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Onaylanamadı'
    );
  }
  return (j as { data: BookOrderRow }).data;
}

export async function cancelBookOrder(id: string): Promise<BookOrderRow> {
  const res = await apiFetch(`/api/book-orders?op=cancel&id=${encodeURIComponent(id)}`, { method: 'POST' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'İptal edilemedi');
  return (j as { data: BookOrderRow }).data;
}

export async function resendBookOrderWhatsApp(id: string): Promise<void> {
  const res = await apiFetch(`/api/book-orders?op=resend&id=${encodeURIComponent(id)}`, { method: 'POST' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'WhatsApp gönderilemedi');
}

export async function processPendingBookOrders(): Promise<{ processed: number }> {
  const res = await apiFetch('/api/book-orders?op=process-pending', { method: 'POST' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'İşlenemedi');
  return j as { processed: number };
}
