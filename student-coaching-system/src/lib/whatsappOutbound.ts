import { apiFetch, getAuthToken, peekJwtClaims } from './session';

export function formatWhatsAppPhone(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

/** TR cep: 0546… → 90546… (gateway ve wa.me için) */
export function normalizeWhatsAppPhoneForSend(value: string): string {
  let d = formatWhatsAppPhone(value);
  if (!d) return '';
  if (d.startsWith('90') && d.length >= 12) return d;
  if (d.startsWith('0') && d.length === 11) return `90${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('5')) return `90${d}`;
  return d;
}

function humanizeGatewayError(status: number, data: { error?: string; detail?: string; hint?: string }): string {
  const code = String(data.error || '').trim();
  if (code === 'session_not_connected') {
    return 'WhatsApp oturumu bağlı değil. WhatsApp merkezinden QR ile yeniden bağlanın.';
  }
  if (code === 'send_message_timeout') {
    return 'WhatsApp sunucusu zaman aşımına uğradı. VPS’te gateway (pm2) çalışıyor mu kontrol edin; tekrar deneyin.';
  }
  if (code === 'send_document_timeout') {
    return 'PDF gönderimi zaman aşımına uğradı. Dosya büyük olabilir veya gateway yavaş — tekrar deneyin.';
  }
  if (code === 'payload_too_large' || code === 'document_too_large' || /payloadtoolarge/i.test(code)) {
    return 'PDF dosyası çok büyük. Gateway gövde limiti aşıldı — VPS’te whatsapp-gateway güncelleyip pm2 restart yapın.';
  }
  if (code === 'send_precheck_timeout') {
    return 'WhatsApp ön kontrolü (numara doğrulama) zaman aşımına uğradı. Bağlantı yeni açıldıysa 2-3 sn bekleyip tekrar deneyin.';
  }
  if (code === 'number_not_on_whatsapp') {
    return 'Bu numara WhatsApp’ta kayıtlı görünmüyor. Veli numarasını 05… veya 905… formatında güncelleyin.';
  }
  if (code === 'gateway_upstream_timeout') {
    return 'Mesaj gönderimi zaman aşımına uğradı. VPS gateway yanıt vermedi — pm2 restart whatsapp-gateway; WHATSAPP_GATEWAY_UPSTREAM doğru mu kontrol edin.';
  }
  if (code === 'phone_and_message_required') {
    return 'Telefon veya mesaj eksik (proxy gövdesi ulaşmamış olabilir). Sayfayı yenileyip tekrar deneyin.';
  }
  if (code === 'send_no_message_id') {
    return 'WhatsApp gateway mesaj kimliği dönmedi — gönderim doğrulanamadı. Koç WhatsApp ekranından QR oturumunu yenileyip tekrar deneyin.';
  }
  if (code === 'invalid_gateway_key') {
    return 'GATEWAY_API_KEY uyuşmuyor — VPS whatsapp-gateway .env dosyasına Vercel’deki aynı anahtarı yazın: pm2 restart whatsapp-gateway';
  }
  if (code === 'missing_token' || code === 'invalid_signature' || code === 'jwt_secret_missing') {
    return 'JWT/APP_JWT_SECRET uyuşmuyor — çıkış yapıp tekrar giriş yapın; VPS gateway .env içinde APP_JWT_SECRET Vercel ile aynı olmalı.';
  }
  if (status === 502 || code === 'fetch failed' || code === 'proxy_failed') {
    return 'VPS gateway kapalı veya erişilemiyor (502). Sunucuda: pm2 status → whatsapp-gateway çalıştırın; firewall 4010.';
  }
  const parts = [data.error, data.detail, data.hint].filter(
    (x): x is string => typeof x === 'string' && x.length > 0
  );
  if (parts.length) return parts.join(' — ');
  return `gateway_request_failed (HTTP ${status})`;
}

function isValidGatewayEnvUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\/[^\s]+/i.test(t);
}

/** HTTPS panel + HTTP VPS → aynı origin Vercel proxy (`/api/whatsapp-gateway`). */
export function resolveWhatsAppGatewayBase(): string {
  const raw = String(import.meta.env.VITE_WHATSAPP_GATEWAY_URL || '').trim();
  const gv = raw.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/$/, '');
    const proxy = `${origin}/api/whatsapp-gateway`;
    if (!gv || !isValidGatewayEnvUrl(gv)) return proxy;
    if (window.location.protocol === 'https:' && gv.startsWith('http://')) return proxy;
    return gv;
  }
  return gv && isValidGatewayEnvUrl(gv) ? gv : '';
}

type GatewayStatusPayload = {
  status?: string;
  qr?: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
};

type GatewaySendAck = {
  ok?: boolean;
  id?: string | null;
  message_id?: string | null;
  error?: string;
  detail?: string;
  hint?: string;
};

function gatewayMessageId(data: GatewaySendAck): string {
  return String(data.id || data.message_id || '').trim();
}

function assertGatewaySendAck(data: GatewaySendAck): string {
  if (data.ok === false) {
    throw new Error(humanizeGatewayError(200, data));
  }
  const mid = gatewayMessageId(data);
  if (!mid) {
    throw new Error(humanizeGatewayError(200, { error: 'send_no_message_id', hint: data.hint }));
  }
  return mid;
}

async function callGateway<T>(coachUserId: string, endpoint: string, init?: RequestInit): Promise<T> {
  const gatewayUrl = resolveWhatsAppGatewayBase();
  if (!gatewayUrl || !coachUserId) throw new Error('whatsapp_gateway_url_missing');
  const authToken = getAuthToken();
  if (!authToken) throw new Error('jwt_required_log_in_again');

  const headers = new Headers(init?.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${authToken}`);
  const gatewayKey = (import.meta.env.VITE_WHATSAPP_GATEWAY_KEY || '').trim();
  if (gatewayKey) headers.set('x-gateway-key', gatewayKey);

  const isSend = /\/send\/?$/i.test(endpoint) || /\/send-document\/?$/i.test(endpoint);
  if (isSend) headers.set('x-gateway-strict-session', '1');

  let body = init?.body;
  if (isSend && body && typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      body = JSON.stringify({ ...parsed, strict_session: true });
    } catch {
      /* keep original body */
    }
  }

  const timeoutMs = isSend ? 115000 : 28000;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${gatewayUrl}${endpoint}`, {
      headers,
      ...init,
      body: body ?? init?.body,
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(tid);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        isSend
          ? 'İstek zaman aşımı (115 sn). VPS gateway yavaş veya takılı; pm2 restart whatsapp-gateway deneyin.'
          : 'Gateway durumu alınamadı (zaman aşımı).'
      );
    }
    throw e;
  }
  clearTimeout(tid);

  const rawText = await res.text();
  let data: { error?: string; detail?: string; hint?: string; ok?: boolean } = {};
  try {
    data = rawText ? (JSON.parse(rawText) as typeof data) : {};
  } catch {
    if (/payloadtoolarge|entity too large|request entity too large/i.test(rawText)) {
      data = { error: 'payload_too_large', detail: rawText.slice(0, 200) };
    } else {
      data = { detail: rawText.slice(0, 400) };
    }
  }
  if (!res.ok) {
    throw new Error(humanizeGatewayError(res.status, data));
  }
  if (data.ok === false) {
    throw new Error(humanizeGatewayError(res.status, data));
  }
  if (isSend) {
    assertGatewaySendAck(data as GatewaySendAck);
  }
  return data as T;
}

export async function isGatewayWhatsAppConnected(coachUserId: string): Promise<boolean> {
  try {
    const data = await callGateway<GatewayStatusPayload>(coachUserId, `/sessions/${coachUserId}/status`);
    return data.status === 'connected';
  } catch {
    return false;
  }
}

export function openWaMeLink(targetPhone: string, message: string): { opened: boolean; url: string } {
  const target = normalizeWhatsAppPhoneForSend(targetPhone) || formatWhatsAppPhone(targetPhone);
  const url = `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  const opened = w != null && !w.closed;
  return { opened, url };
}

export type WhatsAppSendResult = {
  channel: 'gateway' | 'twilio' | 'meta' | 'wame';
  notice: string;
  waUrl?: string;
};

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('blob_read_failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Gateway (bağlı oturum) → Twilio → wa.me sırası — Koç WhatsApp merkezi ile aynı mantık.
 */
export async function sendWhatsAppOutbound(opts: {
  coachUserId: string;
  targetPhone: string;
  message: string;
}): Promise<WhatsAppSendResult> {
  const target = normalizeWhatsAppPhoneForSend(opts.targetPhone);
  const message = String(opts.message || '').trim();
  const coachUserId = String(opts.coachUserId || '').trim();
  if (!target) throw new Error('Geçerli telefon numarası yok');
  if (!message) throw new Error('Mesaj metni boş');

  const gatewayUrl = resolveWhatsAppGatewayBase();
  const hasJwt = Boolean(getAuthToken());

  if (gatewayUrl && coachUserId && hasJwt) {
    const gatewayConnected = await isGatewayWhatsAppConnected(coachUserId);
    if (gatewayConnected) {
      try {
        await callGateway(coachUserId, `/sessions/${coachUserId}/send`, {
          method: 'POST',
          body: JSON.stringify({ phone: target, message })
        });
        return { channel: 'gateway', notice: 'Mesaj veliye WhatsApp gateway üzerinden gönderildi.' };
      } catch (e) {
      const err = e instanceof Error ? e.message : 'gateway_send_failed';
      const { opened, url } = openWaMeLink(target, message);
        return {
          channel: 'wame',
          waUrl: url,
          notice: opened
            ? `Gateway gönderemedi (${err}). wa.me yeni sekmede açıldı.`
            : `Gateway gönderemedi (${err}). Bağlantı: ${url}`
        };
      }
    }
  }

  if (hasJwt) {
    try {
      const statusRes = await apiFetch('/api/twilio');
      const statusPayload = (await statusRes.json().catch(() => ({}))) as {
        data?: { configured?: boolean };
      };
      if (statusRes.ok && statusPayload.data?.configured) {
        const res = await apiFetch('/api/twilio', {
          method: 'POST',
          body: JSON.stringify({ to: target, message })
        });
        const payload = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        if (res.ok) {
          return { channel: 'twilio', notice: 'Analiz özeti veliye kurumsal WhatsApp (Twilio) ile gönderildi.' };
        }
        const { opened, url } = openWaMeLink(target, message);
        return {
          channel: 'wame',
          waUrl: url,
          notice: opened
            ? `Twilio (${res.status}): ${payload.error || 'hata'}. wa.me açıldı.`
            : `Twilio hatası. wa.me: ${url}`
        };
      }
    } catch {
      /* Twilio yok → wa.me */
    }
  }

  const { opened, url } = openWaMeLink(target, message);
  if (opened) {
    return {
      channel: 'wame',
      waUrl: url,
      notice:
        gatewayUrl && !hasJwt
          ? 'Sunucu oturumu (JWT) gerekli. wa.me yeni sekmede açıldı — gateway için çıkış yapıp tekrar giriş yapın.'
          : 'WhatsApp gateway bağlı değil; analiz metni wa.me ile yeni sekmede açıldı.'
    };
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
  } catch {
    /* ignore */
  }
  return {
    channel: 'wame',
    waUrl: url,
    notice: 'Tarayıcı yeni sekme açmayı engelledi. Bağlantı panoya kopyalandı veya aşağıdan açılabilir.'
  };
}

function actorRoleFromJwt(): string {
  return String(peekJwtClaims(getAuthToken())?.role || '').trim();
}

/** Veli PDF — koç, admin, öğretmen ve süper admin için kurumsal Meta */
function canUseMetaForParentPdf(): boolean {
  const r = actorRoleFromJwt();
  return r === 'super_admin' || r === 'admin' || r === 'coach' || r === 'teacher';
}

function buildParentPdfWaMeMessage(opts: {
  studentName?: string;
  title?: string;
  caption?: string;
  downloadUrl: string;
}): string {
  const student = String(opts.studentName || 'Öğrenci').trim() || 'Öğrenci';
  const title = String(opts.title || opts.caption || 'PDF raporu').trim() || 'PDF raporu';
  return (
    `Merhaba,\n\n${student} için ${title} hazır.\n\n` +
    `PDF indirme bağlantısı:\n${opts.downloadUrl}\n\n` +
    `Smart VIP Koçluk`
  );
}

/** PDF — kurumsal Meta şablonu (parent_pdf_link); gateway kullanılmaz */
export async function sendWhatsAppOutboundDocument(opts: {
  coachUserId: string;
  targetPhone: string;
  filename: string;
  base64: string;
  caption?: string;
  mimeType?: string;
  studentId?: string;
  studentName?: string;
  pdfTitle?: string;
}): Promise<WhatsAppSendResult> {
  const target = normalizeWhatsAppPhoneForSend(opts.targetPhone);
  const coachUserId = String(opts.coachUserId || '').trim();
  const base64 = String(opts.base64 || '').trim();
  const filename = String(opts.filename || 'document.pdf').trim() || 'document.pdf';
  const caption = String(opts.caption || '').trim();
  const studentName = String(opts.studentName || '').trim();
  const pdfTitle = String(opts.pdfTitle || '').trim();
  if (!target) throw new Error('Geçerli telefon numarası yok');
  if (!base64) throw new Error('Belge verisi boş');

  const hasJwt = Boolean(getAuthToken());
  const useMeta = canUseMetaForParentPdf();

  if (useMeta && hasJwt) {
    try {
      const res = await apiFetch('/api/meta/whatsapp', {
        method: 'POST',
        body: JSON.stringify({
          to: target,
          student_id: opts.studentId || undefined,
          student_name: studentName || undefined,
          pdf_title: pdfTitle || caption || undefined,
          document_base64: base64,
          filename,
          caption: caption || undefined,
          mime_type: opts.mimeType || 'application/pdf'
        })
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sid?: string | null;
        method?: string;
        error?: string;
        hint?: string;
        download_url?: string;
      };
      if (res.ok && payload.ok === true && payload.sid) {
        const method = String(payload.method || '');
        const viaTemplate = method === 'template_link';
        const viaDocument = method === 'document_link';
        return {
          channel: 'meta',
          notice: viaTemplate
            ? 'PDF bağlantısı veliye Meta şablonu ile gönderildi.'
            : viaDocument
              ? 'PDF dosyası veliye kurumsal WhatsApp (Meta) ile gönderildi.'
              : method === 'plain_text_link'
                ? 'PDF bağlantısı veliye Meta metin mesajı ile gönderildi (24 saat penceresi).'
                : 'PDF veliye kurumsal WhatsApp (Meta) ile gönderildi.'
        };
      }

      const downloadUrl = String(payload.download_url || '').trim();
      const metaErr = [payload.error, payload.hint, (payload as { template_error?: string }).template_error]
        .filter(Boolean)
        .join(' — ');
      if (downloadUrl) {
        const waMessage = buildParentPdfWaMeMessage({
          studentName,
          title: pdfTitle,
          caption,
          downloadUrl
        });
        const { opened, url } = openWaMeLink(target, waMessage);
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(downloadUrl);
          }
        } catch {
          /* ignore */
        }
        return {
          channel: 'wame',
          waUrl: url,
          notice: opened
            ? `Meta şablonu henüz hazır değil${metaErr ? ` (${metaErr})` : ''}. PDF linki wa.me ile açıldı; bağlantı panoya da kopyalandı.`
            : `Meta şablonu hazır değil. wa.me: ${url} — PDF linki panoya kopyalandı.`
        };
      }

      if (res.status !== 503 && !/meta_whatsapp_not_configured|missing_meta_whatsapp/i.test(metaErr)) {
        throw new Error(metaErr || `meta_pdf_send_failed (HTTP ${res.status})`);
      }
    } catch (e) {
      if (e instanceof Error && !/meta_whatsapp_not_configured|missing_meta_whatsapp/i.test(e.message)) {
        throw new Error(`PDF gönderilemedi: ${e.message}`);
      }
    }
  }

  if (!useMeta) {
    throw new Error('PDF gönderimi için yetkili bir personel oturumu gerekli.');
  }

  throw new Error(
    'PDF için Meta parent_pdf_link şablonunu onaylatın veya META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID tanımlayın.'
  );
}
