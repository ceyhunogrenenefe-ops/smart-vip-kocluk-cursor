import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, ClipboardList, School, ExternalLink, Sparkles, KeyRound } from 'lucide-react';
import {
  defaultAcademicCenterLinks,
  fetchAcademicCenterLinksFromServer,
  loadAcademicCenterLinks,
  type AcademicCenterLinks
} from '../lib/academicCenterLinks';
type TabKey = 'study' | 'exam' | 'pool';

const openLink = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

export default function AcademicCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>('study');
  const [links, setLinks] = useState<AcademicCenterLinks>(() => loadAcademicCenterLinks() ?? defaultAcademicCenterLinks);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'study' || t === 'exam' || t === 'pool') setActiveTab(t);
  }, [searchParams]);

  const selectTab = (id: TabKey) => {
    setActiveTab(id);
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('tab', id);
      return n;
    });
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchAcademicCenterLinksFromServer();
        if (mounted) setLinks(data);
      } catch {
        if (mounted) setLinks(loadAcademicCenterLinks() ?? defaultAcademicCenterLinks);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const tabs: {
    id: TabKey;
    label: string;
    short: string;
    icon: typeof School;
    activeClass: string;
    inactiveClass: string;
  }[] = [
    {
      id: 'study',
      label: 'Etüt Sınıfları',
      short: 'Etüt',
      icon: School,
      activeClass:
        'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-300/50 ring-2 ring-white/30 scale-[1.02]',
      inactiveClass:
        'bg-white/90 text-indigo-900 border-2 border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50/90'
    },
    {
      id: 'exam',
      label: 'Deneme / Optik',
      short: 'Deneme',
      icon: ClipboardList,
      activeClass:
        'bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-300/50 ring-2 ring-white/30 scale-[1.02]',
      inactiveClass:
        'bg-white/90 text-emerald-900 border-2 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/90'
    },
    {
      id: 'pool',
      label: 'Soru Havuzları',
      short: 'Havuz',
      icon: BookOpen,
      activeClass:
        'bg-gradient-to-br from-sky-600 to-cyan-600 text-white shadow-lg shadow-sky-300/50 ring-2 ring-white/30 scale-[1.02]',
      inactiveClass:
        'bg-white/90 text-sky-900 border-2 border-sky-100 hover:border-sky-300 hover:bg-sky-50/90'
    }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-400/25">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 left-1/4 h-24 w-40 rounded-full bg-fuchsia-400/20 blur-2xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
            <Sparkles className="h-7 w-7 text-amber-200" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Akademik Merkez</h1>
            <p className="mt-1 max-w-xl text-sm text-indigo-100">
              Etüt sınıfları, deneme/optik ve soru havuzlarına tek ekrandan ulaşın. Aşağıdan bölüm seçin.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-2 shadow-inner sm:p-3">
        <div
          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch"
          role="tablist"
          aria-label="Akademik merkez bölümleri"
        >
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(t.id)}
                className={`flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all sm:min-w-[160px] ${
                  active ? t.activeClass : t.inactiveClass
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-white' : ''}`} />
                <span className="hidden text-left sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="p-1">
          {activeTab === 'study' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-amber-950">Etüt sınıfına giriş — hatırlatma</p>
                    <p className="mt-2 text-sm leading-relaxed text-amber-950/90">
                      Oturuma bağlanırken{' '}
                      <span className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono font-semibold text-amber-950 shadow-sm">
                        Name
                      </span>{' '}
                      alanına <strong>kendi adınızı</strong>,{' '}
                      <span className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono font-semibold text-amber-950 shadow-sm">
                        Access Code
                      </span>{' '}
                      alanına{' '}
                      <span className="rounded-md bg-amber-200/80 px-2 py-0.5 font-mono font-bold tracking-wide text-amber-950">
                        123456
                      </span>{' '}
                      yazmayı unutmayın.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { label: '5-6. sınıf etüt sınıfı', href: links.studyClasses.class56, accent: 'from-violet-500 to-purple-600' },
                { label: '7-8. sınıf etüt sınıfı', href: links.studyClasses.class78, accent: 'from-fuchsia-500 to-pink-600' },
                { label: '9-10-11 etüt sınıfı', href: links.studyClasses.class911, accent: 'from-blue-500 to-indigo-600' },
                { label: 'YKS etüt sınıfı', href: links.studyClasses.yks, accent: 'from-amber-500 to-orange-600' }
              ].map((x) => (
                <div
                  key={x.label}
                  className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${x.accent}`} />
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <School className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800">{x.label}</p>
                      <button
                        type="button"
                        onClick={() => openLink(x.href)}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
                      >
                        Etüte Katıl <ExternalLink className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}

          {activeTab === 'exam' && (
            <div className="mx-auto max-w-xl">
              <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm">
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-200/40 blur-2xl" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg">
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold text-emerald-950">Deneme Sınavı / Sanal Optik</p>
                    <p className="mt-1 text-sm text-emerald-900/80">
                      Kurum girişinizle deneme oturumu ve sanal optik için ayrı giriş adresleri.
                    </p>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => openLink(links.exams.exam)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700"
                      >
                        Deneme giriş <ExternalLink className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openLink(links.exams.optic)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-white px-5 py-3 text-sm font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
                      >
                        Sanal optik <ExternalLink className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pool' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-sky-200 bg-sky-50/90 px-4 py-3 shadow-sm sm:px-5 sm:py-4">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 text-sm text-sky-950">
                    <p className="font-semibold text-sky-950">Öğrenci giriş bilgisi (soru havuzları)</p>
                    <p className="mt-1 text-sky-900/90">
                      Harici havuz sitesinde oturum açarken kullanılacak hesap:{' '}
                      <span className="font-mono font-semibold">ogrenci@gmail.com</span>
                      {' · '}
                      şifre: <span className="font-mono font-semibold">152535</span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { label: 'Soru Havuzu-1', href: links.questionPools.pool1, hue: 'sky' },
                { label: 'Soru Havuzu-2', href: links.questionPools.pool2, hue: 'cyan' }
              ].map((x) => (
                <div
                  key={x.label}
                  className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-cyan-50 p-6 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-center gap-2 text-sky-700">
                    <BookOpen className="h-6 w-6" />
                    <p className="font-semibold text-slate-900">{x.label}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openLink(x.href)}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-sky-700"
                  >
                    Havuzu Aç <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
