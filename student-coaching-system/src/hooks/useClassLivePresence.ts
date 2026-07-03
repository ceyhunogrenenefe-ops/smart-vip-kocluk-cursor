import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchClassLivePresence,
  CLASS_LIVE_PRESENCE_ENABLED,
  type ClassLivePresenceResponse,
  type ClassLivePresenceSnapshot
} from '../lib/classLivePresence';

const IDLE_MS = 180_000;
const SLOW_MS = 60_000;
const FAST_MS = 20_000;

type Options = {
  enabled: boolean;
  classIds: string[];
  idleSeconds?: number;
};

function presenceFingerprint(data: ClassLivePresenceResponse): string {
  const parts: string[] = [data.polled_at];
  for (const [id, snap] of Object.entries(data.classes)) {
    const s = snap.summary;
    parts.push(
      `${id}:${snap.meeting_running}:${s.joined}:${s.active}:${s.passive}:${s.absent}`
    );
  }
  return parts.join('|');
}

function nextPollMs(data: ClassLivePresenceResponse | null, liveClassCount: number): number {
  if (!liveClassCount) return IDLE_MS;
  if (!data) return SLOW_MS;
  const anyRunning = Object.values(data.classes).some((c) => c.meeting_running);
  return anyRunning ? FAST_MS : SLOW_MS;
}

export function useClassLivePresence({ enabled, classIds, idleSeconds }: Options) {
  const liveEnabled = enabled && CLASS_LIVE_PRESENCE_ENABLED;
  const [data, setData] = useState<ClassLivePresenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const classKey = classIds.join(',');
  const busyRef = useRef(false);
  const hasDataRef = useRef(false);
  const fingerprintRef = useRef('');
  const timerRef = useRef<number | null>(null);
  const classIdsRef = useRef(classIds);
  classIdsRef.current = classIds;

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleNext = useCallback((ms: number, run: () => void) => {
    clearTimer();
    timerRef.current = window.setTimeout(run, ms);
  }, []);

  const refresh = useCallback(async (): Promise<ClassLivePresenceResponse | null> => {
    const ids = classIdsRef.current;
    if (!liveEnabled || !ids.length || busyRef.current) return null;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return null;
    busyRef.current = true;
    setLoading((prev) => (hasDataRef.current ? prev : true));
    try {
      const next = await fetchClassLivePresence(ids, idleSeconds);
      const fp = presenceFingerprint(next);
      if (fp !== fingerprintRef.current) {
        fingerprintRef.current = fp;
        hasDataRef.current = true;
        setData(next);
      }
      setError(null);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Canlı katılım yüklenemedi');
      return null;
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [liveEnabled, idleSeconds]);

  useEffect(() => {
    if (!liveEnabled || !classIds.length) {
      clearTimer();
      hasDataRef.current = false;
      fingerprintRef.current = '';
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loop = async () => {
      if (cancelled) return;
      const next = await refresh();
      if (cancelled) return;
      const delay = nextPollMs(next, classIds.length);
      scheduleNext(delay, () => void loop());
    };

    void loop();

    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [liveEnabled, classKey, idleSeconds, refresh, scheduleNext, classIds.length]);

  const byClassId = useCallback(
    (classId: string): ClassLivePresenceSnapshot | undefined => data?.classes?.[classId],
    [data]
  );

  return { data, byClassId, loading, error, refresh };
}
