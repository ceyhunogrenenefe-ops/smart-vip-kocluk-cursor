/**
 * Google Drive resumable yükleme — tarayıcıdan doğrudan Google'a, parça parça.
 * Oturum adresini sunucu açar (dosya bizim sunucumuzdan geçmez).
 * Bağlantı koparsa önce Google'a "nereye kadar aldın?" sorulur, oradan devam edilir.
 */

export type UploadProgress = { sent: number; total: number };

export class UploadAborted extends Error {
  constructor() {
    super('Yükleme duraklatıldı');
  }
}

type PutResult = { status: number; range: string | null };

function put(url: string, body: Blob | null, contentRange: string, onProgress?: (loaded: number) => void, signal?: AbortSignal): Promise<PutResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Range', contentRange);
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, range: xhr.getResponseHeader('Range') });
    xhr.onerror = () => reject(new Error('Ağ hatası'));
    xhr.ontimeout = () => reject(new Error('Zaman aşımı'));
    xhr.onabort = () => reject(new UploadAborted());
    if (signal) {
      if (signal.aborted) {
        reject(new UploadAborted());
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}

function nextOffset(range: string | null): number {
  const m = range?.match(/bytes=0-(\d+)/);
  return m ? Number(m[1]) + 1 : 0;
}

/** Google'ın aldığı bayt sayısı; tamamlandıysa total */
export async function queryUploadedBytes(sessionUri: string, total: number, signal?: AbortSignal): Promise<number> {
  const r = await put(sessionUri, null, `bytes */${total}`, undefined, signal);
  if (r.status === 200 || r.status === 201) return total;
  if (r.status === 308) return nextOffset(r.range);
  if (r.status === 404 || r.status === 410) throw new Error('Yükleme oturumunun süresi doldu; videoyu yeniden seçin');
  throw new Error(`Yükleme durumu okunamadı (${r.status})`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadResumable(
  file: File,
  sessionUri: string,
  { chunkBytes, onProgress, signal }: { chunkBytes: number; onProgress: (p: UploadProgress) => void; signal?: AbortSignal }
): Promise<void> {
  const total = file.size;
  let offset = await queryUploadedBytes(sessionUri, total, signal);
  onProgress({ sent: offset, total });
  let failures = 0;
  while (offset < total) {
    const end = Math.min(offset + chunkBytes, total);
    try {
      const r = await put(
        sessionUri,
        file.slice(offset, end),
        `bytes ${offset}-${end - 1}/${total}`,
        (loaded) => onProgress({ sent: offset + loaded, total }),
        signal
      );
      if (r.status === 200 || r.status === 201) {
        offset = total;
        break;
      }
      if (r.status === 308) {
        // Range başlığı okunamazsa (CORS) parçanın tamamı alınmış sayılır
        offset = r.range ? nextOffset(r.range) : end;
        failures = 0;
        onProgress({ sent: offset, total });
        continue;
      }
      if (r.status === 404 || r.status === 410) throw new Error('Yükleme oturumunun süresi doldu; videoyu yeniden seçin');
      throw new Error(`Sunucu hatası (${r.status})`);
    } catch (e) {
      if (e instanceof UploadAborted) throw e;
      if (e instanceof Error && /süresi doldu/.test(e.message)) throw e;
      failures += 1;
      if (failures > 6) throw new Error('Bağlantı tekrar tekrar koptu. "Devam et" ile kaldığı yerden sürdürebilirsiniz.');
      await sleep(Math.min(30000, 1000 * 2 ** failures));
      offset = await queryUploadedBytes(sessionUri, total, signal).catch(() => offset);
      onProgress({ sent: offset, total });
    }
  }
  onProgress({ sent: total, total });
}
