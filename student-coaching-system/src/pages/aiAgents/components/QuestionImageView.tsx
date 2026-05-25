import React, { useState } from 'react';
import { ImageIcon, Maximize2, X } from 'lucide-react';

interface Props {
  url?: string | null;
  pageNo?: number | null;
  variant?: 'thumbnail' | 'full';
}

/**
 * Sorunun ait olduğu PDF sayfasının görüntüsünü gösterir.
 * - thumbnail: küçük önizleme + tıklayınca büyük modal
 * - full: doğrudan büyük göster (deneme çözme ekranı için)
 */
export default function QuestionImageView({ url, pageNo, variant = 'thumbnail' }: Props) {
  const [open, setOpen] = useState(false);
  if (!url) return null;

  if (variant === 'full') {
    return (
      <>
        <div className="mt-2 mb-3 inline-block max-w-full">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block group relative"
            title="Büyüt"
          >
            <img
              src={url}
              alt={pageNo ? `Sayfa ${pageNo}` : 'Soru görseli'}
              className="max-h-[460px] max-w-full rounded-lg border shadow-sm bg-white object-contain"
              loading="lazy"
            />
            <span className="absolute top-1 right-1 bg-black/60 text-white text-xs px-2 py-1 rounded inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
              <Maximize2 className="w-3 h-3" /> Büyüt
            </span>
          </button>
          {pageNo && (
            <div className="text-xs text-slate-500 mt-1">
              Kaynak: PDF sayfa {pageNo}
            </div>
          )}
        </div>
        {open && <Lightbox url={url} pageNo={pageNo} onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-white hover:bg-slate-50 text-xs"
        title="Sayfa görüntüsünü aç"
      >
        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
        <span>Görsel</span>
        {pageNo && <span className="text-slate-400">· s.{pageNo}</span>}
      </button>
      {open && <Lightbox url={url} pageNo={pageNo} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({ url, pageNo, onClose }: { url: string; pageNo?: number | null; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"
      >
        <X className="w-6 h-6" />
      </button>
      {pageNo && (
        <div className="absolute top-4 left-4 text-white text-sm bg-black/40 px-3 py-1 rounded">
          PDF sayfa {pageNo}
        </div>
      )}
      <img
        src={url}
        alt={pageNo ? `Sayfa ${pageNo}` : 'Soru görseli'}
        className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
