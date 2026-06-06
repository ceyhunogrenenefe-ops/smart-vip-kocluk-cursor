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
  console.log('NO_CREDS');
  process.exit(1);
}

const sb = createClient(url, key);
for (const table of ['seminer_kayitlari', 'seminar_kayitlari']) {
  const { data, error } = await sb.from(table).select('*').limit(3);
  if (error) {
    console.log('TABLE', table, 'ERR', error.message, error.code);
    continue;
  }
  console.log('TABLE', table, 'COUNT', data?.length ?? 0);
  if (data?.[0]) console.log('COLS', Object.keys(data[0]).join(','));
  console.log('SAMPLE', JSON.stringify(data?.[0] ?? null, null, 2));
  break;
}
