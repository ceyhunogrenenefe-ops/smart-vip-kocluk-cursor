import { useEffect, useState } from 'react';
import { BellRing, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { crmAdminStaffAlerts, type CrmStaffAlerts } from '../../lib/crmInboxApi';

const EVENT_LABEL: Record<string, string> = {
  sla_15: '15 dk bekleyen',
  sla_30: '30+ dk (kırmızı)',
  lead_assigned: 'Yeni lead',
  overdue_digest: 'Gecikmiş görev özeti',
  test: 'Test'
};

const STATUS_STYLE: Record<string, string> = {
  sent: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
  pending: 'bg-slate-100 text-slate-600'
};

function gatewayBadge(connected: boolean | undefined, status: string | null | undefined) {
  if (connected) return { text: 'Bağlı', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (status === 'missing_session') return { text: 'Süper admin hesabı yok', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
  return { text: 'Bağlı değil — QR ile bağlayın', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
}

/** FAZ 7 — yönetici: personele WhatsApp bildirimi ayarları */
export default function CrmStaffAlertsPanel() {
  const [data, setData] = useState<CrmStaffAlerts | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, body?: Record<string, unknown>, okMsg?: string) => {
    setBusy(key);
    try {
      const r = await crmAdminStaffAlerts(body);
      setData(r.data);
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void run('load');
  }, []);

  if (!data) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Personel WhatsApp ayarları yükleniyor…
        </p>
      </section>
    );
  }

  const badge = gatewayBadge(data.gateway_connected, data.gateway_status);
  const connected = Boolean(data.gateway_connected);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BellRing className="h-5 w-5 text-emerald-600" /> Personele WhatsApp bildirimi
          </h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            Süper admin hesabının QR ile bağlı WhatsApp hattından (ücretsiz) yalnız temsilcilere gider; müşteriye /
            veliye gitmez. Ücretli Meta şablonu kullanılmaz; hat bağlı değilse mesaj gitmez. Kurallar: 15 dk bekleyen müşteri →
            temsilci; 30+ dk → temsilci + seçili yönetici; yeni atanan lead → temsilci; 09:30 gecikmiş görev özeti. Sessiz
            saat 22:00–09:00, kişi başı saatte en fazla 6 mesaj, yalnız son 2 saatte başlayan beklemeler.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            checked={data.enabled}
            disabled={busy != null}
            onChange={(e) =>
              void run(
                'enable',
                { action: 'settings', enabled: e.target.checked },
                e.target.checked ? 'Bildirimler açıldı' : 'Bildirimler kapatıldı'
              )
            }
            className="h-4 w-4"
          />
          Açık
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Gönderen hat (süper admin QR)</p>
          <span className={`mt-1 inline-block rounded-lg border px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.text}</span>
          <p className="mt-1 text-[11px] text-slate-400">
            Hat düşerse süper admin hesabından WhatsApp ayarlarına girip QR ile yeniden bağlayın.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kırmızı uyarı yöneticisi</p>
          <select
            value={data.admin_user_id || ''}
            disabled={busy != null}
            onChange={(e) => void run('admin', { action: 'settings', admin_user_id: e.target.value }, 'Yönetici kaydedildi')}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">— Yönetici yok —</option>
            {data.agents.map((a) => (
              <option key={a.user_id} value={a.user_id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">30+ dk cevapsız müşteride bu kişiye de gider.</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Bu ay gönderilen</p>
          <p className="mt-1 font-serif text-2xl font-semibold text-slate-900 tabular-nums">{data.sent_this_month}</p>
          <button
            type="button"
            disabled={busy != null || !connected}
            title={connected ? 'Kendi numaranıza test mesajı gönderir' : 'Süper admin WhatsApp hattı bağlı değil'}
            onClick={() => void run('test', { action: 'test' }, 'Test mesajı gönderildi')}
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Bana test gönder
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Kimler alır</h4>
          <div className="space-y-1">
            {data.agents.map((a) => (
              <label key={a.user_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-sm">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={a.wa_alerts_enabled}
                    disabled={busy != null}
                    onChange={(e) =>
                      void run('agent', { action: 'agent', user_id: a.user_id, wa_alerts_enabled: e.target.checked })
                    }
                  />
                  {a.name}
                </span>
                {!a.has_phone ? <span className="text-[11px] text-rose-600">telefon yok</span> : null}
              </label>
            ))}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Son gönderimler</h4>
          {data.log.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz gönderim yok.</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {data.log.map((l) => (
                <div key={l.id} className="rounded-lg border border-slate-100 px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {l.user_name || 'Personel'} · {EVENT_LABEL[l.event_type] || l.event_type}
                    </span>
                    <span className={`rounded px-1.5 py-px ${STATUS_STYLE[l.status] || STATUS_STYLE.pending}`}>{l.status}</span>
                  </div>
                  <p className="truncate text-slate-500">{l.summary}</p>
                  {l.error ? <p className="truncate text-rose-600">{l.error}</p> : null}
                  <p className="text-[10px] text-slate-400">{new Date(l.created_at).toLocaleString('tr-TR')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
