/**
 * Kitap kapak görseli — istemci tarafı yeniden boyutlandırma + JPEG sıkıştırma.
 * Telefon fotoğrafları (5–12 MB) Vercel JSON gövde limitini aşmasın diye
 * en uzun kenarı maxEdge altına indirir; gerekirse kaliteyi düşürür.
 *
 * createImageBitmap başarısız olursa (HEIC / bazı Android) FileReader + <img> yedek yolu kullanılır.
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

function isLikelyImageFile(file: File): boolean {
  const t = String(file.type || '').toLowerCase();
  if (t.startsWith('image/')) return true;
  // Android / WhatsApp / iOS bazen boş veya octet-stream verir
  if (!t || t === 'application/octet-stream' || t === 'binary/octet-stream') {
    if (/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || '')) return true;
    // uzantısız galeri dosyası — denemeye değer (decode başarısız olursa hata gösterilir)
    if (file.size > 8 * 1024 && !/\.[a-z0-9]{1,5}$/i.test(file.name || '')) return true;
  }
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || '');
}

function isHeicLike(file: File): boolean {
  const t = String(file.type || '').toLowerCase();
  if (t.includes('heic') || t.includes('heif')) return true;
  return /\.(heic|heif)$/i.test(file.name || '');
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function loadImageFromObjectUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img_decode_failed'));
    img.src = url;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

type DrawSource = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup?: () => void;
};

async function resolveDrawSource(file: File): Promise<DrawSource> {
  // 1) createImageBitmap — bazı mobil tarayıcılarda HEIC’te asılı kalabiliyor → timeout
  try {
    const bitmap = await withTimeout(createImageBitmap(file), 8000, 'bitmap');
    if (bitmap.width > 0 && bitmap.height > 0) {
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close?.(),
      };
    }
    bitmap.close?.();
  } catch {
    /* fallback */
  }

  // 2) object URL + <img>
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await withTimeout(loadImageFromObjectUrl(objectUrl), 10000, 'img');
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
  }

  // 3) FileReader data URL + <img>
  try {
    const dataUrl = await withTimeout(readFileAsDataUrl(file), 15000, 'read');
    const img = await withTimeout(loadImageFromObjectUrl(dataUrl), 10000, 'img2');
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    };
  } catch {
    /* fall through */
  }

  if (isHeicLike(file)) {
    throw new Error(
      `${file.name || 'foto'}: HEIC/HEIF tarayıcıda açılamadı. iPhone’da Ayarlar → Kamera → Formatlar → En Uyumlu seçin veya JPEG olarak kaydedin.`
    );
  }
  throw new Error(`${file.name || 'foto'}: görsel okunamadı. JPEG veya PNG deneyin.`);
}

export async function compressCoverImage(
  file: File,
  opts?: { maxEdge?: number; quality?: number; maxBytes?: number }
): Promise<CompressedCover> {
  if (!isLikelyImageFile(file)) {
    throw new Error('Yalnızca görsel dosyası yükleyebilirsiniz (JPEG, PNG, WebP).');
  }

  const source = await resolveDrawSource(file);
  try {
    const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
    const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
    const longest = Math.max(source.width, source.height, 1);
    const scale = Math.min(1, maxEdge / longest);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Görsel işlenemedi (canvas).');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    source.draw(ctx, width, height);

    const qualities = [opts?.quality ?? DEFAULT_QUALITY, 0.72, 0.6, 0.48, 0.36];

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
  } finally {
    source.cleanup?.();
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export { isLikelyImageFile };
