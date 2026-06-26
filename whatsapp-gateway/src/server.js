import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pino from 'pino';
import qrcode from 'qrcode';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';

const SILENCE_SIGNAL_SESSION_LOGS = String(process.env.SILENCE_SIGNAL_SESSION_LOGS || '1') !== '0';
const SIGNAL_SESSION_SPAM_RE = /Closing session:\s*SessionEntry/i;
if (SILENCE_SIGNAL_SESSION_LOGS) {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, encoding, callback) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
    if (SIGNAL_SESSION_SPAM_RE.test(text)) {
      if (typeof callback === 'function') callback();
      return true;
    }
    return stdoutWrite(chunk, encoding, callback);
  };
}

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
const allowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const gatewayApiKey = String(process.env.GATEWAY_API_KEY || '').trim();
const appJwtSecret = String(process.env.APP_JWT_SECRET || '').trim();

const CONNECTING_TIMEOUT_MS = Math.min(
  120_000,
  Math.max(30_000, Number(process.env.WA_CONNECTING_TIMEOUT_MS) || 75_000)
);
const RECONNECT_TIMEOUT_MS = Math.min(
  600_000,
  Math.max(CONNECTING_TIMEOUT_MS, Number(process.env.WA_RECONNECT_TIMEOUT_MS) || 180_000)
);
const SESSION_WATCHDOG_MS = Math.min(
  300_000,
  Math.max(15_000, Number(process.env.WA_SESSION_WATCHDOG_MS) || 30_000)
);
const SESSION_KEEPALIVE_MS = Math.min(
  120_000,
  Math.max(20_000, Number(process.env.WA_SESSION_KEEPALIVE_MS) || 45_000)
);
const RECONNECT_COOLDOWN_MS = Math.min(
  600_000,
  Math.max(60_000, Number(process.env.WA_RECONNECT_COOLDOWN_MS) || 120_000)
);
const MAX_RECONNECT_ATTEMPTS = Math.min(
  50,
  Math.max(5, Number(process.env.WA_MAX_RECONNECT_ATTEMPTS) || 24)
);
const RESTORE_BLOCK_MS = Math.min(
  7 * 24 * 3600_000,
  Math.max(60_000, Number(process.env.WA_RESTORE_BLOCK_MS) || 24 * 3600_000)
);
const SEND_MESSAGE_TIMEOUT_MS = Math.min(
  60_000,
  Math.max(10_000, Number(process.env.SEND_MESSAGE_TIMEOUT_MS) || 45_000)
);
const SEND_READY_DELAY_MS = Math.min(
  5_000,
  Math.max(0, Number(process.env.WA_SEND_READY_DELAY_MS) || 500)
);
const SEND_WAIT_READY_MS = Math.min(
  45_000,
  Math.max(5_000, Number(process.env.WA_SEND_WAIT_READY_MS) || 28_000)
);
const SEND_WAIT_POLL_MS = Math.min(
  500,
  Math.max(80, Number(process.env.WA_SEND_WAIT_POLL_MS) || 200)
);
/** Varsayılan kapalı — yavaş onWhatsApp ön kontrolü gönderimi 15 sn geciktirip proxy timeout üretir. */
const SKIP_ON_WHATSAPP_CHECK = String(process.env.WA_SKIP_ON_WHATSAPP_CHECK ?? '1') !== '0';
const ON_WHATSAPP_TIMEOUT_MS = Math.min(
  8_000,
  Math.max(1_500, Number(process.env.WA_ON_WHATSAPP_TIMEOUT_MS) || 3_500)
);
const SEND_MESSAGE_RETRIES = Math.min(
  2,
  Math.max(0, Number(process.env.WA_SEND_MESSAGE_RETRIES) || 1)
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (!allowedOrigins.length || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('cors_origin_not_allowed'));
    },
    credentials: false,
  })
);
app.use(express.json({ limit: '1mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataRoot = process.env.WHATSAPP_DATA_DIR || path.resolve(__dirname, '../data');
const port = Number(process.env.PORT || 4010);

function coachAuthDir(coachId) {
  return path.join(dataRoot, String(coachId || '').trim());
}

function coachMetaPath(coachId) {
  return path.join(dataRoot, `${String(coachId || '').trim()}.meta.json`);
}

async function readSessionMeta(coachId) {
  try {
    const raw = await fs.readFile(coachMetaPath(coachId), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSessionMeta(coachId, patch) {
  const id = String(coachId || '').trim();
  if (!id) return;
  const prev = await readSessionMeta(id);
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(coachMetaPath(id), JSON.stringify(next));
}

async function clearSessionMeta(coachId) {
  try {
    await fs.rm(coachMetaPath(coachId), { force: true });
  } catch {
    /* noop */
  }
}

async function clearCoachAuth(coachId) {
  const id = String(coachId || '').trim();
  if (!id) return;
  try {
    await fs.rm(coachAuthDir(id), { recursive: true, force: true });
  } catch (err) {
    logger.warn({ err, coachId: id }, 'clearCoachAuth failed');
  }
}

function isRestoreBlocked(meta) {
  const until = Number(meta?.restoreBlockedUntil || 0);
  return until > Date.now();
}

function isRestartRequiredDisconnect(statusCode, message) {
  const msg = String(message || '').toLowerCase();
  if (statusCode === DisconnectReason.restartRequired) return true;
  if (msg.includes('restart required')) return true;
  return false;
}

/** WhatsApp XMPP stream hatası — genelde geçici; oturumu silmeyin, yeniden bağlanın. */
function isTransientStreamDisconnect(statusCode, message) {
  const msg = String(message || '').toLowerCase();
  if (msg.includes('stream errored')) return true;
  if (statusCode === DisconnectReason.timedOut) return true;
  if (statusCode === DisconnectReason.connectionLost) return true;
  return false;
}

function isQrScanTimeoutDisconnect(statusCode, message) {
  const msg = String(message || '').toLowerCase();
  if (msg.includes('qr refs attempts ended')) return true;
  if (statusCode === 408 && msg.includes('qr')) return true;
  return false;
}

function isIntentionalLogoutDisconnect(statusCode, message) {
  const msg = String(message || '').toLowerCase();
  return statusCode === DisconnectReason.loggedOut && msg.includes('intentional logout');
}

function shouldAutoRestoreSession(coachId) {
  // Varsayılan: diskte oturumu olan tüm koçları otomatik bağla (kişisel QR oturumları dahil).
  // WA_AUTO_RESTORE_ONLY_PRIORITY=1 → yalnızca BOOK_ORDER/WHATSAPP_GATEWAY_SESSION_ID (eski davranış).
  const restrict = String(process.env.WA_AUTO_RESTORE_ONLY_PRIORITY || '').trim() === '1';
  if (!restrict) return true;
  const priority = String(
    process.env.BOOK_ORDER_GATEWAY_SESSION_ID || process.env.WHATSAPP_GATEWAY_SESSION_ID || ''
  ).trim();
  if (priority && coachId !== priority) return false;
  return true;
}

function parkSessionWaitingForQr(coachId, lastError) {
  /** @type {SessionState} */
  const parked = {
    sock: null,
    status: 'logged_out',
    qr: null,
    lastError: lastError || 'QR okutulmadı — «QR / Oturum başlat» ile yeni QR alın.',
    connectedAt: null,
    generation: 0,
    startedAt: Date.now(),
    readyAt: 0,
    reconnectAttempts: 0,
    lastKeepaliveAt: 0,
    reconnectCooldownUntil: 0,
    connectingTimer: null,
  };
  sessions.set(coachId, parked);
  return parked;
}

function isFatalDisconnect(statusCode, message) {
  if (isTransientStreamDisconnect(statusCode, message)) return false;
  if (isQrScanTimeoutDisconnect(statusCode, message)) return false;
  if (isIntentionalLogoutDisconnect(statusCode, message)) return false;
  const msg = String(message || '').toLowerCase();
  if (statusCode === DisconnectReason.loggedOut) return true;
  if (statusCode === DisconnectReason.badSession) return true;
  if (statusCode === DisconnectReason.connectionReplaced) return true;
  if (msg.includes('conflict')) return true;
  if (msg.includes('logged out')) return true;
  return false;
}

function humanizeDisconnectError(errMsg) {
  const msg = String(errMsg || '').trim();
  if (!msg) return null;
  if (msg.toLowerCase().includes('stream errored')) {
    return 'Geçici bağlantı kesintisi — otomatik yeniden bağlanılıyor.';
  }
  if (msg.toLowerCase().includes('qr refs attempts ended')) {
    return 'QR okutulmadı — «QR / Oturum başlat» ile yeni QR alın.';
  }
  if (msg.toLowerCase().includes('connection failure')) {
    return 'Connection Failure — telefonda Bağlı cihazlardan eski oturumu kaldırın, sonra «Oturumu sıfırla ve QR al».';
  }
  if (msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('connection replaced')) {
    return 'Aynı numara başka yerde bağlı. Telefondan diğer WhatsApp Web oturumlarını kapatın.';
  }
  return msg;
}

async function maybeClearTransientRestoreBlock(coachId, meta) {
  if (!isRestoreBlocked(meta)) return meta;
  const reason = String(meta?.lastFatalReason || '').toLowerCase();
  if (!reason.includes('stream errored')) return meta;
  logger.info({ coachId, reason: meta.lastFatalReason }, 'clearing transient stream restore block');
  await clearSessionMeta(coachId);
  return {};
}

/**
 * @typedef {Object} SessionState
 * @property {import('@whiskeysockets/baileys').WASocket|null} sock
 * @property {string} status
 * @property {string|null} qr
 * @property {string|null} lastError
 * @property {string|null} connectedAt
 * @property {number} generation
 * @property {number} startedAt
 * @property {number} readyAt
 * @property {number} reconnectAttempts
 * @property {number} lastKeepaliveAt
 * @property {number} reconnectCooldownUntil
 * @property {ReturnType<typeof setTimeout>|null} connectingTimer
 */

/** @type {Map<string, SessionState>} */
const sessions = new Map();

/** Aynı coach için eşzamanlı setupSession çağrılarını birleştir. */
const setupInFlight = new Map();
/** Aynı coach için gönderimleri sırala (reconnect yarışını önler). */
const sendInFlight = new Map();

const b64urlToBuffer = (input) => {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLen), 'base64');
};

function verifyJwt(token) {
  if (!appJwtSecret) {
    throw new Error('jwt_secret_missing');
  }
  const [h, p, s] = String(token || '').split('.');
  if (!h || !p || !s) throw new Error('invalid_token');
  const unsigned = `${h}.${p}`;
  const expected = crypto
    .createHmac('sha256', appJwtSecret)
    .update(unsigned)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  if (expected !== s) throw new Error('invalid_signature');
  const payload = JSON.parse(b64urlToBuffer(p).toString('utf8'));
  if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('token_expired');
  return payload;
}

function requireGatewayAuth(req, res, next) {
  if (gatewayApiKey) {
    const provided = String(req.headers['x-gateway-key'] || '').trim();
    if (!provided || provided !== gatewayApiKey) {
      return res.status(401).json({ ok: false, error: 'invalid_gateway_key' });
    }
  }
  return next();
}

function requireCoachScope(req, res, next) {
  try {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      return res.status(401).json({ ok: false, error: 'missing_token' });
    }
    const payload = verifyJwt(token);
    const coachId = getCoachId(req);
    const tokenUserId = String(payload.sub || '');
    // Her kullanıcı (admin, süper admin, koç, öğretmen) yalnızca kendi oturum id'sine erişir.
    // Sunucu tarafı gönderim JWT'si sub = hedef oturum id ile imzalanır (kitap siparişi cron vb.).
    if (!tokenUserId || tokenUserId !== coachId) {
      return res.status(403).json({ ok: false, error: 'coach_scope_mismatch' });
    }
    req.actor = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: error.message || 'unauthorized' });
  }
}

function getCoachId(req) {
  return String(req.params.coachId || '').trim();
}

function normalizeDigitsForWhatsApp(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  // Yanlışlıkla +1 ile birleşmiş TR cep: 1520xxxxxxx (11 hane) → 90520xxxxxxx
  if (d.length === 11 && d.startsWith('1') && /^5\d{9}$/.test(d.slice(1))) {
    d = d.slice(1);
  }
  if (d.startsWith('90') && d.length >= 12) return d;
  if (d.startsWith('0') && d.length === 11) return `90${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('5')) return `90${d}`;
  return d;
}

function ensurePhoneJid(phone) {
  const onlyDigits = normalizeDigitsForWhatsApp(phone);
  if (!onlyDigits) return null;
  return `${onlyDigits}@s.whatsapp.net`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(fn, timeoutMs, timeoutError) {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
    Promise.resolve()
      .then(fn)
      .then((value) => {
        clearTimeout(tid);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(tid);
        reject(err);
      });
  });
}

async function runInCoachSendQueue(coachId, task) {
  const id = String(coachId || '').trim();
  if (!id) return task();
  const prev = sendInFlight.get(id) || Promise.resolve();
  const run = (async () => {
    await prev.catch(() => undefined);
    return task();
  })();
  sendInFlight.set(id, run);
  try {
    return await run;
  } finally {
    if (sendInFlight.get(id) === run) {
      sendInFlight.delete(id);
    }
  }
}

async function hasGatewayAuthOnDisk(coachId) {
  if (!coachId) return false;
  const authDir = coachAuthDir(coachId);
  try {
    const names = await fs.readdir(authDir);
    return names.some((n) => !n.startsWith('.'));
  } catch {
    return false;
  }
}

function clearConnectingTimer(session) {
  if (session?.connectingTimer) {
    clearTimeout(session.connectingTimer);
    session.connectingTimer = null;
  }
}

function isSocketOpen(sock) {
  try {
    const state = sock?.ws?.readyState;
    return state === 1 || state === undefined;
  } catch {
    return false;
  }
}

function scheduleReconnect(coachId, session, generation, reason) {
  const reasonLower = String(reason || '').toLowerCase();
  if (reasonLower.includes('qr refs')) {
    void hasGatewayAuthOnDisk(coachId).then((hasAuth) => {
      if (!hasAuth) {
        parkSessionWaitingForQr(coachId);
        return;
      }
      continueScheduleReconnect(coachId, session, generation, reason);
    });
    return;
  }
  continueScheduleReconnect(coachId, session, generation, reason);
}

function continueScheduleReconnect(coachId, session, generation, reason) {
  const now = Date.now();
  if (Number(session.reconnectCooldownUntil || 0) > now) return;

  const attempts = Number(session.reconnectAttempts || 0) + 1;
  session.reconnectAttempts = attempts;
  session.startedAt = now;
  if (attempts > MAX_RECONNECT_ATTEMPTS) {
    logger.warn({ coachId, attempts, reason }, 'max reconnect attempts — cooldown then retry');
    session.status = 'reconnecting';
    session.lastError = 'Bağlantı kesildi — otomatik yeniden bağlanılıyor (QR gerekmez).';
    session.reconnectAttempts = 0;
    session.reconnectCooldownUntil = now + RECONNECT_COOLDOWN_MS;
    setTimeout(() => {
      const cur = sessions.get(coachId);
      if (!cur || cur.generation !== generation) return;
      cur.reconnectCooldownUntil = 0;
      setupSession(coachId, { allowDiskAuth: true }).catch((err) => {
        logger.error({ err, coachId }, 'cooldown reconnect failed');
      });
    }, RECONNECT_COOLDOWN_MS);
    return;
  }
  const delay = Math.min(30_000, 1500 + attempts * 1500);
  session.status = 'reconnecting';
  session.lastError = null;
  armConnectingTimeout(coachId, session, generation);
  logger.info({ coachId, attempts, delay, reason }, 'scheduling WhatsApp reconnect');
  setTimeout(() => {
    const cur = sessions.get(coachId);
    if (!cur || cur.generation !== generation) return;
    setupSession(coachId, { allowDiskAuth: true }).catch((err) => {
      logger.error({ err, coachId }, 'scheduled reconnect failed');
    });
  }, delay);
}

function armConnectingTimeout(coachId, session, generation) {
  clearConnectingTimer(session);
  const isReconnect = session?.status === 'reconnecting';
  const timeoutMs = isReconnect ? RECONNECT_TIMEOUT_MS : CONNECTING_TIMEOUT_MS;
  session.connectingTimer = setTimeout(() => {
    const cur = sessions.get(coachId);
    if (!cur || cur.generation !== generation) return;
    if (cur.status === 'connected') return;
    if (cur.status === 'reconnecting' || cur.status === 'connecting') {
      logger.warn({ coachId, status: cur.status }, 'connect timeout — retry reconnect');
      scheduleReconnect(coachId, cur, generation, 'connect_timeout');
      return;
    }
    if (cur.status === 'qr_ready') {
      logger.warn({ coachId }, 'QR timeout — waiting for scan');
      armConnectingTimeout(coachId, cur, generation);
      return;
    }
    logger.warn({ coachId, status: cur.status }, 'connecting timeout — tearing down');
    void stopSession(coachId, {
      clearAuth: false,
      lastError: 'Bağlantı zaman aşımı — Oturumu sıfırlayıp yeni QR alın.',
      status: 'logged_out',
    });
  }, timeoutMs);
}

async function endSocket(sock) {
  if (!sock) return;
  try {
    sock.ev.removeAllListeners('connection.update');
    sock.ev.removeAllListeners('creds.update');
  } catch {
    /* noop */
  }
  try {
    await sock.end(undefined);
  } catch {
    try {
      sock.ws?.close();
    } catch {
      /* noop */
    }
  }
}

/**
 * Oturumu bellekten ve isteğe bağlı diskten temizler.
 * @param {string} coachId
 * @param {{ clearAuth?: boolean, lastError?: string|null, status?: string, blockRestore?: boolean, blockReason?: string }} [opts]
 */
async function stopSession(coachId, opts = {}) {
  const id = String(coachId || '').trim();
  if (!id) return;

  setupInFlight.delete(id);

  const session = sessions.get(id);
  if (session) {
    clearLinkedJidOwner(id, session);
    clearConnectingTimer(session);
    await endSocket(session.sock);
    sessions.delete(id);
  }

  if (opts.clearAuth) {
    await clearCoachAuth(id);
  }

  if (opts.blockRestore) {
    await writeSessionMeta(id, {
      restoreBlockedUntil: Date.now() + RESTORE_BLOCK_MS,
      lastFatalReason: opts.blockReason || opts.lastError || 'fatal_disconnect',
    });
  }

  if (opts.status || opts.lastError) {
    /** @type {SessionState} */
    const parked = {
      sock: null,
      status: opts.status || 'logged_out',
      qr: null,
      lastError: opts.lastError ? humanizeDisconnectError(opts.lastError) : null,
      connectedAt: null,
      generation: 0,
      startedAt: Date.now(),
      readyAt: 0,
      reconnectAttempts: 0,
      connectingTimer: null,
    };
    sessions.set(id, parked);
  }
}

async function stopStuckSessionIfNeeded(coachId) {
  const session = sessions.get(coachId);
  if (!session) return;
  if (session.status === 'connected' || session.status === 'qr_ready') return;
  if (setupInFlight.has(coachId)) return;
  const elapsed = Date.now() - Number(session.startedAt || 0);
  if (session.status === 'reconnecting' && elapsed < RECONNECT_TIMEOUT_MS) return;
  if (session.status === 'connecting' && elapsed < CONNECTING_TIMEOUT_MS) return;
  if (session.status === 'reconnecting' || session.status === 'connecting') {
    logger.warn({ coachId, status: session.status, elapsed }, 'stuck session — forcing reconnect');
    clearConnectingTimer(session);
    if (session.sock) {
      await endSocket(session.sock);
      session.sock = null;
    }
    session.startedAt = Date.now();
    session.generation = Number(session.generation || 0) + 1;
    void setupSession(coachId, { allowDiskAuth: true }).catch((err) => {
      logger.error({ err, coachId }, 'stuck session reconnect failed');
    });
  }
}

function linkedPhoneFromSession(session) {
  const jid = session?.sock?.user?.id;
  if (!jid) return null;
  const digits = String(jid).replace(/@.+$/, '').replace(/\D/g, '');
  return digits || null;
}

function sessionPayload(coachId, session, extra = {}) {
  const st = session?.status || 'idle';
  const linkedPhone = st === 'connected' ? linkedPhoneFromSession(session) : null;
  return {
    ok: true,
    coachId,
    sessionCoachId: coachId,
    status: st,
    qr: session?.qr || null,
    connectedAt: session?.connectedAt || null,
    lastError: session?.lastError || null,
    linkedPhone,
    ...extra,
  };
}

/** Aynı WhatsApp numarasının birden fazla panel kullanıcısına bağlanmasını engeller. */
/** @type {Map<string, string>} */
const linkedJidOwner = new Map();

function clearLinkedJidOwner(coachId, session) {
  const jid = session?.sock?.user?.id;
  if (!jid) return;
  if (linkedJidOwner.get(jid) === coachId) linkedJidOwner.delete(jid);
}

function registerLinkedJidOwner(coachId, sock) {
  const jid = sock?.user?.id;
  if (!jid) return null;
  const existing = linkedJidOwner.get(jid);
  if (existing && existing !== coachId) return existing;
  linkedJidOwner.set(jid, coachId);
  return null;
}

async function setupSession(coachId, { allowDiskAuth = true } = {}) {
  if (!coachId) throw new Error('coachId is required');

  if (setupInFlight.has(coachId)) {
    return setupInFlight.get(coachId);
  }

  const work = (async () => {
    await stopStuckSessionIfNeeded(coachId);

    let meta = await readSessionMeta(coachId);
    meta = await maybeClearTransientRestoreBlock(coachId, meta);
    const hasAuthOnDisk = await hasGatewayAuthOnDisk(coachId);
    if (!allowDiskAuth || isRestoreBlocked(meta)) {
      if (hasAuthOnDisk && isRestoreBlocked(meta)) {
        await clearCoachAuth(coachId);
      }
    }
    if (!allowDiskAuth && !hasAuthOnDisk) {
      const parked = sessions.get(coachId);
      if (parked && (parked.status === 'logged_out' || parked.status === 'qr_ready') && !parked.sock) {
        return parked;
      }
    }
    if (isRestoreBlocked(meta) && !(await hasGatewayAuthOnDisk(coachId))) {
      return parkSessionWaitingForQr(
        coachId,
        'Önceki oturum hatalı — «Oturumu sıfırla ve QR al» ile temiz başlayın.'
      );
    }

    const existing = sessions.get(coachId);
    if (existing?.sock && existing.status === 'connected') return existing;
    if (
      existing &&
      !existing.sock &&
      (existing.status === 'connecting' || existing.status === 'reconnecting') &&
      Date.now() - existing.startedAt < 5000
    ) {
      return existing;
    }

    if (existing?.sock) {
      await endSocket(existing.sock);
    }
    clearConnectingTimer(existing);

    const generation = (existing?.generation || 0) + 1;
    const priorReconnectAttempts = Number(existing?.reconnectAttempts || 0);
    const authDir = coachAuthDir(coachId);

    if (!allowDiskAuth) {
      await clearCoachAuth(coachId);
      await clearSessionMeta(coachId);
    } else if (isRestoreBlocked(meta)) {
      await clearCoachAuth(coachId);
    }

    await fs.mkdir(authDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    /** @type {SessionState} */
    const sessionState = {
      sock: null,
      status: 'connecting',
      qr: null,
      lastError: null,
      connectedAt: null,
      generation,
      startedAt: Date.now(),
      readyAt: 0,
      reconnectAttempts: priorReconnectAttempts,
      lastKeepaliveAt: existing?.lastKeepaliveAt || 0,
      reconnectCooldownUntil: existing?.reconnectCooldownUntil || 0,
      connectingTimer: null,
    };
    sessions.set(coachId, sessionState);
    if (priorReconnectAttempts > 0) {
      sessionState.status = 'reconnecting';
    }
    armConnectingTimeout(coachId, sessionState, generation);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Online VIP Ders', 'Chrome', '120.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: () => false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 10_000,
      retryRequestDelayMs: 250,
      getMessage: async () => undefined,
    });
    sessionState.sock = sock;

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (update) => {
      const cur = sessions.get(coachId);
      if (!cur || cur.generation !== generation) return;

      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        sessionState.qr = await qrcode.toDataURL(qr);
        sessionState.status = 'qr_ready';
        sessionState.lastError = null;
      }

      if (connection === 'open') {
        clearConnectingTimer(sessionState);
        const conflictCoach = registerLinkedJidOwner(coachId, sock);
        if (conflictCoach) {
          logger.warn({ coachId, conflictCoach, jid: sock.user?.id }, 'WhatsApp number already linked to another user');
          sessionState.sock = null;
          sessionState.status = 'logged_out';
          sessionState.qr = null;
          sessionState.lastError =
            'Bu WhatsApp numarası başka bir kullanıcı hesabına bağlı. O hesaptan çıkış yapın veya kendi numaranızı QR ile bağlayın.';
          try {
            await endSocket(sock);
          } catch {
            /* noop */
          }
          return;
        }
        sessionState.status = 'connected';
        sessionState.qr = null;
        sessionState.connectedAt = new Date().toISOString();
        sessionState.startedAt = Date.now();
        sessionState.readyAt = Date.now() + SEND_READY_DELAY_MS;
        sessionState.lastError = null;
        sessionState.reconnectAttempts = 0;
        sessionState.reconnectCooldownUntil = 0;
        sessionState.lastKeepaliveAt = Date.now();
        await clearSessionMeta(coachId);
        logger.info({ coachId }, 'WhatsApp connected');
      }

      if (connection === 'close') {
        clearConnectingTimer(sessionState);
        clearLinkedJidOwner(coachId, sessionState);
        const code = lastDisconnect?.error?.output?.statusCode;
        const errMsg = lastDisconnect?.error?.message || null;
        sessionState.sock = null;

        if (isRestartRequiredDisconnect(code, errMsg)) {
          logger.info({ coachId, code, errMsg }, 'WhatsApp restart required — reconnecting with same auth');
          scheduleReconnect(coachId, sessionState, generation, 'restart_required');
          return;
        }

        if (isTransientStreamDisconnect(code, errMsg)) {
          sessionState.lastError = null;
          logger.warn({ coachId, code, errMsg }, 'WhatsApp transient stream error — auto reconnect');
          scheduleReconnect(coachId, sessionState, generation, errMsg || 'stream_error');
          return;
        }

        if (isQrScanTimeoutDisconnect(code, errMsg)) {
          sessionState.reconnectAttempts = 0;
          const hasAuth = await hasGatewayAuthOnDisk(coachId);
          if (hasAuth) {
            logger.warn({ coachId, code, errMsg }, 'QR timeout with saved auth — reconnect');
            scheduleReconnect(coachId, sessionState, generation, 'qr_refs_retry');
          } else {
            parkSessionWaitingForQr(coachId);
            logger.warn({ coachId, code, errMsg }, 'QR scan timeout — parked until user starts');
          }
          return;
        }

        if (isIntentionalLogoutDisconnect(code, errMsg)) {
          await clearCoachAuth(coachId);
          await clearSessionMeta(coachId);
          sessionState.status = 'logged_out';
          sessionState.qr = null;
          sessionState.reconnectAttempts = 0;
          sessionState.lastError = 'Oturum kapatıldı — yeniden bağlanmak için QR okutun.';
          logger.info({ coachId, code, errMsg }, 'WhatsApp intentional logout');
          return;
        }

        const fatal = isFatalDisconnect(code, errMsg);
        if (fatal) {
          await clearCoachAuth(coachId);
          sessionState.status = 'logged_out';
          sessionState.qr = null;
          sessionState.reconnectAttempts = 0;
          sessionState.lastError = humanizeDisconnectError(errMsg);
          await writeSessionMeta(coachId, {
            restoreBlockedUntil: Date.now() + RESTORE_BLOCK_MS,
            lastFatalReason: errMsg || String(code || 'fatal'),
          });
          logger.warn({ coachId, code, errMsg }, 'WhatsApp fatal disconnect');
          return;
        }

        sessionState.lastError = humanizeDisconnectError(errMsg);
        logger.warn({ coachId, code, errMsg }, 'WhatsApp disconnected — auto reconnect');
        scheduleReconnect(coachId, sessionState, generation, errMsg || String(code || 'disconnect'));
      }
    });

    return sessionState;
  })();

  setupInFlight.set(coachId, work);
  try {
    return await work;
  } finally {
    setupInFlight.delete(coachId);
  }
}

async function ensureConnectedForSend(coachId, { waitMs = SEND_WAIT_READY_MS } = {}) {
  if (setupInFlight.has(coachId)) {
    try {
      await setupInFlight.get(coachId);
    } catch {
      /* setup failed — fall through */
    }
  }

  const waitUntilReady = async (ms) => {
    const deadline = Date.now() + Math.max(200, ms);
    while (Date.now() < deadline) {
      const cur = sessions.get(coachId);
      if (
        cur?.sock &&
        cur.status === 'connected' &&
        cur.sock.user &&
        Date.now() >= Number(cur.readyAt || 0)
      ) {
        return cur;
      }
      await sleep(SEND_WAIT_POLL_MS);
    }
    return null;
  };

  let session = sessions.get(coachId);
  if (session?.sock && session.status === 'connected' && session.sock.user) {
    if (Date.now() < Number(session.readyAt || 0)) {
      return waitUntilReady(Math.max(500, Number(session.readyAt || 0) - Date.now() + 500));
    }
    return session;
  }

  const meta = await readSessionMeta(coachId);
  if (isRestoreBlocked(meta)) {
    return session || null;
  }

  const canRestore = await hasGatewayAuthOnDisk(coachId);
  if (!canRestore) return session || null;

  session = await setupSession(coachId, { allowDiskAuth: true });
  if (session.status === 'connected' && session.sock?.user) {
    if (Date.now() < Number(session.readyAt || 0)) {
      return waitUntilReady(Math.max(500, Number(session.readyAt || 0) - Date.now() + 500));
    }
    return session;
  }
  const waited = await waitUntilReady(waitMs);
  if (waited) return waited;
  return null;
}

async function pingSessionKeepalive(coachId, session) {
  if (!session?.sock || session.status !== 'connected') return;
  if (!isSocketOpen(session.sock)) return;
  const now = Date.now();
  if (now - Number(session.lastKeepaliveAt || 0) < SESSION_KEEPALIVE_MS) return;
  try {
    await Promise.race([
      session.sock.query({
        tag: 'iq',
        attrs: { to: '@s.whatsapp.net', type: 'get', xmlns: 'w:p' },
        content: [{ tag: 'ping', attrs: {} }],
      }),
      sleep(8000),
    ]);
    session.lastKeepaliveAt = now;
  } catch (err) {
    logger.warn({ err, coachId }, 'keepalive ping failed');
    if (!isSocketOpen(session.sock)) {
      await endSocket(session.sock);
      session.sock = null;
      scheduleReconnect(coachId, session, session.generation, 'keepalive_ping_failed');
    }
  }
}

app.get('/health', (_req, res) => {
  let connected = 0;
  let reconnecting = 0;
  /** @type {string[]} */
  const connectedSessionIds = [];
  for (const [coachId, session] of sessions.entries()) {
    if (session.status === 'connected') {
      connected += 1;
      connectedSessionIds.push(coachId);
    }
    if (session.status === 'reconnecting') reconnecting += 1;
  }
  res.json({
    ok: true,
    service: 'whatsapp-gateway',
    sessions: sessions.size,
    connected,
    reconnecting,
    connected_session_ids: connectedSessionIds,
    watchdogMs: SESSION_WATCHDOG_MS,
    keepaliveMs: SESSION_KEEPALIVE_MS,
  });
});

app.get('/ready', (_req, res) => {
  const jwtReady = Boolean(appJwtSecret);
  const corsReady = allowedOrigins.length > 0;
  res.json({ ok: jwtReady && corsReady, jwtReady, corsReady });
});

app.post('/sessions/:coachId/start', requireGatewayAuth, requireCoachScope, async (req, res) => {
  try {
    const coachId = getCoachId(req);
    const purge = req.body?.purge === true || String(req.query?.purge || '') === '1';
    const meta = await readSessionMeta(coachId);
    const blocked = isRestoreBlocked(meta);
    const hasBadAuth = blocked || purge;

    if (hasBadAuth) {
      await stopSession(coachId, { clearAuth: true });
      await clearSessionMeta(coachId);
    } else {
      await stopStuckSessionIfNeeded(coachId);
    }

    const session = await setupSession(coachId, { allowDiskAuth: !hasBadAuth });
    res.json(sessionPayload(coachId, session, { purged: hasBadAuth }));
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'session_start_failed' });
  }
});

app.get('/sessions/:coachId/status', requireGatewayAuth, requireCoachScope, async (req, res) => {
  const coachId = getCoachId(req);
  let session = sessions.get(coachId);
  let meta = await readSessionMeta(coachId);
  meta = await maybeClearTransientRestoreBlock(coachId, meta);
  const authOnDisk = await hasGatewayAuthOnDisk(coachId);
  const restoreBlocked = isRestoreBlocked(meta);
  const canAutoRestore = shouldAutoRestoreSession(coachId) && authOnDisk && !restoreBlocked;

  if (!session && canAutoRestore) {
    void setupSession(coachId, { allowDiskAuth: true }).catch((err) => {
      logger.warn({ err, coachId }, 'auto-restore session on status');
    });
    session = sessions.get(coachId);
  } else if (
    session &&
    !session.sock &&
    canAutoRestore &&
    (session.status === 'idle' ||
      session.status === 'reconnecting' ||
      session.status === 'logged_out' ||
      session.status === 'connecting')
  ) {
    void setupSession(coachId, { allowDiskAuth: true }).catch((err) => {
      logger.warn({ err, coachId }, 'auto-restore stale session on status');
    });
    session = sessions.get(coachId) || session;
  }

  if (!session) {
    return res.json(
      sessionPayload(coachId, null, {
        authOnDisk,
        restoreBlocked,
        hint: restoreBlocked
          ? 'Önceki oturum hatalı — «Oturumu sıfırla ve QR al» ile temiz başlayın.'
          : authOnDisk
            ? 'Diskte oturum var; «QR / Oturum başlat» ile bağlanın.'
            : null,
      })
    );
  }

  return res.json(
    sessionPayload(coachId, session, {
      authOnDisk,
      restoreBlocked,
    })
  );
});

app.post('/sessions/:coachId/logout', requireGatewayAuth, requireCoachScope, async (req, res) => {
  const coachId = getCoachId(req);
  const session = sessions.get(coachId);
  if (session?.sock) {
    clearLinkedJidOwner(coachId, session);
    try {
      await session.sock.logout();
    } catch (err) {
      logger.warn({ err, coachId }, 'logout failed; continuing cleanup');
    }
  }
  await stopSession(coachId, { clearAuth: true });
  await clearSessionMeta(coachId);
  res.json({ ok: true, coachId, status: 'logged_out' });
});

app.post('/sessions/:coachId/reset', requireGatewayAuth, requireCoachScope, async (req, res) => {
  try {
    const coachId = getCoachId(req);
    await stopSession(coachId, { clearAuth: true });
    await clearSessionMeta(coachId);
    const fresh = await setupSession(coachId, { allowDiskAuth: false });
    res.json(sessionPayload(coachId, fresh, { reset: true }));
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'session_reset_failed' });
  }
});

async function sendTextWithTimeout(sock, jid, message, retriesLeft = SEND_MESSAGE_RETRIES) {
  try {
    return await withTimeout(
      () => sock.sendMessage(jid, { text: message }),
      SEND_MESSAGE_TIMEOUT_MS,
      'send_message_timeout'
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (retriesLeft > 0 && msg === 'send_message_timeout') {
      await sleep(600);
      return sendTextWithTimeout(sock, jid, message, retriesLeft - 1);
    }
    throw err;
  }
}

app.post('/sessions/:coachId/send', requireGatewayAuth, requireCoachScope, async (req, res) => {
  const coachId = getCoachId(req);
  const digits = normalizeDigitsForWhatsApp(req.body?.phone);
  try {
    const jid = ensurePhoneJid(digits);
    const message = String(req.body?.message || '').trim();
    if (!jid || !message) {
      return res.status(400).json({ ok: false, error: 'phone_and_message_required' });
    }

    const result = await runInCoachSendQueue(coachId, async () => {
      let session = await ensureConnectedForSend(coachId);
      if (!session?.sock || session.status !== 'connected') {
        await sleep(1800);
        session = await ensureConnectedForSend(coachId, { waitMs: SEND_WAIT_READY_MS });
      }
      if (!session?.sock || session.status !== 'connected') {
        const err = new Error('session_not_connected');
        err.httpStatus = 409;
        err.hint =
          'Bağlantı yeniden kuruluyor. 5-10 saniye bekleyip tekrar deneyin veya Koç WhatsApp’tan QR ile bağlanın.';
        throw err;
      }

      try {
        if (!SKIP_ON_WHATSAPP_CHECK) {
          const onWa = await withTimeout(
            () => session.sock.onWhatsApp(digits),
            ON_WHATSAPP_TIMEOUT_MS,
            'on_whatsapp_timeout'
          );
          const exists = Array.isArray(onWa) && onWa.some((r) => r?.exists);
          if (!exists) {
            logger.warn({ coachId, digits }, 'onWhatsApp precheck negative — trying send anyway');
          }
        }
      } catch (checkErr) {
        logger.warn({ err: checkErr, coachId, digits }, 'onWhatsApp check skipped — trying send anyway');
      }

      return sendTextWithTimeout(session.sock, jid, message);
    });

    res.json({ ok: true, id: result?.key?.id || null, phone: digits });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'send_failed';
    const dynamicStatus =
      typeof error === 'object' && error !== null && Number.isFinite(error.httpStatus)
        ? Number(error.httpStatus)
        : null;
    let status = dynamicStatus || (msg === 'send_message_timeout' ? 504 : 500);
    let outError = msg;
    let hint;

    const lower = String(msg || '').toLowerCase();
    if (
      lower.includes('connection closed') ||
      lower.includes('connection terminated') ||
      lower.includes('socket closed') ||
      lower.includes('not connected') ||
      lower.includes('timed out waiting for this socket') ||
      lower.includes('stream errored out') ||
      lower.includes('stream errored (')
    ) {
      status = 409;
      outError = 'session_not_connected';
      hint = 'Bağlantı yeniden kurulurken gönderim denendi. 2-3 saniye sonra tekrar gönderin.';
      const cur = sessions.get(coachId);
      if (cur && cur.status === 'connected') {
        scheduleReconnect(coachId, cur, cur.generation, 'send_stream_error');
      }
    }
    if (outError === 'on_whatsapp_timeout') {
      status = 504;
      outError = 'send_precheck_timeout';
      hint = 'Numara doğrulama aşaması zaman aşımına uğradı; yeniden deneyin.';
    }

    const logLevel = outError === 'number_not_on_whatsapp' ? 'warn' : 'error';
    logger[logLevel]({ err: error, coachId, phone: digits }, 'send message failed');
    if (outError === 'number_not_on_whatsapp') {
      hint =
        hint ||
        'Numara WhatsApp\'ta kayıtlı görünmüyor veya format hatalı. TR cep için 05xx veya 905xx kullanın.';
    }
    res.status(status).json({
      ok: false,
      error: outError,
      hint:
        (typeof error === 'object' && error !== null && typeof error.hint === 'string' && error.hint) ||
        hint ||
        undefined,
      phone:
        typeof error === 'object' && error !== null && typeof error.phone === 'string'
          ? error.phone
          : undefined,
    });
  }
});

app.listen(port, async () => {
  await fs.mkdir(dataRoot, { recursive: true });

  async function restorePersistedSessions() {
    const priorityId = String(process.env.BOOK_ORDER_GATEWAY_SESSION_ID || process.env.WHATSAPP_GATEWAY_SESSION_ID || '').trim();
    const ids = new Set();
    if (priorityId) ids.add(priorityId);
    try {
      const entries = await fs.readdir(dataRoot, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory() && ent.name && !ent.name.startsWith('.')) ids.add(ent.name);
      }
    } catch (err) {
      logger.warn({ err }, 'restorePersistedSessions readdir failed');
    }
    for (const coachId of ids) {
      if (!shouldAutoRestoreSession(coachId)) continue;
      let meta = await readSessionMeta(coachId);
      meta = await maybeClearTransientRestoreBlock(coachId, meta);
      if (isRestoreBlocked(meta)) continue;
      const hasAuth = await hasGatewayAuthOnDisk(coachId);
      if (!hasAuth) continue;
      setupSession(coachId, { allowDiskAuth: true }).catch((err) => {
        logger.warn({ err, coachId }, 'startup session restore failed');
      });
    }
  }

  void restorePersistedSessions();

  async function runSessionWatchdog() {
    for (const [coachId, session] of sessions.entries()) {
      if (session.status === 'connected' && session.sock) {
        if (!isSocketOpen(session.sock)) {
          logger.warn({ coachId }, 'watchdog: socket closed while connected — reconnecting');
          await endSocket(session.sock);
          session.sock = null;
          scheduleReconnect(coachId, session, session.generation, 'watchdog_socket_closed');
          continue;
        }
        await pingSessionKeepalive(coachId, session);
        continue;
      }
      if (
        !session.sock &&
        shouldAutoRestoreSession(coachId) &&
        (session.status === 'reconnecting' ||
          session.status === 'idle' ||
          session.status === 'logged_out' ||
          session.status === 'connecting')
      ) {
        const hasAuth = await hasGatewayAuthOnDisk(coachId);
        let meta = await readSessionMeta(coachId);
        meta = await maybeClearTransientRestoreBlock(coachId, meta);
        if (hasAuth && !isRestoreBlocked(meta) && !setupInFlight.has(coachId)) {
          logger.info({ coachId, status: session.status }, 'watchdog: reviving dropped session');
          void setupSession(coachId, { allowDiskAuth: true }).catch((err) => {
            logger.warn({ err, coachId }, 'watchdog revive failed');
          });
        }
      }
    }

    try {
      const entries = await fs.readdir(dataRoot, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory() || !ent.name || ent.name.startsWith('.')) continue;
        const coachId = ent.name;
        if (sessions.has(coachId)) continue;
        if (!shouldAutoRestoreSession(coachId)) continue;
        let meta = await readSessionMeta(coachId);
        meta = await maybeClearTransientRestoreBlock(coachId, meta);
        if (isRestoreBlocked(meta)) continue;
        const hasAuth = await hasGatewayAuthOnDisk(coachId);
        if (!hasAuth) continue;
        logger.info({ coachId }, 'watchdog: restoring disk session');
        void setupSession(coachId, { allowDiskAuth: true }).catch((err) => {
          logger.warn({ err, coachId }, 'watchdog restore failed');
        });
      }
    } catch (err) {
      logger.warn({ err }, 'watchdog readdir failed');
    }
  }

  setInterval(() => {
    void runSessionWatchdog();
  }, SESSION_WATCHDOG_MS);

  logger.info(
    {
      port,
      dataRoot,
      allowedOriginsCount: allowedOrigins.length,
      apiKeyEnabled: Boolean(gatewayApiKey),
      jwtEnabled: Boolean(appJwtSecret),
      connectingTimeoutMs: CONNECTING_TIMEOUT_MS,
      reconnectTimeoutMs: RECONNECT_TIMEOUT_MS,
      sessionWatchdogMs: SESSION_WATCHDOG_MS,
      sessionKeepaliveMs: SESSION_KEEPALIVE_MS,
      autoRestoreAll: String(process.env.WA_AUTO_RESTORE_ONLY_PRIORITY || '').trim() !== '1',
    },
    'whatsapp-gateway started'
  );
});
