import type { LucideIcon } from 'lucide-react';

import {

  LayoutDashboard,

  Calendar,

  BarChart3,

  CircleHelp,

  Sparkles,

  User,

  Video,

  GraduationCap,

  UserCog,

  Server,

  BookOpenCheck

} from 'lucide-react';

import type { UserRole } from '../../types';

import {

  MOBILE_ACADEMIC_MATCH_PATHS,

  MOBILE_LESSON_MATCH_PATHS

} from './sidebar/navModel';



export type MobileTabItem = {

  path: string;

  label: string;

  icon: LucideIcon;

  end?: boolean;

  /** Alt sayfalarda sekme aktif kalsın */

  matchPaths?: readonly string[];

};



const LESSON_MATCH = ['/mobile/dersler', ...MOBILE_LESSON_MATCH_PATHS] as const;

const ACADEMIC_MATCH = MOBILE_ACADEMIC_MATCH_PATHS;

const ADMIN_HUB_MATCH = [

  '/mobile/yonetim',

  '/super-admin',

  '/notifications',

  '/system-management',

  '/veli-onay',

  '/muhasebe',

  '/tahsilat-muhasebe',

  '/subscription',

  '/topics',

  '/events',

  '/kitap-siparisleri',

  '/whatsapp',

  '/message-templates',

  '/coach-whatsapp-settings',

  '/teachers',

  '/coaches',

  '/settings',

  '/webhooks',

  '/reports',

  '/ai-coach'

] as const;



const STUDENT_TABS: MobileTabItem[] = [

  { path: '/weekly-planner', label: 'Plan', icon: Calendar, matchPaths: ACADEMIC_MATCH },

  { path: '/student-analytics', label: 'Analiz', icon: BarChart3 },

  { path: '/mobile/dersler', label: 'Dersler', icon: Video, matchPaths: LESSON_MATCH },

  { path: '/academic-center', label: 'Merkez', icon: Sparkles },

  { path: '/soru-sor', label: 'Soru', icon: CircleHelp },

  { path: '/my-profile', label: 'Profil', icon: User, end: true }

];



const SUPER_ADMIN_TABS: MobileTabItem[] = [

  { path: '/dashboard', label: 'Panel', icon: LayoutDashboard },

  { path: '/mobile/dersler', label: 'Dersler', icon: Video, matchPaths: LESSON_MATCH },

  { path: '/mobile/akademik', label: 'Akademik', icon: BookOpenCheck, matchPaths: ACADEMIC_MATCH },

  { path: '/students', label: 'Öğrenci', icon: GraduationCap },

  { path: '/user-management', label: 'Kullanıcı', icon: UserCog },

  { path: '/mobile/yonetim', label: 'Yönetim', icon: Server, matchPaths: ADMIN_HUB_MATCH },

  { path: '/my-profile', label: 'Profil', icon: User, end: true }

];



const ADMIN_TABS: MobileTabItem[] = [

  { path: '/dashboard', label: 'Panel', icon: LayoutDashboard },

  { path: '/mobile/dersler', label: 'Dersler', icon: Video, matchPaths: LESSON_MATCH },

  { path: '/mobile/akademik', label: 'Akademik', icon: BookOpenCheck, matchPaths: ACADEMIC_MATCH },

  { path: '/students', label: 'Öğrenci', icon: GraduationCap },

  { path: '/my-profile', label: 'Profil', icon: User, end: true }

];



const COACH_TABS: MobileTabItem[] = [

  { path: '/coach-dashboard', label: 'Panel', icon: LayoutDashboard },

  { path: '/mobile/dersler', label: 'Dersler', icon: Video, matchPaths: LESSON_MATCH },

  { path: '/mobile/akademik', label: 'Akademik', icon: BookOpenCheck, matchPaths: ACADEMIC_MATCH },

  { path: '/students', label: 'Öğrenci', icon: GraduationCap },

  { path: '/my-profile', label: 'Profil', icon: User, end: true }

];



const TEACHER_TABS: MobileTabItem[] = [

  { path: '/teacher-panel', label: 'Panel', icon: LayoutDashboard },

  { path: '/mobile/dersler', label: 'Dersler', icon: Video, matchPaths: LESSON_MATCH },

  { path: '/mobile/akademik', label: 'Akademik', icon: BookOpenCheck, matchPaths: ACADEMIC_MATCH },

  { path: '/my-profile', label: 'Profil', icon: User, end: true }

];



export function getMobileTabsForRoles(tags: UserRole[]): MobileTabItem[] {

  const isStudentOnly =

    tags.includes('student') &&

    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));

  if (isStudentOnly) return STUDENT_TABS;

  if (tags.includes('super_admin')) return SUPER_ADMIN_TABS;

  if (tags.includes('admin')) return ADMIN_TABS;

  if (tags.includes('coach')) return COACH_TABS;

  if (tags.includes('teacher')) return TEACHER_TABS;

  return [];

}



const GRID_COLS: Record<number, string> = {

  4: 'grid-cols-4',

  5: 'grid-cols-5',

  6: 'grid-cols-6'

};



export function mobileTabGridClass(count: number): string {

  return GRID_COLS[count] || 'grid-cols-6';

}


