import React from 'react';
import type { VideoSolutionBrand } from '../../../lib/videoSolutionPublicApi';

type Props = {
  brand: VideoSolutionBrand | null;
  children: React.ReactNode;
};

export default function VideoSolutionPublicShell({ brand, children }: Props) {
  const colors = brand?.colors;
  const lacivert = colors?.lacivert || '#173b70';
  const maviAcik = colors?.maviAcik || '#eef4fa';

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, ${maviAcik} 0%, #fff 40%)` }}>
      <header
        className="border-b border-white/20 shadow-sm"
        style={{ backgroundColor: lacivert }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {brand?.logo ? (
            <img src={brand.logo} alt="" className="h-10 w-auto max-w-[120px] object-contain bg-white/10 rounded px-1" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white">
              VIP
            </span>
          )}
          <div className="min-w-0 text-white">
            <p className="truncate text-sm font-semibold">{brand?.institution.name || 'Online VIP Dershane'}</p>
            <p className="truncate text-xs text-white/80">Video soru çözüm merkezi</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-slate-500">
        {brand?.slogan || 'Olduğunuz yerden, olmak istediğiniz yere.'}
      </footer>
    </div>
  );
}
