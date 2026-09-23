import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getHomeworkModule, homeworkModuleBlocked } from './homeworkApi';

/**
 * Ödev modülü bu kurumda açık mı?
 *
 * Platform ve Ders & Koçluk kurumlarında sunucuya hiç sorulmadan kapalı döner.
 * Diğer kurumlarda /api/institution-features okunur ve kurum başına önbelleklenir.
 */
const cache = new Map<string, boolean>();

export function useHomeworkModule(): { enabled: boolean; loading: boolean } {
  const { institution } = useApp();
  const institutionId = String(institution?.id || '').trim();
  const blocked = homeworkModuleBlocked(institutionId);
  const cached = cache.get(institutionId);
  const [enabled, setEnabled] = useState<boolean>(cached ?? false);
  const [loading, setLoading] = useState<boolean>(!blocked && cached === undefined);

  useEffect(() => {
    if (blocked) {
      setEnabled(false);
      setLoading(false);
      return;
    }
    const known = cache.get(institutionId);
    if (known !== undefined) {
      setEnabled(known);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getHomeworkModule(institutionId)
      .then((r) => {
        cache.set(institutionId, Boolean(r.data?.enabled));
        if (!cancelled) setEnabled(Boolean(r.data?.enabled));
      })
      .catch(() => {
        // Durum okunamazsa modül kapalı sayılır — yanlışlıkla açılmasın
        if (!cancelled) setEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blocked, institutionId]);

  return { enabled, loading };
}

/** Süper admin modülü açıp kapattığında önbelleği tazelemek için. */
export function clearHomeworkModuleCache(institutionId?: string | null) {
  if (institutionId) cache.delete(String(institutionId).trim());
  else cache.clear();
}
