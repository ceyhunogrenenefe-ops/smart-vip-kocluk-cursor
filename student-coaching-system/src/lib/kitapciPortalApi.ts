function apiBase() {
  const env = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (env) return env;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export type KitapciPortalOrder = {
  id: string;
  ogrenci_ad_soyad: string;
  veli_ad_soyad: string;
  sinif?: string | null;
  telefon: string;
  adres?: string | null;
  ilce?: string | null;
  il?: string | null;
  ucret_durumu?: string | null;
  siparis_notu?: string | null;
  status: string;
  whatsapp_sent_at?: string | null;
  kitapci_confirmed_at?: string | null;
  shipped_at?: string | null;
  kargo_takip_no?: string | null;
  kitapci_notu?: string | null;
  created_at: string;
};

export async function fetchKitapciPortal(token: string) {
  const res = await fetch(
    `${apiBase()}/api/book-orders-kitapci-portal?token=${encodeURIComponent(token)}`
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Panel yüklenemedi');
  }
  return j as { bookseller: { name: string; city?: string | null }; orders: KitapciPortalOrder[] };
}

export async function confirmKitapciPortalOrder(token: string, orderId: string) {
  const res = await fetch(
    `${apiBase()}/api/book-orders-kitapci-portal?token=${encodeURIComponent(token)}&op=confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId })
    }
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Onaylanamadı');
  }
  return j;
}

export async function shipKitapciPortalOrder(
  token: string,
  orderId: string,
  payload: { kargo_takip_no: string; kitapci_notu?: string }
) {
  const res = await fetch(
    `${apiBase()}/api/book-orders-kitapci-portal?token=${encodeURIComponent(token)}&op=ship`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, ...payload })
    }
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Kaydedilemedi');
  }
  return j;
}

export function kitapciPortalUrl(portalToken: string) {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://www.dersonlinevipkocluk.com';
  return `${base}/kitapci/${encodeURIComponent(portalToken)}`;
}
