import { apiFetch } from './session';

export type OzelDersTalepRow = {
  id: string;
  merchant_oid?: string | null;
  status: 'pending' | 'paid' | 'contacted' | 'enrolled' | 'cancelled' | string;
  parent_name?: string | null;
  phone?: string | null;
  email?: string | null;
  student_info?: string | null;
  teacher_slug?: string | null;
  package_id?: string | null;
  package_title?: string | null;
  amount_kurus?: number | null;
  source?: string | null;
  notes?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export async function listOzelDersTalepleri(status?: string): Promise<OzelDersTalepRow[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiFetch(`/api/ozel-ders-talepleri${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.hint || json?.error || 'Talepler alınamadı');
  return json.data || [];
}

export async function patchOzelDersTalep(
  id: string,
  patch: { status?: string; notes?: string; teacher_slug?: string }
): Promise<OzelDersTalepRow> {
  const res = await apiFetch(`/api/ozel-ders-talepleri?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Güncellenemedi');
  return json.data;
}

export async function deleteOzelDersTalep(id: string): Promise<void> {
  const res = await apiFetch(`/api/ozel-ders-talepleri?id=${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error || 'Silinemedi');
  }
}
