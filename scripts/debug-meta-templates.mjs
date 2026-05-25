import { readFileSync } from 'fs';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    let v = line.slice(i + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i)] = v;
  }
  return out;
}

const env = loadEnv('.env.meta.test');
const tok = env.META_WHATSAPP_TOKEN;
const pid = env.META_PHONE_NUMBER_ID;
const wabaEnv = env.META_WABA_ID;
const G = env.META_GRAPH_API_VERSION || 'v21.0';

async function get(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
}

const phone = await get(
  `https://graph.facebook.com/${G}/${encodeURIComponent(pid)}?fields=whatsapp_business_account`
);
const wabaPhone =
  phone.json?.whatsapp_business_account?.id || phone.json?.whatsapp_business_account || null;

console.log('PHONE_WABA', wabaPhone || 'FAIL', phone.ok ? 'ok' : 'err', phone.json?.error?.message || '');
console.log('ENV_WABA', wabaEnv || 'MISSING');
console.log('WABA_MATCH', wabaPhone && wabaEnv ? String(wabaPhone) === String(wabaEnv) : 'n/a');

const wabas = [...new Set([wabaPhone, wabaEnv].filter(Boolean).map(String))];
for (const waba of wabas) {
  const names = [];
  let err = null;
  let url = `https://graph.facebook.com/${G}/${encodeURIComponent(waba)}/message_templates?fields=name,status,language&limit=100`;
  while (url) {
    const r = await get(url);
    if (!r.ok) {
      err = r.json?.error?.message || `http_${r.status}`;
      break;
    }
    for (const t of r.json.data || []) {
      names.push(`${t.name}|${t.language}|${t.status}`);
    }
    url = r.json.paging?.next || null;
  }
  console.log('WABA', waba, 'template_count', names.length, err || 'ok');
  const report = names.filter((n) => n.toLowerCase().includes('report'));
  console.log('  report:', report.length ? report.join('; ') : 'NONE');
  const absent = names.filter((n) => n.toLowerCase().includes('class_absent'));
  console.log('  class_absent:', absent.slice(0, 5).join('; ') || 'NONE');
  console.log('  all_names:', names.map((n) => n.split('|')[0]).join(', '));
}
