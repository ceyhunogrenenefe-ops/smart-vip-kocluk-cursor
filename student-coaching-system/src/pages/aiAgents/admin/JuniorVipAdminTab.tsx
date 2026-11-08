import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';
import { apiFetch } from '../../../lib/session';

type BudgetService = {
  service: string;
  model: string;
  calls: number;
  usd: number;
  input_tokens: number;
  output_tokens: number;
  audio_seconds: number;
};

type Overview = {
  budget: {
    month: string;
    limit_usd: number;
    safety_margin_usd: number;
    spent_usd: number;
    open_reservations_usd: number;
    remaining_usd: number;
    paid_calls_blocked: boolean;
    calls: number;
    by_service: BudgetService[];
  } | null;
  events: {
    days: number;
    total: number;
    by_type: Record<string, number>;
    top_recurring: Array<{ event_type: string; intent: string | null; code: string | null; count: number; distinct_users: number; last_at: string }>;
  } | null;
  provider_key: 'dedicated' | 'shared' | 'missing';
  errors: Array<{ part: string; error: string }>;
};

const EVENT_LABEL: Record<string, string> = {
  tool_failed: 'Başarısız işlem',
  intent_fallback: 'Kural motoru anlayamadı (modele gitti)',
  slot_reasked: 'Aynı bilgi tekrar soruldu',
  user_correction: 'Kullanıcı düzeltmesi',
  budget_blocked: 'Bütçe nedeniyle engellendi',
  live_lessons_source_error: 'Ders programı kaynağı hatası',
  duplicate_prevented: 'Mükerrer kayıt engellendi',
  ai_error: 'Model hatası'
};

const SERVICE_LABEL: Record<string, string> = { chat: 'Metin modeli', transcribe: 'Ses tanıma', tts: 'Seslendirme', other: 'Diğer' };

function usd(n: number | undefined) {
  return `$${Number(n || 0).toFixed(4)}`;
}

/** Junior VIP: aylık toplam yapay zekâ bütçesi + hata/geri bildirim özeti (yalnız süper admin). */
export default function JuniorVipAdminTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/junior-vip?op=admin-overview');
      const j = (await res.json().catch(() => ({}))) as Overview & { error?: string };
      if (!res.ok) throw new Error(j.error || 'Yüklenemedi');
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const b = data?.budget;
  const pct = b ? Math.min(100, ((b.spent_usd + b.open_reservations_usd) / Math.max(0.0001, b.limit_usd)) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Junior VIP — bütçe ve hata takibi</h2>
        <button type="button" onClick={() => void load()} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Yenile
        </button>
      </div>

      {error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {data?.errors?.length ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Bazı veriler okunamadı ({data.errors.map((e) => e.part).join(', ')}). SQL dosyası
          (sql/2026-11-08-junior-vip-budget-events.sql) Supabase’de çalıştırılmamış olabilir.
        </p>
      ) : null}
      {data?.provider_key === 'shared' ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Junior VIP, diğer yapay zekâ özellikleriyle aynı OpenAI anahtarını kullanıyor. Bütçe defteri yalnız Junior VIP
          çağrılarını sayar; sağlayıcı tarafında da kesin sınır için ayrı bir OpenAI projesi anahtarı
          (JUNIOR_VIP_OPENAI_API_KEY) ve proje sabit harcama limiti önerilir.
        </p>
      ) : null}

      {b ? (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-slate-500">Ay (Europe/Istanbul): {b.month}</p>
            {b.paid_calls_blocked ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Ücretli çağrılar durduruldu</span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Aktif</span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Aylık sınır (toplam)" value={usd(b.limit_usd)} />
            <Stat label="Kullanılan" value={usd(b.spent_usd)} />
            <Stat label="Açık rezervasyon" value={usd(b.open_reservations_usd)} />
            <Stat label="Kalan" value={usd(b.remaining_usd)} />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full ${pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Yeni ücretli çağrılar sınırın {usd(b.safety_margin_usd)} altında durur. {b.calls} ücretli çağrı.
          </p>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1">Servis</th>
                <th>Model</th>
                <th className="text-right">Çağrı</th>
                <th className="text-right">Giriş / çıkış token</th>
                <th className="text-right">Ses (sn)</th>
                <th className="text-right">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {b.by_service.map((s) => (
                <tr key={`${s.service}-${s.model}`} className="border-t">
                  <td className="py-1">{SERVICE_LABEL[s.service] || s.service}</td>
                  <td>{s.model}</td>
                  <td className="text-right">{s.calls}</td>
                  <td className="text-right">
                    {s.input_tokens} / {s.output_tokens}
                  </td>
                  <td className="text-right">{Math.round(s.audio_seconds)}</td>
                  <td className="text-right font-medium">{usd(s.usd)}</td>
                </tr>
              ))}
              {!b.by_service.length ? (
                <tr>
                  <td colSpan={6} className="py-2 text-slate-500">
                    Bu ay ücretli çağrı yok.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {data?.events ? (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold">Son {data.events.days} gün — {data.events.total} olay</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(data.events.by_type).map(([k, v]) => (
              <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                {EVENT_LABEL[k] || k}: <strong>{v}</strong>
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm font-semibold">En sık tekrarlananlar (test senaryosu adayı)</p>
          <table className="mt-1 w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1">Olay</th>
                <th>Niyet</th>
                <th>Kod</th>
                <th className="text-right">Adet</th>
                <th className="text-right">Kişi</th>
              </tr>
            </thead>
            <tbody>
              {data.events.top_recurring.map((r) => (
                <tr key={`${r.event_type}-${r.intent}-${r.code}`} className="border-t">
                  <td className="py-1">{EVENT_LABEL[r.event_type] || r.event_type}</td>
                  <td>{r.intent || '—'}</td>
                  <td className="font-mono text-xs">{r.code || '—'}</td>
                  <td className="text-right">{r.count}</td>
                  <td className="text-right">{r.distinct_users}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Mesaj metni ve öğrenci kimliği saklanmaz. Kalıcı iyileştirmeler bu listeden test senaryosu yazılarak kodla yapılır;
            asistan kendi kuralını otomatik değiştirmez.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}
