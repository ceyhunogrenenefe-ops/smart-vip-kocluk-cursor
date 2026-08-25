/** Chrome/Edge PDF eklentisi — kitapçığı sayfa genişliğine sığdır */
export type EdesisPdfZoom = 'page-width' | 'page-fit' | '75' | '100' | '125' | '150';

export function buildEdesisPdfViewerSrc(fileUrl: string, zoom: EdesisPdfZoom = 'page-width'): string {
  const base = String(fileUrl || '').trim().replace(/#.*$/, '');
  if (!base) return '';
  const z = encodeURIComponent(zoom);
  return `${base}#toolbar=1&navpanes=0&scrollbar=1&view=FitH&zoom=${z}`;
}
