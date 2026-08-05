import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export async function buildMeetingSummaryPdfBlob(
  element: HTMLElement,
  filename: string,
  opts?: { compactForShare?: boolean }
): Promise<{ blob: Blob; filename: string }> {
  const compact = opts?.compactForShare === true;
  await new Promise((r) => setTimeout(r, 280));

  const canvas = await html2canvas(element, {
    scale: compact ? 1.2 : 1.75,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight
  });

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 8;
  const topY = 10;
  const bottomY = 10;
  const contentWidth = pageWidth - marginX * 2;
  const printableHeight = pageHeight - topY - bottomY;
  const pxPerMm = canvas.width / contentWidth;
  const sliceHeightPx = Math.floor(printableHeight * pxPerMm);

  let offsetY = 0;
  let page = 0;

  while (offsetY < canvas.height) {
    const sliceH = Math.min(sliceHeightPx, canvas.height - offsetY);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceH;
    const ctx = sliceCanvas.getContext('2d');
    if (!ctx) throw new Error('canvas_context_failed');
    ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    const img = sliceCanvas.toDataURL(compact ? 'image/jpeg' : 'image/png', compact ? 0.82 : 1);
    const imgHeightMm = sliceH / pxPerMm;
    if (page > 0) pdf.addPage();
    pdf.addImage(img, compact ? 'JPEG' : 'PNG', marginX, topY, contentWidth, imgHeightMm);
    offsetY += sliceH;
    page += 1;
  }

  return { blob: pdf.output('blob'), filename };
}
