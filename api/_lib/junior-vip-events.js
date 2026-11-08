/**
 * Junior VIP — hata ve geri bildirim olayları (ölçülebilir iyileştirme için).
 * Kişisel veri en aza indirilir: mesaj metni, ad ve öğrenci kimliği SAKLANMAZ; yalnız olay türü,
 * niyet, hata kodu ve öğrenci kimliğinin geri çevrilemez kısa özeti.
 * Bu kayıtlar asistanın kodunu/talimatlarını otomatik DEĞİŞTİRMEZ; yöneticinin incelemesi içindir.
 */
import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin.js';

export const JV_EVENT_TYPES = [
  'tool_failed',
  'intent_fallback',
  'slot_reasked',
  'user_correction',
  'budget_blocked',
  'live_lessons_source_error',
  'duplicate_prevented',
  'ai_error'
];

function actorHash(id) {
  if (!id) return null;
  const salt = String(process.env.APP_JWT_SECRET || 'jv');
  return createHash('sha256').update(`${salt}|jv|${id}`).digest('hex').slice(0, 16);
}

/** Ayrıntıdan serbest metin alanlarını ayıklar (yalnız kısa kod/sayı/bool bırakır). */
function safeDetail(detail) {
  const out = {};
  for (const [k, v] of Object.entries(detail || {})) {
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 40 && /^[\w.:\-/ ]*$/.test(v)) out[k] = v;
  }
  return out;
}

export async function logJuniorVipEvent({ type, intent = null, code = null, panel = null, actorId = null, detail = {} }) {
  if (!JV_EVENT_TYPES.includes(type)) return;
  try {
    const { error } = await supabaseAdmin.from('junior_vip_events').insert({
      event_type: type,
      intent,
      code: code ? String(code).slice(0, 60) : null,
      panel,
      actor_hash: actorHash(actorId),
      detail: safeDetail(detail)
    });
    if (error && !/junior_vip_events/.test(String(error.message || ''))) {
      console.warn('[junior-vip-events]', error.message);
    }
  } catch (e) {
    console.warn('[junior-vip-events]', e?.message || e);
  }
}

/** Yönetici görünümü: son N gündeki olay sayıları + en sık tekrarlanan (tür, niyet, kod) üçlüleri. */
export async function eventsOverview({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('junior_vip_events')
    .select('event_type,intent,code,actor_hash,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  const byType = {};
  const groups = new Map();
  for (const r of data || []) {
    byType[r.event_type] = (byType[r.event_type] || 0) + 1;
    const key = `${r.event_type}|${r.intent || '-'}|${r.code || '-'}`;
    const g = groups.get(key) || { event_type: r.event_type, intent: r.intent, code: r.code, count: 0, users: new Set(), last_at: r.created_at };
    g.count += 1;
    if (r.actor_hash) g.users.add(r.actor_hash);
    groups.set(key, g);
  }
  const top = [...groups.values()]
    .map((g) => ({ ...g, distinct_users: g.users.size, users: undefined }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
  return { days, total: (data || []).length, by_type: byType, top_recurring: top };
}
