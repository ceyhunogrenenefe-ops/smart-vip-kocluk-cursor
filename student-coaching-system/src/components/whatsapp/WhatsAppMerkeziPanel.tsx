import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
  Activity
} from 'lucide-react';
import { apiFetch } from '../../lib/session';

interface CenterSummary {
  sent_today: number;
  failed_today: number;
  pending_estimate: number;
  students_missing_phone: number;
  active_templates_count: number;
}

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
}

interface TemplateRow {
  id: string;
  name: string;
  type: string;
  variables: string[];
  channel: string;
  is_active: boolean;
  meta_template_name: string | null;
  meta_template_language: string | null;
  whatsapp_template_status: string | null;
  total_sent_window: number;
  success_count: number;
  failed_count: number;
  last_sent_at: string | null;
  badge: string;
  meta_missing: boolean;
}

interface LogRow {
  id: string;
  student_id: string | null;
  kind: string;
  phone: string | null;
  status: string;
  sent_at: string;
  error: string | null;
  student_name: string | null;
  coach_name: string | null;
  recipient: string;
  error_code: string | null;
  meta_template_name?: string | null;
}

interface LiveEv {
  id: string;
  at: string;
  status: string;
  kind: string;
  student_name: string | null;
  error_code: string | null;
  message: string | null;
}

interface CoachStudentRow {
  id: string;
  name: string;
  phone_ok: boolean;
  parent_phone_ok: boolean;
  phone_issues: string[];
  failed_last_7d: number;
  last_week_any_whatsapp_sent: boolean;
  student_line_sent: boolean;
  parent_line_sent: boolean;
}

interface CenterPayload {
  mode: string;
  today_istanbul: string;
  summary: CenterSummary;
  cron_status: CronRow[];
  templates: TemplateRow[];
  logs: LogRow[];
  live_events: LiveEv[];
  coach_student_summary: CoachStudentRow[];
}

type InnerTab = 'ozet' | 'sablonlar' | 'cron' | 'log' | 'ogrenciler';

function badgeTpl(t: TemplateRow) {
  if (t.badge === 'inactive') return { emoji: '🔴', label: 'Pasif' };
  if (t.badge === 'meta_missing') return { emoji: '🟡', label: 'Meta eksik' };
  if (t.badge === 'unhealthy') return { emoji: '🟠', label: 'Hatalı / düşük başarı' };
  return { emoji: '🟢', label: 'Aktif' };
}

function badgeCron(state: string) {
  if (state === 'ok') return { emoji: '🟢', label: 'Çalışıyor', cls: 'text-emerald-800' };
  if (state === 'error') return { emoji: '🔴', label: 'Hata', cls: 'text-red-800' };
  return { emoji: '🟡', label: 'Beklenen aralıkta yok / kayıt yok', cls: 'text-amber-800' };
}

function badgeLog(status: string) {
  if (status === 'sent') return { emoji: '🟢', label: 'Başarılı' };
  if (status === 'failed') return { emoji: '🔴', label: 'Başarısız' };
  return { emoji: '🟡', label: 'Bekliyor' };
}

function buildSampleVars(keys: string[]) {
  const o: Record<string, string> = {};
  for (const k of keys || []) {
    o[k] = `(${k})`;
  }
  return o;
}

export default function WhatsAppMerkeziPanel() {
  const [payload, setPayload] = useState<CenterPayload | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [innerTab, setInnerTab] = useState<InnerTab>('ozet');
  const [testPhone, setTestPhone] = useState('');
  const [testingType, setTestingType] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState('');

  const isAdmin = payload?.mode === 'admin';

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

  useEffect(() => {
    const t = window.setInterval(() => void load(), 14_000);
    return () => window.clearInterval(t);
  }, [load]);

  const runTemplateTest = async (tpl: TemplateRow) => {
    const ph = String(testPhone || '').trim();
    if (!ph) {
      setTestMsg('Önce üstte test telefonu girin (+90 ile).');
      return;
    }
    setTestingType(tpl.type);
    setTestMsg('');
    try {
      const res = await apiFetch('/api/whatsapp/template-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_type: tpl.type,
          phone: ph,
          variables: buildSampleVars(tpl.variables)
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || res.statusText);
      setTestMsg(`Gönderildi: ${tpl.name}`);
      void load();
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setTestingType(null);
    }
  };

  if (loading && !payload) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin" />
        WhatsApp özeti yükleniyor…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadErr ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Veri alınamadı</p>
            <p className="mt-1">{loadErr}</p>
            <p className="mt-2 text-xs opacity-90">
              Cron görünümü için Supabase&apos;te <code className="rounded bg-red-100 px-1">cron_run_log</code> tablosunu
              oluşturduğunuzdan emin olun (sql/2026-05-25-cron-run-log.sql).
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 rounded-xl bg-slate-100/80 p-1">
          {(
            [
              ['ozet', 'Genel bakış'],
              ...(isAdmin ? ([['sablonlar', 'Şablonlar']] as const) : []),
              ['cron', 'Cron durumu'],
              ['log', 'Mesaj günlüğü'],
              ['ogrenciler', payload?.mode === 'scoped' ? 'Öğrencilerim' : 'Öğrenci telefonları']
            ] as const
          ).map(([id, lab]) => (
            <button
              key={id}
              type="button"
              onClick={() => setInnerTab(id as InnerTab)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                innerTab === id ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lab}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Yenile
        </button>
      </div>

      {isAdmin ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Şablon test telefonu (admin)
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+905551112233"
              className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          {testMsg ? <p className="mt-2 text-sm text-slate-700">{testMsg}</p> : null}
        </div>
      ) : null}

      {innerTab === 'ozet' && payload ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { emoji: '🟢', title: 'Bugün gönderilen', val: payload.summary.sent_today },
              { emoji: '🔴', title: 'Bugün başarısız', val: payload.summary.failed_today },
              { emoji: '🟡', title: 'Hatırlatma bekleyen (oturum)', val: payload.summary.pending_estimate },
              { emoji: '⚪', title: 'Telefonu eksik öğrenci', val: payload.summary.students_missing_phone },
              { emoji: '📨', title: 'Aktif Meta şablonu', val: payload.summary.active_templates_count }
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="text-2xl">{c.emoji}</div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{c.title}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{c.val}</p>
                <p className="mt-1 text-[11px] text-slate-400">Tarih: {payload.today_istanbul}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <Activity className="h-5 w-5 text-emerald-600" />
              <h3 className="font-semibold text-slate-900">Canlı bildirimler</h3>
              <span className="text-xs text-slate-500">(sayfa her ~14 sn güncellenir)</span>
            </div>
            <ul className="max-h-56 divide-y divide-slate-100 overflow-auto text-sm">
              {(payload.live_events || []).length ? (
                (payload.live_events || []).map((ev) => (
                  <li key={ev.id} className="flex gap-3 px-4 py-2">
                    <span className="shrink-0 text-lg">{ev.status === 'sent' ? '🟢' : '🔴'}</span>
                    <div>
                      <p className="font-medium text-slate-800">{ev.kind}</p>
                      <p className="text-slate-600">
                        {ev.student_name || 'Öğrenci belirsiz'}{' '}
                        {ev.status === 'failed' && ev.error_code ? (
                          <span className="text-red-700"> — {ev.error_code}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-400">{new Date(ev.at).toLocaleString('tr-TR')}</p>
                    </div>
                  </li>
                ))
              ) : (
                <li className="px-4 py-6 text-center text-slate-500">Henüz görüntülenecek olay yok.</li>
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {innerTab === 'sablonlar' && isAdmin && payload ? (
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Şablon</th>
                <th className="px-4 py-3">type</th>
                <th className="px-4 py-3">Meta adı</th>
                <th className="px-4 py-3">Dil</th>
                <th className="px-4 py-3">Son gönderim</th>
                <th className="px-4 py-3 text-right">Başarı / Hata</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payload.templates.map((t) => {
                const b = badgeTpl(t);
                return (
                  <tr key={t.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {b.emoji} {b.label}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{t.type}</td>
                    <td className="px-4 py-3">{t.meta_template_name || '—'}</td>
                    <td className="px-4 py-3">{t.meta_template_language}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {t.last_sent_at ? new Date(t.last_sent_at).toLocaleString('tr-TR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="text-emerald-700">{t.success_count}</span>
                      <span className="text-slate-400"> / </span>
                      <span className="text-red-700">{t.failed_count}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={Boolean(testingType)}
                        onClick={() => void runTemplateTest(t)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {testingType === t.type ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Test
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(payload.templates || []).some((t) => t.meta_missing) ? (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <strong>Kritik eksik:</strong> Bazı şablonlarda Meta template adı yok — otomatik mesaj gitmez. Mesaj Şablonları
              menüsünden veya SQL upsert ile doldurun.
            </div>
          ) : null}
        </div>
      ) : null}

      {innerTab === 'cron' && payload ? (
        <div className="grid gap-4 md:grid-cols-2">
          {payload.cron_status.map((c) => {
            const b = badgeCron(c.state);
            return (
              <div key={c.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {b.emoji} {c.label}
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{c.key}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${b.cls}`}>{b.label}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-slate-500">Son çalışma</dt>
                    <dd className="font-medium">
                      {c.last_run_at ? new Date(c.last_run_at).toLocaleString('tr-TR') : 'Kayıt yok'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Son durum</dt>
                    <dd>{c.last_ok == null ? '—' : c.last_ok ? 'OK' : 'Hatalı / başarısız'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Gönderim / hata</dt>
                    <dd>
                      🟢 {c.messages_sent} &nbsp; 🔴 {c.messages_failed}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Skip / not</dt>
                    <dd className="truncate text-xs">{c.last_skipped || '—'}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      ) : null}

      {innerTab === 'log' && payload ? (
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Öğrenci</th>
                {isAdmin ? <th className="px-3 py-2">Koç</th> : null}
                <th className="px-3 py-2">Alıcı</th>
                <th className="px-3 py-2">Tür</th>
                <th className="px-3 py-2">Telefon</th>
                <th className="px-3 py-2">Zaman</th>
                <th className="px-3 py-2">Hata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payload.logs.map((r) => {
                const b = badgeLog(r.status);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {b.emoji} {b.label}
                    </td>
                    <td className="px-3 py-2">{r.student_name || '—'}</td>
                    {isAdmin ? <td className="px-3 py-2 text-xs">{r.coach_name || '—'}</td> : null}
                    <td className="px-3 py-2 text-xs">{r.recipient}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.kind}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.phone || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString('tr-TR') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-red-700">
                      {r.status === 'failed' ? r.error_code || r.error || '—' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {innerTab === 'ogrenciler' && payload?.mode === 'scoped' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {payload.coach_student_summary.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="font-bold text-slate-900">{s.name}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {s.phone_issues.length ? (
                  <li className="flex gap-2 text-red-800">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {s.phone_issues.join('; ')}
                  </li>
                ) : (
                  <li className="flex gap-2 text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    Numara yapısı uygun görünüyor
                  </li>
                )}
                <li>
                  Öğrenci hattı (7 gün): {s.student_line_sent ? '🟢 Mesaj iletildi' : '⚪ Kayıt yok'}
                </li>
                <li>
                  Veli hattı (7 gün): {s.parent_line_sent ? '🟢 Mesaj iletildi' : '⚪ Kayıt yok'}
                </li>
                {s.failed_last_7d > 0 ? (
                  <li className="text-amber-800">
                    Son 7 günde {s.failed_last_7d} başarısız WhatsApp kaydı — Mesaj günlüğü sekmesine bakın.
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
          {!payload.coach_student_summary.length ? (
            <p className="text-sm text-slate-600">Görünür öğrenci yok veya liste boş.</p>
          ) : null}
        </div>
      ) : null}

      {innerTab === 'ogrenciler' && isAdmin ? (
        <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <strong>Yönetici görünümü:</strong> Telefon uyarı özeti kutusunda eksik öğrenci sayısı görünür. Öğrenci bazlı liste
          için Öğrenciler sayfasını veya raporları kullanın.
        </div>
      ) : null}
    </div>
  );
}
