import { supabaseAdmin } from './supabase-admin.js';
import { uploadParentPdfForMeta } from './meta-document-storage.js';
import { sendMetaDocumentMessage, parseMetaSendError } from './meta-whatsapp.js';
import {
  resolveMetaTemplateName,
  sendWhatsAppUsingTemplateRow
} from './whatsapp-outbound.js';

export const PARENT_PDF_TEMPLATE_TYPE = 'parent_pdf_link';

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
    msg.includes('session') && msg.includes('window')
  );
}

async function loadParentPdfTemplateRow() {
  const envName = String(process.env.PARENT_PDF_META_TEMPLATE_NAME || '').trim();
  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .select('*')
    .eq('type', PARENT_PDF_TEMPLATE_TYPE)
    .maybeSingle();
  if (error) throw error;
  if (data?.content) return data;
  if (!envName) return null;
  return {
    type: PARENT_PDF_TEMPLATE_TYPE,
    content:
      'Merhaba,\n\n{{student_name}} için {{baslik}} hazır.\n\nPDF bağlantısı:\n{{link}}\n\nSmart VIP Koçluk',
    variables: ['student_name', 'baslik', 'link'],
    twilio_variable_bindings: ['student_name', 'baslik', 'link'],
    meta_template_name: envName,
    meta_template_language: process.env.PARENT_PDF_META_TEMPLATE_LANGUAGE || 'tr',
    meta_named_body_parameters: false,
    is_active: true
  };
}

/**
 * Veliye PDF — önce Meta onaylı şablon + indirme linki (24 saat kuralı yok),
 * isteğe bağlı oturum içi belge, son çare download_url (wa.me).
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

  const hosted = await uploadParentPdfForMeta({
    buffer: buf,
    filename,
    mimeType,
    expiresSec: 7 * 24 * 3600
  });

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
  const metaName = templateRow ? resolveMetaTemplateName(templateRow, PARENT_PDF_TEMPLATE_TYPE) : '';
  let templateError = null;

  if (templateRow && metaName) {
    const sent = await sendWhatsAppUsingTemplateRow({
      phone: toE164,
      templateRow,
      vars: templateVars,
      templateType: PARENT_PDF_TEMPLATE_TYPE
    });
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
    templateError = sent.error || 'template_send_failed';
  } else {
    templateError = 'parent_pdf_link_template_not_configured';
  }

  const allowSessionDoc = String(process.env.PARENT_PDF_ALLOW_SESSION_DOCUMENT || '').trim() === '1';
  if (allowSessionDoc) {
    try {
      const doc = await sendMetaDocumentMessage({
        toE164,
        documentBase64: b64,
        filename,
        caption,
        mimeType
      });
      if (doc.messageId) {
        return {
          ok: true,
          channel: 'meta_document',
          sid: doc.messageId,
          method: 'session_document',
          download_url: hosted.signedUrl
        };
      }
    } catch (e) {
      if (!isSessionWindowError(e)) {
        return {
          ok: false,
          error: parseMetaSendError(e).message,
          channel: 'meta_document',
          download_url: hosted.signedUrl,
          template_error: templateError
        };
      }
    }
  }

  return {
    ok: false,
    error: templateError || 'parent_pdf_send_failed',
    channel: 'parent_pdf',
    download_url: hosted.signedUrl,
    hint:
      'Meta’da parent_pdf_link şablonunu onaylatın (3 değişken: öğrenci adı, başlık, link). Geçici olarak wa.me ile link gönderilebilir.'
  };
}
