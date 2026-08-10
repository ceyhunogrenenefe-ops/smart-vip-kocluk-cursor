import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/** Haftalık takvim sütunları: her zaman Pazartesi → Pazar (0 = Pzt). */
export const WEEKDAY_SHORT_MON_FIRST = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

export function formatDdMmYyyyDots(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export type WeekGridColumn = { iso: string; headLine: string; subLine: string };

export type WeekGridRow = { hourLabel: string; cells: string[] };

export type PdfBranding = {
  institutionName: string;
  /** Tam URL; CORS izni yoksa logo atlanır */
  logoUrl?: string | null;
};

let notoCssPromise: Promise<void> | null = null;

/** Türkçe metin örneği — document.fonts latin + latin-ext alt kümelerini yükler */
const TR_FONT_LOAD_SAMPLE = 'ÇçĞğİıIıÖöŞşÜüPztSalÇar';

/**
 * html2canvas + PDF için Noto Sans.
 * NOT: `latin-400.css` + `latin-ext-400.css` ayrı dosyalarda unicode-range yok; aynı weight çakışıp
 * Türkçe harflerin düşmesine yol açabiliyor. `400.css` / `600.css` birleşik @font-face + unicode-range kullanır.
 */
export function ensureNotoSansForPdfCapture(): Promise<void> {
  if (!notoCssPromise) {
    notoCssPromise = Promise.all([
      import('@fontsource/noto-sans/400.css'),
      import('@fontsource/noto-sans/600.css')
    ]).then(async () => {
      if (typeof document === 'undefined' || !document.fonts?.load) return;
      await document.fonts.load(`600 16px "Noto Sans"`, TR_FONT_LOAD_SAMPLE);
      await document.fonts.load(`400 14px "Noto Sans"`, TR_FONT_LOAD_SAMPLE);
      await document.fonts.ready;
    }) as Promise<void>;
  }
  return notoCssPromise;
}

const PDF_CAPTURE_FONT_STYLE_ID = 'smartkocluk-pdf-noto-capture';

/** Klon veya ana dokümanda Tailwind/font-sans üzerine Noto zorla (html2canvas ölçümü ile uyumlu) */
function injectPdfCaptureFontStyles(doc: Document): void {
  if (doc.getElementById(PDF_CAPTURE_FONT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = PDF_CAPTURE_FONT_STYLE_ID;
  style.textContent = `
    .pdf-capture-root, .pdf-capture-root *,
    [data-pdf-font-root="1"], [data-pdf-font-root="1"] * {
      font-family: "Noto Sans", "Segoe UI", system-ui, sans-serif !important;
    }
  `;
  (doc.head || doc.documentElement).appendChild(style);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Uzun görüntüyü dikey dilimlerle birden fazla sayfaya yay — dış modüller (haftalık plan PDF vb.) */
export function addCanvasPaginatedToLandscapePdf(
  doc: jsPDF,
  canvas: HTMLCanvasElement,
  margin: number,
  maxWidthMm: number
): void {
  addCanvasPaginated(doc, canvas, margin, maxWidthMm);
}

/** Tek sayfaya sığdır (ölçekle); taşma yok — takvim PDF için */
export type PdfCanvasImageFormat = 'PNG' | 'JPEG';

export function addCanvasFitToLandscapePage(
  doc: jsPDF,
  canvas: HTMLCanvasElement,
  margin: number,
  newPage: boolean,
  imageFormat: PdfCanvasImageFormat = 'PNG',
  jpegQuality = 0.92
): void {
  if (newPage) doc.addPage();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;
  addCanvasFitWidth(doc, canvas, margin, margin, contentW, contentH, imageFormat, jpegQuality);
}

/** A4 yatay sayfanın tamamını kapla (kenardan kenara) */
export function addCanvasFillLandscapePage(
  doc: jsPDF,
  canvas: HTMLCanvasElement,
  margin: number,
  newPage: boolean,
  imageFormat: PdfCanvasImageFormat = 'PNG',
  jpegQuality = 0.92
): void {
  if (newPage) doc.addPage();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;
  const mime = imageFormat === 'JPEG' ? 'image/jpeg' : 'image/png';
  const quality = imageFormat === 'JPEG' ? jpegQuality : 0.95;
  const img = canvas.toDataURL(mime, quality);
  doc.addImage(img, imageFormat, margin, margin, contentW, contentH);
}

async function loadImageForPdfExport(url: string): Promise<HTMLImageElement | null> {
  if (!url.trim()) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url.trim();
  });
}

function mountOffscreen(el: HTMLElement): void {
  el.style.position = 'fixed';
  el.style.left = '-12000px';
  el.style.top = '0';
  el.style.zIndex = '-1';
  document.body.appendChild(el);
}

function unmountOffscreen(el: HTMLElement): void {
  if (el.parentNode) el.parentNode.removeChild(el);
}

export async function rasterizeHtmlElementForPdf(el: HTMLElement, scale = 2): Promise<HTMLCanvasElement> {
  return rasterizeElement(el, scale);
}

async function waitForLayoutPaint(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise((r) => setTimeout(r, 80));
}

/**
 * html2canvas: hedef mutlaka document içinde olmalı; cloneNode ile önceden
 * kopyalanmış düğümlerde «Node cannot be found in the current page» sık görülür.
 */
async function safeHtml2Canvas(
  el: HTMLElement,
  opts: {
    scale?: number;
    width?: number;
    height?: number;
    onclone?: (doc: Document, cloned: HTMLElement) => void;
  } = {}
): Promise<HTMLCanvasElement> {
  if (!el.isConnected || !document.body.contains(el)) {
    throw new Error('PDF için yakalanacak alan sayfada değil. Sayfayı yenileyip tekrar deneyin.');
  }
  const scale = opts.scale ?? 2;
  const captureId = `pdf-cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  el.setAttribute('data-pdf-capture-id', captureId);
  el.setAttribute('data-pdf-font-root', '1');
  injectPdfCaptureFontStyles(document);
  try {
    await document.fonts?.ready;
    await waitForLayoutPaint();
    const w = Math.max(opts.width || 0, el.scrollWidth, el.offsetWidth, 320);
    const h = Math.max(opts.height || 0, el.scrollHeight, el.offsetHeight, 120);
    return await html2canvas(el, {
      scale,
      useCORS: true,
      allowTaint: true,
      foreignObjectRendering: false,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: w,
      height: h,
      windowWidth: Math.max(w, document.documentElement.clientWidth || w),
      windowHeight: Math.max(h, document.documentElement.clientHeight || h),
      ignoreElements: (node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.classList?.contains('calendar-pdf-hide-ui')) return true;
        if (node.getAttribute?.('data-pdf-hide') === '1') return true;
        return false;
      },
      onclone: (clonedDoc) => {
        injectPdfCaptureFontStyles(clonedDoc);
        clonedDoc.querySelectorAll('.calendar-pdf-hide-ui, [data-pdf-hide="1"]').forEach((node) => {
          (node as HTMLElement).style.setProperty('display', 'none', 'important');
        });
        const cloned =
          (clonedDoc.querySelector(`[data-pdf-capture-id="${captureId}"]`) as HTMLElement | null) ||
          (clonedDoc.body.firstElementChild as HTMLElement | null);
        if (cloned) {
          cloned.style.overflow = 'visible';
          cloned.style.maxHeight = 'none';
          cloned.style.transform = 'none';
          cloned.style.fontFamily = '"Noto Sans", "Segoe UI", system-ui, sans-serif';
          opts.onclone?.(clonedDoc, cloned);
        }
      }
    });
  } finally {
    el.removeAttribute('data-pdf-capture-id');
    el.removeAttribute('data-pdf-font-root');
  }
}

async function rasterizeElement(el: HTMLElement, scale = 2): Promise<HTMLCanvasElement> {
  mountOffscreen(el);
  try {
    const w = Math.max(el.scrollWidth, el.offsetWidth, 320);
    const h = Math.max(el.scrollHeight, el.offsetHeight, 80);
    return await safeHtml2Canvas(el, { scale, width: w, height: h });
  } finally {
    unmountOffscreen(el);
  }
}

/** Canlı takvimi sayfadaki orijinal düğüm üzerinden yakalar (cloneNode kullanmaz). */
async function captureCalendarForPdfSnapshot(calendarElement: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  if (!calendarElement?.isConnected) {
    throw new Error('Takvim alanı bulunamadı. Sayfayı yenileyip tekrar deneyin.');
  }

  const prev = {
    overflow: calendarElement.style.overflow,
    overflowX: calendarElement.style.overflowX,
    overflowY: calendarElement.style.overflowY,
    maxHeight: calendarElement.style.maxHeight,
    width: calendarElement.style.width,
    minWidth: calendarElement.style.minWidth,
    background: calendarElement.style.background
  };

  const w = Math.max(calendarElement.scrollWidth, calendarElement.offsetWidth, 920);
  calendarElement.classList.add('pdf-capture-root');
  calendarElement.style.overflow = 'visible';
  calendarElement.style.overflowX = 'visible';
  calendarElement.style.overflowY = 'visible';
  calendarElement.style.maxHeight = 'none';
  calendarElement.style.width = `${w}px`;
  calendarElement.style.minWidth = `${w}px`;
  calendarElement.style.background = '#ffffff';

  try {
    calendarElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    await waitForLayoutPaint();
    const h = Math.max(calendarElement.scrollHeight, calendarElement.offsetHeight, 200);
    return await safeHtml2Canvas(calendarElement, {
      scale,
      width: w,
      height: h,
      onclone: (_doc, cloned) => {
        cloned.querySelectorAll('svg').forEach((svg) => {
          // Lucide ikonları html2canvas yol eşlemesini bozabiliyor
          svg.remove();
        });
        cloned.querySelectorAll('button, a').forEach((node) => {
          (node as HTMLElement).style.setProperty('display', 'none', 'important');
        });
      }
    });
  } finally {
    calendarElement.classList.remove('pdf-capture-root');
    calendarElement.style.overflow = prev.overflow;
    calendarElement.style.overflowX = prev.overflowX;
    calendarElement.style.overflowY = prev.overflowY;
    calendarElement.style.maxHeight = prev.maxHeight;
    calendarElement.style.width = prev.width;
    calendarElement.style.minWidth = prev.minWidth;
    calendarElement.style.background = prev.background;
  }
}

export type ShareableWeekCard = {
  timeRange: string;
  subject: string;
  teacher?: string;
  kind?: 'session' | 'template';
};

/** Veli/öğretmen paylaşımı için temiz haftalık tablo (ekran UI’sız). */
export function buildShareableWeekCalendarElement(opts: {
  columns: WeekGridColumn[];
  hours: number[];
  /** [hourIndex][dayIndex] → kartlar */
  cells: ShareableWeekCard[][][];
  title?: string;
}): HTMLElement {
  const { columns, hours, cells, title } = opts;
  const root = document.createElement('div');
  root.setAttribute('data-pdf-font-root', '1');
  root.className = 'pdf-capture-root';
  root.style.boxSizing = 'border-box';
  root.style.width = '1280px';
  root.style.padding = '20px 22px 28px';
  root.style.fontFamily = '"Noto Sans", "Segoe UI", system-ui, sans-serif';
  root.style.background = '#ffffff';
  root.style.border = '1px solid #e2e8f0';
  root.style.borderRadius = '14px';

  if (title?.trim()) {
    const h = document.createElement('div');
    h.textContent = title.trim();
    h.style.fontSize = '18px';
    h.style.fontWeight = '700';
    h.style.color = '#0f172a';
    h.style.marginBottom = '14px';
    root.appendChild(h);
  }

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.tableLayout = 'fixed';
  table.style.fontSize = '12px';

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const thTime = document.createElement('th');
  thTime.textContent = 'Saat';
  thTime.style.width = '64px';
  thTime.style.padding = '10px 8px';
  thTime.style.textAlign = 'left';
  thTime.style.background = '#f1f5f9';
  thTime.style.color = '#64748b';
  thTime.style.fontSize = '10px';
  thTime.style.fontWeight = '700';
  thTime.style.textTransform = 'uppercase';
  thTime.style.borderBottom = '2px solid #e2e8f0';
  hr.appendChild(thTime);

  columns.forEach((c) => {
    const th = document.createElement('th');
    th.style.padding = '10px 8px';
    th.style.textAlign = 'left';
    th.style.verticalAlign = 'bottom';
    th.style.background = '#f8fafc';
    th.style.borderBottom = '2px solid #e2e8f0';
    th.style.borderLeft = '1px solid #e2e8f0';
    const day = document.createElement('div');
    day.textContent = c.headLine;
    day.style.fontSize = '12px';
    day.style.fontWeight = '700';
    day.style.color = '#1e293b';
    const sub = document.createElement('div');
    sub.textContent = c.subLine;
    sub.style.marginTop = '2px';
    sub.style.fontSize = '10px';
    sub.style.color = '#64748b';
    sub.style.fontWeight = '500';
    th.appendChild(day);
    th.appendChild(sub);
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  hours.forEach((hour, hi) => {
    const tr = document.createElement('tr');
    const tdH = document.createElement('td');
    tdH.textContent = `${String(hour).padStart(2, '0')}:00`;
    tdH.style.padding = '8px';
    tdH.style.textAlign = 'right';
    tdH.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    tdH.style.fontWeight = '700';
    tdH.style.fontSize = '11px';
    tdH.style.color = '#475569';
    tdH.style.background = '#f8fafc';
    tdH.style.borderTop = '1px solid #e2e8f0';
    tdH.style.verticalAlign = 'top';
    tr.appendChild(tdH);

    for (let di = 0; di < 7; di++) {
      const td = document.createElement('td');
      td.style.padding = '6px';
      td.style.verticalAlign = 'top';
      td.style.borderTop = '1px solid #e2e8f0';
      td.style.borderLeft = '1px solid #e2e8f0';
      td.style.minHeight = '48px';
      const cards = cells[hi]?.[di] || [];
      if (!cards.length) {
        td.innerHTML = '&nbsp;';
      } else {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.gap = '6px';
        for (const card of cards) {
          const box = document.createElement('div');
          const isTpl = card.kind === 'template';
          box.style.borderRadius = '10px';
          box.style.padding = '8px 9px';
          box.style.border = isTpl ? '1px dashed #a5b4fc' : '1px solid #bbf7d0';
          box.style.background = isTpl
            ? 'linear-gradient(135deg, #eef2ff 0%, #ffffff 70%)'
            : 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 70%)';
          box.style.borderLeft = isTpl ? '4px solid #6366f1' : '4px solid #10b981';
          const subj = document.createElement('div');
          subj.textContent = card.subject;
          subj.style.fontWeight = '700';
          subj.style.fontSize = '12px';
          subj.style.color = '#0f172a';
          subj.style.lineHeight = '1.25';
          box.appendChild(subj);
          if (card.teacher) {
            const t = document.createElement('div');
            t.textContent = card.teacher;
            t.style.marginTop = '2px';
            t.style.fontSize = '10px';
            t.style.fontWeight = '600';
            t.style.color = '#334155';
            box.appendChild(t);
          }
          const tm = document.createElement('div');
          tm.textContent = card.timeRange;
          tm.style.marginTop = '2px';
          tm.style.fontSize = '10px';
          tm.style.color = '#64748b';
          tm.style.fontVariantNumeric = 'tabular-nums';
          box.appendChild(tm);
          wrap.appendChild(box);
        }
        td.appendChild(wrap);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  root.appendChild(table);
  return root;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Paylaşılabilir haftalık takvim → PNG */
export async function downloadShareableWeekCalendarPng(opts: {
  columns: WeekGridColumn[];
  hours: number[];
  cells: ShareableWeekCard[][][];
  title?: string;
  filename: string;
}): Promise<void> {
  await ensureNotoSansForPdfCapture();
  const el = buildShareableWeekCalendarElement(opts);
  const canvas = await rasterizeElement(el, 2);
  assertPdfCanvas(canvas, 'Takvim PNG');
  await new Promise<void>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('PNG oluşturulamadı'));
          return;
        }
        triggerBlobDownload(blob, opts.filename.endsWith('.png') ? opts.filename : `${opts.filename}.png`);
        resolve();
      },
      'image/png',
      0.95
    );
  });
}

/** Paylaşılabilir haftalık takvim görseli + metin listesi PDF */
export async function downloadShareableWeekCalendarPdf(opts: {
  columns: WeekGridColumn[];
  hours: number[];
  cells: ShareableWeekCard[][][];
  calendarTitle?: string;
  filename: string;
  titleLine: string;
  subtitleLines?: string[];
  listHeading: string;
  lessonLines: string[];
  footerNote?: string;
  branding?: PdfBranding;
}): Promise<void> {
  const {
    columns,
    hours,
    cells,
    calendarTitle,
    filename,
    titleLine,
    subtitleLines = [],
    listHeading,
    lessonLines,
    footerNote,
    branding
  } = opts;

  await ensureNotoSansForPdfCapture();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - 2 * margin;

  const headerEl = await buildHeaderElement(titleLine, subtitleLines, branding);
  const headerCanvas = await rasterizeElement(headerEl, 2);
  assertPdfCanvas(headerCanvas, 'PDF başlığı');
  let y = margin;
  y += addCanvasFitWidth(doc, headerCanvas, margin, y, contentW, 24) + 5;

  const calEl = buildShareableWeekCalendarElement({
    columns,
    hours,
    cells,
    title: calendarTitle
  });
  const calCanvas = await rasterizeElement(calEl, 2);
  assertPdfCanvas(calCanvas, 'Takvim görüntüsü');
  if (pageH - margin - y < 40) {
    doc.addPage();
    y = margin;
  }
  addCanvasFitWidth(doc, calCanvas, margin, y, contentW, pageH - margin - y);

  doc.addPage();
  const listEl = buildLessonListElement(listHeading, lessonLines);
  const listCanvas = await rasterizeElement(listEl, 2);
  assertPdfCanvas(listCanvas, 'Ders listesi');
  addCanvasPaginated(doc, listCanvas, margin, contentW);

  if (footerNote?.trim()) {
    doc.addPage();
    const footEl = buildFooterElement(footerNote);
    const footCanvas = await rasterizeElement(footEl, 2);
    assertPdfCanvas(footCanvas, 'PDF alt notu');
    addCanvasFitWidth(doc, footCanvas, margin, margin, contentW, pageH - 2 * margin);
  }

  doc.save(filename);
}

function addCanvasFitWidth(
  doc: jsPDF,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  maxWidthMm: number,
  maxHeightMm: number,
  imageFormat: PdfCanvasImageFormat = 'PNG',
  jpegQuality = 0.92
): number {
  const cw = canvas.width;
  const ch = canvas.height;
  let wMm = maxWidthMm;
  let hMm = (ch / cw) * wMm;
  if (hMm > maxHeightMm) {
    hMm = maxHeightMm;
    wMm = (cw / ch) * hMm;
  }
  const mime = imageFormat === 'JPEG' ? 'image/jpeg' : 'image/png';
  const quality = imageFormat === 'JPEG' ? jpegQuality : 0.95;
  const img = canvas.toDataURL(mime, quality);
  doc.addImage(img, imageFormat, x, y, wMm, hMm);
  return hMm;
}

/** Uzun görüntüyü dikey dilimlerle birden fazla sayfaya yay */
function addCanvasPaginated(doc: jsPDF, canvas: HTMLCanvasElement, margin: number, maxWidthMm: number): void {
  const pageH = doc.internal.pageSize.getHeight();
  const sliceMm = pageH - 2 * margin;
  const mmPerPx = maxWidthMm / canvas.width;
  const slicePx = sliceMm / mmPerPx;
  let y0 = 0;
  let first = true;
  while (y0 < canvas.height) {
    const hPx = Math.min(slicePx, canvas.height - y0);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = hPx;
    const ctx = slice.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(canvas, 0, y0, canvas.width, hPx, 0, 0, canvas.width, hPx);
    const hMm = hPx * mmPerPx;
    if (!first) doc.addPage();
    first = false;
    doc.addImage(slice.toDataURL('image/png', 0.92), 'PNG', margin, margin, maxWidthMm, hMm);
    y0 += hPx;
  }
}

export async function buildHeaderElement(
  titleLine: string,
  subtitleLines: string[],
  branding: PdfBranding | undefined
): Promise<HTMLElement> {
  const wrap = document.createElement('div');
  wrap.setAttribute('data-pdf-font-root', '1');
  wrap.style.boxSizing = 'border-box';
  wrap.style.width = '100%';
  wrap.style.height = '72px';
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.padding = '0 28px';
  wrap.style.gap = '20px';
  wrap.style.fontFamily = '"Noto Sans", "Segoe UI", system-ui, sans-serif';
  wrap.style.background = 'linear-gradient(120deg, #1e1b4b 0%, #312e81 42%, #5b21b6 100%)';
  wrap.style.borderRadius = '12px';
  wrap.style.boxShadow = '0 12px 40px rgba(30, 27, 75, 0.25)';

  const logoUrl = branding?.logoUrl?.trim();
  if (logoUrl) {
    const img = await loadImageForPdfExport(logoUrl);
    if (img && img.naturalWidth > 0) {
      img.style.maxHeight = '52px';
      img.style.maxWidth = '160px';
      img.style.objectFit = 'contain';
      img.style.filter = 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))';
      wrap.appendChild(img);
    }
  }

  const textCol = document.createElement('div');
  textCol.style.flex = '1';
  textCol.style.minWidth = '0';

  const h1 = document.createElement('div');
  h1.textContent = titleLine;
  h1.style.color = '#fff';
  h1.style.fontSize = '22px';
  h1.style.fontWeight = '600';
  h1.style.lineHeight = '1.25';
  h1.style.letterSpacing = '-0.02em';
  textCol.appendChild(h1);

  const sub = document.createElement('div');
  sub.style.color = 'rgba(226, 232, 255, 0.95)';
  sub.style.fontSize = '13px';
  sub.style.marginTop = '6px';
  sub.style.lineHeight = '1.45';
  sub.textContent = subtitleLines.filter(Boolean).join(' · ');
  textCol.appendChild(sub);

  if (branding?.institutionName?.trim()) {
    const badge = document.createElement('div');
    badge.textContent = branding.institutionName.trim();
    badge.style.marginTop = '8px';
    badge.style.display = 'inline-block';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '600';
    badge.style.letterSpacing = '0.06em';
    badge.style.textTransform = 'uppercase';
    badge.style.color = '#312e81';
    badge.style.background = '#fde68a';
    badge.style.padding = '4px 10px';
    badge.style.borderRadius = '999px';
    textCol.appendChild(badge);
  }

  wrap.appendChild(textCol);
  return wrap;
}

function buildLessonListElement(listHeading: string, lessonLines: string[]): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('data-pdf-font-root', '1');
  root.style.boxSizing = 'border-box';
  root.style.width = '1280px';
  root.style.padding = '24px 28px 32px';
  root.style.fontFamily = '"Noto Sans", "Segoe UI", system-ui, sans-serif';
  root.style.background = 'linear-gradient(180deg, #f8fafc 0%, #ffffff 18%)';
  root.style.borderRadius = '12px';
  root.style.border = '1px solid #e2e8f0';
  root.style.boxShadow = '0 8px 32px rgba(15, 23, 42, 0.08)';

  const bar = document.createElement('div');
  bar.style.display = 'flex';
  bar.style.alignItems = 'center';
  bar.style.gap = '12px';
  bar.style.marginBottom = '18px';

  const stripe = document.createElement('div');
  stripe.style.width = '5px';
  stripe.style.height = '28px';
  stripe.style.borderRadius = '4px';
  stripe.style.background = 'linear-gradient(180deg, #6366f1, #7c3aed)';
  bar.appendChild(stripe);

  const h2 = document.createElement('div');
  h2.textContent = listHeading;
  h2.style.fontSize = '18px';
  h2.style.fontWeight = '600';
  h2.style.color = '#0f172a';
  bar.appendChild(h2);
  root.appendChild(bar);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '13px';

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const headers = ['Zaman', 'Öğrenci', 'Ders', 'Öğretmen', 'Durum'];
  headers.forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    th.style.textAlign = 'left';
    th.style.padding = '10px 10px';
    th.style.fontWeight = '600';
    th.style.fontSize = '10px';
    th.style.textTransform = 'uppercase';
    th.style.letterSpacing = '0.04em';
    th.style.color = '#eef2ff';
    th.style.background = 'linear-gradient(180deg, #4338ca 0%, #312e81 100%)';
    th.style.borderBottom = '2px solid #1e1b4b';
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let rowIndex = 0;
  for (const raw of lessonLines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('—')) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = line;
      td.style.padding = '12px 10px 8px';
      td.style.fontWeight = '700';
      td.style.fontSize = '12px';
      td.style.color = '#334155';
      td.style.background = 'linear-gradient(90deg, #e0e7ff 0%, #e2e8f0 40%)';
      td.style.borderTop = rowIndex > 0 ? '10px solid transparent' : 'none';
      tr.appendChild(td);
      tbody.appendChild(tr);
      rowIndex++;
      continue;
    }
    const parts = line.split(/\s*\|\s*/).map((p) => p.trim());
    let cells: string[];
    if (parts.length >= 5) {
      cells = parts.slice(0, 5);
    } else if (parts.length === 4) {
      cells = [parts[0], 'Tüm sınıf', parts[1], parts[2], parts[3]];
    } else if (parts.length === 3) {
      cells = [parts[0], 'Şablon', parts[1], parts[2], '—'];
    } else {
      cells = [parts[0] || '—', parts[1] || '—', parts[2] || '—', parts[3] || '—', parts[4] || '—'];
    }
    const tr = document.createElement('tr');
    const bg = rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff';
    tr.style.background = bg;
    tr.style.borderBottom = '1px solid #e2e8f0';

    cells.forEach((text, ci) => {
      const td = document.createElement('td');
      td.innerHTML = escapeHtml(text).replace(/\n/g, '<br/>');
      td.style.padding = '10px 10px';
      td.style.verticalAlign = 'top';
      td.style.color = '#1e293b';
      if (ci === 0) {
        td.style.fontWeight = '600';
        td.style.color = '#4338ca';
        td.style.whiteSpace = 'nowrap';
      }
      if (ci === 1) {
        td.style.fontWeight = '600';
        td.style.color = '#0f172a';
      }
      if (ci === 2) {
        td.style.color = '#334155';
      }
      if (ci === 4) {
        td.style.fontSize = '12px';
        td.style.fontWeight = '700';
        td.style.color =
          /planlı|Planlı|scheduled/i.test(text) ? '#047857' : /tamamlandı|Tamamlandı|completed/i.test(text) ? '#0369a1' : '#64748b';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
    rowIndex++;
  }
  table.appendChild(tbody);
  root.appendChild(table);
  return root;
}

function buildFooterElement(footerNote: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-pdf-font-root', '1');
  el.style.boxSizing = 'border-box';
  el.style.width = '1280px';
  el.style.padding = '18px 28px';
  el.style.fontFamily = '"Noto Sans", "Segoe UI", system-ui, sans-serif';
  el.style.fontSize = '12px';
  el.style.lineHeight = '1.55';
  el.style.color = '#475569';
  el.style.background = 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)';
  el.style.borderRadius = '10px';
  el.style.border = '1px solid #cbd5e1';
  el.style.whiteSpace = 'pre-wrap';
  el.textContent = footerNote.trim();
  return el;
}

/**
 * Gün × saat tablosu (yatay A4). Veli/öğrenci ile paylaşım için uygun.
 */
export function downloadLiveWeekGridPdf(opts: {
  filename: string;
  title: string;
  footerNote?: string;
  extraLines?: string[];
  columns: WeekGridColumn[];
  rows: WeekGridRow[];
}): void {
  const { filename, title, footerNote, extraLines = [], columns, rows } = opts;
  if (columns.length !== 7 || !rows.length) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 8;
  const timeColW = 16;
  const usable = pageW - margin * 2 - timeColW;
  const colW = usable / 7;
  let y = margin + 6;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const line of extraLines) {
    doc.text(line, margin, y);
    y += 4;
  }
  if (extraLines.length) y += 2;

  const headerY = y;
  doc.setFillColor(240, 244, 250);
  doc.rect(margin, headerY - 4, pageW - margin * 2, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Saat', margin + 1, headerY + 3);
  columns.forEach((c, i) => {
    const x = margin + timeColW + i * colW + 1;
    doc.text(c.headLine, x, headerY + 1.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(c.subLine, x, headerY + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
  });
  y = headerY + 10;
  doc.setFont('helvetica', 'normal');

  const rowH = 11;
  for (const row of rows) {
    if (y + rowH > doc.internal.pageSize.getHeight() - margin - 10) {
      doc.addPage();
      y = margin + 8;
    }
    doc.setDrawColor(220, 225, 235);
    doc.rect(margin, y - 3, timeColW, rowH);
    doc.setFontSize(7.5);
    doc.text(row.hourLabel, margin + 2, y + 3);
    row.cells.forEach((cell, ci) => {
      const x = margin + timeColW + ci * colW;
      doc.rect(x, y - 3, colW, rowH);
      doc.setFontSize(6);
      const lines = doc.splitTextToSize(cell || '—', colW - 2);
      let cy = y + 1;
      for (const ln of lines.slice(0, 4)) {
        doc.text(ln, x + 1, cy);
        cy += 3.2;
      }
      if (lines.length > 4) {
        doc.setFontSize(5.5);
        doc.text('…', x + 1, cy);
        doc.setFontSize(6);
      }
    });
    y += rowH;
  }

  if (footerNote) {
    y += 4;
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 90);
    doc.text(footerNote, margin, Math.min(y, doc.internal.pageSize.getHeight() - margin));
    doc.setTextColor(0, 0, 0);
  }

  doc.save(filename);
}

function assertPdfCanvas(canvas: HTMLCanvasElement, label: string): void {
  if (!canvas.width || !canvas.height) {
    throw new Error(`${label} oluşturulamadı. Sayfayı yenileyip tekrar deneyin.`);
  }
}

/** Yalnızca ders listesi PDF (Noto Sans + kurumsal başlık). */
export async function downloadLessonListPdf(opts: {
  filename: string;
  titleLine: string;
  subtitleLines?: string[];
  listHeading: string;
  lessonLines: string[];
  footerNote?: string;
  branding?: PdfBranding;
}): Promise<void> {
  const {
    filename,
    titleLine,
    subtitleLines = [],
    listHeading,
    lessonLines,
    footerNote,
    branding
  } = opts;

  await ensureNotoSansForPdfCapture();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - 2 * margin;

  const headerEl = await buildHeaderElement(titleLine, subtitleLines, branding);
  const headerCanvas = await rasterizeElement(headerEl, 2);
  assertPdfCanvas(headerCanvas, 'PDF başlığı');
  addCanvasFitWidth(doc, headerCanvas, margin, margin, contentW, 24);

  doc.addPage();
  const listEl = buildLessonListElement(listHeading, lessonLines);
  const listCanvas = await rasterizeElement(listEl, 2);
  assertPdfCanvas(listCanvas, 'Ders listesi');
  addCanvasPaginated(doc, listCanvas, margin, contentW);

  if (footerNote?.trim()) {
    doc.addPage();
    const footEl = buildFooterElement(footerNote);
    const footCanvas = await rasterizeElement(footEl, 2);
    assertPdfCanvas(footCanvas, 'PDF alt notu');
    addCanvasFitWidth(doc, footCanvas, margin, margin, contentW, pageH - 2 * margin);
  }

  doc.save(filename);
}

/**
 * Profesyonel PDF: kurumsal başlık (logo + gradient), Türkçe uyumlu Noto Sans ile takvim görüntüsü,
 * ardından renkli tablo tarzında ders listesi (görüntü dilimleri).
 */
export async function downloadCalendarPdfWithSnapshot(opts: {
  calendarElement: HTMLElement;
  filename: string;
  titleLine: string;
  subtitleLines?: string[];
  listHeading: string;
  lessonLines: string[];
  footerNote?: string;
  branding?: PdfBranding;
}): Promise<void> {
  const {
    calendarElement,
    filename,
    titleLine,
    subtitleLines = [],
    listHeading,
    lessonLines,
    footerNote,
    branding
  } = opts;

  await ensureNotoSansForPdfCapture();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - 2 * margin;

  const headerEl = await buildHeaderElement(titleLine, subtitleLines, branding);
  const headerCanvas = await rasterizeElement(headerEl, 2);
  assertPdfCanvas(headerCanvas, 'PDF başlığı');
  let y = margin;
  const headerMaxH = 24;
  const headerUsed = addCanvasFitWidth(doc, headerCanvas, margin, y, contentW, headerMaxH);
  y += headerUsed + 5;

  const scale = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2);
  let calCanvas: HTMLCanvasElement;
  try {
    calCanvas = await captureCalendarForPdfSnapshot(calendarElement, scale);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Takvim görüntüsü alınamadı (${msg}). Sayfayı yenileyip «PDF görüntü»yi tekrar deneyin; gerekirse PNG paylaşımını kullanın.`
    );
  }
  assertPdfCanvas(calCanvas, 'Takvim görüntüsü');

  const roomCal = pageH - margin - y;
  if (roomCal < 35) {
    doc.addPage();
    y = margin;
  }
  const calUsed = addCanvasFitWidth(doc, calCanvas, margin, y, contentW, pageH - margin - y);
  y += calUsed + 4;

  doc.addPage();
  const listEl = buildLessonListElement(listHeading, lessonLines);
  const listCanvas = await rasterizeElement(listEl, 2);
  assertPdfCanvas(listCanvas, 'Ders listesi');
  addCanvasPaginated(doc, listCanvas, margin, contentW);

  if (footerNote?.trim()) {
    doc.addPage();
    const footEl = buildFooterElement(footerNote);
    const footCanvas = await rasterizeElement(footEl, 2);
    assertPdfCanvas(footCanvas, 'PDF alt notu');
    addCanvasFitWidth(doc, footCanvas, margin, margin, contentW, pageH - 2 * margin);
  }

  doc.save(filename);
}
