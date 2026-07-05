import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookMarked,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MessageCircle,
  Radio,
  Sparkles,
  Target,
  Users,
  Video,
  Wallet
} from 'lucide-react';
import type { CoachGuideSection, GuideMenuGroup, GuideVisualKind, GuideWorkflowBlock } from '../../content/coachPanelGuide';

const ACCENT: Record<
  CoachGuideSection['accent'],
  { ring: string; bg: string; text: string; soft: string; border: string; gradient: string }
> = {
  violet: {
    ring: 'ring-violet-200',
    bg: 'bg-violet-600',
    text: 'text-violet-700',
    soft: 'bg-violet-50',
    border: 'border-violet-200',
    gradient: 'from-violet-600 to-indigo-600'
  },
  blue: {
    ring: 'ring-blue-200',
    bg: 'bg-blue-600',
    text: 'text-blue-700',
    soft: 'bg-blue-50',
    border: 'border-blue-200',
    gradient: 'from-blue-600 to-cyan-600'
  },
  emerald: {
    ring: 'ring-emerald-200',
    bg: 'bg-emerald-600',
    text: 'text-emerald-700',
    soft: 'bg-emerald-50',
    border: 'border-emerald-200',
    gradient: 'from-emerald-600 to-teal-600'
  },
  amber: {
    ring: 'ring-amber-200',
    bg: 'bg-amber-500',
    text: 'text-amber-800',
    soft: 'bg-amber-50',
    border: 'border-amber-200',
    gradient: 'from-amber-500 to-orange-500'
  },
  rose: {
    ring: 'ring-rose-200',
    bg: 'bg-rose-600',
    text: 'text-rose-700',
    soft: 'bg-rose-50',
    border: 'border-rose-200',
    gradient: 'from-rose-600 to-pink-600'
  },
  indigo: {
    ring: 'ring-indigo-200',
    bg: 'bg-indigo-600',
    text: 'text-indigo-700',
    soft: 'bg-indigo-50',
    border: 'border-indigo-200',
    gradient: 'from-indigo-600 to-violet-600'
  },
  sky: {
    ring: 'ring-sky-200',
    bg: 'bg-sky-600',
    text: 'text-sky-700',
    soft: 'bg-sky-50',
    border: 'border-sky-200',
    gradient: 'from-sky-600 to-blue-600'
  }
};

export const GUIDE_ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  Calendar,
  Sparkles,
  Video,
  MessageCircle,
  Brain,
  CircleHelp,
  FileText,
  Bell,
  Target,
  GraduationCap,
  Radio,
  BookMarked,
  BarChart3,
  Wallet
};

export function GuideAccentStyles(accent: CoachGuideSection['accent']) {
  return ACCENT[accent];
}

/** Sol menü yapısını görsel olarak gösterir */
export function GuideMenuMap({ groups }: { groups: GuideMenuGroup[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => {
        const Icon = GUIDE_ICON_MAP[g.icon] ?? LayoutDashboard;
        return (
          <div
            key={g.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
          >
            <div className={`flex items-center gap-2 bg-gradient-to-r ${g.gradient} px-3 py-2.5 text-white`}>
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              <span className="text-sm font-semibold">{g.title}</span>
            </div>
            <ul className="space-y-1 p-3">
              {g.items.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                  {item}
                </li>
              ))}
            </ul>
            {g.note ? <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">{g.note}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Günlük / haftalık iş akışı zaman çizelgesi */
export function GuideWorkflowTimeline({ blocks }: { blocks: GuideWorkflowBlock[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {blocks.map((block, i) => {
        const Icon = GUIDE_ICON_MAP[block.icon] ?? Target;
        return (
          <div key={block.id} className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {i < blocks.length - 1 ? (
              <ChevronRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-slate-300 md:block" />
            ) : null}
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${block.gradient} text-white shadow-sm`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{block.timeLabel}</p>
                <h3 className="font-semibold text-slate-900">{block.title}</h3>
              </div>
            </div>
            <ul className="space-y-2">
              {block.tasks.map((t) => (
                <li key={t} className="flex gap-2 text-xs leading-relaxed text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Bölüme özel mini arayüz önizlemesi */
export function GuideUiMock({ kind, caption }: { kind: GuideVisualKind; caption: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900/5 shadow-inner">
      <div className="border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 truncate text-[10px] text-slate-400">Smart VIP Koçluk — önizleme</span>
        </div>
      </div>
      <div className="bg-gradient-to-b from-slate-50 to-white p-4">{renderMockBody(kind)}</div>
      <p className="border-t border-slate-200 bg-white px-3 py-2 text-center text-[11px] text-slate-500">{caption}</p>
    </div>
  );
}

function renderMockBody(kind: GuideVisualKind) {
  switch (kind) {
    case 'dashboard':
      return (
        <div className="space-y-3">
          <div className="rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 p-4 text-white">
            <div className="flex justify-between gap-2">
              <div>
                <p className="text-lg font-bold">Merhaba, Koç!</p>
                <p className="text-xs text-purple-200">Eğitim Koçu Paneli</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">24</p>
                <p className="text-[10px] text-purple-200">Öğrenci</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {['Öğrenci', 'Başarı', 'Hedef', 'Okuma'].map((l, i) => (
              <div key={l} className="rounded-lg border border-slate-100 bg-white p-2 text-center shadow-sm">
                <p className="text-sm font-bold text-slate-800">{[24, 78, 92, 340][i]}</p>
                <p className="text-[9px] text-slate-500">{l}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-red-100 bg-red-50 p-2">
            <p className="flex items-center gap-1 text-[10px] font-medium text-red-800">
              <AlertTriangle className="h-3 w-3" /> 3 riskli öğrenci — başarı %70 altında
            </p>
          </div>
        </div>
      );
    case 'students':
      return (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-[10px]">
          <div className="grid grid-cols-4 gap-2 border-b bg-slate-50 px-2 py-1.5 font-medium text-slate-600">
            <span>Ad Soyad</span>
            <span>Sınıf</span>
            <span>Veli Tel.</span>
            <span>Durum</span>
          </div>
          {[
            ['Ayşe Y.', '12. Sınıf', '05xx…', 'Aktif'],
            ['Mehmet K.', '11. Sınıf', '05xx…', 'Aktif'],
            ['Zeynep A.', 'Mezun', '05xx…', 'Yeni']
          ].map((row) => (
            <div key={row[0]} className="grid grid-cols-4 gap-2 border-b px-2 py-1.5 last:border-0">
              {row.map((c) => (
                <span key={c} className="truncate text-slate-700">
                  {c}
                </span>
              ))}
            </div>
          ))}
          <div className="bg-violet-50 px-2 py-1.5 text-violet-700">+ Öğrenci Ekle</div>
        </div>
      );
    case 'planner':
      return (
        <div className="space-y-2">
          <div className="flex gap-1">
            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum'].map((d, i) => (
              <div
                key={d}
                className={`flex-1 rounded-md py-1 text-center text-[9px] font-medium ${
                  i === 1 ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {[
              { sub: 'Matematik', t: '120 soru hedefi', done: true },
              { sub: 'Fizik', t: 'Konu tekrarı', done: false },
              { sub: 'Türkçe', t: '30 dk okuma', done: true }
            ].map((x) => (
              <div key={x.sub} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2 py-1.5">
                <span className={`h-3 w-3 rounded border ${x.done ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`} />
                <div>
                  <p className="text-[10px] font-medium text-slate-800">{x.sub}</p>
                  <p className="text-[9px] text-slate-500">{x.t}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case 'academic':
      return (
        <div className="grid grid-cols-2 gap-2">
          {[
            { l: 'Kitap', v: '68%', c: 'bg-emerald-100 text-emerald-800' },
            { l: 'Deneme', v: 'TYT 78 net', c: 'bg-blue-100 text-blue-800' },
            { l: 'Konu', v: '142/210', c: 'bg-violet-100 text-violet-800' },
            { l: 'Yazılı', v: 'Ort. 82', c: 'bg-amber-100 text-amber-800' }
          ].map((x) => (
            <div key={x.l} className={`rounded-lg p-2 ${x.c}`}>
              <p className="text-[9px] opacity-80">{x.l}</p>
              <p className="text-xs font-bold">{x.v}</p>
            </div>
          ))}
        </div>
      );
    case 'lessons':
      return (
        <div className="space-y-2">
          {[
            { t: 'Canlı özel ders — Ayşe Y.', time: '14:00', live: true },
            { t: 'Grup dersi — TYT Matematik', time: '16:30', live: false },
            { t: 'Veli görüşmesi — Meet', time: '18:00', live: false }
          ].map((x) => (
            <div key={x.t} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-medium text-slate-800">{x.t}</p>
                <p className="text-[9px] text-slate-500">{x.time}</p>
              </div>
              {x.live ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-medium text-red-700">CANLI</span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-600">Planlı</span>
              )}
            </div>
          ))}
        </div>
      );
    case 'whatsapp':
      return (
        <div className="space-y-2 rounded-lg bg-[#e5ddd5] p-3">
          <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-2 py-1.5 text-[10px] text-slate-800 shadow-sm">
            Merhaba, bugünkü matematik hedefin 120 soru. Planına göz atmayı unutma 📚
          </div>
          <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white px-2 py-1.5 text-[10px] text-slate-800 shadow-sm">
            Teşekkürler hocam, akşam tamamlayacağım.
          </div>
          <p className="text-center text-[9px] text-slate-600">Şablon: Haftalık plan hatırlatması</p>
        </div>
      );
    case 'ai':
      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-violet-100 bg-violet-50 p-2">
            <p className="text-[10px] font-medium text-violet-900">AI Koç önerisi</p>
            <p className="mt-1 text-[9px] leading-relaxed text-violet-800">
              Son 2 haftada Fizik netlerinde düşüş var. Haftalık planda tekrar konularını artırın.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] text-indigo-800">TYT Matematik Ajanı</span>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] text-indigo-800">Paragraf Ajanı</span>
          </div>
        </div>
      );
    case 'questions':
      return (
        <div className="space-y-1.5">
          {[
            { s: 'Bekleyen', n: 4, c: 'bg-amber-100 text-amber-900' },
            { s: 'Bugün çözülen', n: 12, c: 'bg-emerald-100 text-emerald-900' },
            { s: 'Ort. yanıt süresi', n: '18 dk', c: 'bg-sky-100 text-sky-900' }
          ].map((x) => (
            <div key={x.s} className={`flex justify-between rounded-lg px-2 py-1.5 text-[10px] ${x.c}`}>
              <span>{x.s}</span>
              <span className="font-bold">{x.n}</span>
            </div>
          ))}
        </div>
      );
    case 'veli':
      return (
        <div className="flex items-center justify-between gap-2 text-[10px]">
          {['Taslak', 'Ücret', 'Veli imza', 'Aktif'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`rounded-lg px-2 py-2 text-center ${i <= 2 ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <p className="font-medium">{s}</p>
                {i === 2 ? <p className="mt-0.5 text-[8px] opacity-80">Link gönderildi</p> : null}
              </div>
              {i < 3 ? <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" /> : null}
            </React.Fragment>
          ))}
        </div>
      );
    case 'notify':
      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-slate-100 bg-white p-2">
            <p className="flex items-center gap-1 text-[10px] font-medium text-slate-800">
              <Bell className="h-3 w-3 text-amber-500" /> Deneme sınavı hatırlatması
            </p>
            <p className="mt-0.5 text-[9px] text-slate-500">Yarın 10:00 — TYT Deneme #4</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-white p-2">
            <p className="text-[10px] font-medium text-slate-800">Veli toplantısı</p>
            <p className="text-[9px] text-slate-500">Cumartesi 14:00 — Etkinlik takviminde</p>
          </div>
        </div>
      );
    case 'routine':
      return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {['Sabah kontrol', 'Öğlen takip', 'Akşam kapanış'].map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex-1 rounded-xl bg-white p-2 text-center ring-1 ring-slate-200">
                <p className="text-[10px] font-semibold text-slate-800">{s}</p>
                <p className="text-[9px] text-slate-500">{['Panel', 'WhatsApp', 'Rapor'][i]}</p>
              </div>
              {i < 2 ? <ChevronRight className="mx-auto h-4 w-4 text-slate-300 sm:mx-0" /> : null}
            </React.Fragment>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export function GuideStepCards({
  steps,
  accent
}: {
  steps: CoachGuideSection['steps'];
  accent: CoachGuideSection['accent'];
}) {
  const a = ACCENT[accent];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {steps.map((step, idx) => (
        <div
          key={step.title}
          className={`relative rounded-xl border ${a.border} bg-white p-4 shadow-sm`}
        >
          <div className="mb-2 flex items-start gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${a.bg} text-sm font-bold text-white`}>
              {idx + 1}
            </span>
            <div className="min-w-0">
              <h4 className="font-semibold text-slate-900">{step.title}</h4>
              {step.where ? (
                <p className={`mt-0.5 text-[11px] font-medium ${a.text}`}>📍 {step.where}</p>
              ) : null}
            </div>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">{step.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function GuideOnboardingStrip({
  days
}: {
  days: { day: number; title: string; action: string }[];
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-3">
        {days.map((d) => (
          <div
            key={d.day}
            className="w-44 shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
              Gün {d.day}
            </span>
            <p className="mt-2 text-sm font-semibold text-slate-900">{d.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{d.action}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
