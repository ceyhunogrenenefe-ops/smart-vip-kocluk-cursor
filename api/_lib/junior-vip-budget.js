/**
 * Junior VIP — aylık TOPLAM yapay zekâ bütçesi (varsayılan 15 USD, tüm kullanıcılar için tek havuz).
 *
 * Akış (her ücretli çağrı):
 *   1) Mümkün olan AZAMİ maliyet hesaplanır (giriş token üst sınırı + max_tokens / ses süresi üst sınırı).
 *   2) Postgres fonksiyonu `junior_vip_budget_reserve` advisory lock altında payı ayırır; sınır − güvenlik payı
 *      aşılacaksa veya açık çağrı sayısı doluysa reddeder → çağrı YAPILMAZ.
 *   3) Çağrı biter: gerçek kullanım (usage / süre) ile `junior_vip_budget_settle`.
 *      Hiç gönderilemediyse `release`. Sonuç bilinmiyorsa (ağ kopması) rezerve tutar harcanmış sayılır.
 * Veritabanına ulaşılamazsa ücretli çağrı yapılmaz (fail-closed).
 *
 * Fiyatlar: OpenAI resmi fiyatları (USD). Model listede yoksa çağrı reddedilir.
 * Ortam değişkeni JUNIOR_VIP_PRICING_JSON ile güncellenebilir, ör.
 *   {"gpt-4o-mini":{"input_per_1m":0.15,"output_per_1m":0.6},"whisper-1":{"per_minute":0.006}}
 */
import { supabaseAdmin } from './supabase-admin.js';
import { istanbulMonthKey } from './junior-vip-dates.js';

export const DEFAULT_PRICING = {
  // https://openai.com/api/pricing — Kasım 2026 itibarıyla (bkz. rapor)
  'gpt-4o-mini': { input_per_1m: 0.15, output_per_1m: 0.6 },
  'whisper-1': { per_minute: 0.006 },
  'gpt-4o-mini-transcribe': { per_minute: 0.003 },
  'gpt-transcribe': { per_minute: 0.0045 }
};

export function juniorVipPricing() {
  const raw = String(process.env.JUNIOR_VIP_PRICING_JSON || '').trim();
  if (!raw) return DEFAULT_PRICING;
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PRICING, ...parsed };
  } catch {
    return DEFAULT_PRICING;
  }
}

export class JuniorVipBudgetError extends Error {
  constructor(reason, extra = {}) {
    super(reason);
    this.code = 'budget_blocked';
    this.reason = reason;
    Object.assign(this, extra);
  }
}

/**
 * Giriş token ÜST SINIRI: bir token en az bir karakterdir → karakter sayısı + mesaj başına ek yük.
 * (Türkçe metinde gerçek değer ~karakter/3; bu bilinçli olarak kötümser — gerçek kullanım asla ayrılanı aşmaz.)
 */
export function estimateMaxInputTokens(messages) {
  let chars = 0;
  for (const m of messages || []) chars += String(m?.content || '').length;
  return chars + 8 * (messages || []).length + 16;
}

export function chatCostUsd(model, inputTokens, outputTokens) {
  const p = juniorVipPricing()[model];
  if (!p || p.input_per_1m == null || p.output_per_1m == null) return null;
  return (Math.max(0, inputTokens) / 1e6) * p.input_per_1m + (Math.max(0, outputTokens) / 1e6) * p.output_per_1m;
}

export function transcribeCostUsd(model, seconds) {
  const p = juniorVipPricing()[model];
  if (!p || p.per_minute == null) return null;
  return (Math.max(1, Math.ceil(seconds)) / 60) * p.per_minute;
}

/**
 * Ses dosyasının azami süresi: opus/webm en düşük pratik bit hızı ~6 kbps varsayımıyla.
 * (Gerçek süre genelde çok daha kısadır; mutabakatta gerçek süre kullanılır.)
 */
export function maxAudioSecondsForBytes(bytes) {
  return Math.ceil((Math.max(0, bytes) * 8) / 6000);
}

function round6(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

export async function reserveBudget({ service, model, amountUsd, panel = null, now = new Date() }) {
  const amount = round6(amountUsd);
  if (!(amount > 0)) throw new JuniorVipBudgetError('invalid_amount');
  const month = istanbulMonthKey(now);
  let res;
  try {
    res = await supabaseAdmin.rpc('junior_vip_budget_reserve', {
      p_month: month,
      p_service: service,
      p_model: model,
      p_amount: amount,
      p_panel: panel
    });
  } catch (e) {
    throw new JuniorVipBudgetError('ledger_unavailable', { detail: e?.message });
  }
  if (res?.error) throw new JuniorVipBudgetError('ledger_unavailable', { detail: res.error.message });
  const row = Array.isArray(res?.data) ? res.data[0] : res?.data;
  if (!row || !row.ok) {
    throw new JuniorVipBudgetError(row?.reason || 'budget_exhausted', {
      committed_usd: row?.committed_usd,
      limit_usd: row?.limit_usd
    });
  }
  return { id: row.reservation_id, month, amount };
}

export async function settleBudget(id, { actualUsd = null, inputTokens = null, outputTokens = null, audioSeconds = null, errorCode = null } = {}) {
  if (!id) return;
  try {
    const { error } = await supabaseAdmin.rpc('junior_vip_budget_settle', {
      p_id: id,
      p_actual: actualUsd == null ? null : round6(actualUsd),
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_audio_seconds: audioSeconds,
      p_error_code: errorCode
    });
    if (error) console.error('[junior-vip-budget] settle', error.message);
  } catch (e) {
    // Mutabakat yazılamazsa rezervasyon açık kalır ve rezerve tutar harcanmış sayılmaya devam eder (güvenli taraf)
    console.error('[junior-vip-budget] settle', e?.message || e);
  }
}

export async function releaseBudget(id, errorCode = null) {
  if (!id) return;
  try {
    const { error } = await supabaseAdmin.rpc('junior_vip_budget_release', { p_id: id, p_error_code: errorCode });
    if (error) console.error('[junior-vip-budget] release', error.message);
  } catch (e) {
    console.error('[junior-vip-budget] release', e?.message || e);
  }
}

/** Yönetici ekranı: bu ay kullanılan, açık rezervasyon, kalan ve servis/model dağılımı. */
export async function budgetOverview({ month } = {}) {
  const m = month || istanbulMonthKey();
  const [settingsRes, ledgerRes] = await Promise.all([
    supabaseAdmin.from('junior_vip_budget_settings').select('*').eq('id', 1).maybeSingle(),
    supabaseAdmin
      .from('junior_vip_ai_ledger')
      .select('service,model,status,reserved_usd,actual_usd,input_tokens,output_tokens,audio_seconds,created_at')
      .eq('month_key', m)
      .limit(20000)
  ]);
  if (ledgerRes.error) throw ledgerRes.error;
  const limit = Number(settingsRes.data?.monthly_limit_usd ?? 15);
  const margin = Number(settingsRes.data?.safety_margin_usd ?? 0.5);
  let settled = 0;
  let reserved = 0;
  let calls = 0;
  const byService = {};
  for (const r of ledgerRes.data || []) {
    const key = `${r.service}|${r.model}`;
    byService[key] ||= { service: r.service, model: r.model, calls: 0, usd: 0, input_tokens: 0, output_tokens: 0, audio_seconds: 0 };
    const b = byService[key];
    if (r.status === 'settled') {
      const v = Number(r.actual_usd ?? r.reserved_usd) || 0;
      settled += v;
      b.usd += v;
      b.calls += 1;
      calls += 1;
      b.input_tokens += Number(r.input_tokens) || 0;
      b.output_tokens += Number(r.output_tokens) || 0;
      b.audio_seconds += Number(r.audio_seconds) || 0;
    } else if (r.status === 'reserved') {
      reserved += Number(r.reserved_usd) || 0;
    }
  }
  const committed = settled + reserved;
  return {
    month: m,
    limit_usd: limit,
    safety_margin_usd: margin,
    spent_usd: round6(settled),
    open_reservations_usd: round6(reserved),
    remaining_usd: round6(Math.max(0, limit - committed)),
    paid_calls_blocked: committed >= limit - margin,
    calls,
    by_service: Object.values(byService).map((b) => ({ ...b, usd: round6(b.usd) }))
  };
}
