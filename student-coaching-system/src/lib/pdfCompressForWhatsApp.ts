/**
 * Edesis / veli PDF — WhatsApp gateway gövde limiti için raster sıkıştırma.
 */
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
// eslint-disable-next-line import/no-unresolved
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  } catch {
    /* ignore */
  }
}

/** Vercel proxy + gateway için güvenli üst sınır (ham PDF bayt) */
export const WHATSAPP_PDF_TARGET_BYTES = Math.floor(2.5 * 1024 * 1024);

const PROFILES: { scale: number; jpegQuality: number }[] = [
  { scale: 1.4, jpegQuality: 0.8 },
  { scale: 1.2, jpegQuality: 0.74 },
  { scale: 1.0, jpegQuality: 0.68 },
  { scale: 0.88, jpegQuality: 0.62 },
  { scale: 0.75, jpegQuality: 0.55 },
  { scale: 0.65, jpegQuality: 0.48 }
];

async function rasterPdfToBlob(
  arrayBuffer: ArrayBuffer,
  profile: { scale: number; jpegQuality: number }
): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await (pdfjsLib as any).getDocument({ data: arrayBuffer }).promise;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let first = true;

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: profile.scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_context_failed');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const imgData = canvas.toDataURL('image/jpeg', profile.jpegQuality);
    let w = 210;
    let h = (viewport.height / viewport.width) * w;
    if (h > 297) {
      h = 297;
      w = (viewport.width / viewport.height) * h;
    }
    if (!first) doc.addPage();
    first = false;
    doc.addImage(imgData, 'JPEG', 0, 0, w, h, undefined, 'FAST');
  }

  return doc.output('blob');
}

/**
 * Büyük Edesis karnelerini JPEG sayfalı PDF'e dönüştürerek boyutu düşürür.
 * Zaten küçükse orijinal PDF döner.
 */
export async function compressPdfBlobForWhatsApp(
  input: Blob,
  targetMaxBytes = WHATSAPP_PDF_TARGET_BYTES
): Promise<{ blob: Blob; compressed: boolean }> {
  if (input.size <= targetMaxBytes) {
    return { blob: input, compressed: false };
  }

  const arrayBuffer = await input.arrayBuffer();
  let lastBlob: Blob = input;

  for (const profile of PROFILES) {
    const out = await rasterPdfToBlob(arrayBuffer, profile);
    lastBlob = out;
    if (out.size <= targetMaxBytes) {
      return { blob: out, compressed: true };
    }
  }

  return { blob: lastBlob, compressed: true };
}
