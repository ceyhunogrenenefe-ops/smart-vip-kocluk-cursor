import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { adVideosApi } from './api';
import { fmtBytes } from './format';

type Props = {
  submissionId: string;
  title: string;
  fileName?: string | null;
  sizeBytes?: number | null;
  allowDownload?: boolean;
  previewStatus?: string | null;
  previewNote?: string | null;
};

/** Panel oturumuyla kısa ömürlü bilet. Google hesabına veya erişim isteğine gitmez. */
export default function PanelVideo({ submissionId, title, fileName, sizeBytes, allowDownload, previewStatus, previewNote }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [playErr, setPlayErr] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancel = false;
    setSrc(null);
    setErr('');
    setPlayErr('');
    adVideosApi
      .ticket(submissionId)
      .then((r) => {
        if (!cancel) setSrc(r.url);
      })
      .catch((e) => {
        if (!cancel) setErr(e instanceof Error ? e.message : 'Video açılamadı');
      });
    return () => {
      cancel = true;
    };
  }, [submissionId]);

  const download = async () => {
    if (!src) return;
    setDownloading(true);
    try {
      const name = fileName || 'video.mp4';
      const head = await fetch(src, { headers: { Range: 'bytes=0-0' } });
      const total = Number((head.headers.get('content-range') || '').split('/')[1]) || sizeBytes || 0;
      if (!total) throw new Error('Dosya boyutu okunamadı');
      const step = 2 * 1024 * 1024;
      const picker = (window as Window & { showSaveFilePicker?: (o: { suggestedName: string }) => Promise<{ createWritable: () => Promise<{ write: (c: Uint8Array) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker;
      if (picker) {
        const handle = await picker({ suggestedName: name });
        const writable = await handle.createWritable();
        for (let start = 0; start < total; start += step) {
          const end = Math.min(total - 1, start + step - 1);
          const res = await fetch(src, { headers: { Range: `bytes=${start}-${end}` } });
          if (!res.ok) throw new Error('İndirme kesildi');
          await writable.write(new Uint8Array(await res.arrayBuffer()));
        }
        await writable.close();
        return;
      }
      if (total > 400 * 1024 * 1024) throw new Error('Dosya 400 MB üstü. İndirmek için Chrome veya Edge kullanın.');
      const chunks: BlobPart[] = [];
      for (let start = 0; start < total; start += step) {
        const end = Math.min(total - 1, start + step - 1);
        const res = await fetch(src, { headers: { Range: `bytes=${start}-${end}` } });
        if (!res.ok) throw new Error('İndirme kesildi');
        chunks.push(await res.arrayBuffer());
      }
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setErr(e instanceof Error ? e.message : 'İndirilemedi');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-2">
      {err ? <p className="text-sm text-rose-700">{err}</p> : null}
      {!src && !err ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Oynatıcı hazırlanıyor…
        </p>
      ) : null}
      {src ? (
        <video
          key={src}
          src={src}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full rounded-xl bg-black"
          title={title}
          onError={() => setPlayErr('Tarayıcı bu dosyayı oynatamadı. Orijinal kurum arşivinde duruyor.')}
        />
      ) : null}
      {playErr ? <p className="text-xs text-amber-800">{playErr}</p> : null}
      {previewStatus === 'unavailable' ? <p className="text-xs text-amber-800">{previewNote || 'Önizleme hazır değil. Orijinal arşivde.'}</p> : null}
      {previewStatus === 'not_needed' ? <p className="text-xs text-slate-500">Yükleme tamam. Bu dosya tarayıcıda oynatılabilir.</p> : null}
      {allowDownload && src ? (
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          İndir {sizeBytes ? `· ${fmtBytes(sizeBytes)}` : ''}
        </button>
      ) : null}
    </div>
  );
}
