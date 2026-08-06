import React, { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { VeliKayitKvkkBody, VeliKayitKullaniciBody, VeliKayitSatisOnbilgiBody } from '../content/veliKayitLegalDocs';
import {
  ONLINEVIP_KULLANICI_SOZLESMESI_URL,
  ONLINEVIP_SATIS_SOZLESMESI_URL,
  VELI_KAYIT_KULLANICI_PATH,
  VELI_KAYIT_KVKK_PATH,
  VELI_KAYIT_SATIS_ONBILGI_PATH
} from '../lib/veliKayitLegalLinks';

const TITLES: Record<string, string> = {
  kvkk: 'KVKK bilgilendirme',
  'satis-onbilgilendirme': 'Satış sözleşmesi ve ön bilgilendirme',
  kullanici: 'Kullanıcı sözleşmesi'
};

export default function VeliKayitLegalDocPage() {
  const { slug } = useParams();

  // Eski site içi yollar: resmi Online VIP sayfalarına yönlendir (404 / boş yer tutucu olmasın)
  useEffect(() => {
    if (slug === 'satis-onbilgilendirme') {
      window.location.replace(ONLINEVIP_SATIS_SOZLESMESI_URL);
    } else if (slug === 'kullanici') {
      window.location.replace(ONLINEVIP_KULLANICI_SOZLESMESI_URL);
    }
  }, [slug]);

  if (slug === 'satis-onbilgilendirme' || slug === 'kullanici') {
    const href =
      slug === 'kullanici' ? ONLINEVIP_KULLANICI_SOZLESMESI_URL : ONLINEVIP_SATIS_SOZLESMESI_URL;
    const title = TITLES[slug];
    return (
      <div className="min-h-screen bg-slate-900 px-4 py-12 text-center text-slate-200">
        <p className="text-sm">{title} sayfasına yönlendiriliyorsunuz…</p>
        <a
          href={href}
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-400 underline hover:text-blue-300"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Sayfayı aç
        </a>
        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-white/10 bg-white p-6 text-left text-slate-900 shadow-xl">
          {slug === 'kullanici' ? <VeliKayitKullaniciBody /> : <VeliKayitSatisOnbilgiBody />}
        </div>
      </div>
    );
  }

  if (slug === 'kvkk') {
    return (
      <LegalShell title={TITLES.kvkk}>
        <VeliKayitKvkkBody />
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
        <a
          href={ONLINEVIP_SATIS_SOZLESMESI_URL}
          className="font-semibold text-blue-400 underline hover:text-blue-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          Satış sözleşmesi
        </a>
        <a
          href={ONLINEVIP_KULLANICI_SOZLESMESI_URL}
          className="font-semibold text-blue-400 underline hover:text-blue-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          Kullanıcı sözleşmesi
        </a>
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
            <a
              href={ONLINEVIP_SATIS_SOZLESMESI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-700 underline decoration-blue-400/70 underline-offset-2 hover:text-blue-900"
            >
              Satış sözleşmesi
            </a>
            <a
              href={ONLINEVIP_KULLANICI_SOZLESMESI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-700 underline decoration-blue-400/70 underline-offset-2 hover:text-blue-900"
            >
              Kullanıcı sözleşmesi
            </a>
            <Link
              to={VELI_KAYIT_SATIS_ONBILGI_PATH}
              className="text-slate-500 underline underline-offset-2 hover:text-slate-700"
            >
              {VELI_KAYIT_SATIS_ONBILGI_PATH}
            </Link>
            <Link
              to={VELI_KAYIT_KULLANICI_PATH}
              className="text-slate-500 underline underline-offset-2 hover:text-slate-700"
            >
              {VELI_KAYIT_KULLANICI_PATH}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
