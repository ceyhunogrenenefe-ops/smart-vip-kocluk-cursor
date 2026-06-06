import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, process.argv[2] || '.env.probe.prod');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      let v = l.slice(i + 1);
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [l.slice(0, i), v];
    })
);

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log('NO_CREDS', { url: !!url, key: !!key, keyLen: key?.length || 0 });
  process.exit(1);
}

const sb = createClient(url, key);

for (const table of ['seminer_kayitlari', 'seminar_kayitlari']) {
  const { count: totalRegs, error: countErr } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true });
  console.log('TABLE', table, 'TOTAL_REGS', totalRegs, countErr?.message || null);
  if (countErr) continue;

  const { data: unsynced, error: unsErr } = await sb
    .from(table)
    .select('*')
    .is('synced_at', null)
    .limit(5);
  console.log('UNSYNCED_SAMPLE', unsynced?.length ?? 0, unsErr?.message || null);
  if (unsynced?.[0]) console.log('REG_COLS', Object.keys(unsynced[0]).join(','));
  if (unsynced?.[0]) console.log('REG_SAMPLE', JSON.stringify(unsynced[0], null, 2));

  const { data: allRegs } = await sb.from(table).select('*').order('created_at', { ascending: false }).limit(3);
  if (allRegs?.[0] && !unsynced?.[0]) {
    console.log('LATEST_REG_COLS', Object.keys(allRegs[0]).join(','));
    console.log('LATEST_REG', JSON.stringify(allRegs[0], null, 2));
  }
  break;
}

const { data: events, error: evErr } = await sb.from('institution_events').select('*');
console.log('EVENTS', events?.length ?? 0, evErr?.message || null);
for (const ev of events || []) {
  console.log('EV', {
    id: ev.id,
    title: ev.title,
    send_mode: ev.send_mode,
    schedule_status: ev.schedule_status,
    seminar_sync_key: ev.seminar_sync_key,
    seminar_auto_send: ev.seminar_auto_send,
    last_schedule_run_at: ev.last_schedule_run_at
  });
}

const { count: partCount } = await sb
  .from('institution_event_participants')
  .select('*', { count: 'exact', head: true });
console.log('PARTICIPANTS_TOTAL', partCount);
