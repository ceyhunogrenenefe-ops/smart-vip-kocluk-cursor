import { supabaseAdmin } from './supabase-admin.js';
import { uploadParentPdfForMeta } from './meta-document-storage.js';
import {
  sendMetaDocumentWithLink,
  sendMetaTextMessage,
  parseMetaSendError
} from './meta-whatsapp.js';
import {
  resolveMetaTemplateName,
  sendWhatsAppUsingTemplateRow
} from './whatsapp-outbound.js';

export const PARENT_PDF_TEMPLATE_TYPE = 'parent_pdf_link';

export const PARENT_PDF_META_NAME =
  String(process.env.PARENT_PDF_META_TEMPLATE_NAME || 'parent_pdf_link').trim() || 'parent_pdf_link';

export const PARENT_PDF_META_LANGUAGE =
  String(process.env.PARENT_PDF_META_TEMPLATE_LANGUAGE || 'tr').trim() || 'tr';

const PARENT_PDF_TEMPLATE_CONTENT = `Merhaba,

{{student_name}} için {{baslik}} hazır.

PDF indirmek için bağlantı:
{{link}}

Smart VIP Koçluk`;

export function buildParentPdfTemplateRow() {
  return {
    type: PARENT_PDF_TEMPLATE_TYPE,
    name: 'Veli PDF bağlantısı (Meta)',
    content: PARENT_PDF_TEMPLATE_CONTENT,
    variables: ['student_name', 'baslik', 'link'],
    twilio_variable_bindings: ['student_name', 'baslik', 'link'],
    meta_template_name: PARENT_PDF_META_NAME,
    meta_template_language: PARENT_PDF_META_LANGUAGE,
    meta_named_body_parameters: false,
    channel: 'whatsapp',
    is_active: true,
    whatsapp_template_status: 'APPROVED'
  };
}

export async function upsertParentPdfTemplateDefaults() {
  const now = new Date().toISOString();
  const row = { ...buildParentPdfTemplateRow(), updated_at: now };
  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .upsert(row, { onConflict: 'type' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function isSessionWindowError(error) {
  const parsed = parseMetaSendError(error);
  const code = Number(parsed.code || 0);
  const msg = String(parsed.message || (error instanceof Error ? error.message : '')).toLowerCase();
  return (
    code === 131047 ||
    code === 131026 ||
    msg.includes('24 hour') ||
    msg.includes('24-hour') ||
    msg.includes('re-engagement') ||
    (msg.includes('session') && msg.includes('window'))
  );
}

async function loadParentPdfTemplateRow() {
  await upsertParentPdfTemplateDefaults().catch(() => {});
  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .select('*')
    .eq('type', PARENT_PDF_TEMPLATE_TYPE)
    .maybeSingle();
  if (error) throw error;
  if (data?.content && data.is_active !== false) return data;
  return buildParentPdfTemplateRow();
}

function buildParentPdfPlainText(vars) {
  return `Merhaba,\n\n${vars.student_name} için ${vars.baslik} hazır.\n\nPDF indirmek için bağlantı:\n${vars.link}\n\nSmart VIP Koçluk`;
}

async function tryTemplateSend(toE164, templateRow, templateVars) {
  const metaName = resolveMetaTemplateName(templateRow, PARENT_PDF_TEMPLATE_TYPE);
  if (!metaName) {
    return { ok: false, error: 'parent_pdf_link_template_not_configured' };
  }

  let sent = await sendWhatsAppUsingTemplateRow({
    phone: toE164,
    templateRow,
    vars: templateVars,
    templateType: PARENT_PDF_TEMPLATE_TYPE,
    requirePhoneWabaTemplate: true
  });

  if (!sent.ok && /template_not_on_phone_waba|132001|translation/i.test(String(sent.error || ''))) {
    sent = await sendWhatsAppUsingTemplateRow({
      phone: toE164,
      templateRow,
      vars: templateVars,
      templateType: PARENT_PDF_TEMPLATE_TYPE,
      requirePhoneWabaTemplate: false
    });
  }

  if (!sent.ok && templateRow?.meta_named_body_parameters !== true) {
    const namedRow = { ...templateRow, meta_named_body_parameters: true };
    const named = await sendWhatsAppUsingTemplateRow({
      phone: toE164,
      templateRow: namedRow,
      vars: templateVars,
      templateType: PARENT_PDF_TEMPLATE_TYPE,
      requirePhoneWabaTemplate: false
    });
    if (named.ok) return named;
  }

  return sent;
}

/**
 * Veliye PDF — önce Meta onaylı şablon + indirme linki (24 saat kuralı dışında),
 * sonra belge bağlantısı, sonra düz metin; son çare download_url (wa.me).
 */
export async function sendParentPdfToWhatsapp({
  toE164,
  documentBase64,
  filename = 'document.pdf',
  caption = '',
  mimeType = 'application/pdf',
  studentName = '',
  title = ''
}) {
  const b64 = String(documentBase64 || '').trim();
  if (!b64) {
    return { ok: false, error: 'document_base64_required', channel: 'parent_pdf' };
  }

  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) {
    return { ok: false, error: 'invalid_document_base64', channel: 'parent_pdf' };
  }
  if (buf.subarray(0, 4).toString('ascii') !== '%PDF') {
    return { ok: false, error: 'invalid_pdf_content', channel: 'parent_pdf' };
  }

  let hosted;
  try {
    hosted = await uploadParentPdfForMeta({
      buffer: buf,
      filename,
      mimeType,
      expiresSec: 7 * 24 * 3600
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: 'pdf_storage_upload_failed',
      channel: 'parent_pdf',
      hint: `PDF depolamaya yüklenemedi: ${msg}. Supabase storage bucket (${process.env.META_DOCUMENT_BUCKET || 'question-help'}) erişimini kontrol edin.`
    };
  }

  const baslik = String(title || caption || 'PDF raporu')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 200);
  const student = String(studentName || 'Öğrenci').trim().slice(0, 200) || 'Öğrenci';
  const templateVars = {
    student_name: student,
    baslik: baslik || 'PDF raporu',
    link: hosted.signedUrl
  };

  const templateRow = await loadParentPdfTemplateRow();
  const metaName = resolveMetaTemplateName(templateRow, PARENT_PDF_TEMPLATE_TYPE);
  const errors = [];

  if (templateRow && metaName) {
    const sent = await tryTemplateSend(toE164, templateRow, templateVars);
    if (sent.ok && sent.sid) {
      return {
        ok: true,
        channel: 'meta_template',
        sid: sent.sid,
        method: 'template_link',
        meta_template_name: sent.meta_template_name || metaName,
        download_url: hosted.signedUrl
      };
    }
    errors.push(sent.error || 'template_send_failed');
  } else {
    errors.push('parent_pdf_link_template_not_configured');
  }

  try {
    const doc = await sendMetaDocumentWithLink({
      toE164,
      documentUrl: hosted.signedUrl,
      filename: hosted.filename || filename,
      caption: caption || baslik
    });
    if (doc.messageId) {
      return {
        ok: true,
        channel: 'meta_document',
        sid: doc.messageId,
        method: 'document_link',
        download_url: hosted.signedUrl,
        template_error: errors.join(' · ') || null
      };
    }
  } catch (e) {
    if (!isSessionWindowError(e)) {
      errors.push(parseMetaSendError(e).message);
    } else {
      errors.push('session_window_closed_for_document');
    }
  }

  try {
    const text = buildParentPdfPlainText(templateVars);
    const { messageId } = await sendMetaTextMessage({ toE164, text });
    if (messageId) {
      return {
        ok: true,
        channel: 'meta_plain_text',
        sid: messageId,
        method: 'plain_text_link',
        download_url: hosted.signedUrl,
        template_error: errors.join(' · ') || null
      };
    }
  } catch (e) {
    if (!isSessionWindowError(e)) {
      errors.push(parseMetaSendError(e).message);
    } else {
      errors.push('session_window_closed_for_text');
    }
  }

  return {
    ok: false,
    error: errors.filter(Boolean).join(' · ') || 'parent_pdf_send_failed',
    channel: 'parent_pdf',
    download_url: hosted.signedUrl,
    hint:
      'Meta’da parent_pdf_link şablonunu onaylayın (UTILITY, tr, 3 değişken: öğrenci adı, başlık, link). Şablon yoksa veli son 24 saatte yazmış olmalı. Geçici olarak wa.me ile link açılabilir.'
  };
}
