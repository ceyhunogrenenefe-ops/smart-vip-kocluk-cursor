/**
 * Gateway + WhatsApp tam sağlık testi (production env).
 * node --env-file=.env.prod.live scripts/gateway-health-full.mjs
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
    process.env[k] = v;
  }
}

loadEnvFile(resolve(root, '.env.prod.live'));

const mask = (s, show = 8) => {
  const t = String(s || '').trim();
  if (!t) return '(boş)';
  if (t.length <= show * 2) return '*'.repeat(t.length);
  return `${t.slice(0, 4)}…${t.slice(-4)} (len ${t.length})`;
};

const b64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

function signJwt(sub) {
  const secret = String(process.env.APP_JWT_SECRET || '').trim();
  if (!secret) throw new Error('APP_JWT_SECRET boş');
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
  if (!raw) {
    const alt = String(process.env.WHATSAPP_GATEWAY_URL || '').trim().replace(/\/$/, '');
    if (alt && /^https?:\/\//i.test(alt) && !/vercel\.app/i.test(alt)) raw = alt;
  }
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

async function fetchJson(url, opts = {}) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), opts.timeoutMs || 15000);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { _raw: text.slice(0, 300) };
    }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(tid);
  }
}

async function testMeta() {
  const token = String(process.env.META_WHATSAPP_TOKEN || '').trim();
  const phoneId = String(process.env.META_PHONE_NUMBER_ID || '').trim();
  if (!token || !phoneId) {
    return { ok: false, error: 'META_WHATSAPP_TOKEN veya META_PHONE_NUMBER_ID boş' };
  }
  const ver = String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim();
  const r = await fetchJson(`https://graph.facebook.com/${ver}/${phoneId}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 15000
  });
  if (!r.ok) {
    return { ok: false, status: r.status, error: r.json?.error?.message || JSON.stringify(r.json).slice(0, 200) };
  }
  return {
    ok: true,
    display_phone: r.json?.display_phone_number || null,
    verified_name: r.json?.verified_name || null,
    quality_rating: r.json?.quality_rating || null
  };
}

async function testVercelProxy() {
  const origin = 'https://www.dersonlinevipkocluk.com';
  const r = await fetchJson(`${origin}/api/whatsapp-gateway/health`, { timeoutMs: 20000 });
  return { origin, status: r.status, body: r.json };
}

async function main() {
  const up = upstream();
  const envSession = String(process.env.BOOK_ORDER_GATEWAY_SESSION_ID || '').trim();
  const gk = String(process.env.GATEWAY_API_KEY || process.env.VITE_WHATSAPP_GATEWAY_KEY || '').trim();
  const hasJwt = Boolean(String(process.env.APP_JWT_SECRET || '').trim());
  const channel = String(process.env.BOOK_ORDER_WHATSAPP_CHANNEL || 'auto').trim();

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  WhatsApp Gateway + Meta — CANLI SAĞLIK TESTİ   ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  console.log('── Vercel ortam (maskeli) ──');
  console.log('  BOOK_ORDER_WHATSAPP_CHANNEL:', channel);
  console.log('  WHATSAPP_GATEWAY_UPSTREAM:  ', up || '(BOŞ — gateway doğrudan erişilemez)');
  console.log('  BOOK_ORDER_GATEWAY_SESSION_ID:', mask(envSession));
  console.log('  APP_JWT_SECRET:             ', hasJwt ? mask(process.env.APP_JWT_SECRET) : '(BOŞ)');
  console.log('  GATEWAY_API_KEY:            ', gk ? mask(gk) : '(BOŞ)');
  console.log('  META_WHATSAPP_TOKEN:        ', process.env.META_WHATSAPP_TOKEN ? mask(process.env.META_WHATSAPP_TOKEN) : '(BOŞ)');
  console.log('  META_PHONE_NUMBER_ID:       ', process.env.META_PHONE_NUMBER_ID ? mask(process.env.META_PHONE_NUMBER_ID) : '(BOŞ)');

  console.log('\n── 1) Meta Cloud API ──');
  const meta = await testMeta();
  if (meta.ok) {
    console.log('  ✅ Meta API erişilebilir');
    console.log('     Numara:', meta.display_phone || '—');
    console.log('     İsim:  ', meta.verified_name || '—');
  } else {
    console.log('  ❌ Meta API:', meta.error || meta.status);
  }

  console.log('\n── 2) Vercel proxy (/api/whatsapp-gateway/health) ──');
  const proxy = await testVercelProxy();
  console.log('  HTTP', proxy.status, JSON.stringify(proxy.body, null, 2).split('\n').join('\n  '));

  if (!up) {
    console.log('\n── 3) VPS doğrudan ──');
    console.log('  ⏭️  WHATSAPP_GATEWAY_UPSTREAM boş — VPS testi atlandı');
    printSummary({ meta, gatewayConnected: false, vpsReachable: false, envSession, connectedIds: [] });
    return;
  }

  console.log('\n── 3) VPS doğrudan /health ──');
  const healthHeaders = gk ? { 'x-gateway-key': gk } : {};
  const health = await fetchJson(`${up}/health`, { headers: healthHeaders, timeoutMs: 12000 });
  if (!health.ok) {
    console.log('  ❌ VPS erişilemiyor — HTTP', health.status, health.json);
    printSummary({ meta, gatewayConnected: false, vpsReachable: false, envSession, connectedIds: [] });
    return;
  }
  console.log('  ✅ VPS yanıt veriyor:', JSON.stringify(health.json));
  const connectedIds = Array.isArray(health.json?.connected_session_ids)
    ? health.json.connected_session_ids
    : [];

  if (!hasJwt) {
    console.log('\n── 4) Oturum durumu ──');
    console.log('  ❌ APP_JWT_SECRET boş — oturum testi yapılamadı');
    printSummary({ meta, gatewayConnected: health.json?.connected > 0, vpsReachable: true, envSession, connectedIds });
    return;
  }

  const candidates = [...new Set([envSession, ...connectedIds].filter(Boolean))];
  console.log('\n── 4) Oturum durumu (aday id:', candidates.length, ') ──');

  let anyConnected = false;
  for (const sid of candidates) {
    const token = signJwt(sid);
    const headers = { Authorization: `Bearer ${token}` };
    if (gk) headers['x-gateway-key'] = gk;
    const st = await fetchJson(`${up}/sessions/${encodeURIComponent(sid)}/status`, { headers, timeoutMs: 15000 });
    const status = st.json?.status || 'unknown';
    const icon = st.ok && status === 'connected' ? '✅' : '❌';
    if (st.ok && status === 'connected') anyConnected = true;
    console.log(`  ${icon} …${sid.slice(-12)} → HTTP ${st.status} status=${status}${st.json?.error ? ` error=${st.json.error}` : ''}`);
    if (st.json?.lastError) console.log('       lastError:', st.json.lastError);
  }

  if (envSession && connectedIds.length && !connectedIds.includes(envSession)) {
    console.log('\n  ⚠️  UYUMSUZLUK: Vercel BOOK_ORDER_GATEWAY_SESSION_ID, VPS’te bağlı oturumlarla eşleşmiyor!');
    console.log('     Env:    …' + envSession.slice(-12));
    console.log('     Bağlı: ', connectedIds.map((x) => '…' + x.slice(-12)).join(', '));
  }

  printSummary({ meta, gatewayConnected: anyConnected, vpsReachable: true, envSession, connectedIds });
}

function printSummary({ meta, gatewayConnected, vpsReachable, envSession, connectedIds }) {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  ÖZET                                            ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('  VPS erişimi:     ', vpsReachable ? '✅' : '❌');
  console.log('  Gateway bağlı:   ', gatewayConnected ? '✅ en az 1 oturum connected' : '❌ bağlı oturum yok');
  console.log('  Meta API:        ', meta.ok ? '✅' : '❌');
  console.log('  Kitap siparişi:  ', gatewayConnected ? 'Gateway ile gönderilebilir' : meta.ok ? 'Meta yedek ile gönderilebilir' : '❌ iki kanal da hazır değil');

  if (!gatewayConnected && meta.ok) {
    console.log('\n  → Şu an gateway bağlı değil; deploy sonrası auto mod Meta ile gönderir.');
  }
  if (!gatewayConnected && !meta.ok) {
    console.log('\n  → QR bağlayın (Kitap siparişleri / Koç WhatsApp) VE/VEYA Meta token kontrol edin.');
  }
  if (connectedIds.length && !envSession) {
    console.log(`\n  → Vercel BOOK_ORDER_GATEWAY_SESSION_ID=${connectedIds[0]} yazın (cron için).`);
  }
  console.log('');
}

main().catch((e) => {
  console.error('HATA:', e);
  process.exit(1);
});
