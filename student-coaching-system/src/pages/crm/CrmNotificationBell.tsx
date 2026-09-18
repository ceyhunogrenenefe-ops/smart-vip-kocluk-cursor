import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, BellRing, CheckCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';
import { disablePush, enablePush, getPushState, sendPushTest, type PushState } from '../../lib/crmPush';

type CrmNotification = {
  id: string;
  title: string;
  body: string;
  link_url: string;
  priority: string;
  created_at: string;
  read_at: string | null;
};

async function inboxGet<T>(op: string): Promise<T> {
  const res = await apiFetch(`/api/crm-inbox?op=${op}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || `crm_${op}_failed`);
  return json as T;
}

async function markRead(ids: string[] | null) {
  await apiFetch('/api/crm-inbox?op=notifications_read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids ? { ids } : { all: true })
  });
}

/** "2 dakika önce" */
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'az önce';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dakika önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.round(h / 24)} gün önce`;
}

const PUSH_HINT: Record<PushState, string> = {
  on: 'Bu cihazda açık — CRM kapalıyken de bildirim gelir.',
  off: 'Kapalı — CRM sekmesi kapalıyken bildirim gelmez.',
  denied: 'Tarayıcı bildirimleri engelli. Adres çubuğundaki kilit simgesinden izin verin.',
  unsupported: 'Bu tarayıcı anlık bildirimi desteklemiyor.',
  ios_needs_install: 'iPhone’da: Paylaş → “Ana Ekrana Ekle”, sonra uygulamadan açıp bildirimi etkinleştirin.'
};

/** FAZ 4 — CRM zil: okunmamış sayısı, liste, tıklayınca ilgili sohbet */
export default function CrmNotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CrmNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [push, setPush] = useState<PushState>('off');
  const [pushBusy, setPushBusy] = useState(false);
  const prevUnread = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await inboxGet<{ data: { items: CrmNotification[]; unread: number } }>('notifications');
      setItems(res.data.items);
      setUnread(res.data.unread);
      prevUnread.current = res.data.unread;
    } catch {
      /* sessiz */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    // Sayfa odaktayken service worker bildirimi burada gösterilir
    const onSw = (e: MessageEvent) => {
      if (e.data?.type === 'crm-push') {
        void load();
        toast.message(e.data.payload?.title || 'Yeni bildirim', { description: e.data.payload?.body });
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSw);
    void getPushState().then(setPush).catch(() => undefined);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      navigator.serviceWorker?.removeEventListener('message', onSw);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openItem = async (n: CrmNotification) => {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markRead([n.id]);
    }
    if (n.link_url) navigate(n.link_url);
  };

  const readAll = async () => {
    await markRead(null);
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    setUnread(0);
  };

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (push === 'on') {
        setPush(await disablePush());
        toast.message('Bu cihazda bildirimler kapatıldı');
      } else {
        const next = await enablePush();
        setPush(next);
        if (next === 'on') {
          await sendPushTest().catch(() => undefined);
          toast.success('Bildirimler açıldı — test bildirimi gönderildi');
        } else {
          toast.error(PUSH_HINT[next]);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bildirim ayarı değiştirilemedi');
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Bildirimler, ${unread} okunmamış` : 'Bildirimler'}
        className="relative inline-flex items-center rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      >
        {unread ? <BellRing className="h-5 w-5 text-emerald-700" /> : <Bell className="h-5 w-5" />}
        {unread ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1.15rem] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[1.15rem] text-white tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">Bildirimler</p>
            <button
              type="button"
              onClick={() => void readAll()}
              disabled={!unread}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Tümünü okundu yap
            </button>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length ? (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void openItem(n)}
                    className={`block w-full border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${
                      n.read_at ? '' : 'bg-emerald-50/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm ${n.read_at ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                      {!n.read_at ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-hidden /> : null}
                    </div>
                    {n.body ? <p className="mt-0.5 whitespace-pre-line text-xs text-slate-600 line-clamp-3">{n.body}</p> : null}
                    <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-6 text-center text-sm text-slate-500">Bildirim yok</li>
            )}
          </ul>
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700">Bu cihazda anlık bildirim</span>
              <button
                type="button"
                disabled={pushBusy || push === 'unsupported' || push === 'ios_needs_install'}
                onClick={() => void togglePush()}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
                  push === 'on' ? 'border border-slate-300 bg-white text-slate-700' : 'bg-emerald-600 text-white'
                }`}
              >
                {pushBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : push === 'on' ? <BellOff className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
                {push === 'on' ? 'Kapat' : 'Aç'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{PUSH_HINT[push]}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
