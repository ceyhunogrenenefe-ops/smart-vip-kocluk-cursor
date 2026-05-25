import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { VeliKayitKvkkBody, VeliKayitSatisOnbilgiBody } from '../content/veliKayitLegalDocs';
import { VELI_KAYIT_KVKK_PATH, VELI_KAYIT_SATIS_ONBILGI_PATH } from '../lib/veliKayitLegalLinks';

const TITLES: Record<string, string> = {
  kvkk: 'KVKK bilgilendirme',
  'satis-onbilgilendirme': 'Satış sözleşmesi ve ön bilgilendirme'
};

export default function VeliKayitLegalDocPage() {
  const { slug } = useParams();

  if (slug === 'kvkk') {
    return (
      <LegalShell title={TITLES.kvkk}>
        <VeliKayitKvkkBody />
      </LegalShell>
    );
  }
  if (slug === 'satis-onbilgilendirme') {
    return (
      <LegalShell title={TITLES['satis-onbilgilendirme']}>
        <VeliKayitSatisOnbilgiBody />
      </LegalShell>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-12 text-center text-slate-200">
      <p className="text-sm">Bu metin bulunamadı.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
        <Link to={VELI_KAYIT_KVKK_PATH} className="font-semibold text-blue-400 underline hover:text-blue-300">
          KVKK
        </Link>
        <Link to={VELI_KAYIT_SATIS_ONBILGI_PATH} className="font-semibold text-blue-400 underline hover:text-blue-300">
          Satış / ön bilgilendirme
        </Link>
      </div>
    </div>
  );
}

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Geri
        </button>
        <div className="rounded-2xl border border-white/10 bg-white p-6 text-slate-900 shadow-xl sm:p-8">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          <div className="mt-6 border-t border-slate-200 pt-6">{children}</div>
          <div className="mt-8 flex flex-wrap gap-4 border-t border-slate-200 pt-6 text-sm">
            <Link
              to={VELI_KAYIT_KVKK_PATH}
              className="font-semibold text-blue-700 underline decoration-blue-400/70 underline-offset-2 hover:text-blue-900"
            >
              KVKK metni
            </Link>
            <Link
              to={VELI_KAYIT_SATIS_ONBILGI_PATH}
              className="font-semibold text-blue-700 underline decoration-blue-400/70 underline-offset-2 hover:text-blue-900"
            >
              Satış / ön bilgilendirme
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
