import { getGatewaySessionUserId } from './session';
import { compressPdfBlobForWhatsApp } from './pdfCompressForWhatsApp';
import {
  blobToBase64,
  formatWhatsAppPhone,
  sendWhatsAppGatewayDocument,
  sendWhatsAppOutbound
} from './whatsappOutbound';
import type { MtMeetingBundle, MtUser } from './meetingTrackerApi';

const GATEWAY_HARD_MAX_BYTES = 15 * 1024 * 1024;
const SEND_DELAY_MS = 750;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function shareMeetingSummaryWhatsApp(opts: {
  bundle: MtMeetingBundle;
  users: MtUser[];
  recipientIds: string[];
  senderUserId: string;
  pdfBlob: Blob;
  filename: string;
}): Promise<{ sent: number; skipped: { name: string; reason: string }[]; notice: string }> {
  const coachUserId = getGatewaySessionUserId(opts.senderUserId);
  if (!coachUserId) {
    throw new Error('Oturum bulunamadı — çıkış yapıp tekrar giriş yapın.');
  }

  const meetingTitle = opts.bundle.meeting.title;
  const caption = `${meetingTitle} — toplantı özeti (${opts.bundle.meeting.meeting_date}).`;

  let { blob: pdfBlob } = await compressPdfBlobForWhatsApp(opts.pdfBlob);
  if (pdfBlob.size > GATEWAY_HARD_MAX_BYTES) {
    throw new Error('PDF çok büyük — önce indirip manuel paylaşın.');
  }
  const base64 = await blobToBase64(pdfBlob);

  const skipped: { name: string; reason: string }[] = [];
  let sent = 0;

  for (const userId of opts.recipientIds) {
    const u = opts.users.find((x) => x.id === userId);
    const label = u?.name || u?.email || userId;
    const phone = formatWhatsAppPhone(u?.phone || '');
    if (!phone) {
      skipped.push({ name: label, reason: 'Telefon kayıtlı değil' });
      continue;
    }
    try {
      await sendWhatsAppGatewayDocument({
        coachUserId,
        targetPhone: phone,
        filename: opts.filename,
        base64,
        caption,
        mimeType: 'application/pdf'
      });
      sent += 1;
      if (sent < opts.recipientIds.length) await sleep(SEND_DELAY_MS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/gateway|bağlı değil|session/i.test(msg) && sent === 0) {
        throw e;
      }
      skipped.push({ name: label, reason: msg.slice(0, 120) });
    }
  }

  if (!sent && skipped.length) {
    const textFallback = `${caption}\n\n(PDF gateway ile gönderilemedi — WhatsApp merkezinden bağlantıyı kontrol edin.)`;
    for (const userId of opts.recipientIds) {
      const u = opts.users.find((x) => x.id === userId);
      const phone = formatWhatsAppPhone(u?.phone || '');
      if (!phone) continue;
      try {
        await sendWhatsAppOutbound({ coachUserId, targetPhone: phone, message: textFallback });
        sent += 1;
        break;
      } catch {
        /* continue */
      }
    }
  }

  const notice =
    sent > 0
      ? `${sent} kişiye toplantı özeti PDF gönderildi.`
      : 'Kimseye gönderilemedi — telefon ve WhatsApp gateway bağlantısını kontrol edin.';

  return { sent, skipped, notice };
}
