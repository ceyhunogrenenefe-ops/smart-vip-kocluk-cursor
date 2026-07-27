import { getGatewaySessionUserId } from '../session';
import {
  blobToBase64,
  buildParentPdfWaMeMessage,
  formatWhatsAppPhone,
  sendWhatsAppOutbound,
  sendWhatsAppOutboundDocument
} from '../whatsappOutbound';
import { fetchEdesisKarnePdf, type EdesisStudentResultsExam } from './edesisApi';

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

  try {
    const pdfRes = await fetch(reportUrl);
    if (pdfRes.ok) {
      const blob = await pdfRes.blob();
      if (blob.size > 200) {
        const safeStem = examTitle.replace(/[^\w\u00C0-\u024F\s-]/gi, '').trim().slice(0, 48) || 'edesis-karne';
        const result = await sendWhatsAppOutboundDocument({
          coachUserId,
          targetPhone: parentDigits,
          studentId: opts.platformStudentId,
          studentName,
          pdfTitle,
          filename: `${safeStem}.pdf`,
          base64: await blobToBase64(blob),
          caption
        });
        return { notice: result.notice, reportUrl };
      }
    }
  } catch {
    /* PDF indirilemedi — metin + link */
  }

  const message = buildParentPdfWaMeMessage({
    studentName,
    title: pdfTitle,
    caption,
    downloadUrl: reportUrl
  });
  const result = await sendWhatsAppOutbound({
    coachUserId,
    targetPhone: parentDigits,
    message
  });
  return { notice: result.notice, reportUrl };
}
