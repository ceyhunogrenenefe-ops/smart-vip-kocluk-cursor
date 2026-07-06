import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BarChart3,
  Settings,
  BookOpen,
  MessageCircle,
  TrendingUp,
  Calendar,
  CheckSquare,
  Brain,
  ClipboardList,
  Webhook,
  BookMarked,
  FileCheck,
  UserCog,
  CreditCard,
  Server,
  Radio,
  MessageSquareText,
  Sparkles,
  Video,
  FileText,
  Wallet,
  CircleHelp,
  Bell,
  Presentation,
  User,
  CalendarDays,
  Bot,
  CloudDownload,
  ScrollText
} from 'lucide-react';
import type { UserRole } from '../../../types';

export type FlatNavItem = { path: string; label: string; icon: LucideIcon };

/** Admin / süper admin — kitap siparişleri (sidebar’da üst düzey link) */
export const NAV_KITAP_SIPARISLERI: FlatNavItem = {
  path: '/kitap-siparisleri',
  icon: BookOpen,
  label: 'Kitap siparişleri'
};

/** Öğrenci — Akademik Merkez (Öğrenci Paneli üstünde, tek link) */
export const STUDENT_NAV_ACADEMIC_CENTER: FlatNavItem = {
  path: '/academic-center',
  icon: Sparkles,
  label: 'Akademik Merkez'
};

/** Öğrenci — Soru Sor (sidebar’da yalnız, grup dışı) */
export const NAV_MY_PROFILE: FlatNavItem = {
  path: '/my-profile',
  icon: User,
  label: 'Profilim'
};

export const STUDENT_NAV_SORU_SOR: FlatNavItem = {
  path: '/soru-sor',
  icon: CircleHelp,
  label: 'Soru Sor'
};

/** Ödev + animasyon içerik sayfası (öğrenci / koç / öğretmen) */
export const EDU_HOMEWORK_ANIMATIONS_LABEL = 'Ödevlerim ve Animasyonlarım';

/** Öğrenci — Ders & görüşmeler (Akademik Merkez’in altında) */
export const STUDENT_LESSON_NAV_ITEMS: FlatNavItem[] = [
  { path: '/edu-derslerim', icon: Presentation, label: EDU_HOMEWORK_ANIMATIONS_LABEL },
  { path: '/ai-agents', icon: Bot, label: 'AI Koçlarım' },
  { path: '/exams', icon: ClipboardList, label: 'AI Denemelerim' },
  { path: '/class-schedule', icon: Calendar, label: 'Canlı derslerim' },
  { path: '/student-meetings', icon: Video, label: 'Görüşmelerim' }
];

/** Öğrenci Paneli — Sidebar’da accordion altında */
export const STUDENT_PANEL_SUBMENU_ITEMS: FlatNavItem[] = [
  { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
  { path: '/topic-tracking', icon: CheckSquare, label: 'Konu takibi' },
  { path: '/student-dashboard/denemeler', icon: ClipboardList, label: 'Deneme sınavları' },
  { path: '/student-dashboard/yazili', icon: FileCheck, label: 'Yazılılarım' },
  { path: '/student-dashboard/kitaplar', icon: BookMarked, label: 'Kitaplarım' },
];

const PANEL_PATHS = new Set([
  '/dashboard',
  '/coach-dashboard',
  '/teacher-panel',
  '/student-dashboard'
]);

const LESSON_PATHS = new Set([
  '/class-live-lessons',
  '/schedule-planner',
  '/live-lessons',
  '/meetings',
  '/class-schedule',
  '/student-meetings',
  '/edu-panel',
  '/edu-derslerim',
  '/ai-agents',
  '/ai-agents-admin',
  '/exams'
]);

/** Mobil alt sekme — Ders & Görüşmeler aktif eşleşmesi */
export const MOBILE_LESSON_MATCH_PATHS = [...LESSON_PATHS] as const;

/** Mobil alt sekme — Akademik takip aktif eşleşmesi */
export const MOBILE_ACADEMIC_MATCH_PATHS = [
  '/mobile/akademik',
  '/academic-center',
  '/weekly-planner',
  '/tracking',
  '/book-tracking',
  '/exam-tracking',
  '/edesis',
  '/written-exam',
  '/topic-tracking',
  '/analytics',
  '/attendance-report',
  '/soru-sor',
  '/soru-havuzu',
  '/soru-analitik',
  '/student-dashboard',
  '/student-analytics',
  '/exam-tracking'
] as const;

const ACADEMIC_CENTER_PATH = '/academic-center';

const ACADEMIC_PATHS = new Set([
  '/weekly-planner',
  '/tracking',
  '/book-tracking',
  '/exam-tracking',
  '/edesis',
  '/written-exam',
  '/topic-tracking',
  '/analytics',
  '/attendance-report',
  '/soru-sor',
  '/soru-havuzu',
  '/soru-analitik'
]);

/** Öğrenci, öğretmen ve koçlar — tek alt menü */
const TEAM_PATHS = new Set(['/students', '/teachers', '/coaches']);
const TEAM_ORDER = ['/students', '/teachers', '/coaches'] as const;

/** WhatsApp paneli + şablonlar + koç merkezi */
const WHATSAPP_PATHS = new Set(['/whatsapp', '/message-templates', '/coach-whatsapp-settings']);
const WHATSAPP_ORDER = ['/whatsapp', '/message-templates', '/coach-whatsapp-settings'] as const;

/** Kurum / kullanıcı / sistem (öğrenci–öğretmen–koç listeleri ayrı grupta) */
const ORG_SYSTEM_PATHS = new Set([
  '/super-admin',
  '/user-management',
  '/notifications',
  '/system-management',
  '/veli-onay',
  '/muhasebe'
]);
const ORG_SYSTEM_ORDER = [
  '/super-admin',
  '/user-management',
  '/notifications',
  '/system-management',
  '/veli-onay',
  '/muhasebe'
] as const;

const SETTINGS_PATHS = new Set(['/settings', '/webhooks', '/my-profile']);
const SETTINGS_ORDER = ['/my-profile', '/settings', '/webhooks'] as const;

const LESSON_LABELS: Record<string, string> = {
  '/class-live-lessons': 'Canlı Grup Dersleri',
  '/schedule-planner': 'Ders Programı Planlayıcı',
  '/live-lessons': 'Canlı Özel Dersler',
  '/meetings': 'Online Görüşmeler',
  '/class-schedule': 'Canlı derslerim',
  '/student-meetings': 'Online Görüşmeler',
  '/edu-panel': EDU_HOMEWORK_ANIMATIONS_LABEL,
  '/edu-derslerim': EDU_HOMEWORK_ANIMATIONS_LABEL,
  '/ai-agents': 'AI Koçlarım',
  '/ai-agents-admin': 'AI Ders Ajanları',
  '/exams': 'AI Denemelerim'
};

const ACADEMIC_LABELS: Record<string, string> = {
  '/weekly-planner': 'Haftalık Plan',
  '/tracking': 'Haftalık Takip',
  '/book-tracking': 'Kitap Takibi',
  '/exam-tracking': 'Sınav Takibi',
  '/edesis': 'Edesis',
  '/written-exam': 'Yazılı Takibi',
  '/topic-tracking': 'Konu Takibi',
  '/academic-center': 'Akademik Merkez',
  '/analytics': 'Analiz Paneli',
  '/attendance-report': 'Yoklama raporu',
  '/soru-sor': 'Soru Sor',
  '/soru-havuzu': 'Soru Havuzu',
  '/soru-analitik': 'Soru Analitiği'
};

function withProfileNav(items: FlatNavItem[]): FlatNavItem[] {
  if (items.some((i) => i.path === NAV_MY_PROFILE.path)) return items;
  return [...items, NAV_MY_PROFILE];
}

function mergeSideMenus(groups: FlatNavItem[][]): FlatNavItem[] {
  const map = new Map<string, FlatNavItem>();
  for (const group of groups) {
    for (const item of group) {
      if (!map.has(item.path)) map.set(item.path, item);
    }
  }
  return [...map.values()];
}

/** Rol birleşimine göre düz menü (mevcut davranışla uyumlu). */
export function getFlatMenuForRoles(tags: UserRole[]): FlatNavItem[] {
  if (tags.includes('super_admin')) {
    return [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Ana Panel' },
      { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
      { path: '/attendance-report', icon: ClipboardList, label: 'Yoklama raporu' },
      { path: '/academic-center', icon: Sparkles, label: 'Akademik Merkez' },
      { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
      { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
      { path: '/schedule-planner', icon: CalendarDays, label: 'Ders Programı Planlayıcı' },
      { path: '/meetings', icon: Video, label: 'Online görüşmeler' },
      { path: '/edu-panel', icon: Presentation, label: EDU_HOMEWORK_ANIMATIONS_LABEL },
      { path: '/ai-agents-admin', icon: Bot, label: 'AI Ders Ajanları' },
      { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
      { path: '/teachers', icon: GraduationCap, label: 'Öğretmenler' },
      { path: '/coaches', icon: Users, label: 'Koçlar' },
      { path: '/super-admin', icon: Server, label: 'Kurum Yönetimi' },
      { path: '/user-management', icon: UserCog, label: 'Kullanıcı Yönetimi' },
      { path: '/notifications', icon: Bell, label: 'Bildirimler' },
      { path: '/events', icon: CalendarDays, label: 'Etkinlikler' },
      NAV_KITAP_SIPARISLERI,
      { path: '/edesis', icon: CloudDownload, label: 'Edesis' },
      { path: '/coach-whatsapp-settings', icon: MessageCircle, label: 'WhatsApp merkezi' },
      { path: '/subscription', icon: CreditCard, label: 'Abonelik / Paketler' },
      { path: '/topics', icon: BookOpen, label: 'Konu Havuzu' },
      { path: '/system-management', icon: Server, label: 'Sistem Yönetimi' },
      { path: '/veli-onay', icon: FileText, label: 'Veli onayı & e-imza' },
      { path: '/muhasebe', icon: Wallet, label: 'Muhasebe' },
      { path: '/ai-coach', icon: Brain, label: 'AI KOÇ' },
      { path: '/settings', icon: Settings, label: 'Ayarlar' }
    ].concat([NAV_MY_PROFILE]);
  }

  const isStudentOnlyNav =
    tags.includes('student') &&
    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
  if (isStudentOnlyNav) {
    /** Akademik Merkez, Ders&Görüşme, panel ve Soru Sor Sidebar.tsx’te ayrı */
    return [{ path: '/student-analytics', icon: BarChart3, label: 'Analizlerim' },
      { path: '/exam-tracking', icon: ClipboardList, label: 'Deneme analizi' }];
  }

  const MENU_ADMIN: FlatNavItem[] = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Ana Panel' },
    { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
    { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
    { path: '/schedule-planner', icon: CalendarDays, label: 'Ders Programı Planlayıcı' },
    { path: '/meetings', icon: Video, label: 'Online görüşmeler' },
    { path: '/edu-panel', icon: Presentation, label: EDU_HOMEWORK_ANIMATIONS_LABEL },
    { path: '/ai-agents-admin', icon: Bot, label: 'AI Ders Ajanları' },
    { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
    { path: '/teachers', icon: GraduationCap, label: 'Öğretmenler' },
    { path: '/coaches', icon: Users, label: 'Koçlar' },
    { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
    { path: '/academic-center', icon: Sparkles, label: 'Akademik Merkez' },
    { path: '/book-tracking', icon: BookMarked, label: 'Kitap Takibi' },
    { path: '/exam-tracking', icon: ClipboardList, label: 'Sınav Takibi (Denemelerim)' },
    { path: '/edesis', icon: CloudDownload, label: 'Edesis' },
    { path: '/reports', icon: FileCheck, label: 'Raporlar' },
    { path: '/ai-coach', icon: Brain, label: 'AI KOÇ' },
    { path: '/whatsapp', icon: MessageCircle, label: 'Mesaj gönder' },
    { path: '/message-templates', icon: MessageSquareText, label: 'Mesaj şablonları' },
    { path: '/topics', icon: BookOpen, label: 'Konu Havuzu' },
    { path: '/topic-tracking', icon: CheckSquare, label: 'Konu Takibi' },
      { path: '/written-exam', icon: FileCheck, label: 'Yazılı Takip' },
      { path: '/attendance-report', icon: ClipboardList, label: 'Yoklama raporu' },
      { path: '/analytics', icon: BarChart3, label: 'Analiz Paneli' },
    { path: '/soru-havuzu', icon: CircleHelp, label: 'Soru Havuzu' },
    { path: '/webhooks', icon: Webhook, label: 'Webhook Ayarları' },
    { path: '/user-management', icon: UserCog, label: 'Kullanıcı Yönetimi' },
    { path: '/notifications', icon: Bell, label: 'Bildirimler' },
    { path: '/events', icon: CalendarDays, label: 'Etkinlikler' },
    NAV_KITAP_SIPARISLERI,
    { path: '/system-management', icon: Server, label: 'Sistem Yönetimi' },
    { path: '/veli-onay', icon: FileText, label: 'Veli onayı & e-imza' },
    { path: '/muhasebe', icon: Wallet, label: 'Muhasebe' },
    { path: '/settings', icon: Settings, label: 'Ayarlar' }
  ];

  const MENU_TEACHER: FlatNavItem[] = [
    { path: '/teacher-panel', icon: LayoutDashboard, label: 'Öğretmen Paneli' },
    { path: '/teacher-solution-appointments', icon: Calendar, label: 'Bugünkü Randevular' },
    { path: '/edu-panel', icon: Presentation, label: EDU_HOMEWORK_ANIMATIONS_LABEL },
    { path: '/ai-agents-admin', icon: Bot, label: 'AI Ders Ajanları' },
    { path: '/soru-havuzu', icon: CircleHelp, label: 'Soru Havuzu' },
    { path: '/academic-center', icon: Sparkles, label: 'Akademik Merkez' },
    { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
    { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
    { path: '/attendance-report', icon: ClipboardList, label: 'Yoklama raporu' },
    { path: '/coach-whatsapp-settings', icon: MessageCircle, label: 'WhatsApp merkezi' },
    { path: '/settings', icon: Settings, label: 'Ayarlar' }
  ];

  const MENU_COACH: FlatNavItem[] = [
    { path: '/coach-dashboard', icon: LayoutDashboard, label: 'Koç Paneli' },
    { path: '/coach-kilavuz', icon: ScrollText, label: 'Kullanım kılavuzu' },
    { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
    { path: '/edu-panel', icon: Presentation, label: EDU_HOMEWORK_ANIMATIONS_LABEL },
    { path: '/ai-agents-admin', icon: Bot, label: 'AI Ders Ajanları' },
    { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
    { path: '/meetings', icon: Video, label: 'Online görüşmeler' },
    { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
    { path: '/teachers', icon: GraduationCap, label: 'Öğretmenler' },
    { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
    { path: '/academic-center', icon: Sparkles, label: 'Akademik Merkez' },
    { path: '/book-tracking', icon: BookMarked, label: 'Kitap Takibi' },
    { path: '/exam-tracking', icon: ClipboardList, label: 'Sınav Takibi (Denemelerim)' },
    { path: '/edesis', icon: CloudDownload, label: 'Edesis' },
    { path: '/topic-tracking', icon: CheckSquare, label: 'Konu Takibi' },
    { path: '/analytics', icon: BarChart3, label: 'Analiz Paneli' },
    { path: '/soru-analitik', icon: CircleHelp, label: 'Soru Analitiği' },
    { path: '/soru-havuzu', icon: CircleHelp, label: 'Soru Havuzu' },
    { path: '/notifications', icon: Bell, label: 'Bildirimler' },
    { path: '/events', icon: CalendarDays, label: 'Etkinlikler' },
    { path: '/ai-coach', icon: Brain, label: 'AI KOÇ' },
    { path: '/coach-whatsapp-settings', icon: MessageCircle, label: 'WhatsApp merkezi' },
    { path: '/written-exam', icon: FileCheck, label: 'Yazılı Takip' },
    { path: '/attendance-report', icon: ClipboardList, label: 'Yoklama raporu' },
    { path: '/veli-onay', icon: FileText, label: 'Veli onayı & e-imza' }
  ];

  const isCoachPanelUser =
    tags.includes('coach') && !tags.includes('admin') && !tags.includes('super_admin');

  const chunks: FlatNavItem[][] = [];
  if (tags.includes('admin')) chunks.push(MENU_ADMIN);
  if (tags.includes('coach')) chunks.push(MENU_COACH);
  /** Koç paneli varken öğretmen paneli menüsü birleştirilmez */
  if (tags.includes('teacher') && !tags.includes('coach')) chunks.push(MENU_TEACHER);

  if (chunks.length === 0) return [];

  let merged = mergeSideMenus(chunks);
  if (tags.includes('coach')) {
    merged = merged.filter((m) => m.path !== '/teacher-panel');
  }
  if (isCoachPanelUser) {
    merged = merged.filter((m) => !SETTINGS_PATHS.has(m.path));
    return merged;
  }
  return withProfileNav(merged);
}

export type NavGroupKind =
  | 'lessons'
  | 'academic'
  | 'org'
  | 'settings'
  | 'studentPanel'
  | 'team'
  | 'whatsapp';

export type StructuredNav = {
  panels: FlatNavItem[];
  academicCenter: FlatNavItem | null;
  lessons: FlatNavItem[];
  team: FlatNavItem[];
  academic: FlatNavItem[];
  whatsapp: FlatNavItem[];
  orgSystem: FlatNavItem[];
  settings: FlatNavItem[];
  rest: FlatNavItem[];
};

/** Gruplar + panel + kalan öğeler (sıra korunur). */
export function structureNavFromFlat(flat: FlatNavItem[]): StructuredNav {
  const panels: FlatNavItem[] = [];
  let academicCenter: FlatNavItem | null = null;
  const lessons: FlatNavItem[] = [];
  const team: FlatNavItem[] = [];
  const academic: FlatNavItem[] = [];
  const whatsapp: FlatNavItem[] = [];
  const orgSystem: FlatNavItem[] = [];
  const settings: FlatNavItem[] = [];
  const rest: FlatNavItem[] = [];

  for (const it of flat) {
    if (it.path === ACADEMIC_CENTER_PATH) {
      academicCenter = {
        ...it,
        label: ACADEMIC_LABELS[ACADEMIC_CENTER_PATH] ?? it.label,
        icon: Sparkles
      };
      continue;
    }
    if (PANEL_PATHS.has(it.path)) {
      panels.push({
        ...it,
        icon: LayoutDashboard,
        label: it.label
      });
      continue;
    }
    if (LESSON_PATHS.has(it.path)) {
      lessons.push({
        ...it,
        label: LESSON_LABELS[it.path] ?? it.label
      });
      continue;
    }
    if (TEAM_PATHS.has(it.path)) {
      team.push(it);
      continue;
    }
    if (WHATSAPP_PATHS.has(it.path)) {
      whatsapp.push(it);
      continue;
    }
    if (ACADEMIC_PATHS.has(it.path)) {
      academic.push({
        ...it,
        label: ACADEMIC_LABELS[it.path] ?? it.label
      });
      continue;
    }
    if (ORG_SYSTEM_PATHS.has(it.path)) {
      orgSystem.push(it);
      continue;
    }
    if (SETTINGS_PATHS.has(it.path)) {
      settings.push(it);
      continue;
    }
    rest.push(it);
  }

  const orgRank = (p: string) => {
    const i = (ORG_SYSTEM_ORDER as readonly string[]).indexOf(p);
    return i === -1 ? 99 : i;
  };
  orgSystem.sort((a, b) => orgRank(a.path) - orgRank(b.path));

  const settingsRank = (p: string) => {
    const i = (SETTINGS_ORDER as readonly string[]).indexOf(p);
    return i === -1 ? 99 : i;
  };
  settings.sort((a, b) => settingsRank(a.path) - settingsRank(b.path));

  const teamRank = (p: string) => {
    const i = (TEAM_ORDER as readonly string[]).indexOf(p);
    return i === -1 ? 99 : i;
  };
  team.sort((a, b) => teamRank(a.path) - teamRank(b.path));

  const waRank = (p: string) => {
    const i = (WHATSAPP_ORDER as readonly string[]).indexOf(p);
    return i === -1 ? 99 : i;
  };
  whatsapp.sort((a, b) => waRank(a.path) - waRank(b.path));

  /** Akademik Takip içinde tutarlı sıra: plan → merkez → takip türleri */
  const academicOrder = [
    '/weekly-planner',
    '/tracking',
    '/book-tracking',
  '/exam-tracking',
  '/analytics',
    '/topic-tracking',
    '/written-exam',
    '/attendance-report'
  ] as const;
  const acRank = (p: string) => {
    const i = (academicOrder as readonly string[]).indexOf(p);
    return i === -1 ? 99 : i;
  };
  academic.sort((a, b) => acRank(a.path) - acRank(b.path));

  return { panels, academicCenter, lessons, team, academic, whatsapp, orgSystem, settings, rest };
}

export function pathnameMatchesGroup(pathname: string, kind: NavGroupKind, items: FlatNavItem[]): boolean {
  if (kind === 'studentPanel') {
    return (
      pathname === '/student-dashboard' ||
      pathname.startsWith('/student-dashboard/') ||
      pathname === '/weekly-planner' ||
      pathname.startsWith('/weekly-planner/') ||
      pathname === '/topic-tracking' ||
      pathname.startsWith('/topic-tracking/') ||
      items.some((it) => pathname === it.path || pathname.startsWith(`${it.path}/`))
    );
  }
  return items.some((it) => pathname === it.path || pathname.startsWith(`${it.path}/`));
}

export function getStructuredNavForRoles(tags: UserRole[]): StructuredNav {
  return structureNavFromFlat(getFlatMenuForRoles(tags));
}

export function pathnameMatchesMobileTab(
  pathname: string,
  tabPath: string,
  matchPaths?: readonly string[]
): boolean {
  if (pathname === tabPath || pathname.startsWith(`${tabPath}/`)) return true;
  if (!matchPaths?.length) return false;
  return matchPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
