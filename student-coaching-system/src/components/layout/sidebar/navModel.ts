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
  Upload,
  BookMarked,
  FileCheck,
  UserCog,
  CreditCard,
  Server,
  Radio,
  MessageSquareText,
  Sparkles,
  Video
} from 'lucide-react';
import type { UserRole } from '../../../types';

export type FlatNavItem = { path: string; label: string; icon: LucideIcon };

const PANEL_PATHS = new Set([
  '/dashboard',
  '/coach-dashboard',
  '/teacher-panel',
  '/student-dashboard'
]);

const LESSON_PATHS = new Set([
  '/class-live-lessons',
  '/live-lessons',
  '/meetings',
  '/class-schedule',
  '/student-meetings'
]);

const ACADEMIC_PATHS = new Set([
  '/weekly-planner',
  '/tracking',
  '/book-tracking',
  '/exam-tracking',
  '/written-exam'
]);

/** Süper admin / admin: kurum, kullanıcı ve sistem yönetimi tek accordion altında */
const ORG_SYSTEM_PATHS = new Set(['/super-admin', '/user-management', '/system-management']);
const ORG_SYSTEM_ORDER = ['/super-admin', '/user-management', '/system-management'] as const;

const LESSON_LABELS: Record<string, string> = {
  '/class-live-lessons': 'Canlı Grup Dersleri',
  '/live-lessons': 'Canlı Özel Dersler',
  '/meetings': 'Online Görüşmeler',
  '/class-schedule': 'Canlı derslerim',
  '/student-meetings': 'Online Görüşmeler'
};

const ACADEMIC_LABELS: Record<string, string> = {
  '/weekly-planner': 'Haftalık Plan',
  '/tracking': 'Haftalık Takip',
  '/book-tracking': 'Kitap Takibi',
  '/exam-tracking': 'Sınav Takibi',
  '/written-exam': 'Yazılı Takibi'
};

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
      { path: '/academic-center', icon: Sparkles, label: 'Akademik Merkez' },
      { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
      { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
      { path: '/super-admin', icon: Server, label: 'Kurum Yönetimi' },
      { path: '/user-management', icon: UserCog, label: 'Kullanıcı Yönetimi' },
      { path: '/message-templates', icon: MessageSquareText, label: 'WA şablonları' },
      { path: '/coach-whatsapp-settings', icon: MessageCircle, label: 'WhatsApp merkezi' },
      { path: '/subscription', icon: CreditCard, label: 'Abonelik / Paketler' },
      { path: '/topics', icon: BookOpen, label: 'Konu Havuzu' },
      { path: '/system-management', icon: Server, label: 'Sistem Yönetimi' },
      { path: '/ai-coach', icon: Brain, label: 'AI KOÇ' },
      { path: '/settings', icon: Settings, label: 'Ayarlar' }
    ];
  }

  const isStudentOnlyNav =
    tags.includes('student') &&
    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
  if (isStudentOnlyNav) {
    return [
      { path: '/student-dashboard', icon: LayoutDashboard, label: 'Öğrenci Paneli' },
      { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
      { path: '/academic-center', icon: Sparkles, label: 'Akademik Merkez' },
      { path: '/class-schedule', icon: Calendar, label: 'Canlı derslerim' },
      { path: '/student-meetings', icon: Video, label: 'Görüşmelerim' },
      { path: '/student-reports', icon: BookMarked, label: 'Benim Raporlarım' },
      { path: '/student-analytics', icon: BarChart3, label: 'Analizlerim' }
    ];
  }

  const MENU_ADMIN: FlatNavItem[] = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Ana Panel' },
    { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
    { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
    { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
    { path: '/teachers', icon: GraduationCap, label: 'Öğretmenler' },
    { path: '/coaches', icon: Users, label: 'Eğitim Koçları' },
    { path: '/tracking', icon: Calendar, label: 'Haftalık Takip' },
    { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
    { path: '/academic-center', icon: Sparkles, label: 'Akademik Merkez' },
    { path: '/book-tracking', icon: BookMarked, label: 'Kitap Takibi' },
    { path: '/exam-tracking', icon: ClipboardList, label: 'Sınav Takibi (Denemelerim)' },
    { path: '/reports', icon: FileCheck, label: 'Raporlar' },
    { path: '/ai-coach', icon: Brain, label: 'AI KOÇ' },
    { path: '/whatsapp', icon: MessageCircle, label: 'WhatsApp Panel' },
    { path: '/message-templates', icon: MessageSquareText, label: 'WA şablonları' },
    { path: '/topics', icon: BookOpen, label: 'Konu Havuzu' },
    { path: '/topic-tracking', icon: CheckSquare, label: 'Konu Takibi' },
    { path: '/written-exam', icon: FileCheck, label: 'Yazılı Takip' },
    { path: '/pdf-import', icon: Upload, label: 'PDF İçe Aktar' },
    { path: '/analytics', icon: BarChart3, label: 'Analiz Paneli' },
    { path: '/webhooks', icon: Webhook, label: 'Webhook Ayarları' },
    { path: '/meetings', icon: Video, label: 'Online görüşmeler' },
    { path: '/user-management', icon: UserCog, label: 'Kullanıcı Yönetimi' },
    { path: '/system-management', icon: Server, label: 'Sistem Yönetimi' },
    { path: '/settings', icon: Settings, label: 'Ayarlar' }
  ];

  const MENU_TEACHER: FlatNavItem[] = [
    { path: '/teacher-panel', icon: LayoutDashboard, label: 'Öğretmen Paneli' },
    { path: '/academic-center', icon: Sparkles, label: 'Akademik Merkez' },
    { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
    { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
    { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
    { path: '/coach-whatsapp-settings', icon: MessageCircle, label: 'WhatsApp merkezi' },
    { path: '/settings', icon: Settings, label: 'Ayarlar' }
  ];

  const MENU_COACH: FlatNavItem[] = [
    { path: '/coach-dashboard', icon: LayoutDashboard, label: 'Koç Paneli' },
    { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
    { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
    { path: '/meetings', icon: Video, label: 'Online görüşmeler' },
    { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
    { path: '/teachers', icon: GraduationCap, label: 'Öğretmenler' },
    { path: '/tracking', icon: Calendar, label: 'Haftalık Takip' },
    { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
    { path: '/academic-center', icon: Sparkles, label: 'Akademik Merkez' },
    { path: '/book-tracking', icon: BookMarked, label: 'Kitap Takibi' },
    { path: '/exam-tracking', icon: ClipboardList, label: 'Sınav Takibi (Denemelerim)' },
    { path: '/topic-tracking', icon: CheckSquare, label: 'Konu Takibi' },
    { path: '/analytics', icon: BarChart3, label: 'Analiz Paneli' },
    { path: '/ai-coach', icon: Brain, label: 'AI KOÇ' },
    { path: '/coach-whatsapp-settings', icon: MessageCircle, label: 'WhatsApp merkezi' },
    { path: '/webhooks', icon: Webhook, label: 'Webhook Ayarlari' },
    { path: '/written-exam', icon: FileCheck, label: 'Yazılı Takip' },
    { path: '/settings', icon: Settings, label: 'Ayarlar' }
  ];

  const chunks: FlatNavItem[][] = [];
  if (tags.includes('admin')) chunks.push(MENU_ADMIN);
  if (tags.includes('coach')) chunks.push(MENU_COACH);
  if (tags.includes('teacher')) chunks.push(MENU_TEACHER);

  if (chunks.length === 0) return [];

  let merged = mergeSideMenus(chunks);
  if (tags.includes('coach') && tags.includes('teacher') && !tags.includes('admin')) {
    const coachDash = merged.find((m) => m.path === '/coach-dashboard');
    const teachPanel = merged.find((m) => m.path === '/teacher-panel');
    if (coachDash && teachPanel) {
      const rest = merged.filter(
        (m) => m.path !== '/coach-dashboard' && m.path !== '/teacher-panel'
      );
      merged = [coachDash, teachPanel, ...rest];
    }
  }
  return merged;
}

export type NavGroupKind = 'lessons' | 'academic' | 'org';

export type StructuredNav = {
  panels: FlatNavItem[];
  lessons: FlatNavItem[];
  academic: FlatNavItem[];
  orgSystem: FlatNavItem[];
  rest: FlatNavItem[];
};

/** Gruplar + panel + kalan öğeler (sıra korunur). */
export function structureNavFromFlat(flat: FlatNavItem[]): StructuredNav {
  const panels: FlatNavItem[] = [];
  const lessons: FlatNavItem[] = [];
  const academic: FlatNavItem[] = [];
  const orgSystem: FlatNavItem[] = [];
  const rest: FlatNavItem[] = [];

  for (const it of flat) {
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
    rest.push(it);
  }

  const orgRank = (p: string) => {
    const i = (ORG_SYSTEM_ORDER as readonly string[]).indexOf(p);
    return i === -1 ? 99 : i;
  };
  orgSystem.sort((a, b) => orgRank(a.path) - orgRank(b.path));

  return { panels, lessons, academic, orgSystem, rest };
}

export function pathnameMatchesGroup(pathname: string, _kind: NavGroupKind, items: FlatNavItem[]): boolean {
  return items.some((it) => pathname === it.path || pathname.startsWith(`${it.path}/`));
}
