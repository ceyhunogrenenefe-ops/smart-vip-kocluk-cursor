import { apiFetch } from './session';

export type ClassLivePresenceStudent = {
  student_id: string;
  name: string;
  joined_at?: string;
  joined_at_label?: string;
  camera_on?: boolean;
  microphone_on?: boolean;
  last_active_at?: string;
  last_active_label?: string;
  passive_minutes?: number;
};

export type ClassLivePresenceSummary = {
  total: number;
  joined: number;
  active: number;
  passive: number;
  absent: number;
};

export type ClassLivePresenceSnapshot = {
  session_id: string | null;
  subject?: string | null;
  live_window: boolean;
  meeting_running: boolean;
  idle_seconds: number;
  polled_at: string;
  summary: ClassLivePresenceSummary;
  active_students: ClassLivePresenceStudent[];
  passive_students: ClassLivePresenceStudent[];
  absent_students: ClassLivePresenceStudent[];
};

export type ClassLivePresenceResponse = {
  classes: Record<string, ClassLivePresenceSnapshot>;
  idle_seconds: number;
  polled_at: string;
};

export type ClassLivePresenceModalKind = 'active' | 'passive' | 'absent';

/** BBB canlı katılım — VITE_CLASS_LIVE_PRESENCE=0 ile kapatılır. */
export const CLASS_LIVE_PRESENCE_ENABLED = import.meta.env.VITE_CLASS_LIVE_PRESENCE !== '0';

export async function fetchClassLivePresence(
  classIds: string[],
  idleSeconds?: number
): Promise<ClassLivePresenceResponse> {
  if (!CLASS_LIVE_PRESENCE_ENABLED) {
    return { classes: {}, idle_seconds: 180, polled_at: new Date().toISOString() };
  }
  if (!classIds.length) {
    return { classes: {}, idle_seconds: idleSeconds ?? 180, polled_at: new Date().toISOString() };
  }
  const qs = new URLSearchParams({
    scope: 'live-presence',
    class_ids: classIds.join(',')
  });
  if (idleSeconds != null) qs.set('idle_seconds', String(idleSeconds));
  const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(j.error || 'Canlı katılım verisi alınamadı'));
  const data = j.data as ClassLivePresenceResponse | undefined;
  return data || { classes: {}, idle_seconds: 180, polled_at: new Date().toISOString() };
}

export function presenceShowsOnCard(snapshot: ClassLivePresenceSnapshot | undefined): boolean {
  if (!snapshot) return false;
  return snapshot.live_window || snapshot.meeting_running;
}
