import React from 'react';
import { AlertCircle, VideoOff } from 'lucide-react';
import { AppModal } from '../ui/AppModal';

const DEFAULT_HINT =
  'Derste kayıt başlatıldıysa ders bitiminden 5–15 dakika sonra tekrar deneyin. Sorun devam ederse yöneticinize başvurun.';

type RecordingUnavailableModalProps = {
  open: boolean;
  message: string;
  onClose: () => void;
};

export function RecordingUnavailableModal({ open, message, onClose }: RecordingUnavailableModalProps) {
  const body = String(message || '').trim() || 'Kayıt henüz hazır değil veya bulunamadı.';

  return (
    <AppModal open={open} onClose={onClose} panelClassName="max-w-md">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <VideoOff className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900">Kayıt henüz hazır değil</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{body}</p>
            <p className="mt-3 flex gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <span>{DEFAULT_HINT}</span>
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Tamam
          </button>
        </div>
      </div>
    </AppModal>
  );
}
