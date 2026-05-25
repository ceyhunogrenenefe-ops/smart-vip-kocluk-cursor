/**
 * Tarayıcı tarafında PDF'ten sayfa sayfa metin çıkartma.
 * pdfjs-dist v5 worker'ı Vite tarafından bundle edilir (?url import).
 * Offline çalışır, CDN'e bağımlı değildir.
 */
import * as pdfjsLib from 'pdfjs-dist';
// pdfjs-dist v5 ESM worker — Vite ?url importu ile fingerprint'li statik dosyaya çevrilir
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
