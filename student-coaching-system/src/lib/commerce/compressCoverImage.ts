/**
 * Kitap kapak görseli — istemci tarafı yeniden boyutlandırma + JPEG sıkıştırma.
 * Telefon fotoğrafları (5–12 MB) Vercel JSON gövde limitini aşmasın diye
 * en uzun kenarı maxEdge altına indirir; gerekirse kaliteyi düşürür.
 */

export type CompressedCover = {
  dataUrl: string;
  mime: 'image/jpeg';
  width: number;
  height: number;
  /** Yaklaşık ham bayt (base64 çözülmüş) */
  bytesApprox: number;
};

const DEFAULT_MAX_EDGE = 1200;
const DEFAULT_QUALITY = 0.82;
/** Decoded buffer hedefi — commerce-upload MAX_BYTES (~4.2MB) altında kalır */
const DEFAULT_MAX_BYTES = 1.6 * 1024 * 1024;

function dataUrlByteLength(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

export async function compressCoverImage(
  file: File,
  opts?: { maxEdge?: number; quality?: number; maxBytes?: number }
): Promise<CompressedCover> {
  if (!file.type.startsWith('image/') && file.type !== '') {
    throw new Error('Yalnızca görsel dosyası yükleyebilirsiniz (JPEG, PNG, WebP).');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      'Bu görsel okunamadı. iPhone’dan HEIC ise Ayarlar → Kamera → En Uyumlu seçin veya JPEG/PNG kaydedin.'
    );
  }

  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const longest = Math.max(bitmap.width, bitmap.height, 1);
  const scale = Math.min(1, maxEdge / longest);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    throw new Error('Görsel işlenemedi (canvas).');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const qualities = [
    opts?.quality ?? DEFAULT_QUALITY,
    0.72,
    0.6,
    0.48,
    0.36,
  ];

  let best: CompressedCover | null = null;
  for (const q of qualities) {
    const dataUrl = canvas.toDataURL('image/jpeg', q);
    const bytesApprox = dataUrlByteLength(dataUrl);
    best = { dataUrl, mime: 'image/jpeg', width, height, bytesApprox };
    if (bytesApprox <= maxBytes) break;
  }

  if (!best) throw new Error('Görsel sıkıştırılamadı');
  if (best.bytesApprox > 3.5 * 1024 * 1024) {
    throw new Error('Görsel hâlâ çok büyük. Daha küçük bir kapak fotoğrafı seçin.');
  }
  return best;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
