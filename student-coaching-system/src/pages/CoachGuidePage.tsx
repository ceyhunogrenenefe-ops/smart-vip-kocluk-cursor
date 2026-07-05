import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  Compass,
  HelpCircle,
  Lightbulb,
  Map,
  Rocket,
  Search,
  Sparkles
} from 'lucide-react';
import {
  COACH_DAILY_WORKFLOW,
  COACH_GUIDE_CATEGORIES,
  COACH_GUIDE_FAQ,
  COACH_GUIDE_INTRO,
  COACH_GUIDE_SECTIONS,
  COACH_MENU_GROUPS,
  COACH_ONBOARDING_DAYS,
  type CoachGuideSection
} from '../content/coachPanelGuide';
import {
  GUIDE_ICON_MAP,
  GuideAccentStyles,
  GuideMenuMap,
  GuideOnboardingStrip,
  GuideStepCards,
  GuideUiMock,
  GuideWorkflowTimeline
} from '../components/coachGuide/CoachGuideVisuals';

function GuideSectionBlock({
  section,
  onNavigate
}: {
  section: CoachGuideSection;
  onNavigate: (path: string) => void;
}) {
  const accent = GuideAccentStyles(section.accent);
  const Icon = GUIDE_ICON_MAP[section.icon] ?? BookOpen;

  return (
    <section
      id={`guide-${section.id}`}
      className={`scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ${accent.ring}`}
    >
      <div className={`bg-gradient-to-r ${accent.gradient} px-5 py-4 text-white`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <span className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {section.categoryLabel}
              </span>
              <h2 className="mt-1 text-xl font-bold tracking-tight">{section.title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-white/90">{section.summary}</p>
            </div>
          </div>
          {section.linkPath ? (
            <button
              type="button"
              onClick={() => onNavigate(section.linkPath!)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-white/95"
            >
              {section.linkLabel ?? 'Sayfaya git'}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <GuideUiMock kind={section.visual} caption={section.visualCaption} />
        <div className="space-y-4">
          <GuideStepCards steps={section.steps} accent={section.accent} />
          {section.tips?.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
                <Lightbulb className="h-4 w-4" />
                Pratik ipuçları
              </p>
              <ul className="space-y-1.5">
                {section.tips.map((tip) => (
                  <li key={tip} className="flex gap-2 text-sm text-amber-950/90">
                    <span className="text-amber-500">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {section.relatedLinks?.length ? (
            <div className="flex flex-wrap gap-2">
              {section.relatedLinks.map((r) => (
                <button
                  key={r.path}
                  type="button"
                  onClick={() => onNavigate(r.path)}
                  className={`rounded-full border ${accent.border} ${accent.soft} px-3 py-1 text-xs font-medium ${accent.text} hover:opacity-90`}
                >
                  {r.label} →
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function CoachGuidePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CoachGuideSection['category'] | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COACH_GUIDE_SECTIONS.filter((s) => {
      if (activeCategory !== 'all' && s.category !== activeCategory) return false;
      if (!q) return true;
      const blob = [
        s.title,
        s.summary,
        s.categoryLabel,
        ...s.steps.map((x) => `${x.title} ${x.detail} ${x.where ?? ''}`),
        ...(s.tips ?? [])
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [query, activeCategory]);

  const filteredFaq = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COACH_GUIDE_FAQ;
    return COACH_GUIDE_FAQ.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(q));
  }, [query]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-800 p-6 text-white shadow-lg md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
              <BookOpen className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-200">Smart VIP Koçluk</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{COACH_GUIDE_INTRO.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-violet-100">{COACH_GUIDE_INTRO.subtitle}</p>
            </div>
          </div>
          <Link
            to="/coach-dashboard"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-violet-800 shadow-md hover:bg-violet-50"
          >
            Koç paneline dön
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
          {COACH_GUIDE_INTRO.stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-white/10 px-3 py-3 text-center backdrop-blur-sm">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-[11px] text-violet-200">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* İlk 7 gün */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Rocket className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-bold text-slate-900">İlk 7 gün — hızlı başlangıç</h2>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Panele yeni başlayan koçlar için günlük mini görevler. Her gün bir adımı tamamlayın; bir hafta sonunda tüm
          modüllere hakim olursunuz.
        </p>
        <GuideOnboardingStrip days={COACH_ONBOARDING_DAYS} />
      </div>

      {/* Menü haritası */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Map className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-900">Sol menü haritası</h2>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Koç panelinde sayfalar gruplar halinde düzenlenir. Kaybolduğunuzda önce hangi grupta olduğunuzu bulun.
        </p>
        <GuideMenuMap groups={COACH_MENU_GROUPS} />
      </div>

      {/* Günlük rutin */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Compass className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-bold text-slate-900">Günlük koç rutini</h2>
        </div>
        <p className="mb-4 text-sm text-slate-600">Sabah–öğlen–akşam üç aşamalı önerilen iş akışı.</p>
        <GuideWorkflowTimeline blocks={COACH_DAILY_WORKFLOW} />
      </div>

      {/* Arama & filtre */}
      <div className="sticky top-0 z-20 space-y-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Modül ara: WhatsApp, haftalık plan, veli imza, AI koç…"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activeCategory === 'all' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tümü
          </button>
          {COACH_GUIDE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCategory(c.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                activeCategory === c.id ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* İçindekiler — masaüstü */}
        <aside className="hidden lg:block">
          <nav className="sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Sparkles className="h-3.5 w-3.5" />
              Modüller
            </p>
            <ul className="space-y-0.5">
              {filtered.map((s) => {
                const Icon = GUIDE_ICON_MAP[s.icon];
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => scrollTo(`guide-${s.id}`)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-slate-600 hover:bg-violet-50 hover:text-violet-800"
                    >
                      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" /> : null}
                      <span className="line-clamp-2">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <div className="space-y-8">
          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
              Filtreye uyan modül bulunamadı. Arama metnini temizleyin veya “Tümü”ne tıklayın.
            </p>
          ) : (
            filtered.map((section) => (
              <GuideSectionBlock key={section.id} section={section} onNavigate={navigate} />
            ))
          )}

          {/* SSS */}
          {filteredFaq.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-4">
                <HelpCircle className="h-5 w-5 text-violet-600" />
                <h2 className="text-lg font-bold text-slate-900">Sık sorulan sorular</h2>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {filteredFaq.map((item) => {
                  const Icon = item.icon ? GUIDE_ICON_MAP[item.icon] : HelpCircle;
                  const FaqIcon = Icon ?? HelpCircle;
                  return (
                    <details
                      key={item.q}
                      className="group rounded-xl border border-slate-100 bg-slate-50/50 p-4 open:bg-white open:shadow-sm"
                    >
                      <summary className="cursor-pointer list-none marker:content-none">
                        <span className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                            <FaqIcon className="h-4 w-4" />
                          </span>
                          <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pt-1">
                            <span className="text-sm font-semibold text-slate-900">{item.q}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                          </span>
                        </span>
                      </summary>
                      <p className="mt-3 pl-12 text-sm leading-relaxed text-slate-600">{item.a}</p>
                    </details>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
