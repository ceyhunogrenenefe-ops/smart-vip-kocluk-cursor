import { useEffect, useState } from 'react';
import { AlertTriangle, GraduationCap, Globe, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { rtOpsLeadDrilldown, type CrmLeadDrilldownRow } from '../../lib/registrationTrackingApi';

/** Kurum dışı (yeni aday) satış hunisi */
export type ExternalFunnel = {
  total: number;
  contacted: number;
  not_contacted: number;
  in_progress: number;
  call_again: number;
  trial: number;
  registered: number;
  negative: number;
  contact_rate: number;
  conversion_rate: number;
};

/** Kurum içi (kendi öğrencimiz) özeti */
export type InternalSummary = {
  total: number;
  answered: number;
  pending: number;
  by_channel?: Array<{ id: string; label: string; count: number }>;
};

const TONE: Record<string, string> = {
  rose: 'border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100',
  sky: 'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100',
  amber: 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100',
  violet: 'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
  slate: 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
};

function saatTr(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Karta tıklanınca açılan lead listesi */
function DrilldownModal({
  bucket,
  scope,
  title,
  query,
  onClose
}: {
  bucket: string;
  scope: 'external' | 'internal';
  title: string;
  query: Record<string, string>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CrmLeadDrilldownRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let iptal = false;
    setLoading(true);
    void rtOpsLeadDrilldown({ ...query, bucket, scope })
      .then((r) => {
        if (!iptal) setRows(r.data?.items || []);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Liste alınamadı'))
      .finally(() => {
        if (!iptal) setLoading(false);
      });
    return () => {
      iptal = true;
    };
  }, [bucket, scope, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 sm:p-8">
      <div className="max-h-full w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="text-[11px] text-slate-500">{loading ? 'Yükleniyor…' : `${rows.length} kayıt`}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          {loading ? (
            <div className="flex justify-center py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length ? (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Ad</th>
                  <th className="px-3 py-2 font-medium">Telefon</th>
                  <th className="px-3 py-2 font-medium">Sınıf</th>
                  <th className="px-3 py-2 font-medium">Temsilci</th>
                  <th className="px-3 py-2 font-medium">Son iletişim</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">{r.phone || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.grade_program || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.assigned_user_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {saatTr(r.last_contact_at) || (
                        <span className="text-rose-600">dönüş yok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-10 text-center text-xs text-slate-500">Bu grupta kayıt yok.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * KURUM DIŞI — Instagram / WhatsApp vb. üzerinden gelen yeni adaylar.
 * Satış performansı burada ölçülür; kendi öğrencilerimiz bu sayılara girmez.
 */
export function ExternalFunnelPanel({
  funnel,
  query
}: {
  funnel: ExternalFunnel;
  query: Record<string, string>;
}) {
  const [open, setOpen] = useState<{ bucket: string; title: string } | null>(null);

  const cards = [
    { bucket: 'not_contacted', label: 'Dönüş yapılmadı', value: funnel.not_contacted, tone: 'rose' },
    { bucket: 'contacted', label: 'Dönüş yapıldı', value: funnel.contacted, tone: 'sky' },
    { bucket: 'in_progress', label: 'Görüşme devam ediyor', value: funnel.in_progress, tone: 'indigo' },
    { bucket: 'call_again', label: 'Tekrar aranacak', value: funnel.call_again, tone: 'amber' },
    { bucket: 'trial', label: 'Deneme dersine yönlendirildi', value: funnel.trial, tone: 'violet' },
    { bucket: 'registered', label: 'Kayıta dönüşen', value: funnel.registered, tone: 'emerald' },
    { bucket: 'negative', label: 'Olumsuz', value: funnel.negative, tone: 'slate' }
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-sky-700" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Kurum dışı — yeni adaylar</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Instagram, WhatsApp ve web sitesinden gelen {funnel.total} aday. Kendi öğrencilerimiz bu
              sayılara dahil değil. Karta tıklayın, listesi açılsın.
            </p>
          </div>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <p className="text-[11px] text-slate-500">Dönüş oranı</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">%{funnel.contact_rate}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Kayıt dönüşümü</p>
            <p className="text-lg font-semibold tabular-nums text-emerald-700">%{funnel.conversion_rate}</p>
          </div>
        </div>
      </div>

      {funnel.not_contacted > 0 ? (
        <button
          type="button"
          onClick={() => setOpen({ bucket: 'not_contacted', title: 'Dönüş yapılmayan adaylar' })}
          className="mb-3 flex w-full items-center gap-2 rounded-xl border-2 border-rose-300 bg-rose-50 px-3 py-2 text-left text-sm font-semibold text-rose-900 hover:bg-rose-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {funnel.not_contacted} adaya henüz dönüş yapılmadı — listeyi aç
        </button>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.bucket}
            type="button"
            onClick={() => setOpen({ bucket: c.bucket, title: c.label })}
            className={`rounded-xl border px-3 py-2 text-left transition ${TONE[c.tone]}`}
          >
            <p className="text-2xl font-semibold tabular-nums">{c.value}</p>
            <p className="mt-0.5 text-[11px] font-medium leading-tight">{c.label}</p>
          </button>
        ))}
      </div>

      {open ? (
        <DrilldownModal
          bucket={open.bucket}
          scope="external"
          title={open.title}
          query={query}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * KURUM İÇİ — kendi öğrencimiz / velimiz. Satış hunisine girmez;
 * burada yalnız hacim ve yanıtsız kalan görünür.
 */
export function InternalContactsPanel({
  summary,
  query
}: {
  summary: InternalSummary;
  query: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-teal-200/80 bg-teal-50/40 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-teal-700" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Kurum içi — kendi öğrencilerimiz</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Mevcut öğrenci / veli mesajları. Satış performansı sayılarına karışmaz.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
        >
          Listeyi aç
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ['Toplam', summary.total, 'text-slate-900'],
          ['Yanıtlanan', summary.answered, 'text-emerald-700'],
          ['Bekleyen', summary.pending, summary.pending > 0 ? 'text-rose-700' : 'text-slate-400']
        ].map(([label, value, cls]) => (
          <div key={String(label)} className="rounded-xl border border-teal-200 bg-white px-3 py-2">
            <p className={`text-2xl font-semibold tabular-nums ${cls as string}`}>{value as number}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-600">{label}</p>
          </div>
        ))}
      </div>

      {summary.by_channel?.length ? (
        <p className="mt-2 text-[11px] text-slate-600">
          {summary.by_channel.map((c) => `${c.label}: ${c.count}`).join(' · ')}
        </p>
      ) : null}

      {open ? (
        <DrilldownModal
          bucket="all"
          scope="internal"
          title="Kurum içi — kendi öğrencilerimiz"
          query={query}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
