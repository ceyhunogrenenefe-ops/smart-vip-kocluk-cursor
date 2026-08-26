/** Chrome/Edge PDF eklentisi — varsayılan %100; öğrenci büyütebilir */
export type EdesisPdfZoom = 'page-width' | 'page-fit' | '75' | '100' | '125' | '150';

export function isGoogleDrivePreviewSrc(fileUrl: string): boolean {
  const u = String(fileUrl || '');
  return /drive\.google\.com\/file\/d\//i.test(u) && /\/preview(?:[?#]|$)/i.test(u);
}

export function buildEdesisPdfViewerSrc(fileUrl: string, zoom: EdesisPdfZoom = '100'): string {
  const base = String(fileUrl || '').trim().replace(/#.*$/, '');
  if (!base) return '';
  // Drive önizleme kendi zoom’unu kullanır; #toolbar= Chrome PDF hash’i preview’ı bozar
  if (isGoogleDrivePreviewSrc(base)) return base;
  const z = String(zoom || '100');
  if (z === 'page-width') {
    return `${base}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`;
  }
  if (z === 'page-fit') {
    return `${base}#toolbar=1&navpanes=0&scrollbar=1&view=Fit`;
  }
  return `${base}#toolbar=1&navpanes=0&scrollbar=1&zoom=${encodeURIComponent(z)}`;
}
