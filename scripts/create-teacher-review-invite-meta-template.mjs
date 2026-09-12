/**
 * Meta WABA'da ogretmen_yorum_daveti (UTILITY, named) şablonunu oluşturur / yeniden kullanır.
 *
 * Kullanım:
 *   node --env-file=.env.vercel.prod scripts/create-teacher-review-invite-meta-template.mjs
 *
 * Panelden alternatif:
 *   Mesaj Şablonları → «Öğretmen yorum daveti» → Meta'ya gönder
 */
import { loadMetaWhatsAppSecretsFromDb } from '../api/_lib/meta-whatsapp.js';
import { resolvePrimaryWabaId } from '../api/_lib/meta-templates-sync.js';
import {
  buildMetaTemplateCreatePayload,
  createOrReuseMetaMessageTemplate,
} from '../api/_lib/meta-template-create.js';

const NAME = 'ogretmen_yorum_daveti';
const LANG = 'tr';

const BODY_TEXT = `Sayın {{parent_name}},

{{student_name}} öğrencimizin {{teacher_name}} öğretmenimizle dersi tamamlandı.
Lütfen öğretmenimizi değerlendirin:
{{review_link}}

Online VIP Dershane`;

const EXAMPLES = {
  parent_name: 'Ayse Yilmaz',
  student_name: 'Safiye Yilmaz',
  teacher_name: 'Mehmet Demir',
  review_link: 'https://www.dersonlinevipkocluk.com/review/public?token=ornek',
};

async function main() {
  await loadMetaWhatsAppSecretsFromDb().catch(() => {});
  const tok = process.env.META_WHATSAPP_TOKEN?.trim();
  if (!tok) {
    console.error('META_WHATSAPP_TOKEN eksik (.env veya Supabase meta secrets)');
    process.exit(1);
  }

  const { waba_id, source } = await resolvePrimaryWabaId(tok);
  if (!waba_id) {
    console.error('WABA bulunamadı — META_WABA_ID veya META_PHONE_NUMBER_ID kontrol edin');
    process.exit(1);
  }
  console.log(`WABA: ${waba_id} (source=${source})`);

  let payload;
  try {
    payload = buildMetaTemplateCreatePayload({
      name: NAME,
      language: LANG,
      category: 'UTILITY',
      bodyText: BODY_TEXT,
      examples: EXAMPLES,
    });
  } catch (e) {
    console.error('payload_error', e?.message || e);
    process.exit(1);
  }

  console.log('payload', JSON.stringify(payload, null, 2));

  const submitted = await createOrReuseMetaMessageTemplate(payload);
  console.log(JSON.stringify(submitted, null, 2));
  if (!submitted.ok) process.exit(1);

  console.log(
    `\nOK — name=${submitted.name}, status=${submitted.status}, created=${Boolean(submitted.created)}, reused=${Boolean(submitted.reused)}`
  );
  console.log('Meta Business Manager → WhatsApp → Mesaj şablonları üzerinden onay durumunu izleyin.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
