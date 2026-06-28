import React from 'react';
import { Loader2, ScanLine } from 'lucide-react';
import { AppModal } from '../ui/AppModal';

const RULES: React.ReactNode[] = [
  'Kodlamalarınızı bu bölüm üzerinden gerçekleştirebilirsiniz.',
  <>
    <strong>Sanal Optik</strong> ile devam ettiğinizde otomatik olarak{' '}
    <strong>Deneme Sınav Sistemi</strong>&apos;ne yönlendirileceksiniz.
  </>,
  <>
    Açılan ekranda <strong>Deneme Sınav Sistemi kullanıcı adı ve şifreniz</strong> ile giriş yapın.
  </>,
  'Giriş yaptıktan sonra optik kodlamalarınızı tamamlayabilirsiniz.'
];

type VirtualOpticInfoModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
  hasLink?: boolean;
};

export function VirtualOpticInfoModal({
  open,
  onClose,
  onConfirm,
  confirming,
  hasLink = true
}: VirtualOpticInfoModalProps) {
  return (
    <AppModal open={open} onClose={onClose} align="bottom" panelClassName="max-w-lg overflow-hidden p-0">
      <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <ScanLine className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Sanal Optik Bilgilendirmesi</h3>
            <p className="mt-0.5 text-sm text-slate-600">Deneme Sınav Sistemi</p>
          </div>
        </div>
      </div>
      <div className="px-5 py-5">
        <ul className="space-y-3 text-sm leading-relaxed text-slate-700">
          {RULES.map((rule, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
        {!hasLink ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            Sanal optik bağlantısı henüz tanımlanmamış. Yöneticinizden link eklemesini isteyin.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          İptal
        </button>
        <button
          type="button"
          disabled={confirming || !hasLink}
          onClick={onConfirm}
          className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Okudum, Devam Et
        </button>
      </div>
    </AppModal>
  );
}
