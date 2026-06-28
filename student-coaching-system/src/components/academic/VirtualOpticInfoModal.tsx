import React from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { AppModal } from '../ui/AppModal';

const RULES: React.ReactNode[] = [
  <>
    Tanımlanan sınavlarınızı <strong>Online Sınavlar</strong> bölümünde görebilirsiniz.
  </>,
  <>
    Sınavınıza <strong>Sınava Başla</strong> butonuna tıkladığınız anda süre başlamaktadır.
  </>,
  <>
    Her bölüm değişikliğinde cevaplarınızın kaybolmaması için <strong>Kaydet</strong> butonuna basmayı
    unutmayınız.
  </>,
  <>
    Sınavınızı tamamladıktan sonra <strong>Sınavı Bitir</strong> butonuna basarak sınavınızı
    sonlandırınız.
  </>,
  <>
    Sınav sonuçlarınızı ve detaylı analizlerinizi <strong>Sınav Raporları</strong> bölümünden
    görüntüleyebilirsiniz.
  </>
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
    <AppModal open={open} onClose={onClose} align="center" panelClassName="max-w-lg overflow-hidden p-0">
      <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Online Sınav Bilgilendirmesi</h3>
            <p className="mt-0.5 text-sm text-slate-600">Sanal Optik</p>
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
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Okudum, Sınava Devam Et
        </button>
      </div>
    </AppModal>
  );
}
