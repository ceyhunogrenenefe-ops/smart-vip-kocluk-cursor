import React, { useEffect, useState } from 'react';
import { Loader2, Maximize2, Minimize2, ExternalLink, X } from 'lucide-react';

type Props = {
  open: boolean;
  animUrl: string | null;
  loading?: boolean;
  onClose: () => void;
};

export default function EduAnimationPreviewModal({ open, animUrl, loading, onClose }: Props) {
  const [fullscreen, setFullscreen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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
    };
  }, [open]);

  if (!open) return null;

  const openInNewTab = () => {
    if (animUrl) window.open(animUrl, '_blank', 'noopener,noreferrer');
  };

  const containerCls = fullscreen
    ? 'fixed inset-0 z-50 bg-black flex flex-col'
    : 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4';

  const innerCls = fullscreen
    ? 'flex-1 flex flex-col bg-white'
    : 'relative w-full max-w-[min(98vw,1400px)] h-[92vh] rounded-xl bg-white shadow-2xl overflow-hidden flex flex-col';

  const iframeCls = fullscreen ? 'flex-1 w-full border-0' : 'flex-1 w-full border-0';

  return (
    <div className={containerCls} role="dialog" aria-modal="true" aria-label="Animasyon önizleme">
      <div className={innerCls}>
        <div className="flex items-center justify-end gap-1 bg-slate-900/95 px-2 py-1.5 text-white">
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
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? 'Pencere modu (F)' : 'Tam ekran (F)'}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-slate-700"
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{fullscreen ? 'Pencere' : 'Tam ekran'}</span>
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

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
          </div>
        ) : animUrl ? (
          <iframe
            title="Animasyon önizleme"
            src={animUrl}
            className={iframeCls}
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
            allowFullScreen
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Önizleme yüklenemedi.
          </div>
        )}
      </div>
    </div>
  );
}
