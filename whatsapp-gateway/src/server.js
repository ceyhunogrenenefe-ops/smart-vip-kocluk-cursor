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
} from '@whiskeysockets/baileys';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
const allowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const gatewayApiKey = String(process.env.GATEWAY_API_KEY || '').trim();
const appJwtSecret = String(process.env.APP_JWT_SECRET || '').trim();

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

/** @type {Map<string, {sock:any,status:string,qr:string|null,lastError:string|null,connectedAt:string|null}>} */
const sessions = new Map();

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
    const role = String(payload.role || '');
    const tokenUserId = String(payload.sub || '');
    const allowByRole = role === 'super_admin' || role === 'admin';
    if (!allowByRole && tokenUserId !== coachId) {
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

/**
 * WhatsApp s.whatsapp.net JID: ülke kodu olmadan 05… veya 10 haneli 5… gönderilirse mesaj gitmez / hata verir.
 * TR cep: 0555… → 90555…, 555… (10 hane) → 90555…
 */
function normalizeDigitsForWhatsApp(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
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

/** Sunucu yeniden başlayınca bellekte Map boş kalır; diskte Baileys auth varsa true. */
async function hasGatewayAuthOnDisk(coachId) {
  if (!coachId) return false;
  const authDir = path.join(dataRoot, coachId);
  try {
    const names = await fs.readdir(authDir);
    return names.some((n) => !n.startsWith('.'));
  } catch {
    return false;
  }
}

/** Aynı anda birden fazla /status isteği duplicate setupSession açmasın. */
const restoreInFlight = new Map();

async function ensureSessionFromDiskIfNeeded(coachId) {
  if (!coachId || sessions.has(coachId)) return;
  const canRestore = await hasGatewayAuthOnDisk(coachId);
  if (!canRestore) return;

  if (restoreInFlight.has(coachId)) {
    try {
      await restoreInFlight.get(coachId);
    } catch {
      /* setupSession hata verdiyse tekrar denemeyiz; bir sonraki poll */
    }
    return;
  }

  const p = setupSession(coachId).finally(() => {
    restoreInFlight.delete(coachId);
  });
  restoreInFlight.set(coachId, p);
  try {
    await p;
  } catch (err) {
    logger.warn({ err, coachId }, 'restore WhatsApp session from disk failed');
  }
}

async function setupSession(coachId) {
  if (!coachId) {
    throw new Error('coachId is required');
  }
  const existing = sessions.get(coachId);
  if (existing?.sock) {
    return existing;
  }

  const authDir = path.join(dataRoot, coachId);
  await fs.mkdir(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sessionState = {
    sock: null,
    status: 'connecting',
    qr: null,
    lastError: null,
    connectedAt: null,
  };
  sessions.set(coachId, sessionState);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Online VIP Coach', 'Chrome', '1.0.0'],
  });
  sessionState.sock = sock;

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      sessionState.qr = await qrcode.toDataURL(qr);
      sessionState.status = 'qr_ready';
      sessionState.lastError = null;
    }

    if (connection === 'open') {
      sessionState.status = 'connected';
      sessionState.qr = null;
      sessionState.connectedAt = new Date().toISOString();
      sessionState.lastError = null;
      logger.info({ coachId }, 'WhatsApp connected');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      sessionState.status = loggedOut ? 'logged_out' : 'reconnecting';
      sessionState.lastError = lastDisconnect?.error?.message || null;
      if (loggedOut) {
        sessionState.sock = null;
        sessionState.qr = null;
      } else {
        sessionState.sock = null;
        setTimeout(() => {
          setupSession(coachId).catch((err) => {
            logger.error({ err, coachId }, 'failed to reconnect session');
          });
        }, 1500);
      }
    }
  });

  return sessionState;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'whatsapp-gateway' });
});

app.get('/ready', (_req, res) => {
  const jwtReady = Boolean(appJwtSecret);
  const corsReady = allowedOrigins.length > 0;
  res.json({ ok: jwtReady && corsReady, jwtReady, corsReady });
});

app.post('/sessions/:coachId/start', requireGatewayAuth, requireCoachScope, async (req, res) => {
  try {
    const coachId = getCoachId(req);
    const session = await setupSession(coachId);
    res.json({
      ok: true,
      coachId,
      status: session.status,
      qr: session.qr,
      connectedAt: session.connectedAt,
      lastError: session.lastError,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'session_start_failed' });
  }
});

app.get(
  '/sessions/:coachId/status',
  requireGatewayAuth,
  requireCoachScope,
  async (req, res) => {
    const coachId = getCoachId(req);
    await ensureSessionFromDiskIfNeeded(coachId);
    const session = sessions.get(coachId);
    if (!session) {
      return res.json({
        ok: true,
        coachId,
        status: 'idle',
        qr: null,
        connectedAt: null,
        lastError: null,
      });
    }
    return res.json({
      ok: true,
      coachId,
      status: session.status,
      qr: session.qr,
      connectedAt: session.connectedAt,
      lastError: session.lastError,
    });
  }
);

app.post('/sessions/:coachId/logout', requireGatewayAuth, requireCoachScope, async (req, res) => {
  const coachId = getCoachId(req);
  const session = sessions.get(coachId);
  if (!session?.sock) {
    return res.json({ ok: true, coachId, status: 'idle' });
  }

  try {
    await session.sock.logout();
  } catch (err) {
    logger.warn({ err, coachId }, 'logout failed; continuing cleanup');
  }
  session.sock = null;
  session.status = 'logged_out';
  session.qr = null;
  res.json({ ok: true, coachId, status: session.status });
});

app.post('/sessions/:coachId/send', requireGatewayAuth, requireCoachScope, async (req, res) => {
  try {
    const coachId = getCoachId(req);
    await ensureSessionFromDiskIfNeeded(coachId);
    const session = sessions.get(coachId);
    if (!session?.sock || session.status !== 'connected') {
      return res.status(409).json({ ok: false, error: 'session_not_connected' });
    }

    const jid = ensurePhoneJid(req.body?.phone);
    const message = String(req.body?.message || '').trim();
    if (!jid || !message) {
      return res.status(400).json({ ok: false, error: 'phone_and_message_required' });
    }

    const result = await session.sock.sendMessage(jid, { text: message });
    res.json({ ok: true, id: result?.key?.id || null });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'send_failed' });
  }
});

app.listen(port, async () => {
  await fs.mkdir(dataRoot, { recursive: true });
  logger.info(
    {
      port,
      dataRoot,
      allowedOriginsCount: allowedOrigins.length,
      apiKeyEnabled: Boolean(gatewayApiKey),
      jwtEnabled: Boolean(appJwtSecret),
    },
    'whatsapp-gateway started'
  );
});
