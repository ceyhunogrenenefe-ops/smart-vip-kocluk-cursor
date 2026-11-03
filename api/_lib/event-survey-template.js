/**
 * Etkinlik sonrası anket WhatsApp şablonu — DB satırı + Meta onayı.
 * Kayıt yoksa oluşturur; Meta'da yoksa onaya gönderir; onaylıysa durumu hizalar.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { loadMetaWhatsAppSecretsFromDb, metaWhatsAppConfigured } from './meta-whatsapp.js';
import { fetchMetaTemplatesFromPhoneWaba, isMetaTemplateSendableStatus } from './meta-templates-sync.js';
import { buildMetaTemplateCreatePayload, createOrReuseMetaMessageTemplate } from './meta-template-create.js';
import { SURVEY_TEMPLATE_TYPE } from './event-form-logic.js';

export const SURVEY_TEMPLATE_SEED = {
  type: SURVEY_TEMPLATE_TYPE,
  metaTemplateName: 'etkinlik_sonrasi_anket',
  name: 'Etkinlik sonrası anket (link)',
  // Değişken başta/sonda olmasın (Meta kuralı) — link ortada, kapanış cümlesi sonda
  content:
    'Merhaba {{ad}} 🌸\n{{etkinlik}} seminerimize gösterdiğiniz ilgi için teşekkür ederiz.\nSeminer hakkındaki görüşlerinizi 1 dakikalık kısa anketimizle bizimle paylaşır mısınız?\n🔗 {{link}}\nGeri bildiriminiz bizim için çok değerli.',
  variables: ['ad', 'etkinlik', 'link'],
  examples: {
    ad: 'Ayşe Yılmaz',
    etkinlik: 'Paragraf Etkinliği',
    link: 'https://www.dersonlinevipkocluk.com/anket/abc123'
  }
};

const SELECT = 'id, type, name, content, meta_template_name, meta_template_language, whatsapp_template_status, rejected_reason';

export async function getSurveyTemplateRow() {
  const { data } = await supabaseAdmin
    .from('message_templates')
    .select(SELECT)
    .eq('type', SURVEY_TEMPLATE_TYPE)
    .maybeSingle();
  return data || null;
}

export function surveyTemplateState(row) {
  if (!row) return 'missing';
  const st = String(row.whatsapp_template_status || '').toUpperCase();
  if (st === 'APPROVED' || st === 'ACTIVE') return 'approved';
  if (st === 'REJECTED') return 'rejected';
  if (st) return 'pending';
  return 'draft';
}

/** Satırı oluştur (yoksa) ve Meta'ya gönder / durumunu eşitle */
export async function ensureSurveyTemplate({ submit = true } = {}) {
  let row = await getSurveyTemplateRow();
  if (!row) {
    const seed = SURVEY_TEMPLATE_SEED;
    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .upsert(
        {
          name: seed.name,
          type: seed.type,
          content: seed.content,
          variables: seed.variables,
          twilio_variable_bindings: seed.variables,
          channel: 'whatsapp',
          is_active: true,
          category: 'UTILITY',
          meta_template_name: seed.metaTemplateName,
          meta_template_language: 'tr',
          meta_named_body_parameters: true,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'type' }
      )
      .select(SELECT)
      .maybeSingle();
    if (error) return { ok: false, error: error.message, state: 'missing' };
    row = data;
  }

  if (!submit) return { ok: true, state: surveyTemplateState(row), row };

  await loadMetaWhatsAppSecretsFromDb();
  if (!metaWhatsAppConfigured()) {
    return { ok: false, error: 'meta_not_configured', state: surveyTemplateState(row), row };
  }

  const metaName = row.meta_template_name || SURVEY_TEMPLATE_SEED.metaTemplateName;
  const phone = await fetchMetaTemplatesFromPhoneWaba(metaName, { includeComponents: false });
  const matches = phone.ok ? phone.matches || [] : [];
  const found =
    matches.find((m) => isMetaTemplateSendableStatus(m.status)) || matches[0] || null;

  let status = found ? String(found.status || '').toUpperCase() : null;
  let submitted = null;
  if (!found) {
    const payload = buildMetaTemplateCreatePayload({
      name: metaName,
      language: 'tr',
      category: 'UTILITY',
      bodyText: row.content || SURVEY_TEMPLATE_SEED.content,
      examples: SURVEY_TEMPLATE_SEED.examples
    });
    submitted = await createOrReuseMetaMessageTemplate(payload);
    if (!submitted.ok) {
      return { ok: false, error: submitted.error || 'meta_submit_failed', state: surveyTemplateState(row), row };
    }
    status = String(submitted.status || 'PENDING').toUpperCase();
  }

  const { data: updated } = await supabaseAdmin
    .from('message_templates')
    .update({
      meta_template_name: (submitted && submitted.name) || metaName,
      meta_template_language: (submitted && submitted.language) || 'tr',
      whatsapp_template_status: status,
      whatsapp_template_synced_at: new Date().toISOString(),
      is_active: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', row.id)
    .select(SELECT)
    .maybeSingle();
  const finalRow = updated || row;
  return { ok: true, state: surveyTemplateState(finalRow), row: finalRow, submitted: Boolean(submitted) };
}
