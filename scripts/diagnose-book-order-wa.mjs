/**
 * Kitap siparişi WhatsApp gönderim tanısı — production env ile çalıştırın:
 * node --env-file=.env.prod.live scripts/diagnose-book-order-wa.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(resolve(root, '.env.prod.live'));

const b64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

function signJwt(sub) {
  const secret = String(process.env.APP_JWT_SECRET || '').trim() || 'dev-insecure-secret-change-me';
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { sub, role: 'super_admin', institution_id: null, iat: now, exp: now + 43200 };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
  const sig = crypto.createHmac('sha256', secret).update(unsigned).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${unsigned}.${sig}`;
}

function upstream() {
  let raw = String(process.env.WHATSAPP_GATEWAY_UPSTREAM || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  try {
    const u = new URL(raw);
    if (!u.port) return `${u.protocol}//${u.hostname}:${u.protocol === 'https:' ? '443' : '4010'}`;
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    return '';
  }
}

async function main() {
  const up = upstream();
  const sessionId = String(
    process.env.BOOK_ORDER_GATEWAY_SESSION_ID || process.env.WHATSAPP_GATEWAY_SESSION_ID || ''
  ).trim();
  const hasJwt = Boolean(String(process.env.APP_JWT_SECRET || '').trim());
  const hasGk = Boolean(String(process.env.GATEWAY_API_KEY || process.env.VITE_WHATSAPP_GATEWAY_KEY || '').trim());
  const metaOk = Boolean(
    String(process.env.META_WHATSAPP_TOKEN || '').trim() &&
      String(process.env.META_PHONE_NUMBER_ID || '').trim()
  );
  const channel = String(process.env.BOOK_ORDER_WHATSAPP_CHANNEL || 'gateway').trim();

  console.log('=== Kitap siparişi WhatsApp tanı ===');
  console.log('BOOK_ORDER_WHATSAPP_CHANNEL:', channel);
  console.log('WHATSAPP_GATEWAY_UPSTREAM:', up || '(YOK)');
  console.log('BOOK_ORDER_GATEWAY_SESSION_ID:', sessionId ? `${sessionId.slice(0, 8)}…${sessionId.slice(-8)}` : '(YOK)');
  console.log('APP_JWT_SECRET:', hasJwt ? 'var' : 'YOK');
  console.log('GATEWAY_API_KEY:', hasGk ? 'var' : 'YOK');
  console.log('META configured:', metaOk ? 'evet' : 'hayır');

  if (!up) {
    console.log('\n❌ WHATSAPP_GATEWAY_UPSTREAM boş — gateway gönderimi imkansız.');
    if (metaOk && channel !== 'meta') {
      console.log('💡 Meta token var ama kanal gateway — BOOK_ORDER_WHATSAPP_CHANNEL=meta veya gateway bağlayın.');
    }
    return;
  }

  try {
    const h = await fetch(`${up}/health`, { signal: AbortSignal.timeout(12000) });
    const hd = await h.json().catch(() => ({}));
    console.log('\n/health:', h.status, hd);
  } catch (e) {
    console.log('\n❌ VPS /health erişilemiyor:', e instanceof Error ? e.message : e);
    if (metaOk) console.log('💡 Meta fallback kullanılabilir — gateway VPS kapalı.');
    return;
  }

  if (!sessionId || !hasJwt) {
    console.log('\n❌ Oturum id veya JWT secret eksik.');
    return;
  }

  const token = signJwt(sessionId);
  const gk = String(process.env.GATEWAY_API_KEY || process.env.VITE_WHATSAPP_GATEWAY_KEY || '').trim();
  const headers = { Authorization: `Bearer ${token}` };
  if (gk) headers['x-gateway-key'] = gk;

  const st = await fetch(`${up}/sessions/${encodeURIComponent(sessionId)}/status`, {
    headers,
    signal: AbortSignal.timeout(15000)
  });
  const stData = await st.json().catch(() => ({}));
  console.log('\n/sessions/.../status:', st.status, JSON.stringify(stData, null, 2));

  if (st.status === 403) {
    console.log('\n❌ coach_scope_mismatch — BOOK_ORDER_GATEWAY_SESSION_ID, QR bağlı users.id ile aynı olmalı.');
  } else if (st.status === 401) {
    console.log('\n❌ Auth hatası — APP_JWT_SECRET veya GATEWAY_API_KEY VPS ile uyuşmuyor.');
  } else if (st.ok && stData.status !== 'connected') {
    console.log(`\n❌ Oturum bağlı değil (${stData.status}) — bu id ile QR okutun.`);
  } else if (st.ok && stData.status === 'connected') {
    console.log('\n✅ Gateway oturumu bağlı — gönderim çalışmalı.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
