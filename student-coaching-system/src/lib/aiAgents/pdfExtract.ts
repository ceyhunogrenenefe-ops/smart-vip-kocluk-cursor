/**
 * Tarayıcı tarafında PDF'ten sayfa sayfa metin + görüntü çıkartma.
 * pdfjs-dist v5 worker'ı Vite tarafından bundle edilir (?url import).
 */
import * as pdfjsLib from 'pdfjs-dist';
// eslint-disable-next-line import/no-unresolved
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  } catch {
    /* yoksay */
  }
}

export interface PdfPageText {
  page: number;
  text: string;
}

/** PDF'i bir kez yükle, sayfa sayfa hem metin hem görüntüye eriş */
export async function loadPdf(file: File) {
  const buffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadingTask = (pdfjsLib as any).getDocument({ data: buffer });
  return await loadingTask.promise;
}

export async function extractPdfPages(file: File): Promise<PdfPageText[]> {
  const pdf = await loadPdf(file);
  const pages: PdfPageText[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (content.items as any[])
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push({ page: i, text });
  }
  return pages;
}

/** Bir PDF sayfasını PNG blob olarak render et */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function renderPageToPngBlob(pdf: any, pageNo: number, scale = 1.4): Promise<{
  blob: Blob;
  width: number;
  height: number;
}> {
  const page = await pdf.getPage(pageNo);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_context_failed');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve({ blob: b, width: canvas.width, height: canvas.height });
        else reject(new Error('blob_failed'));
      },
      'image/png',
      0.85
    );
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const i = result.indexOf(',');
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const i = result.indexOf(',');
      resolve({ base64: i >= 0 ? result.slice(i + 1) : result, mime: file.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
