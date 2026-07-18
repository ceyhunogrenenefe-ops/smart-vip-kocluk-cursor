/**
 * 15 Temmuz 2026 (resmi tatil) grup ders oturumlarını iptal eder.
 * Muaf sınıflar: 8-A, 8-B, 8-E, 8-F (isim / şube eşleşmesi).
 * Haftalık şablonlar (class_weekly_slots) dokunulmaz.
 * Oturumlar silinmez → status=cancelled (maaş özeti yalnızca completed sayar;
 * iptal satırlar şablondan yeniden oluşturulmayı engeller).
 *
 *   node scripts/cancel-holiday-group-sessions-2026-07-15.mjs
 *   DRY_RUN=0 node scripts/cancel-holiday-group-sessions-2026-07-15.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const LESSON_DATE = String(process.env.LESSON_DATE || '2026-07-15').trim().slice(0, 10);
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const KEEP_LABELS = ['8-A', '8-B', '8-E', '8-F'];

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) {
      if (v === '') continue; // boş değerle dolu env ezilmesin / boş yazılmasın
      process.env[k] = v;
    }
  }
}

for (const f of [
  '.env.vercel.holiday-tmp',
  'student-coaching-system/.env.local',
  '.env.local',
  '.env.edesis.prod',
  '.env.edesis.live',
  '.env.prod.live',
  '.env.production',
  '.env.vercel.pull',
  '.env.vercel.runtime',
  '.env.vercel.prod',
  '.env.vercel.prod.secrets',
  '.env.vercel',
  '.env.vercel.local',
  '.env.prod.insert'
]) {
  loadDotEnv(path.join(root, f));
}

// Boş string sayma (bazı .env dosyalarında KEY="")
function envNonEmpty(name) {
  const v = String(process.env[name] || '').trim();
  return v.length > 8 ? v : '';
}

const url = envNonEmpty('SUPABASE_URL') || envNonEmpty('VITE_SUPABASE_URL');
const key = envNonEmpty('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (boş olmamalı).');
  console.error('Örn: $env:SUPABASE_SERVICE_ROLE_KEY="..." ; DRY_RUN=0 node scripts/cancel-holiday-group-sessions-2026-07-15.mjs');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function norm(s) {
  return String(s || '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, '')
    .replace(/[._–—]/g, '-');
}

function isKeepClass(row) {
  const name = norm(row.name);
  const branch = norm(row.branch);
  const level = String(row.class_level || '')
    .trim()
    .replace(/\D/g, '');
  for (const label of KEEP_LABELS) {
    const n = norm(label); // 8-A
    if (name === n || name.endsWith(n) || name.includes(n)) return true;
    // name "8" + branch "A"
    if (level === '8' && branch === n.split('-')[1]) return true;
    if ((name === '8' || name === '8SINIF' || /^8$/.test(name)) && branch === n.split('-')[1]) return true;
    // "8A" without hyphen
    if (name === n.replace(/-/g, '')) return true;
  }
  return false;
}

async function main() {
  console.log(`Tarih: ${LESSON_DATE} | DRY_RUN=${DRY_RUN ? 'yes' : 'NO (iptal edilecek)'}`);
  console.log(`Muaf: ${KEEP_LABELS.join(', ')}`);

  const { data: classes, error: cErr } = await sb
    .from('classes')
    .select('id,name,branch,class_level')
    .order('name', { ascending: true });
  if (cErr) throw cErr;

  const keep = [];
  const cancelClasses = [];
  for (const c of classes || []) {
    if (isKeepClass(c)) keep.push(c);
    else cancelClasses.push(c);
  }

  console.log('\n— Muaf sınıflar —');
  for (const c of keep) {
    console.log(`  KEEP  ${c.id}  name="${c.name}" branch="${c.branch || ''}" level="${c.class_level || ''}"`);
  }
  if (!keep.length) {
    console.error('\nUYARI: Hiç muaf sınıf eşleşmedi! İptal durduruldu.');
    process.exit(2);
  }

  const keepIds = new Set(keep.map((c) => String(c.id)));

  const { data: sessions, error: sErr } = await sb
    .from('class_sessions')
    .select('id,class_id,lesson_date,start_time,end_time,subject,status,teacher_id')
    .eq('lesson_date', LESSON_DATE)
    .order('start_time', { ascending: true });
  if (sErr) throw sErr;

  const byClass = new Map((classes || []).map((c) => [String(c.id), c]));
  const toCancel = [];
  const keptSessions = [];
  const alreadyCancelled = [];

  for (const s of sessions || []) {
    const cid = String(s.class_id || '');
    if (String(s.status || '') === 'cancelled') {
      alreadyCancelled.push(s);
      continue;
    }
    if (keepIds.has(cid)) keptSessions.push(s);
    else toCancel.push(s);
  }

  console.log(`\nToplam oturum (${LESSON_DATE}): ${(sessions || []).length}`);
  console.log(`  Zaten iptal: ${alreadyCancelled.length}`);
  console.log(`  Muaf (kalacak): ${keptSessions.length}`);
  console.log(`  İptal edilecek: ${toCancel.length}`);

  console.log('\n— Kalacak (muaf) —');
  for (const s of keptSessions) {
    const c = byClass.get(String(s.class_id));
    console.log(
      `  KEEP  ${String(s.start_time).slice(0, 5)}  ${c?.name || s.class_id}  ${s.subject}  [${s.status}]`
    );
  }

  console.log('\n— İptal listesi (sınıf özeti) —');
  const cancelByClass = new Map();
  for (const s of toCancel) {
    const key = String(s.class_id);
    const arr = cancelByClass.get(key) || [];
    arr.push(s);
    cancelByClass.set(key, arr);
  }
  for (const [cid, arr] of [...cancelByClass.entries()].sort((a, b) => {
    const na = byClass.get(a[0])?.name || a[0];
    const nb = byClass.get(b[0])?.name || b[0];
    return String(na).localeCompare(String(nb), 'tr');
  })) {
    const c = byClass.get(cid);
    console.log(`  ${c?.name || cid}: ${arr.length} oturum (${arr.map((x) => String(x.start_time).slice(0, 5)).join(', ')})`);
  }

  if (!toCancel.length) {
    console.log('\nİptal edilecek oturum yok.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nÖnizleme bitti. Uygulamak için: DRY_RUN=0 node scripts/cancel-holiday-group-sessions-2026-07-15.mjs');
    return;
  }

  const ids = toCancel.map((s) => s.id);
  const CHUNK = 200;
  let updated = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from('class_sessions')
      .update({ status: 'cancelled', updated_at: now })
      .in('id', chunk)
      .neq('status', 'cancelled')
      .select('id');
    if (error) throw error;
    updated += (data || []).length;
  }

  console.log(`\nTamam: ${updated} oturum cancelled yapıldı (maaş tamamlananlardan sayılmaz).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
