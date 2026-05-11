import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/session';

interface CronRow {
  key: string;
  label: string;
  expectEveryMinutes: number;
  last_run_at: string | null;
  last_ok: boolean | null;
  last_skipped: string | null;
  messages_sent: number;
  messages_failed: number;
  state: string;
  age_minutes: number | null;
  awaiting_first_run?: boolean;
}

interface CronErrorRow {
  job_key: string;
  at: string;
  skipped: string | null;
  messages_failed: number;
  error: string | null;
}

interface CenterPayload {
  mode: string;
  server_time?: string;
  cron_status: CronRow[];
  cron_recent_errors: CronErrorRow[];
}

function badgeCron(state: string) {
  if (state === 'ok') return { emoji: '🟢', label: 'Çalışıyor', cls: 'bg-emerald-100 text-emerald-900' };
  if (state === 'error') return { emoji: '🔴', label: 'Hata', cls: 'bg-red-100 text-red-900' };
  if (state === 'idle_1h')
    return { emoji: '🟡', label: 'Son 1 saat tetik yok', cls: 'bg-amber-100 text-amber-900' };
  if (state === 'pending')
    return { emoji: '🔵', label: 'İlk kayıt bekleniyor', cls: 'bg-sky-100 text-sky-900' };
  if (state === 'stale')
    return { emoji: '🟡', label: 'Gecikmiş / kayıt yok', cls: 'bg-amber-100 text-amber-900' };
  return { emoji: '⚪', label: 'Belirsiz', cls: 'bg-slate-100 text-slate-800' };
}

function summarizeStates(rows: CronRow[]) {
  let ok = 0;
  let warn = 0;
  let err = 0;
  for (const c of rows) {
    if (c.state === 'ok') ok += 1;
    else if (c.state === 'error') err += 1;
    else warn += 1;
  }
  return { ok, warn, err };
}

/** Sistem Yönetimi — cron_run_log özetı (WhatsApp merkezi ile aynı API). */
export default function CronSummarySection() {
  const [payload, setPayload] = useState<CenterPayload | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoadErr('');
    try {
      const res = await apiFetch('/api/whatsapp/center');
      const j = (await res.json().catch(() => ({}))) as CenterPayload & { error?: string };
      if (!res.ok) throw new Error(j?.error || res.statusText);
      setPayload(j);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => summarizeStates(payload?.cron_status || []),
    [payload?.cron_status]
  );

  const isAdminMode = payload?.mode === 'admin';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-600" />
          <div>
            <h4 className="font-semibold text-slate-800">Cron özeti</h4>
            <p className="text-sm text-gray-500 mt-0.5">
              Kaynak: <code className="rounded bg-gray-100 px-1 text-xs">cron_run_log</code>
              {payload?.server_time ? (
                <span className="ml-2 text-xs text-slate-400">
                  Sunucu: {new Date(payload.server_time).toLocaleString('tr-TR')}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-gray-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
          <Link
            to="/coach-whatsapp-settings"
            className="inline-flex items-center rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-900 hover:bg-purple-100"
          >
            WhatsApp merkezi → Cron
          </Link>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Zaman çizelgesi Vercel üzerinde tanımlıdır; tam liste için Vercel proje ayarlarındaki Cron Jobs veya repo
        kökündeki <code className="rounded bg-gray-100 px-1">vercel.json</code>.
      </p>

      {loadErr ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadErr}</span>
        </div>
      ) : null}

      {loading && !payload ? (
        <div className="flex items-center gap-2 py-8 text-slate-600 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cron verisi yükleniyor…
        </div>
      ) : null}

      {payload && !isAdminMode ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Bu oturumda cron özeti kurum geneli değil; tam görünüm için yönetici veya süper admin hesabı kullanın.
        </p>
      ) : null}

      {payload && isAdminMode ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
              <p className="text-xs text-emerald-700 font-medium">Çalışıyor</p>
              <p className="text-2xl font-bold text-emerald-800">{counts.ok}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
              <p className="text-xs text-amber-800 font-medium">Dikkat / beklemede</p>
              <p className="text-2xl font-bold text-amber-900">{counts.warn}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-100">
              <p className="text-xs text-red-700 font-medium">Hata</p>
              <p className="text-2xl font-bold text-red-800">{counts.err}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <p className="text-xs text-slate-600 font-medium">Toplam iş</p>
              <p className="text-2xl font-bold text-slate-800">{payload.cron_status?.length ?? 0}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">İş</th>
                  <th className="px-3 py-2 hidden sm:table-cell">Anahtar</th>
                  <th className="px-3 py-2">Son çalışma</th>
                  <th className="px-3 py-2 text-right">Süre (dk)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(payload.cron_status || []).map((c) => {
                  const b = badgeCron(c.state);
                  return (
                    <tr key={c.key} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${b.cls}`}>
                          {b.emoji} {b.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">{c.label}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500 hidden sm:table-cell">{c.key}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {c.last_run_at ? new Date(c.last_run_at).toLocaleString('tr-TR') : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c.age_minutes != null ? Math.round(c.age_minutes) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(payload.cron_recent_errors || []).length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm font-semibold text-amber-950 mb-2">Son cron uyarıları / hataları</p>
              <ul className="space-y-1 text-xs text-amber-950 max-h-40 overflow-auto">
                {(payload.cron_recent_errors || []).slice(0, 12).map((e, i) => (
                  <li key={`${e.job_key}-${e.at}-${i}`} className="font-mono">
                    <span className="font-sans font-semibold">{e.job_key}</span>
                    {' · '}
                    {e.at ? new Date(e.at).toLocaleString('tr-TR') : ''}
                    {e.skipped ? ` · skip: ${e.skipped}` : ''}
                    {e.error ? ` · ${e.error}` : ''}
                    {e.messages_failed ? ` · başarısız: ${e.messages_failed}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
