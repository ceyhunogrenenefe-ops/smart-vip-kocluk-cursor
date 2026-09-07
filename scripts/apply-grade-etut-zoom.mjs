/**
 * Belirli sınıf gruplarının TÜM Etüt slot + oturumlarına ortak Zoom linki yazar.
 *
 * Örnek:
 *   DRY_RUN=0 GRADES=7,8 ETUT_ZOOM_URL='https://us06web.zoom.us/j/...' node scripts/apply-grade-etut-zoom.mjs
 *   DRY_RUN=0 GRADES=5,6 ETUT_ZOOM_URL='https://us06web.zoom.us/j/...' node scripts/apply-grade-etut-zoom.mjs
 */
const API = String(process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com').replace(/\/$/, '');
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
/** FORCE=1 (varsayılan): Zoom zaten yazılmış görünse bile PATCH et — skip yarışı / geri alma riskini önler. */
const FORCE = process.env.FORCE !== '0' && process.env.FORCE !== 'false';
const INST = process.env.INSTITUTION_ID || '73323d75-eea1-4552-8bba-d50555423589';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@smartkocluk.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const DAYS_AHEAD = Math.max(14, Number(process.env.DAYS_AHEAD || 60));
const ZOOM = String(process.env.ETUT_ZOOM_URL || '').trim();
const GRADES = String(process.env.GRADES || '')
  .split(/[,\s]+/)
  .map((g) => g.trim())
  .filter(Boolean);

function hasExactZoom(row) {
  const m = String(row?.meeting_link || '').trim();
  const j = String(row?.join_link || '').trim();
  return m === ZOOM && (j === ZOOM || j === '' || j === m);
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function hm(t) {
  const s = String(t || '');
  return s.length >= 5 ? s.slice(0, 5) : s;
}
function isEtutSubject(s) {
  return /et[uü]t/i.test(String(s || ''));
}

/** Sınıf adı / grade alanından 5–8 eşlemesi */
function classMatchesGrades(cls, grades) {
  const name = String(cls.name || '').toLocaleUpperCase('tr-TR').trim();
  const grade = String(cls.grade || cls.class_level || '').toLocaleUpperCase('tr-TR').trim();
  // "2026-2027 5A …" → önek yılı at
  const stripped = name.replace(/^20\d{2}-20\d{2}\s+/, '').trim();

  for (const g of grades) {
    const gu = String(g).toLocaleUpperCase('tr-TR');
    if (grade === gu) return true;
    // 8. sınıflar LGS grade + isimde 8X
    if ((gu === '8' || gu === 'LGS') && grade === 'LGS' && /^8[A-ZÇĞİÖŞÜ]/.test(stripped)) {
      return true;
    }
    // "5A …", "6B …", "7A …", "8C SINIFI", "8E YAZ…"
    if (new RegExp(`^${gu}[A-ZÇĞİÖŞÜ]?(\\s|$)`).test(stripped)) return true;
    // "5-A" / "6 A"
    if (new RegExp(`^${gu}\\s*-\\s*[A-ZÇĞİÖŞÜ]`).test(stripped)) return true;
    if (new RegExp(`^${gu}\\s+[A-ZÇĞİÖŞÜ]\\b`).test(stripped)) return true;
  }
  return false;
}

async function api(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.CONCURRENCY || 8)));

async function main() {
  console.log(`API=${API} DRY_RUN=${DRY_RUN} FORCE=${FORCE} GRADES=${GRADES.join(',')} ZOOM=${ZOOM}`);
  if (!GRADES.length) {
    console.error('GRADES required, e.g. GRADES=7,8');
    process.exit(1);
  }
  if (!ZOOM.includes('zoom.us')) {
    console.error('ETUT_ZOOM_URL must be a zoom.us URL');
    process.exit(1);
  }

  const login = await fetch(`${API}/api/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await login.json().catch(() => ({}));
  if (!login.ok || !loginJson.token) {
    console.error('login_failed', login.status, loginJson);
    process.exit(1);
  }
  const token = loginJson.token;

  const { status: cStatus, json: cJson } = await api(
    'GET',
    `/api/class-live-lessons?scope=classes&institution_id=${INST}`,
    token
  );
  if (cStatus >= 400) {
    console.error('classes_failed', cStatus, cJson);
    process.exit(1);
  }

  const classes = (cJson.data || []).filter((c) => classMatchesGrades(c, GRADES));
  console.log(
    'matched_classes',
    classes.map((c) => `${c.name} [${c.grade}]`).join(' | ') || '(none)'
  );
  if (!classes.length) {
    console.error('no_classes_matched');
    process.exit(2);
  }

  const today = ymd(new Date());
  const dateTo = addDays(today, DAYS_AHEAD);
  const summary = [];

  for (const cls of classes) {
    console.log(`\n=== ${cls.name} (${cls.grade}) ===`);

    const { json: slotsJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=slots&class_id=${cls.id}&institution_id=${INST}`,
      token
    );
    const etutSlots = (slotsJson.data || []).filter((s) => isEtutSubject(s.subject));
    console.log(`etut_slots=${etutSlots.length}`);

    let slotsUpdated = 0;
    let slotsFailed = 0;
    let slotsSkipped = 0;
    const slotResults = await mapPool(etutSlots, CONCURRENCY, async (slot) => {
      if (!FORCE && hasExactZoom(slot)) return 'skip';
      if (DRY_RUN) return 'ok';
      const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
        kind: 'slot',
        id: slot.id,
        meeting_link: ZOOM,
      });
      if (status >= 400) {
        console.error('slot_patch_failed', slot.id, status, json);
        return 'fail';
      }
      return 'ok';
    });
    for (const r of slotResults) {
      if (r === 'skip') slotsSkipped += 1;
      else if (r === 'fail') slotsFailed += 1;
      else slotsUpdated += 1;
    }

    const { json: sessJson } = await api(
      'GET',
      `/api/class-live-lessons?scope=sessions&class_id=${cls.id}&institution_id=${INST}&from=${today}&to=${dateTo}&include_cancelled=1`,
      token
    );
    const etutSessions = (sessJson.data || []).filter(
      (s) => String(s.status) !== 'cancelled' && isEtutSubject(s.subject)
    );
    console.log(`etut_sessions=${etutSessions.length}`);

    let sessionsUpdated = 0;
    let sessionsFailed = 0;
    let sessionsSkipped = 0;
    const sessResults = await mapPool(etutSessions, CONCURRENCY, async (sess) => {
      if (!FORCE && hasExactZoom(sess)) return 'skip';
      if (DRY_RUN) return 'ok';
      const { status, json } = await api('PATCH', '/api/class-live-lessons', token, {
        id: sess.id,
        meeting_link: ZOOM,
        apply_scope: 'single',
      });
      if (status >= 400) {
        console.error('session_patch_failed', sess.id, status, json);
        return 'fail';
      }
      return 'ok';
    });
    for (const r of sessResults) {
      if (r === 'skip') sessionsSkipped += 1;
      else if (r === 'fail') sessionsFailed += 1;
      else sessionsUpdated += 1;
    }

    summary.push({
      name: cls.name,
      grade: cls.grade,
      classId: cls.id,
      slots: etutSlots.length,
      slotsUpdated,
      slotsSkipped,
      slotsFailed,
      sessions: etutSessions.length,
      sessionsUpdated,
      sessionsSkipped,
      sessionsFailed,
    });
  }

  console.log('\nSUMMARY');
  console.log(JSON.stringify(summary, null, 2));
  const failed = summary.some((s) => s.slotsFailed || s.sessionsFailed);
  if (DRY_RUN) {
    console.log(
      '\nDry-run. Uygula: DRY_RUN=0 GRADES=… ETUT_ZOOM_URL=… node scripts/apply-grade-etut-zoom.mjs'
    );
  }
  if (failed) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
