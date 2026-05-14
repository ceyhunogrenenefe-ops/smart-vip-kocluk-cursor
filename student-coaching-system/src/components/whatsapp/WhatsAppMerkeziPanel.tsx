import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Send } from 'lucide-react';
import { apiFetch } from '../../lib/session';

interface CenterSummary {
  sent_today: number;
  failed_today: number;
  pending_messages_today: number;
  pending_estimate: number;
  students_missing_phone: number;
  active_templates_count: number;
}

interface CronErrorRow {
  job_key: string;
  at: string;
  skipped: string | null;
  messages_failed: number;
  error: string | null;
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
  age_minutes: number | null;
  awaiting_first_run?: boolean;
  discovered_from_logs?: boolean;
}

interface TemplateRow {
  id: string;
  name: string;
  type: string;
  variables: string[];
  /** Sunucu: Meta gövde sırası (twilio_variable_bindings veya variables) */
  binding_keys?: string[];
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
  lesson_reminder_student_7d: boolean;
  lesson_reminder_parent_7d: boolean;
}

interface CenterPayload {
  server_time?: string;
  mode: string;
  today_istanbul: string;
  summary: CenterSummary;
  cron_status: CronRow[];
  cron_recent_errors: CronErrorRow[];
  templates: TemplateRow[];
  logs: LogRow[];
  live_events: LiveEv[];
  coach_student_summary: CoachStudentRow[];
}

type InnerTab = 'ozet' | 'sablonlar' | 'cron' | 'log' | 'ogrenciler';

const POLL_MS = 8000;

function badgeTpl(t: TemplateRow) {
  if (t.badge === 'inactive') return { emoji: '🔴', label: 'Pasif' };
  if (t.badge === 'meta_missing') return { emoji: '🟡', label: 'Meta eksik' };
  if (t.badge === 'unhealthy') return { emoji: '🟠', label: 'Hatalı' };
  return { emoji: '🟢', label: 'Aktif' };
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

function badgeLog(status: string) {
  if (status === 'sent') return { emoji: '🟢', label: 'Başarılı' };
  if (status === 'failed') return { emoji: '🔴', label: 'Başarısız' };
  return { emoji: '🟡', label: 'Bekliyor' };
}

/** Meta test: gerçekçi Türkçe örnekler — eksik anahtar kalmaması için geniş tutuldu */
function buildSampleVars(keys: string[]): Record<string, string> {
  const todayTr = new Date().toLocaleDateString('tr-TR');
  const sampleByKey: Record<string, string> = {
    student_name: 'Ahmet Yılmaz',
    studentName: 'Ahmet Yılmaz',
    class_name: '12-A Hazırlık',
    class_label: '9A',
    subject: 'Matematik',
    lesson_name: 'Canlı ders',
    lesson_time: '19:00',
    lessonTime: '19:00',
    time: '19:00',
    lesson_date: todayTr,
    lessonDate: todayTr,
    lessonLink: 'https://example.com/ders',
    link: 'https://example.com/ders',
    meeting_link: 'https://example.com/ders',
    homework: 'Sayfa 12–14',
    body: 'Smart Koçluk test mesajı.',
    report_url: 'https://example.com/rapor',
    coach_name: 'Koç',
    date: new Date().toISOString().slice(0, 10)
  };
  const o: Record<string, string> = {};
  for (const k of keys || []) {
    const key = String(k || '').trim();
    if (!key) continue;
    o[key] = sampleByKey[key] ?? `Örnek ${key}`;
  }
  return o;
}

function bindingKeysForTest(tpl: TemplateRow): string[] {
  const bk = tpl.binding_keys;
  if (Array.isArray(bk) && bk.length) return bk;
  if (Array.isArray(tpl.variables) && tpl.variables.length) return tpl.variables;
  return [];
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
    const t = window.setInterval(() => void load(), POLL_MS);
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
          variables: buildSampleVars(bindingKeysForTest(tpl))
        })
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        validation?: { missing?: string[]; empty?: string[] };
      };
      if (!res.ok) {
        const v = j?.validation;
        const extra =
          v && (v.missing?.length || v.empty?.length)
            ? ` (${[...(v.missing || []).map((m) => `eksik:${m}`), ...(v.empty || []).map((e) => `bos:${e}`)].join(', ')})`
            : '';
        throw new Error((j?.error || res.statusText) + extra);
      }
      setTestMsg(`Gönderildi: ${tpl.name}`);
      void load();
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setTestingType(null);
    }
  };

  const summary = payload?.summary;

  if (loading && !payload) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin" />
        WhatsApp Merkezi yükleniyor…
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
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">WhatsApp Merkezi</h2>
          <p className="text-xs text-slate-500">
            {payload?.today_istanbul ? `İstanbul günü: ${payload.today_istanbul}` : ''}
            {payload?.server_time ? ` · Sunucu: ${new Date(payload.server_time).toLocaleString('tr-TR')}` : ''}
            {' · '}
            Canlı yenileme ~{POLL_MS / 1000}s
          </p>
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

      <div className="flex flex-wrap gap-2 rounded-xl bg-slate-100/90 p-1">
        {(
          [
            ['ozet', 'Özet'],
            ...(isAdmin ? ([['sablonlar', 'Şablonlar']] as const) : []),
            ['cron', 'Cron durumu'],
            ['log', 'Mesaj günlüğü'],
            ['ogrenciler', payload?.mode === 'scoped' ? 'Öğrencilerim' : 'Telefon özeti']
          ] as const
        ).map(([id, lab]) => (
          <button
            key={id}
            type="button"
            onClick={() => setInnerTab(id as InnerTab)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              innerTab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {lab}
          </button>
        ))}
      </div>

      {isAdmin ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Test mesajı — hedef telefon (yalnız yönetici)
          </label>
          <input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="+905551112233"
            className="mt-2 w-full max-w-md rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
          />
          {testMsg ? <p className="mt-2 text-sm text-slate-800">{testMsg}</p> : null}
        </div>
      ) : null}

      {/* ÖZET */}
      {innerTab === 'ozet' && payload && summary ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { emoji: '🟢', title: 'Bugün gönderilen mesaj', val: summary.sent_today },
              { emoji: '🔴', title: 'Başarısız mesaj', val: summary.failed_today },
              { emoji: '🟡', title: 'Bekleyen mesaj', val: summary.pending_messages_today ?? 0 },
              { emoji: '⚪', title: 'Telefonu eksik öğrenci', val: summary.students_missing_phone },
              { emoji: '📨', title: 'Aktif şablon sayısı', val: summary.active_templates_count }
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="text-2xl">{c.emoji}</div>
                <p className="mt-2 text-xs font-medium text-slate-600">{c.title}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{c.val}</p>
              </div>
            ))}
          </div>

          {summary.pending_estimate > 0 ? (
            <p className="text-sm text-amber-800">
              🟡 Yaklaşan <strong>grup canlı ders</strong> oturumlarında (<code className="text-xs">class_sessions</code>)
              hatırlatma henüz gitmemiş (tahmini): <strong>{summary.pending_estimate}</strong>
              <span className="block mt-1 text-xs text-amber-900/90">
                Birebir dersler (<code className="text-[10px]">teacher_lessons</code>) bu sayıya dahil değildir; onlar için
                cron <code className="text-[10px]">lesson-reminders</code> + şablonlar{' '}
                <code className="text-[10px]">lesson_reminder</code> / <code className="text-[10px]">lesson_reminder_parent</code>.
              </span>
            </p>
          ) : null}

          {(payload.cron_recent_errors || []).length > 0 ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="font-semibold text-red-950">Son cron / otomasyon hataları</p>
              <ul className="mt-2 space-y-2 text-sm text-red-900">
                {payload.cron_recent_errors.map((e, i) => (
                  <li key={`${e.job_key}-${i}`} className="rounded-lg bg-white/80 px-3 py-2">
                    <span className="font-mono text-xs">{e.job_key}</span>
                    <span className="text-slate-600">
                      {' '}
                      · {e.at ? new Date(e.at).toLocaleString('tr-TR') : ''}
                    </span>
                    <div className="mt-1 text-xs break-words">{e.error || e.skipped || '—'}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h3 className="font-semibold text-slate-900">Canlı bildirimler</h3>
              <p className="text-xs text-slate-500">Son gönderimler ve hatalar burada düşer.</p>
            </div>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-auto text-sm">
              {(payload.live_events || []).length ? (
                (payload.live_events || []).map((ev) => (
                  <li key={ev.id} className="flex gap-3 px-4 py-2.5">
                    <span className="shrink-0 text-lg">{ev.status === 'sent' ? '🟢' : '🔴'}</span>
                    <div>
                      <p className="font-medium text-slate-800">{ev.kind}</p>
                      <p className="text-slate-600">
                        {ev.student_name || '—'}
                        {ev.status === 'failed' && ev.error_code ? (
                          <span className="text-red-700"> · {ev.error_code}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-400">
                        {ev.at ? new Date(ev.at).toLocaleString('tr-TR') : ''}
                      </p>
                    </div>
                  </li>
                ))
              ) : (
                <li className="px-4 py-8 text-center text-slate-500">Henüz kayıt yok.</li>
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {/* ŞABLONLAR */}
      {innerTab === 'sablonlar' && isAdmin && payload ? (
        <div className="space-y-3">
          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Durum</th>
                  <th className="px-3 py-3">Şablon adı</th>
                  <th className="px-3 py-3">type</th>
                  <th className="px-3 py-3">Meta şablon adı</th>
                  <th className="px-3 py-3">Dil</th>
                  <th className="px-3 py-3">Aktif</th>
                  <th className="px-3 py-3">Son gönderim</th>
                  <th className="px-3 py-3 text-right">Toplam</th>
                  <th className="px-3 py-3 text-right">Başarılı</th>
                  <th className="px-3 py-3 text-right">Başarısız</th>
                  <th className="px-3 py-3">Test</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payload.templates.map((t) => {
                  const b = badgeTpl(t);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-3 whitespace-nowrap">
                        {b.emoji} {b.label}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">{t.name}</td>
                      <td className="px-3 py-3 font-mono text-xs">{t.type}</td>
                      <td className="px-3 py-3 font-mono text-xs">{t.meta_template_name || '—'}</td>
                      <td className="px-3 py-3">{t.meta_template_language || '—'}</td>
                      <td className="px-3 py-3">{t.is_active ? 'Evet' : 'Hayır'}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {t.last_sent_at ? new Date(t.last_sent_at).toLocaleString('tr-TR') : '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{t.total_sent_window}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{t.success_count}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-red-700">{t.failed_count}</td>
                      <td className="px-3 py-3">
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
                          Test gönder
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(payload.templates || []).some((t) => t.meta_missing) ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
              <strong>Kritik eksik:</strong> Meta template bağlantısı yapılmamış şablonlar var — otomatik mesaj
              gönderilemez. Mesaj Şablonlarından <code className="rounded bg-red-100 px-1">meta_template_name</code>{' '}
              doldurun.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* CRON */}
      {innerTab === 'cron' && payload ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Cron kayıtları <code className="rounded bg-slate-100 px-1 text-xs">cron_run_log</code> tablosundan gelir.
            Sık çalışan işlerde ~1 saat tetik yoksa uyarı gösterilir; günlük işlerde beklenti daha gevşektir.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {payload.cron_status.map((c) => {
              const b = badgeCron(c.state);
              return (
                <div key={c.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900">
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
                      <dt className="text-slate-500">Süre (dk)</dt>
                      <dd>{c.age_minutes != null ? Math.round(c.age_minutes) : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Gönderilen</dt>
                      <dd className="text-emerald-800">{c.messages_sent}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Hata</dt>
                      <dd className="text-red-800">{c.messages_failed}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-500">Skip / not</dt>
                      <dd className="truncate text-xs">{c.last_skipped || '—'}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
          {(payload.cron_recent_errors || []).length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Arka planda cron hataları oluştuysa yukarıda ve özet sekmesinde listelenir; sessiz kalmaması için bu kayıtlar
              saklanır.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* LOG */}
      {innerTab === 'log' && payload ? (
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Öğrenci</th>
                {isAdmin ? <th className="px-3 py-2">Koç</th> : null}
                <th className="px-3 py-2">Veli / Öğrenci</th>
                <th className="px-3 py-2">Şablon tipi</th>
                <th className="px-3 py-2">Telefon</th>
                <th className="px-3 py-2">Zaman</th>
                <th className="px-3 py-2">Hata kodu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payload.logs.map((r) => {
                const b = badgeLog(r.status);
                const errShow =
                  r.status === 'failed'
                    ? (() => {
                        const raw = r.error ? String(r.error).replace(/\s+/g, ' ').trim() : '';
                        const short =
                          r.error_code ||
                          (raw ? (raw.length > 140 ? `${raw.slice(0, 140)}…` : raw) : '—');
                        return short;
                      })()
                    : '—';
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
                    <td
                      className="max-w-[min(420px,45vw)] px-3 py-2 font-mono text-xs text-red-800 break-words"
                      title={r.status === 'failed' && r.error ? String(r.error) : undefined}
                    >
                      {errShow}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* KOÇ ÖĞRENCİLER */}
      {innerTab === 'ogrenciler' && payload?.mode === 'scoped' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {payload.coach_student_summary.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="font-bold text-slate-900">{s.name}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {s.phone_issues.length ? (
                  <li className="rounded-lg bg-red-50 px-3 py-2 text-red-900">
                    🔴 {s.phone_issues.join(' · ')}
                  </li>
                ) : null}
                <li>
                  {s.lesson_reminder_student_7d ? '🟢' : '⚪'} Ders hatırlatma (öğrenci hattı, 7 gün)
                </li>
                <li>
                  {s.lesson_reminder_parent_7d ? '🟢' : '⚪'} Veli ders hatırlatması (7 gün)
                </li>
                <li>
                  {s.student_line_sent ? '🟢' : '⚪'} Öğrenci numarasına herhangi bir WhatsApp (7 gün)
                </li>
                <li>
                  {s.parent_line_sent ? '🟢' : '⚪'} Veli numarasına herhangi bir WhatsApp (7 gün)
                </li>
                {s.failed_last_7d > 0 ? (
                  <li className="text-amber-800">
                    🔴 Son 7 günde <strong>{s.failed_last_7d}</strong> başarısız kayıt — günlük sekmesine bakın.
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
          {!payload.coach_student_summary.length ? (
            <p className="text-sm text-slate-600">Görünür öğrenci yok.</p>
          ) : null}
        </div>
      ) : null}

      {innerTab === 'ogrenciler' && isAdmin ? (
        <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          Yönetici: Özet kartındaki <strong>telefonu eksik öğrenci</strong> sayısı kurum geneli uyarıdır. Detay için
          Öğrenciler sayfasını kullanın.
        </div>
      ) : null}
    </div>
  );
}
