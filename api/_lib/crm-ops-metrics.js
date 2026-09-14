/**
 * CRM operasyon metrikleri — KPI, ilk yanıt süresi, tarih aralığı.
 * Saf fonksiyonlar; handler ve test aynı mantığı kullanır.
 */

const IST_OFFSET_MS = 3 * 60 * 60 * 1000;

export function formatFirstResponse(ms) {
  if (ms == null || ms === '') return '—';
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  const totalSec = Math.round(n / 1000);
  if (totalSec < 60) return `${totalSec} sn`;
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts = [];
  if (days) parts.push(`${days} g`);
  if (hours) parts.push(`${hours} sa`);
  if (mins) parts.push(`${mins} dk`);
  if (secs && !days) parts.push(`${secs} sn`);
  return parts.join(' ') || '0 sn';
}

export function istanbulYmd(d = new Date()) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

export function addIstanbulDays(ymd, days) {
  const [y, m, day] = String(ymd).split('-').map(Number);
  const utc = Date.UTC(y, m - 1, day) + days * 86400000;
  const ist = new Date(utc);
  const yy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Pazartesi başı (ISO hafta), Europe/Istanbul */
export function istanbulWeekStart(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = date.getUTCDay(); // 0 Paz
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return addIstanbulDays(ymd, mondayOffset);
}

export function resolveOpsDateRange(preset, customFrom, customTo) {
  const today = istanbulYmd();
  const p = String(preset || 'this_week');
  if (p === 'today') return { from: today, to: today, preset: 'today' };
  if (p === 'yesterday') {
    const y = addIstanbulDays(today, -1);
    return { from: y, to: y, preset: 'yesterday' };
  }
  if (p === 'this_month') {
    return { from: `${today.slice(0, 7)}-01`, to: today, preset: 'this_month' };
  }
  if (p === 'custom') {
    const from = String(customFrom || today).slice(0, 10);
    const to = String(customTo || today).slice(0, 10);
    return { from: from <= to ? from : to, to: from <= to ? to : from, preset: 'custom' };
  }
  const weekStart = istanbulWeekStart(today);
  return { from: weekStart, to: today, preset: 'this_week' };
}

/**
 * İlk inbound → sonraki outbound ortalama ms.
 * @param {Array<{lead_id?: string, direction?: string, occurred_at?: string}>} messages
 */
export function computeFirstResponseAvgMs(messages) {
  const byLead = new Map();
  const sorted = [...(messages || [])].sort(
    (a, b) => new Date(a.occurred_at || 0).getTime() - new Date(b.occurred_at || 0).getTime()
  );
  for (const m of sorted) {
    const lid = m.lead_id || m.normalized_phone || m.phone || m.external_contact_id;
    if (!lid) continue;
    if (!byLead.has(lid)) byLead.set(lid, []);
    byLead.get(lid).push(m);
  }
  const deltas = [];
  for (const list of byLead.values()) {
    let pendingIn = null;
    for (const m of list) {
      const dir = String(m.direction || '');
      if (dir === 'inbound' && !pendingIn) {
        pendingIn = new Date(m.occurred_at || 0).getTime();
        continue;
      }
      if (dir === 'outbound' && pendingIn) {
        const out = new Date(m.occurred_at || 0).getTime();
        if (out >= pendingIn) deltas.push(out - pendingIn);
        pendingIn = null;
      }
    }
  }
  if (!deltas.length) return { avg_ms: null, samples: 0 };
  const avg = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
  return { avg_ms: avg, samples: deltas.length };
}

export function isTrialLessonLead(lead) {
  const stage = String(lead?.stage || '');
  return stage === 'trial_lesson_scheduled' || stage === 'trial_lesson_completed';
}

export function isOfferPendingLead(lead) {
  return String(lead?.stage || '') === 'offer_sent';
}

export function inIsoRange(iso, fromMs, toMs) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= fromMs && t <= toMs;
}

export const CRM_OPS_SEGMENTS = [
  { id: 'all_tracking', label: 'Tüm takip lead’leri', stage_in: null },
  { id: 'trial_no_show', label: 'Deneme dersine gelmeyenler', stage_in: ['trial_lesson_scheduled'] },
  { id: 'offer_pending', label: 'Fiyat teklifi bekleyenler', stage_in: ['offer_sent'] },
  { id: 'considering', label: 'Düşünüyor', stage_in: ['considering', 'follow_up'] },
  { id: 'new_lead', label: 'Yeni lead’ler', stage_in: ['new_lead', 'first_contact_pending'] }
];

export const CRM_SOURCE_BUCKETS = [
  { id: 'website', label: 'Web sitesi', hint: 'Form ve reklam formu' },
  { id: 'instagram', label: 'Instagram', hint: 'DM / reklam' },
  { id: 'whatsapp', label: 'WhatsApp', hint: 'Gelen mesaj' },
  { id: 'facebook', label: 'Facebook', hint: 'Messenger' },
  { id: 'other', label: 'Diğer', hint: 'Manuel / belirsiz' }
];

export function classifyLeadSource(lead) {
  const ch = String(lead?.last_inbound_channel || '').toLowerCase();
  const src = String(lead?.source || '').toLowerCase();
  if (ch === 'website' || /website|web_form|site.?form|siteform/.test(src)) return 'website';
  if (ch === 'instagram' || src.includes('instagram')) return 'instagram';
  if (ch === 'facebook' || src.includes('facebook')) return 'facebook';
  if (ch === 'whatsapp' || src.includes('whatsapp')) return 'whatsapp';
  if (/web/.test(`${ch} ${src}`)) return 'website';
  return 'other';
}

export function summarizeLeadSources(leads) {
  const counts = Object.fromEntries(CRM_SOURCE_BUCKETS.map((b) => [b.id, 0]));
  for (const l of leads || []) {
    const id = classifyLeadSource(l);
    counts[id] = (counts[id] || 0) + 1;
  }
  const total = (leads || []).length;
  return CRM_SOURCE_BUCKETS.map((b) => ({
    ...b,
    count: counts[b.id] || 0,
    pct: total ? Math.round(((counts[b.id] || 0) / total) * 1000) / 10 : 0
  }));
}
