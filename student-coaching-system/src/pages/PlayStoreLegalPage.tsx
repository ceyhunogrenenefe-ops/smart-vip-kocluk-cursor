import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MobileAppPrivacyBody, MobileAppTermsBody } from '../content/playStoreLegalDocs';

const TITLES: Record<string, string> = {
  gizlilik: 'Gizlilik Politikası',
  'kullanim-kosullari': 'Kullanım Koşulları'
};

export default function PlayStoreLegalPage() {
  const { pathname } = useLocation();
  const slug = pathname.replace(/^\//, '');

  if (slug === 'gizlilik') {
    return (
      <LegalShell title={TITLES.gizlilik}>
        <MobileAppPrivacyBody />
      </LegalShell>
    );
  }
  if (slug === 'kullanim-kosullari') {
    return (
      <LegalShell title={TITLES['kullanim-kosullari']}>
        <MobileAppTermsBody />
      </LegalShell>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-12 text-center text-slate-200">
      <p className="text-sm">Sayfa bulunamadı.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
        <Link to="/gizlilik" className="font-semibold text-blue-400 underline">
          Gizlilik
        </Link>
        <Link to="/kullanim-kosullari" className="font-semibold text-blue-400 underline">
          Kullanım koşulları
        </Link>
      </div>
    </div>
  );
}

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Link
          to="/marketing"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Ana sayfa
        </Link>
        <div className="rounded-2xl border border-white/10 bg-white p-6 text-slate-900 shadow-xl sm:p-8">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          <div className="mt-6 border-t border-slate-200 pt-6">{children}</div>
          <div className="mt-8 flex flex-wrap gap-4 border-t border-slate-200 pt-6 text-sm">
            <Link to="/gizlilik" className="font-semibold text-blue-700 underline underline-offset-2">
              Gizlilik Politikası
            </Link>
            <Link to="/kullanim-kosullari" className="font-semibold text-blue-700 underline underline-offset-2">
              Kullanım Koşulları
            </Link>
            <Link to="/veli-kayit-metin/kvkk" className="font-semibold text-blue-700 underline underline-offset-2">
              KVKK
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
