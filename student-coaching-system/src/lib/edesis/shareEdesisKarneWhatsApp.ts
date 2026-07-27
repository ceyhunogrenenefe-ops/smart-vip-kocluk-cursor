import { getGatewaySessionUserId } from '../session';
import {
  compressPdfBlobForWhatsApp
} from '../pdfCompressForWhatsApp';
import {
  blobToBase64,
  buildParentPdfWaMeMessage,
  formatWhatsAppPhone,
  sendWhatsAppGatewayDocument,
  sendWhatsAppOutbound
} from '../whatsappOutbound';
import { fetchEdesisKarnePdf, type EdesisStudentResultsExam } from './edesisApi';

const GATEWAY_HARD_MAX_BYTES = 15 * 1024 * 1024;

function isPayloadTooLargeError(msg: string): boolean {
  return /payload_too_large|document_too_large|entity too large|payloadtoolarge/i.test(msg);
}

export async function shareEdesisKarneWithParent(opts: {
  exam: EdesisStudentResultsExam;
  edesisStudentId: string;
  platformStudentId?: string;
  studentName: string;
  parentPhone: string;
  coachUserId: string;
  termId?: string | number;
}): Promise<{ notice: string; reportUrl: string }> {
  const parentDigits = formatWhatsAppPhone(opts.parentPhone);
  if (!parentDigits) {
    throw new Error(
      'Veli telefonu koçluk sisteminde tanımlı değil — öğrenci kartına veli numarası ekleyin (Edesis veli kaydı gerekmez).'
    );
  }

  const coachUserId = getGatewaySessionUserId(opts.coachUserId);
  if (!coachUserId) {
    throw new Error('Oturum bulunamadı — çıkış yapıp tekrar giriş yapın.');
  }

  const karne = await fetchEdesisKarnePdf({
    examId: String(opts.exam.edesisExamId || ''),
    edesisStudentId: opts.edesisStudentId,
    studentId: opts.platformStudentId,
    termId: opts.termId
  });

  const reportUrl = String(karne.reportUrl || '').trim();
  if (!reportUrl) {
    throw new Error(karne.message || karne.hint || 'Karne PDF bağlantısı alınamadı');
  }

  const studentName = String(opts.studentName || 'Öğrenci').trim() || 'Öğrenci';
  const examTitle = String(opts.exam.examTitle || 'Deneme sınavı').trim() || 'Deneme sınavı';
  const pdfTitle = `${examTitle} — Edesis karne`;
  const caption = `Merhaba, ${studentName} için ${examTitle} deneme karnesi.`;
  const safeStem = examTitle.replace(/[^\w\u00C0-\u024F\s-]/gi, '').trim().slice(0, 48) || 'edesis-karne';

  const pdfRes = await fetch(reportUrl);
  if (!pdfRes.ok) {
    throw new Error(`Karne PDF indirilemedi (HTTP ${pdfRes.status})`);
  }
  const rawBlob = await pdfRes.blob();
  if (rawBlob.size < 200) {
    throw new Error('Karne PDF dosyası boş veya geçersiz');
  }

  let { blob: pdfBlob, compressed } = await compressPdfBlobForWhatsApp(rawBlob);
  if (pdfBlob.size > GATEWAY_HARD_MAX_BYTES) {
    throw new Error(
      'Karne PDF sıkıştırıldıktan sonra bile çok büyük — Karne PDF ile indirip manuel paylaşın.'
    );
  }

  let base64 = await blobToBase64(pdfBlob);
  const filename = `${safeStem}.pdf`;

  const sendOnce = async () =>
    sendWhatsAppGatewayDocument({
      coachUserId,
      targetPhone: parentDigits,
      filename,
      base64,
      caption,
      mimeType: 'application/pdf'
    });

  try {
    const result = await sendOnce();
    const extra = compressed
      ? ` (orijinal ${(rawBlob.size / (1024 * 1024)).toFixed(1)} MB → ${(pdfBlob.size / (1024 * 1024)).toFixed(1)} MB)`
      : '';
    return { notice: result.notice + extra, reportUrl };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (!isPayloadTooLargeError(errMsg)) {
      throw e instanceof Error ? e : new Error(errMsg);
    }
    const tighter = await compressPdfBlobForWhatsApp(rawBlob, Math.floor(1.4 * 1024 * 1024));
    pdfBlob = tighter.blob;
    compressed = true;
    base64 = await blobToBase64(pdfBlob);
    if (pdfBlob.size > GATEWAY_HARD_MAX_BYTES) {
      throw new Error('PDF gateway limitine sığmıyor — Karne PDF bağlantısı ile manuel gönderin.');
    }
    try {
      const retry = await sendOnce();
      return {
        notice:
          retry.notice +
          ` (sıkıştırılmış ${(pdfBlob.size / (1024 * 1024)).toFixed(1)} MB)`,
        reportUrl
      };
    } catch (retryErr) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      if (!isPayloadTooLargeError(retryMsg)) {
        throw retryErr instanceof Error ? retryErr : new Error(retryMsg);
      }
    }
  }

  const message = buildParentPdfWaMeMessage({
    studentName,
    title: pdfTitle,
    caption,
    downloadUrl: reportUrl
  });
  const fallback = await sendWhatsAppOutbound({
    coachUserId,
    targetPhone: parentDigits,
    message:
      message +
      '\n\n(PDF dosyası boyut sınırı nedeniyle eklenemedi; lütfen bağlantıdan indirin.)'
  });
  return {
    notice:
      fallback.notice +
      ' PDF eklenemedi — bağlantı mesajı gönderildi. Gateway bağlıysa tekrar deneyin veya Karne PDF ile indirin.',
    reportUrl
  };
}
