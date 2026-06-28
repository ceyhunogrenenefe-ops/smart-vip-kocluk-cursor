import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  ClipboardList,
  School,
  ExternalLink,
  Sparkles,
  KeyRound,
  Loader2,
  ScanLine,
  Video,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  defaultAcademicCenterLinks,
  examEntryUrl,
  EXAM_ENTRY_DEFS,
  fetchAcademicCenterLinksFromServer,
  loadAcademicCenterLinks,
  openAcademicCenterLink,
  type AcademicCenterLinks,
  type ExamEntryKey
} from '../lib/academicCenterLinks';
import { AppModal } from '../components/ui/AppModal';
import { VirtualOpticInfoModal } from '../components/academic/VirtualOpticInfoModal';
type TabKey = 'study' | 'exam' | 'pool';

const EXAM_CLASS_INTRO =
  'Canlı öğretmen eşliğinde gerçekleştirilen deneme sınavı oturumlarına bu bölümden katılabilirsiniz.';

type ExamModalTarget = { key: ExamEntryKey; href: string; label: string };

function PortalActionCard(props: {
  accent: string;
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  buttonLabel: string;
  onAction: () => void;
  disabled?: boolean;
  busy?: boolean;
  buttonClassName?: string;
  /** Tüm karta tıklanınca da aksiyon tetiklensin (deneme sınıfları). */
  clickableCard?: boolean;
}) {
  const {
    accent,
    icon,
    title,
    description,
    buttonLabel,
    onAction,
    disabled,
    busy,
    buttonClassName = 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:brightness-110',
    clickableCard = false
  } = props;

  const canAct = !disabled && !busy;

  const trigger = () => {
    if (canAct) onAction();
  };

  return (
    <div
      className={`group relative flex h-full overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md ${
        clickableCard && canAct ? 'cursor-pointer' : ''
      }`}
      role={clickableCard && canAct ? 'button' : undefined}
      tabIndex={clickableCard && canAct ? 0 : undefined}
      onClick={clickableCard ? trigger : undefined}
      onKeyDown={
        clickableCard && canAct
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                trigger();
              }
            }
          : undefined
      }
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="flex w-full items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          {icon}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-semibold text-slate-900">{title}</p>
          <div className="mt-2 min-h-[7.5rem] flex-1 text-sm leading-relaxed text-slate-600 sm:min-h-[6.5rem]">
            {description}
          </div>
          <button
            type="button"
            disabled={!canAct}
            onClick={(e) => {
              e.stopPropagation();
              trigger();
            }}
            className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-md transition disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${buttonClassName}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {buttonLabel}
            {!busy ? <ExternalLink className="h-4 w-4" /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExamRulesModal(props: {
  target: ExamModalTarget | null;
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  const { target, onClose, onConfirm, confirming } = props;
  const hasLink = Boolean(target?.href?.trim());

  const rules: React.ReactNode[] = [
    'Deneme sınavının geçerli sayılabilmesi için kameranız açık olmalıdır.',
    <>
      Kamera açınız; <strong>yüzünüzü, kitapçığınızı ve ellerinizi</strong> net şekilde gösterecek biçimde
      ayarlanmalıdır.
    </>,
    'Sınav boyunca kameranızı kapatmamanız gerekmektedir.',
    'Bu kurallara uyulmaması durumunda deneme sınavı geçersiz sayılabilir.'
  ];

  return (
    <AppModal open={Boolean(target)} onClose={onClose} align="bottom" panelClassName="max-w-lg overflow-hidden p-0">
      {target ? (
        <>
          <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                  <Video className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="exam-rules-title" className="text-lg font-bold text-slate-900">
                    Deneme Sınavı Bilgilendirmesi
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-600">{target.label}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="px-5 py-5">
            <ul className="space-y-3 text-sm leading-relaxed text-slate-700">
              {rules.map((rule, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
            {!hasLink ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                Bu sınıf için henüz giriş bağlantısı tanımlanmamış. Yöneticinizden link eklemesini isteyin.
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
              Kuralları Okudum, Devam Et
            </button>
          </div>
        </>
      ) : null}
    </AppModal>
  );
}

export default function AcademicCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { institution, activeInstitutionId } = useApp();
  const institutionId = institution?.id || activeInstitutionId || null;
  const [activeTab, setActiveTab] = useState<TabKey>('study');
  const [links, setLinks] = useState<AcademicCenterLinks>(
    () => loadAcademicCenterLinks(institutionId) ?? defaultAcademicCenterLinks
  );
  const [bbbBusyRoom, setBbbBusyRoom] = useState<ExamEntryKey | null>(null);
  const [examModal, setExamModal] = useState<ExamModalTarget | null>(null);
  const [opticModalOpen, setOpticModalOpen] = useState(false);

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
        const data = await fetchAcademicCenterLinksFromServer(institutionId);
        if (mounted) setLinks(data);
      } catch {
        if (mounted) setLinks(loadAcademicCenterLinks(institutionId) ?? defaultAcademicCenterLinks);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [institutionId]);

  const openLink = (url: string, room?: ExamEntryKey) => {
    void openAcademicCenterLink(url, {
      room,
      institutionId,
      busy: room ? (v) => setBbbBusyRoom(v ? room : null) : undefined
    });
  };

  const requestExamClassJoin = (key: ExamEntryKey, label: string) => {
    const href = examEntryUrl(links, key);
    setExamModal({ key, href, label });
  };

  const confirmExamClassJoin = () => {
    if (!examModal?.href?.trim()) return;
    openLink(examModal.href, examModal.key);
    setExamModal(null);
  };

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
            <div className="space-y-6">
              <PortalActionCard
                accent="from-teal-500 to-emerald-600"
                icon={<ScanLine className="h-5 w-5" />}
                title="Sanal Optik"
                description={
                  <>
                    Kodlamalarınızı bu bölüm üzerinden gerçekleştirebilirsiniz.{' '}
                    <strong>Sanal Optik</strong> butonuna tıkladığınızda otomatik olarak{' '}
                    <strong>Deneme Sınav Sistemi</strong>&apos;ne yönlendirileceksiniz. Açılan ekranda{' '}
                    <strong>Deneme Sınav Sistemi kullanıcı adı ve şifreniz</strong> ile giriş yaparak optik
                    kodlamalarınızı tamamlayabilirsiniz.
                  </>
                }
                buttonLabel="Sanal Optik"
                clickableCard
                onAction={() => setOpticModalOpen(true)}
                buttonClassName="border-2 border-emerald-600 bg-white text-emerald-800 shadow-sm hover:bg-emerald-50"
              />

              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Deneme Sınavı Sınıfları</h2>

                <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
                  {EXAM_ENTRY_DEFS.map((x) => {
                    const busy = bbbBusyRoom === x.key;
                    return (
                      <PortalActionCard
                        key={x.key}
                        accent={x.accent}
                        icon={<ClipboardList className="h-5 w-5" />}
                        title={x.label}
                        description={EXAM_CLASS_INTRO}
                        buttonLabel="Deneme Sınıfına Katıl"
                        busy={busy}
                        clickableCard
                        onAction={() => requestExamClassJoin(x.key, x.label)}
                      />
                    );
                  })}
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

      <ExamRulesModal
        target={examModal}
        onClose={() => setExamModal(null)}
        onConfirm={confirmExamClassJoin}
        confirming={examModal ? bbbBusyRoom === examModal.key : false}
      />

      <VirtualOpticInfoModal
        open={opticModalOpen}
        onClose={() => setOpticModalOpen(false)}
        hasLink={Boolean(String(links.exams.optic || '').trim())}
        onConfirm={() => {
          const href = String(links.exams.optic || '').trim();
          if (!href) return;
          setOpticModalOpen(false);
          openLink(href);
        }}
      />
    </div>
  );
}
