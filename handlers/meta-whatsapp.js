import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { insertWhatsAppAutomationLog } from '../api/_lib/message-log.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import {
  getMetaWhatsAppEnvStatus,
  metaWhatsAppConfigured,
  normalizePhoneToE164,
  sendMetaTextMessage,
  parseMetaSendError
} from '../api/_lib/meta-whatsapp.js';
import { sendParentPdfToWhatsapp } from '../api/_lib/parent-pdf-meta-send.js';

function parseBody(req) {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  actor = await enrichStudentActor(actor);

  const role = String(actor.role || '').trim();
  const allowed =
    role === 'super_admin' || role === 'admin' || role === 'coach' || role === 'teacher';
  if (!allowed) {
    return res.status(403).json({
      error: 'forbidden',
      hint: 'Meta WhatsApp yalnızca yönetici, koç veya öğretmen oturumu içindir.'
    });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ data: getMetaWhatsAppEnvStatus() });
  }

  if (req.method === 'POST') {
    const b = parseBody(req);
    const to = typeof b.to === 'string' ? b.to.trim() : '';
    const message = typeof b.message === 'string' ? b.message : '';
    const documentBase64 =
      typeof b.document_base64 === 'string'
        ? b.document_base64.trim()
        : typeof b.data_base64 === 'string'
          ? b.data_base64.trim()
          : '';
    const filename = typeof b.filename === 'string' ? b.filename.trim() : 'document.pdf';
    const caption = typeof b.caption === 'string' ? b.caption.trim() : '';
    const mimeType = typeof b.mime_type === 'string' ? b.mime_type.trim() : 'application/pdf';
    const studentId = typeof b.student_id === 'string' ? b.student_id.trim() : '';
    const studentName = typeof b.student_name === 'string' ? b.student_name.trim() : '';
    const pdfTitle = typeof b.pdf_title === 'string' ? b.pdf_title.trim() : '';

    if (!to) {
      return res.status(400).json({ error: 'to required' });
    }
    if (!message && !documentBase64) {
      return res.status(400).json({ error: 'message or document_base64 required' });
    }
    const e164 = normalizePhoneToE164(to);
    if (!e164) {
      return res.status(400).json({ error: 'invalid_phone' });
    }

    if (!metaWhatsAppConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'meta_whatsapp_not_configured',
        hint:
          'Vercel Production’da META_WHATSAPP_TOKEN ve META_PHONE_NUMBER_ID dolu olmalı. Kaydettikten sonra redeploy.'
      });
    }

    if (role === 'coach' && !actor.coach_id) {
      return res.status(403).json({
        error: 'coach_id_required',
        hint: 'Koç hesabı veritabanıyla eşleşmedi. Çıkış yapıp tekrar giriş yapın veya yöneticinizin coaches kaydınızı e-postanızla eşlemesini isteyin.'
      });
    }

    try {
      if (documentBase64) {
        if (role !== 'super_admin') {
          return res.status(403).json({
            ok: false,
            error: 'parent_pdf_meta_super_admin_only',
            hint:
              'PDF gönderimi koç ve admin için WhatsApp gateway kullanır. Koç WhatsApp ayarlarından QR ile bağlanın; veliye PDF panelden tekrar gönderin.'
          });
        }

        const sent = await sendParentPdfToWhatsapp({
          toE164: e164,
          documentBase64,
          filename,
          caption,
          mimeType,
          studentName,
          title: pdfTitle || caption
        });
        if (!sent.ok || !sent.sid) {
          await insertWhatsAppAutomationLog({
            studentId: studentId || null,
            relatedId: null,
            kind: 'parent_pdf_meta',
            message: caption || filename,
            status: 'failed',
            logDate: getIstanbulDateString(),
            phone: e164,
            error: [sent.error, sent.hint, sent.template_error].filter(Boolean).join(' — '),
            twilio_error_code: sent.channel || null
          });
          return res.status(sent.download_url ? 409 : 500).json({
            ok: false,
            error: sent.error || 'parent_pdf_send_failed',
            hint: sent.hint || null,
            download_url: sent.download_url || null,
            channel: sent.channel || 'parent_pdf'
          });
        }
        await insertWhatsAppAutomationLog({
          studentId: studentId || null,
          relatedId: null,
          kind: 'parent_pdf_meta',
          message: caption || filename,
          status: 'sent',
          logDate: getIstanbulDateString(),
          phone: e164,
          meta_message_id: sent.sid,
          meta_template_name: sent.meta_template_name || null
        });
        return res.status(200).json({
          ok: true,
          sid: sent.sid,
          channel: sent.channel || 'meta_template',
          method: sent.method || 'template_link',
          download_url: sent.download_url || null
        });
      }

      const { messageId } = await sendMetaTextMessage({ toE164: e164, text: message });
      if (!messageId) {
        return res.status(502).json({
          ok: false,
          error: 'meta_accepted_without_message_id',
          channel: 'meta_cloud_api'
        });
      }
      return res.status(200).json({ ok: true, sid: messageId, channel: 'meta_cloud_api' });
    } catch (e) {
      const parsed = parseMetaSendError(e);
      await insertWhatsAppAutomationLog({
        studentId: studentId || null,
        relatedId: null,
        kind: documentBase64 ? 'parent_pdf_meta' : 'manual_whatsapp',
        message: documentBase64 ? caption || filename : message,
        status: 'failed',
        logDate: getIstanbulDateString(),
        phone: e164,
        error: parsed.message,
        twilio_error_code: parsed.code || null
      });
      return res.status(500).json({ ok: false, error: parsed.message, channel: 'meta_cloud_api' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
