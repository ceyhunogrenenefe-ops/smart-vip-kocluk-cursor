import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import {
  rtGetDailyReport,
  rtListDailyReports,
  rtSendDailyReport,
  type CrmDailyReportRow
} from '../../lib/registrationTrackingApi';

function todayIstanbul(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function shiftDay(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

function dateLabel(ymd: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', weekday: 'long' }) {
  return new Date(`${ymd}T12:00:00+03:00`).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', ...opts });
}

function timeLabel(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Bar({ label, value, max, tone = 'bg-emerald-500' }: { label: string; value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(7rem,11rem)_1fr_3rem] items-center gap-3 text-sm">
      <span className="truncate text-slate-600">{label}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right font-semibold tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

export default function CrmDailyReportPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isAdmin = tags.includes('super_admin') || tags.includes('admin');
  const [params, setParams] = useSearchParams();
  const today = todayIstanbul();
  const rawDate = params.get('tarih') || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate <= today ? rawDate : today;

  const [report, setReport] = useState<CrmDailyReportRow | null>(null);
  const [archive, setArchive] = useState<Awaited<ReturnType<typeof rtListDailyReports>>['data']['items']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showText, setShowText] = useState(false);

  const setDate = (d: string) => setParams(d === today ? {} : { tarih: d }, { replace: true });

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const [r, list] = await Promise.all([
          rtGetDailyReport(date, refresh),
          rtListDailyReports().catch(() => ({ data: { items: [] } }))
        ]);
        setReport(r.data);
        setArchive(list.data?.items || []);
      } catch (e) {
        setReport(null);
        setError(e instanceof Error ? e.message : 'Rapor yüklenemedi');
      } finally {
        setLoading(false);
      }
    },
    [date]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const already = Boolean(report?.sent_at);
    const ok = window.confirm(
      already
        ? `Bu rapor ${timeLabel(report?.sent_at)} tarihinde gönderildi. Admin ve temsilcilere tekrar gönderilsin mi?`
        : 'Rapor admin ve temsilcilere WhatsApp ile gönderilsin mi?'
    );
    if (!ok) return;
    setSending(true);
    try {
      const res = await rtSendDailyReport(date, already);
      const d = res.data.delivery;
      if (d.failed) toast.warning(`${d.sent} kişiye gönderildi · ${d.failed} gönderilemedi`);
      else toast.success(`${d.sent} kişiye gönderildi`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  const p = report?.payload;
  const pipelineMax = useMemo(() => Math.max(0, ...(p?.pipeline || []).map((c) => c.count)), [p]);
  const sourceRows = p
    ? [
        { label: 'WhatsApp', value: p.sources.whatsapp, tone: 'bg-emerald-500' },
        { label: 'Instagram', value: p.sources.instagram, tone: 'bg-pink-500' },
        { label: 'Web sitesi', value: p.sources.website, tone: 'bg-sky-500' },
        { label: 'Facebook', value: p.sources.facebook, tone: 'bg-blue-600' },
        { label: 'Diğer', value: p.sources.other, tone: 'bg-slate-400' }
      ]
    : [];
  const sourceMax = Math.max(0, ...sourceRows.map((r) => r.value));

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">CRM · Günlük rapor</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold">{dateLabel(date)}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Her akşam 21:00’de admin ve temsilcilere WhatsApp ile gönderilir, tarih tarih arşivlenir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              aria-label="Önceki gün"
              onClick={() => setDate(shiftDay(date, -1))}
              className="p-2 text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="border-x border-slate-200 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              aria-label="Sonraki gün"
              disabled={date >= today}
              onClick={() => setDate(shiftDay(date, 1))}
              className="p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yeniden hesapla
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || loading || !report}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              WhatsApp’a gönder
            </button>
          ) : null}
        </div>
      </div>

      {loading && !report ? (
        <Loader2 className="mx-auto my-16 h-7 w-7 animate-spin text-slate-400" />
      ) : error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : p ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Gelen başvuru" value={p.sources.total} hint="Bugün oluşan yeni lead" />
            <Stat
              label="Gelen mesaj"
              value={p.inbound_messages.total}
              hint={`WA ${p.inbound_messages.whatsapp} · IG ${p.inbound_messages.instagram} · FB ${p.inbound_messages.facebook}`}
            />
            <Stat
              label="Görüşülen kişi"
              value={p.conversations.contacted}
              hint={`${p.conversations.outbound_messages} mesaj · ${p.conversations.notes} not/arama`}
            />
            <Stat label="Kesin kayıt" value={p.status.confirmed} hint={`Kaybedilen ${p.status.lost}`} />
            <Stat label="Yanıt bekleyen" value={p.waiting_reply} hint="Okunmamış açık görüşme (şu an)" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Kaynak dağılımı · nereden geldi">
              <div className="space-y-2.5">
                {sourceRows.map((r) => (
                  <Bar key={r.label} label={r.label} value={r.value} max={sourceMax} tone={r.tone} />
                ))}
              </div>
            </Section>

            <Section title="Pipeline özeti" aside={<span className="text-[11px] text-slate-500">Rapor anındaki durum</span>}>
              <div className="space-y-2.5">
                {p.pipeline.map((c) => (
                  <Bar
                    key={c.id}
                    label={c.label}
                    value={c.count}
                    max={pipelineMax}
                    tone={c.id === 'confirmed' ? 'bg-emerald-600' : c.id === 'lost' ? 'bg-rose-400' : 'bg-sky-500'}
                  />
                ))}
              </div>
            </Section>
          </div>

          <Section title="Temsilciler · kaç görüşme yapıldı">
            {p.representatives.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-[11px] uppercase text-slate-500">
                      <th className="py-2">Temsilci</th>
                      <th className="py-2 text-right">Görüşülen kişi</th>
                      <th className="py-2 text-right">Mesaj</th>
                      <th className="py-2 text-right">Not / arama</th>
                      <th className="py-2 text-right">Aşama değişikliği</th>
                      <th className="py-2 text-right">Kesin kayıt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.representatives.map((r) => (
                      <tr key={r.user_id} className="border-b border-slate-100">
                        <td className="py-2 font-medium">{r.name}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{r.contacts}</td>
                        <td className="py-2 text-right tabular-nums">{r.messages}</td>
                        <td className="py-2 text-right tabular-nums">{r.notes}</td>
                        <td className="py-2 text-right tabular-nums">{r.stage_changes}</td>
                        <td className="py-2 text-right tabular-nums">{r.confirmed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Bu gün temsilci görüşmesi kaydedilmedi.</p>
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Durum analizi · aşama değişiklikleri">
              {p.status.by_stage.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {p.status.by_stage.map((s) => (
                    <li key={s.stage} className="flex items-center justify-between py-2">
                      <span className="text-slate-700">{s.label}</span>
                      <span className="font-semibold tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Aşama değişikliği yok.</p>
              )}
              {p.tasks.due ? (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  Görevler: {p.tasks.due} bugün · {p.tasks.completed} tamamlandı · {p.tasks.open} açık
                </p>
              ) : null}
            </Section>

            <Section title="Rapor gönderimi">
              <p className="text-sm text-slate-700">
                {report?.sent_at ? (
                  <>
                    WhatsApp ile gönderildi: <strong>{timeLabel(report.sent_at)}</strong>
                  </>
                ) : (
                  'Henüz gönderilmedi.'
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">Son hesaplama: {timeLabel(report?.generated_at)}</p>
              {report?.delivery?.recipients?.length ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {report.delivery.recipients.map((r, i) => (
                    <li key={`${r.name}-${i}`} className="flex items-center justify-between gap-2">
                      <span>
                        {r.name} <span className="text-slate-400">· {r.role === 'admin' ? 'Admin' : 'Temsilci'}</span>
                      </span>
                      <span className={r.ok ? 'text-emerald-700' : 'text-red-600'}>{r.ok ? 'Gönderildi' : r.error}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                onClick={() => setShowText((v) => !v)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {showText ? 'WhatsApp metnini gizle' : 'WhatsApp metnini göster'}
              </button>
              {showText ? (
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                  {report?.message}
                </pre>
              ) : null}
            </Section>
          </div>

          <Section title="Toplu mesaj analizi">
            {p.bulk.campaigns.length ? (
              <>
                <div className="mb-3 grid gap-2 sm:grid-cols-4">
                  <Stat label="Gönderilen kişi" value={p.bulk.totals.attempted} />
                  <Stat label="Ulaştı" value={p.bulk.totals.delivered} hint={`Okundu ${p.bulk.totals.read}`} />
                  <Stat label="Beklemede" value={p.bulk.totals.pending} hint="Ulaştı bilgisi gelmedi" />
                  <Stat label="Hatalı" value={p.bulk.totals.failed} />
                </div>
                <BulkCampaignTable rows={p.bulk.campaigns} />
              </>
            ) : (
              <p className="text-sm text-slate-500">Bu gün toplu mesaj gönderilmedi.</p>
            )}
          </Section>
        </>
      ) : null}

      <Section title="Rapor arşivi">
        {archive.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase text-slate-500">
                  <th className="py-2">Tarih</th>
                  <th className="py-2 text-right">Gelen</th>
                  <th className="py-2 text-right">Görüşülen</th>
                  <th className="py-2 text-right">Kesin kayıt</th>
                  <th className="py-2 text-right">Toplu mesaj</th>
                  <th className="py-2 text-right">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((a) => (
                  <tr
                    key={a.report_date}
                    onClick={() => setDate(a.report_date)}
                    className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                      a.report_date === date ? 'bg-emerald-50/70' : ''
                    }`}
                  >
                    <td className="py-2 font-medium">{dateLabel(a.report_date, { day: 'numeric', month: 'short', weekday: 'short', year: 'numeric' })}</td>
                    <td className="py-2 text-right tabular-nums">{a.new_leads}</td>
                    <td className="py-2 text-right tabular-nums">{a.contacted}</td>
                    <td className="py-2 text-right tabular-nums">{a.confirmed}</td>
                    <td className="py-2 text-right tabular-nums">{a.bulk_sent}</td>
                    <td className="py-2 text-right text-xs">
                      {a.sent_at ? <span className="text-emerald-700">Gönderildi</span> : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Arşivde rapor yok. İlk rapor bu akşam oluşturulacak.</p>
        )}
      </Section>
    </div>
  );
}

export function BulkCampaignTable({
  rows
}: {
  rows: Array<{
    id: string;
    template_name: string | null;
    audience: string;
    created_at: string;
    created_by_name: string | null;
    attempted: number;
    delivered: number;
    read: number;
    pending: number;
    failed: number;
  }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b text-[11px] uppercase text-slate-500">
            <th className="py-2">Tarih</th>
            <th className="py-2">Şablon / kitle</th>
            <th className="py-2 text-right">Gönderilen</th>
            <th className="py-2 text-right">Ulaştı</th>
            <th className="py-2 text-right">Okundu</th>
            <th className="py-2 text-right">Beklemede</th>
            <th className="py-2 text-right">Hatalı</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="py-2 whitespace-nowrap text-slate-600">
                {timeLabel(c.created_at)}
                {c.created_by_name ? <span className="block text-[11px] text-slate-400">{c.created_by_name}</span> : null}
              </td>
              <td className="py-2">
                <span className="font-medium">{c.template_name || 'Şablon'}</span>
                {c.audience ? <span className="block text-[11px] text-slate-500">{c.audience}</span> : null}
              </td>
              <td className="py-2 text-right font-semibold tabular-nums">{c.attempted}</td>
              <td className="py-2 text-right tabular-nums text-emerald-700">{c.delivered}</td>
              <td className="py-2 text-right tabular-nums">{c.read}</td>
              <td className="py-2 text-right tabular-nums text-amber-700">{c.pending}</td>
              <td className="py-2 text-right tabular-nums text-red-600">{c.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
