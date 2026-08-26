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

export function expandGoogleDrivePdfCandidates(fileUrl: string): string[] {
  const id = extractGoogleDriveFileId(fileUrl);
  if (!id) return [];
  const enc = encodeURIComponent(id);
  return [
    `https://drive.usercontent.google.com/download?id=${enc}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${enc}&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${enc}`,
    `https://docs.google.com/uc?export=download&id=${enc}`
  ];
}

function looksLikePdfBuffer(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 5) return false;
  const head = new TextDecoder('latin1').decode(new Uint8Array(buf).subarray(0, 8));
  return head.includes('%PDF-');
}

/** Drive PDF’sini tarayıcıda çek (CORS *); Vercel 4.5MB proxy limiti yok. */
export async function fetchGoogleDrivePdfBlob(fileUrl: string): Promise<Blob | null> {
  const cands = expandGoogleDrivePdfCandidates(fileUrl);
  const list = cands.length ? cands : fileUrl ? [fileUrl] : [];
  for (const u of list) {
    try {
      const res = await fetch(u, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (looksLikePdfBuffer(buf)) return new Blob([buf], { type: 'application/pdf' });
    } catch {
      /* sonraki aday */
    }
  }
  return null;
}
