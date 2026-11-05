/**
 * Geçmiş web siparişlerini crm_website_orders tablosuna aktarır.
 * Kullanım: node scripts/run-crm-website-orders-backfill.mjs C:\path\to\.env.production.local
 */
import fs from 'fs';

const envPath = process.argv[2];
if (envPath && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const { ensureCrmWebsiteOrdersSchema, backfillCrmWebsiteOrders } = await import(
  '../api/_lib/crm-website-orders.js'
);
const { supabaseAdmin } = await import('../api/_lib/supabase-admin.js');

const ensured = await ensureCrmWebsiteOrdersSchema();
console.log('schema', ensured);

let cursor = null;
let total = 0;
let rounds = 0;
const maxRounds = 500;

while (rounds < maxRounds) {
  rounds += 1;
  const result = await backfillCrmWebsiteOrders({ source: 'all', cursor });
  total += Number(result.synced || 0);
  console.log(
    JSON.stringify({
      round: rounds,
      phase: result.phase,
      synced: result.synced,
      done: result.done,
      next_cursor: result.next_cursor || null,
    })
  );
  if (result.done) break;
  cursor = result.next_cursor;
  if (!cursor) break;
}

const { count } = await supabaseAdmin
  .from('crm_website_orders')
  .select('*', { count: 'exact', head: true });
console.log(JSON.stringify({ ok: true, total_synced_this_run: total, crm_website_orders_count: count }));
