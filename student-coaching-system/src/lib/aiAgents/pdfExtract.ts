/**
 * Tarayıcı tarafında PDF'ten sayfa sayfa metin çıkartma.
 * pdfjs-dist worker'ı CDN'den yüklenir (build'i şişirmemek için).
 */
import * as pdfjsLib from 'pdfjs-dist';

/** Worker URL'i — Vite üretiminde de çalışır */
const setupWorker = () => {
  try {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${(pdfjsLib as { version: string }).version}/build/pdf.worker.min.js`;
  } catch {
    /* yoksay */
  }
};
setupWorker();

export interface PdfPageText {
  page: number;
  text: string;
}

export async function extractPdfPages(file: File): Promise<PdfPageText[]> {
  const buffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadingTask = (pdfjsLib as any).getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
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
