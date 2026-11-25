import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/session';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from '../../lib/activeInstitutionScope';

/** Online VIP Dershane'de CRM her zaman açıktır (sunucuda da aynı kural sabittir). */
export function crmModuleAlwaysOn(institutionId?: string | null): boolean {
  const id = String(institutionId || '').trim();
  return !id || id === PLATFORM_PRIMARY_INSTITUTION_ID;
}

export type CrmModuleState = { institution_id: string | null; enabled: boolean; always_on: boolean };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || 'İşlem başarısız');
  return json as T;
}

export async function getCrmModule(institutionId: string): Promise<CrmModuleState> {
  const r = await request<{ data: { crm?: CrmModuleState } }>(
    `/api/institution-features?institution_id=${encodeURIComponent(institutionId)}`
  );
  return r.data?.crm || { institution_id: institutionId, enabled: false, always_on: false };
}

export async function setCrmModule(institutionId: string, enabled: boolean): Promise<CrmModuleState> {
  const r = await request<{ data: { crm: CrmModuleState } }>('/api/institution-features', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institution_id: institutionId, crm_module: enabled })
  });
  return r.data.crm;
}

/** Açık kurumda CRM lisansı açık mı? Okunamazsa kapalı sayılır. */
export function useCrmModule(institutionId?: string | null) {
  const id = String(institutionId || '').trim();
  const alwaysOn = crmModuleAlwaysOn(id);
  const [enabled, setEnabled] = useState<boolean>(alwaysOn);
  const [loading, setLoading] = useState<boolean>(!alwaysOn);

  const reload = useCallback(async () => {
    if (alwaysOn) {
      setEnabled(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await getCrmModule(id);
      setEnabled(Boolean(s.enabled));
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [alwaysOn, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { enabled, loading, alwaysOn, setEnabled, reload };
}
