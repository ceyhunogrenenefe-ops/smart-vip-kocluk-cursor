import { readFileSync } from 'fs';
import { getMetaWhatsAppEnvStatus, metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';

for (const line of readFileSync('.env.vercel.prod.check', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  if (/^META_|^TWILIO_/.test(m[1])) {
    console.log(m[1], 'len=' + val.length, 'empty=' + (val.length === 0));
  }
  if (!process.env[m[1]]) process.env[m[1]] = val;
}

console.log('configured', metaWhatsAppConfigured());
console.log('status', JSON.stringify(getMetaWhatsAppEnvStatus(), null, 2));

const pid = process.env.META_PHONE_NUMBER_ID;
const tok = process.env.META_WHATSAPP_TOKEN;
const ver = process.env.META_GRAPH_API_VERSION || 'v21.0';
const r = await fetch(`https://graph.facebook.com/${ver}/${pid}`, {
  headers: { Authorization: `Bearer ${tok}` }
});
const j = await r.json().catch(() => ({}));
console.log('graph_phone_check', r.status, JSON.stringify(j).slice(0, 500));
