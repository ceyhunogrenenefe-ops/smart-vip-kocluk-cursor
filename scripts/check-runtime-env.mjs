import fs from 'fs';
const t = fs.readFileSync('.env.vercel.runtime', 'utf8');
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL']) {
  const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'));
  let v = m ? m[1] : '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  console.log(k, v.length);
}
