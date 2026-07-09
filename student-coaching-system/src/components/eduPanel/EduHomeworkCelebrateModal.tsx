import React, { useEffect } from 'react';
import { PartyPopper } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function EduHomeworkCelebrateModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => onClose(), 3200);
    return () => window.clearTimeout(t);
  }, [open, onClose]);

  if (!open) return null;

  const msg =
    Math.random() > 0.5
      ? 'Harika! Ödevini başarıyla teslim ettin.'
      : 'Hocan ödevini inceleyecek.';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-amber-50 via-white to-violet-50" />
        <div className="relative">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-3xl">
            🎉
          </div>
          <PartyPopper className="mx-auto mt-3 h-6 w-6 text-violet-600" />
          <p className="mt-3 text-lg font-bold text-slate-900">{msg}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
