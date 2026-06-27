import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { getAuthToken, getGatewaySessionUserId } from '../../lib/session';
import {
  callWhatsAppGateway,
  emptyGatewayStatusPayload,
  formatGatewaySessionError,
  gatewayResetSession,
  isGatewayStatusForSession,
  resolveWhatsAppGatewayBase,
  type GatewayStatus,
  type GatewayStatusPayload
} from '../../lib/whatsappGatewayClient';

type Props = {
  sessionId: string;
  title?: string;
  description?: string;
  envHint?: string | null;
};

function formatLinkedPhone(digits: string | null | undefined): string | null {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('90') && d.length >= 12) return `+${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return `+${d}`;
}

export default function WhatsAppGatewaySessionPanel({
  sessionId,
  title = 'WhatsApp Gateway oturumu',
  description,
  envHint
}: Props) {
  const sid = getGatewaySessionUserId(sessionId);
  const gatewayUrl = resolveWhatsAppGatewayBase();
  const hasServerJwt = Boolean(getAuthToken());
  const canUse = Boolean(gatewayUrl && sid && hasServerJwt);

  const [status, setStatus] = useState<GatewayStatus>('idle');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [gatewaySessionError, setGatewaySessionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const fetchGenRef = useRef(0);

  const isConnected = status === 'connected';
  const statusLabel = useMemo(() => {
    if (status === 'connected') return 'Bağlı';
    if (status === 'qr_ready') return 'QR hazır';
    if (status === 'connecting' || status === 'reconnecting') return 'Yeniden bağlanıyor…';
    if (status === 'logged_out') return 'Oturum kapalı';
    return 'Bağlı değil';
  }, [status]);

  const applyPayload = useCallback(
    (data: GatewayStatusPayload) => {
      if (!isGatewayStatusForSession(data, sid)) {
        const empty = emptyGatewayStatusPayload();
        setStatus(empty.status);
        setQrDataUrl(null);
        setLastConnectedAt(null);
        setLinkedPhone(null);
        setGatewaySessionError(null);
        return;
      }
      setStatus(data.status || 'idle');
      setQrDataUrl(data.qr || null);
      setLastConnectedAt(data.connectedAt || null);
      setLinkedPhone(formatLinkedPhone(data.linkedPhone));
      const err =
        data.status === 'connected' || data.status === 'reconnecting' || data.status === 'connecting'
          ? null
          : typeof data.lastError === 'string' && data.lastError.trim()
            ? data.lastError.trim()
            : data.restoreBlocked && data.hint
              ? data.hint
              : null;
      setGatewaySessionError(err);
    },
    [sid]
  );

  useEffect(() => {
    fetchGenRef.current += 1;
    const empty = emptyGatewayStatusPayload();
    setStatus(empty.status);
    setQrDataUrl(null);
    setLastConnectedAt(null);
    setLinkedPhone(null);
    setGatewaySessionError(null);
    setStatusMessage('');
  }, [sid]);

  const autoReconnectIfNeeded = useCallback(
    async (data: GatewayStatusPayload) => {
      if (!canUse) return;
      const st = data.status || 'idle';
      const transientErr = String(data.lastError || '').toLowerCase().includes('stream errored');
      const canAutoRestore =
        data.authOnDisk &&
        !data.restoreBlocked &&
        (st === 'idle' ||
          st === 'reconnecting' ||
          (st === 'logged_out' && transientErr));
      if (!canAutoRestore) return;
      if (st === 'reconnecting' || st === 'connecting') return;
      try {
        await callWhatsAppGateway<GatewayStatusPayload>(sid, `/sessions/${sid}/start`, {
          method: 'POST',
          body: JSON.stringify({ purge: false })
        });
      } catch {
        /* status poll will retry */
      }
    },
    [canUse, sid]
  );

  const fetchStatus = useCallback(async () => {
    if (!canUse) return false;
    const gen = ++fetchGenRef.current;
    try {
      const data = await callWhatsAppGateway<GatewayStatusPayload>(sid, `/sessions/${sid}/status`);
      if (gen !== fetchGenRef.current) return false;
      applyPayload(data);
      void autoReconnectIfNeeded(data);
      return true;
    } catch (e) {
      if (gen !== fetchGenRef.current) return false;
      const msg = e instanceof Error ? e.message : 'gateway_request_failed';
      setGatewaySessionError(null);
      setStatusMessage(`Durum alınamadı: ${msg}`);
      return false;
    }
  }, [applyPayload, autoReconnectIfNeeded, canUse, sid]);

  useEffect(() => {
    if (!canUse) return;
    let cancelled = false;
    let delayMs = 4000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      const ok = await fetchStatus();
      const fastPoll = status === 'connecting' || status === 'reconnecting' || status === 'qr_ready';
      delayMs = ok ? (fastPoll ? 2000 : 4000) : Math.min(delayMs * 2, 20000);
      if (!cancelled) timer = setTimeout(() => void tick(), delayMs);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canUse, fetchStatus, sid, status]);

  const startConnection = async () => {
    if (!canUse) {
      setStatusMessage(
        !hasServerJwt
          ? 'Sunucu JWT yok — çıkış yapıp tekrar giriş yapın.'
          : 'Gateway adresi veya oturum id eksik.'
      );
      return;
    }
    setIsBusy(true);
    setStatusMessage('');
    setGatewaySessionError(null);
    try {
      const errLower = String(gatewaySessionError || '').toLowerCase();
      const needsReset =
        errLower.includes('connection failure') ||
        (status === 'logged_out' && errLower.includes('bağlantı birçok kez'));
      if (needsReset) {
        const resetData = await gatewayResetSession(sid);
        applyPayload(resetData);
        if (resetData.qr) {
          setStatusMessage('Yeni QR hazır — telefonunuzdan okutun.');
          return;
        }
      }

      const started = await callWhatsAppGateway<GatewayStatusPayload & { purged?: boolean }>(
        sid,
        `/sessions/${sid}/start`,
        { method: 'POST', body: JSON.stringify({ purge: needsReset }) }
      );
      applyPayload(started);
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const snap = await callWhatsAppGateway<GatewayStatusPayload>(sid, `/sessions/${sid}/status`);
        applyPayload(snap);
        if (snap.status === 'connected' || snap.qr) break;
      }
      setStatusMessage(
        status === 'connected' || qrDataUrl
          ? 'Oturum başlatıldı.'
          : 'QR henüz gelmedi — «Oturumu sıfırla ve QR al» deneyin.'
      );
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Bağlantı başlatılamadı');
    } finally {
      setIsBusy(false);
    }
  };

  const resetSession = async () => {
    if (!canUse) return;
    setIsBusy(true);
    setGatewaySessionError(null);
    setStatusMessage('');
    try {
      const data = await gatewayResetSession(sid);
      applyPayload(data);
      setStatusMessage('Oturum sıfırlandı — QR okutun.');
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Sıfırlanamadı');
    } finally {
      setIsBusy(false);
    }
  };

  const logoutSession = async () => {
    if (!canUse) return;
    setIsBusy(true);
    try {
      await callWhatsAppGateway(sid, `/sessions/${sid}/logout`, { method: 'POST' });
      applyPayload({ status: 'logged_out', qr: null });
      setStatusMessage('Oturum kapatıldı.');
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Çıkış yapılamadı');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-white px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-slate-600">{description}</p> : null}
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isConnected ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="space-y-4 p-4 text-sm">
        {envHint ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {envHint}
          </div>
        ) : null}

        {!hasServerJwt ? (
          <p className="text-xs text-rose-700">Sunucu JWT gerekli — çıkış yapıp tekrar giriş yapın.</p>
        ) : !gatewayUrl ? (
          <p className="text-xs text-amber-700">
            Gateway proxy kapalı. Vercel: WHATSAPP_GATEWAY_UPSTREAM ve VITE_WHATSAPP_GATEWAY_URL (veya site proxy).
          </p>
        ) : !sid ? (
          <p className="text-xs text-amber-700">Oturum id tanımlı değil — BOOK_ORDER_GATEWAY_SESSION_ID ayarlayın.</p>
        ) : null}

        {sid ? (
          <p className="font-mono text-[10px] text-slate-500">
            Oturum id: …{sid.length > 12 ? sid.slice(-12) : sid}
          </p>
        ) : null}

        {gatewaySessionError && canUse ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-950">
            {formatGatewaySessionError(gatewaySessionError)}
          </div>
        ) : null}

        {statusMessage ? <p className="text-xs text-slate-600">{statusMessage}</p> : null}

        {qrDataUrl && !isConnected ? (
          <div className="flex flex-col items-center gap-2">
            <img src={qrDataUrl} alt="WhatsApp QR" className="h-48 w-48 rounded-lg border bg-white p-2" />
            <p className="text-xs text-slate-500">WhatsApp → Bağlı cihazlar → QR okut (60 sn)</p>
          </div>
        ) : null}

        {lastConnectedAt && isConnected ? (
          <p className="text-xs text-emerald-800">
            Son bağlantı: {new Date(lastConnectedAt).toLocaleString('tr-TR')}
            {linkedPhone ? ` · Hat: ${linkedPhone}` : ''}
          </p>
        ) : null}

        {!isConnected && canUse ? (
          <p className="text-xs text-slate-500">
            Bu panel yalnızca sizin kullanıcı hesabınıza bağlı WhatsApp hattını gösterir. Başka yöneticiler veya koçlar
            kendi numaralarını ayrı ayrı bağlamalıdır.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isBusy || !canUse}
            onClick={() => void startConnection()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            QR / Oturum başlat
          </button>
          <button
            type="button"
            disabled={isBusy || !canUse}
            onClick={() => void resetSession()}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
          >
            Oturumu sıfırla ve QR al
          </button>
          {isConnected ? (
            <button
              type="button"
              disabled={isBusy || !canUse}
              onClick={() => void logoutSession()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Çıkış yap
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
