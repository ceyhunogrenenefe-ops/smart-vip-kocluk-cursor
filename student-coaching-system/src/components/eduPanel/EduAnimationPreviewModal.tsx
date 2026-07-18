import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Maximize2, Minimize2, ExternalLink, X, Expand } from 'lucide-react';

type Props = {
  open: boolean;
  animUrl: string | null;
  loading?: boolean;
  onClose: () => void;
};

export default function EduAnimationPreviewModal({ open, animUrl, loading, onClose }: Props) {
  const [fullscreen, setFullscreen] = useState(true);
  const [nativeFs, setNativeFs] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setFullscreen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
      if (e.key === 'f' || e.key === 'F') setFullscreen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      if (document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => undefined);
      }
    };
  }, [open]);

  useEffect(() => {
    const onFs = () => setNativeFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  if (!open) return null;

  const openInNewTab = () => {
    if (animUrl) window.open(animUrl, '_blank', 'noopener,noreferrer');
  };

  const toggleNativeFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const el = stageRef.current;
      if (el?.requestFullscreen) {
        await el.requestFullscreen();
      } else {
        setFullscreen(true);
      }
    } catch {
      setFullscreen(true);
    }
  };

  const containerCls = fullscreen
    ? 'fixed inset-0 z-50 bg-slate-900 flex flex-col'
    : 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4';

  const innerCls = fullscreen
    ? 'flex-1 flex flex-col bg-slate-100 min-h-0'
    : 'relative w-full max-w-[min(98vw,1400px)] h-[92vh] rounded-xl bg-slate-100 shadow-2xl overflow-hidden flex flex-col';

  return (
    <div className={containerCls} role="dialog" aria-modal="true" aria-label="Animasyon önizleme">
      <div ref={stageRef} className={innerCls}>
        <div className="flex shrink-0 items-center justify-between gap-2 bg-slate-900/95 px-2 py-1.5 text-white">
          <p className="truncate pl-1 text-[11px] text-slate-300">
            Animasyon ortada · Tam sayfa için butona bas (F)
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={openInNewTab}
              disabled={!animUrl}
              title="Yeni sekmede aç"
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-slate-700 disabled:opacity-40"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Yeni sekme</span>
            </button>
            <button
              type="button"
              onClick={() => void toggleNativeFullscreen()}
              title="Cihaz tam ekranı"
              className="inline-flex items-center gap-1.5 rounded bg-violet-600 px-2 py-1 text-xs font-semibold hover:bg-violet-500"
            >
              <Expand className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{nativeFs ? 'Tam ekrandan çık' : 'Tam sayfa'}</span>
            </button>
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Pencere modu (F)' : 'Uygulama tam ekranı (F)'}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-slate-700"
            >
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{fullscreen ? 'Pencere' : 'Geniş'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Kapat (Esc)"
              className="inline-flex items-center gap-1.5 rounded bg-rose-600 px-3 py-1 text-xs font-semibold hover:bg-rose-500"
            >
              <X className="h-3.5 w-3.5" />
              <span>Kapat</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center bg-slate-100">
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
          </div>
        ) : animUrl ? (
          <div className="flex min-h-0 flex-1 items-stretch justify-center bg-slate-100">
            <iframe
              title="Animasyon önizleme"
              src={animUrl}
              className="h-full w-full max-w-[1400px] border-0 bg-white"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
              allowFullScreen
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Önizleme yüklenemedi.
          </div>
        )}
      </div>
    </div>
  );
}
