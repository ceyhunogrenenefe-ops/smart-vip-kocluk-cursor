import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/** Veli / yönetici tarafında: HTML sözleşme + isteğe bağlı imza görseli → PDF indir */
export async function downloadParentSignContractPdf(opts: {
  html: string;
  signaturePng: string | null | undefined;
  contractNo: string;
}): Promise<void> {
  const { html, signaturePng, contractNo } = opts;
  if (!html?.trim()) throw new Error('Belge içeriği yok');

  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-9999px;top:0;width:794px;max-width:100%;box-sizing:border-box;background:#fff;padding:24px;color:#0f172a;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;';
  const content = document.createElement('div');
  content.innerHTML = html;
  host.appendChild(content);

  const sig = typeof signaturePng === 'string' && signaturePng.trim().length > 80 ? signaturePng.trim() : null;
  if (sig) {
    const sigBlock = document.createElement('div');
    sigBlock.style.cssText = 'margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;';
    const p = document.createElement('p');
    p.style.cssText = 'font-weight:600;margin:0 0 10px;font-size:14px;color:#0f172a';
    p.textContent = 'Veli e-imzası';
    sigBlock.appendChild(p);
    const img = document.createElement('img');
    img.src = sig;
    img.alt = 'İmza';
    img.style.cssText = 'max-width:360px;height:auto;display:block';
    sigBlock.appendChild(img);
    host.appendChild(sigBlock);
  }

  document.body.appendChild(host);
  try {
    await new Promise((r) => setTimeout(r, 150));
    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 8;
    const topY = 12;
    const bottomY = 10;
    const contentWidth = pageWidth - marginX * 2;
    const printableHeight = pageHeight - topY - bottomY;
    const pxPerMm = canvas.width / contentWidth;
    const pageHeightPx = Math.floor(printableHeight * pxPerMm);
    const safeName = (contractNo || 'sozlesme').replace(/[^\w\u00C0-\u024f.-]+/gi, '_');
    const datePart = new Date().toISOString().slice(0, 10);

    let renderedHeight = 0;
    let pageIndex = 0;
    while (renderedHeight < canvas.height) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedHeight);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const ctx = pageCanvas.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (pageIndex > 0) pdf.addPage();
      const sliceHeightMm = sliceHeight / pxPerMm;
      pdf.addImage(
        pageCanvas.toDataURL('image/png'),
        'PNG',
        marginX,
        pageIndex === 0 ? topY : 8,
        contentWidth,
        sliceHeightMm
      );
      renderedHeight += sliceHeight;
      pageIndex += 1;
    }
    pdf.save(`Sozlesme_${safeName}_${datePart}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
