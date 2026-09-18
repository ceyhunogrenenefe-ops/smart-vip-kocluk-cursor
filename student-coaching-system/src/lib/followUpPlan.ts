import { rtGetFollowUpRules, type FollowUpRules, type FollowUpStep } from './registrationTrackingApi';

/** FAZ 3 — takip planı önizlemesi (sunucudaki planFollowUps ile aynı kural: gün sonrası 10:00 TR) */
export function planFollowUps(stage: string, rules: FollowUpRules | null, nowMs = Date.now()) {
  const steps: FollowUpStep[] = rules?.[stage] || [];
  return steps.map((s) => {
    const ymd = new Date(nowMs + 3 * 3600 * 1000 + s.days * 86400000).toISOString().slice(0, 10);
    let due = new Date(`${ymd}T10:00:00+03:00`).getTime();
    if (due <= nowMs) due = nowMs + 3600 * 1000;
    return { ...s, due_at: new Date(due).toISOString() };
  });
}

let cached: { at: number; rules: FollowUpRules } | null = null;

/** Kurallar oturum başına bir kez alınır (1 dk önbellek) */
export async function loadFollowUpRules(force = false): Promise<FollowUpRules> {
  if (!force && cached && Date.now() - cached.at < 60000) return cached.rules;
  const res = await rtGetFollowUpRules();
  cached = { at: Date.now(), rules: res.data?.rules || {} };
  return cached.rules;
}

export function clearFollowUpRulesCache() {
  cached = null;
}

export const TASK_TYPE_SHORT: Record<string, string> = {
  call_parent: 'Ara',
  whatsapp: 'Mesaj',
  payment_followup: 'Ödeme',
  re_evaluate: 'Değerlendir',
  send_offer: 'Teklif',
  send_program: 'Program',
  other: 'Görev'
};

/** datetime-local değeri (tarayıcı saatinde) */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDue(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}
