import { useEffect, useState } from 'react';
import { apiFetch } from './session';

/** Sunucuda BBB API tanımlı mı (Online Görüşmeler ile aynı kontrol). */
export function useBbbAutoLinkStatus() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await apiFetch('/api/meetings?op=bbb-status');
        const j = await res.json().catch(() => ({}));
        if (!cancel) setConfigured(Boolean(j.configured));
      } catch {
        if (!cancel) setConfigured(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return configured;
}
