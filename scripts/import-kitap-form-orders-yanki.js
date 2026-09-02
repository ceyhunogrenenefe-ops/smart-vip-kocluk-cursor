#!/usr/bin/env node
/**
 * kitap_siparisleri → Yankı Kitapevi Siparişlerim aktarımı.
 *
 * Kullanım:
 *   node scripts/import-kitap-form-orders-yanki.js
 *   node scripts/import-kitap-form-orders-yanki.js --dry-run
 *   node scripts/import-kitap-form-orders-yanki.js --since=2026-08-26
 *
 * Gerekli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (veya projedeki supabase-admin env'leri)
 */
import { importKitapFormOrdersToYanki, DEFAULT_SINCE } from '../api/_lib/commerce-kitap-form-import.js';

function argValue(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  if (process.argv.includes(`--${name}`)) return 'true';
  return fallback;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const since = argValue('since', DEFAULT_SINCE);
  const limit = parseInt(argValue('limit', '500'), 10);

  console.log(`Kitap form siparişleri → Yankı Kitapevi (${dryRun ? 'DRY RUN' : 'LIVE'})`);
  console.log(`since=${since} limit=${limit}`);

  const out = await importKitapFormOrdersToYanki({
    since,
    dryRun,
    limit,
    actorSub: 'script:import-kitap-form-orders-yanki',
  });

  console.log(JSON.stringify(out, null, 2));
  if (out.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
