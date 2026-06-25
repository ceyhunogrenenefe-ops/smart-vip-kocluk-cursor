/**
 * BBB API sağlık kontrolü (yerel / CI).
 * Kullanım: BBB_API_ENDPOINT=... BBB_API_SECRET=... node scripts/bbb-recording-health.mjs
 */
import { isBbbConfigured, probeBbbApiReachable } from '../api/_lib/bbb.js';

async function main() {
  console.log('=== BBB kayıt API sağlık testi ===\n');
  const configured = isBbbConfigured();
  console.log('Env yapılandırması:', configured ? 'OK' : 'EKSİK');
  if (!configured) {
    console.error('\nBBB_API_ENDPOINT ve BBB_API_SECRET tanımlayın.');
    process.exit(1);
  }

  const probe = await probeBbbApiReachable();
  console.log('getMeetings probe:', probe.ok ? `OK (${probe.ms}ms)` : `HATA: ${probe.error} (${probe.ms}ms)`);

  if (!probe.ok) {
    process.exit(2);
  }

  console.log('\nBBB API erişilebilir. Kayıt izleme için getRecordings sunucu yanıt süresi kritiktir.');
  console.log('Üretimde: GET /api/bbb-health?probe=1');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
