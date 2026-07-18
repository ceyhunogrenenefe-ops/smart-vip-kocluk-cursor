/**
 * Meta WABA'da meeting_notification UTILITY şablonunu oluşturur.
 *
 * Kullanım:
 *   node --env-file=.env.vercel.prod scripts/create-meeting-notification-meta-template.mjs
 *
 * Meta gövde ({{1}} = isim):
 *   Online VIP Dershane — görüşme hatırlatması
 *   {{1}} 10 dakika içinde görüşmeniz başlıyor.
 *    https://www.dersonlinevipkocluk.com
 */
import { resolvePrimaryWabaId } from '../api/_lib/meta-templates-sync.js';

const GRAPH = String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
const NAME = 'meeting_notification';
const LANG = 'tr';

const BODY_TEXT =
  'Online VIP Dershane — görüşme hatırlatması\n{{1}} 10 dakika içinde görüşmeniz başlıyor.\n https://www.dersonlinevipkocluk.com';

const EXAMPLE = 'Ahmet';

async function main() {
  const tok = process.env.META_WHATSAPP_TOKEN?.trim();
  if (!tok) {
    console.error('META_WHATSAPP_TOKEN eksik');
    process.exit(1);
  }

  const { waba_id, source } = await resolvePrimaryWabaId(tok);
  if (!waba_id) {
    console.error('WABA bulunamadı — META_WABA_ID veya META_PHONE_NUMBER_ID kontrol edin');
    process.exit(1);
  }
  console.log(`WABA: ${waba_id} (source=${source})`);

  const url = `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(waba_id)}/message_templates`;
  const payload = {
    name: NAME,
    language: LANG,
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text: BODY_TEXT,
        example: {
          body_text: [[EXAMPLE]]
        }
      }
    ]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  console.log(JSON.stringify({ http: res.status, ...json }, null, 2));
  if (!res.ok) process.exit(1);
  console.log(`\nOK — name=${NAME}, lang=${LANG}, {{1}}=isim`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
