/** Chrome/Edge PDF eklentisi — varsayılan %100; öğrenci büyütebilir */
export type EdesisPdfZoom = 'page-width' | 'page-fit' | '75' | '100' | '125' | '150';

export function buildEdesisPdfViewerSrc(fileUrl: string, zoom: EdesisPdfZoom = '100'): string {
  const base = String(fileUrl || '').trim().replace(/#.*$/, '');
  if (!base) return '';
  const z = String(zoom || '100');
  if (z === 'page-width') {
    return `${base}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`;
  }
  if (z === 'page-fit') {
    return `${base}#toolbar=1&navpanes=0&scrollbar=1&view=Fit`;
  }
  return `${base}#toolbar=1&navpanes=0&scrollbar=1&zoom=${encodeURIComponent(z)}`;
}
