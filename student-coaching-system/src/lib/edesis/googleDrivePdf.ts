/** Edesis kitapçık: Google Drive /view HTML değil, indirme adresi */

export function extractGoogleDriveFileId(value: string): string {
  const s = String(value || '').trim();
  if (!s || !/(?:drive|docs)\.google\.com|drive\.usercontent\.google\.com/i.test(s)) return '';
  const filePath = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (filePath) return filePath[1];
  const openPath = s.match(/\/open\/d\/([a-zA-Z0-9_-]+)/i);
  if (openPath) return openPath[1];
  const q = s.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  return q ? q[1] : '';
}

/** Chrome Drive download’u CORS/CORP ile keser; /preview iframe aynı origin değil ama yüklenir */
export function googleDrivePreviewUrl(fileUrl: string): string {
  const id = extractGoogleDriveFileId(fileUrl);
  if (!id) return '';
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function firstGoogleDrivePreviewUrl(urls: Array<string | null | undefined>): string {
  for (const u of urls) {
    const preview = googleDrivePreviewUrl(String(u || ''));
    if (preview) return preview;
  }
  return '';
}
