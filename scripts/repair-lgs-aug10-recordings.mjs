/**
 * Bilinen recordID listesini yayınla, media hazırsa 8A/B/E/F oturumlarına bağla.
 * Vercel timeout'a düşmemek için client tarafında bekler / küçük batch kullanır.
 *
 *   node scripts/repair-lgs-aug10-recordings.mjs
 */
const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';

/** 10.08.2026 akşam 8A/B/E/F (ve birleşik dilimler) */
const RECORD_IDS = [
  'a1e3f5d58031b2cb5c40035ab1df41684f703a29-1786376842722', // 8A Fen
  '0d075b19b390b69f0f30585ba9da09d7fdea40ff-1786383187869', // 8A İnkılap
  'a157f53d7acb255e63779b3e20317e7b9c5c1974-1786377447407', // 8B İnkılap
  '38ad7435c987995ff829e0833fe2a5194e6d0f69-1786380123928', // 8B İngilizce
  '30268e9fb997922b7b200590f7b3e17ab8884e16-1786377283203', // 8E Mat
  'fcbd028f709fb2a72bf106dca1ac276395b28ee8-1786377340389' // 8F Türkçe
];

const CLASS_IDS = {
  '8A': 'f14b1b1d-be9d-416a-aa82-1899b1c9fc08',
  '8B': 'a45cae1a-0ec3-420e-9bd1-280a06f4196c',
  '8E': '132f7a34-08b9-4910-9034-2e40652a33ba',
  '8F': '7cc4e2e4-8c4f-478d-ae9c-a4554fe8ba11'
};

async function api(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function mediaReady(recordId) {
  const urls = [
    `https://data.biggerbluebutton.com/presentation/${recordId}/metadata.xml`,
    `https://ders.dersonlinevipkocluk.com/presentation/${recordId}/metadata.xml`
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { Accept: 'application/xml,text/xml,*/*' } });
      if (!r.ok) continue;
      const t = (await r.text()).slice(0, 120);
      if (t.includes('<?xml') || t.includes('<recording')) return true;
    } catch {
      /* next */
    }
  }
  return false;
}

async function main() {
  const login = await fetch(`${API}/api/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const loginJson = await login.json().catch(() => ({}));
  if (!login.ok || !loginJson.token) {
    console.error('login_failed', login.status, loginJson);
    process.exit(1);
  }
  const token = loginJson.token;

  console.log('=== publish record_ids ===');
  const pub = await api('POST', '/api/class-live-lessons?op=publish-bbb-recordings-day', token, {
    record_ids: RECORD_IDS,
    attempts: 2,
    wait_ms: 500
  });
  console.log(pub.status, {
    ready: pub.json.ready,
    still_missing: pub.json.still_missing,
    published_attempts: pub.json.published_attempts,
    error: pub.json.error
  });
  for (const d of pub.json.details || []) console.log(' ', d.status, d.recordId?.slice(-24));

  // Client-side wait + re-publish rounds
  for (let round = 1; round <= 4; round += 1) {
    const pending = [];
    for (const rid of RECORD_IDS) {
      const ok = await mediaReady(rid);
      console.log(`round${round}`, rid.slice(-20), ok ? 'READY' : 'missing');
      if (!ok) pending.push(rid);
    }
    if (!pending.length) break;
    console.log('re-publish pending', pending.length);
    await api('POST', '/api/class-live-lessons?op=publish-bbb-recordings-day', token, {
      record_ids: pending,
      attempts: 2,
      wait_ms: 400
    });
    await new Promise((r) => setTimeout(r, 8000));
  }

  const readyMap = new Map();
  for (const rid of RECORD_IDS) {
    readyMap.set(rid, await mediaReady(rid));
  }

  console.log('\n=== repair sync classes ===');
  for (const [k, id] of Object.entries(CLASS_IDS)) {
    const sync = await api('POST', '/api/class-live-lessons?op=sync-recordings-range', token, {
      class_id: id,
      date_from: '2026-08-10',
      date_to: '2026-08-10',
      institution_id: INST,
      repair: true
    });
    console.log(k, sync.status, {
      linked: sync.json.linked,
      missing: sync.json.missing,
      repaired: sync.json.repaired,
      cleared: sync.json.cleared,
      skipped: sync.json.skipped,
      error: sync.json.error
    });
    for (const d of sync.json.details || []) {
      console.log(' ', d.status, d.subject, d.start_time || '', d.recordId?.slice(-16) || '');
    }
  }

  console.log('\nREADY SUMMARY');
  for (const [rid, ok] of readyMap) console.log(ok ? 'OK' : 'FAIL', rid);
  if ([...readyMap.values()].some((v) => !v)) {
    console.log(
      '\nBazı kayıtlar BiggerBlueButton CDN’de hâlâ yok. publish API yetmeyebilir; BBB panelinden rebuild gerekir.'
    );
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
