// Türkçe: Yan menü bileşeni - Compact tasarım, tek sütun hizalı
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
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
  Video,
  Radio,
  MessageSquareText
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { userRoleTags } from '../../config/rolePermissions';

type SideMenuItem = { path: string; icon: LucideIcon; label: string };

function mergeSideMenus(groups: SideMenuItem[][]): SideMenuItem[] {
  const map = new Map<string, SideMenuItem>();
  for (const group of groups) {
    for (const item of group) {
      if (!map.has(item.path)) map.set(item.path, item);
    }
  }
  return [...map.values()];
}

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { effectiveUser } = useAuth();
  const { institution } = useApp();

  /** Çoklu rol: koç + öğretmen menüleri birleştirilir (aynı path tek kez). */
  const getMenuItems = (): SideMenuItem[] => {
    const tags = userRoleTags(effectiveUser);
    if (tags.includes('super_admin')) {
      return [
        { path: '/dashboard', icon: LayoutDashboard, label: 'Ana Panel' },
        { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
        { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
        { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
        { path: '/super-admin', icon: Server, label: 'Kurum Yönetimi' },
        { path: '/user-management', icon: UserCog, label: 'Kullanıcı Yönetimi' },
        { path: '/message-templates', icon: MessageSquareText, label: 'WA şablonları' },
        { path: '/subscription', icon: CreditCard, label: 'Abonelik / Paketler' },
        { path: '/topics', icon: BookOpen, label: 'Konu Havuzu' },
        { path: '/system-management', icon: Server, label: 'Sistem Yönetimi' }
      ];
    }
    const isStudentOnlyNav =
      tags.includes('student') &&
      !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
    if (isStudentOnlyNav) {
      return [
        { path: '/student-dashboard', icon: LayoutDashboard, label: 'Öğrenci Paneli' },
        { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
        { path: '/class-schedule', icon: Calendar, label: 'Canlı derslerim' },
        { path: '/student-meetings', icon: Video, label: 'Görüşmelerim' },
        { path: '/student-reports', icon: BookMarked, label: 'Benim Raporlarım' },
        { path: '/student-analytics', icon: BarChart3, label: 'Analizlerim' }
      ];
    }

    const MENU_ADMIN: SideMenuItem[] = [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Ana Panel' },
      { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
      { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
      { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
      { path: '/teachers', icon: GraduationCap, label: 'Öğretmenler' },
      { path: '/coaches', icon: Users, label: 'Eğitim Koçları' },
      { path: '/tracking', icon: Calendar, label: 'Haftalık Takip' },
      { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
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

    const MENU_TEACHER: SideMenuItem[] = [
      { path: '/teacher-panel', icon: LayoutDashboard, label: 'Öğretmen Paneli' },
      { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
      { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
      { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
      { path: '/coach-whatsapp-settings', icon: MessageCircle, label: 'WhatsApp merkezi' },
      { path: '/user-management', icon: UserCog, label: 'Kullanıcı Yönetimi' },
      { path: '/settings', icon: Settings, label: 'Ayarlar' }
    ];

    const MENU_COACH: SideMenuItem[] = [
      { path: '/coach-dashboard', icon: LayoutDashboard, label: 'Koç Paneli' },
      { path: '/class-live-lessons', icon: Calendar, label: 'Canlı Grup Dersi' },
      { path: '/live-lessons', icon: Radio, label: 'Canlı özel dersler' },
      { path: '/meetings', icon: Video, label: 'Online görüşmeler' },
      { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
      { path: '/teachers', icon: GraduationCap, label: 'Öğretmenler' },
      { path: '/tracking', icon: Calendar, label: 'Haftalık Takip' },
      { path: '/weekly-planner', icon: Calendar, label: 'Haftalık plan' },
      { path: '/book-tracking', icon: BookMarked, label: 'Kitap Takibi' },
      { path: '/exam-tracking', icon: ClipboardList, label: 'Sınav Takibi (Denemelerim)' },
      { path: '/topic-tracking', icon: CheckSquare, label: 'Konu Takibi' },
      { path: '/analytics', icon: BarChart3, label: 'Analiz Paneli' },
      { path: '/ai-coach', icon: Brain, label: 'AI KOÇ' },
      { path: '/coach-whatsapp-settings', icon: MessageCircle, label: 'WhatsApp merkezi' },
      { path: '/webhooks', icon: Webhook, label: 'Webhook Ayarlari' },
      { path: '/written-exam', icon: FileCheck, label: 'Yazılı Takip' }
    ];

    const chunks: SideMenuItem[][] = [];
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
  };

  const menuItems = getMenuItems();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white z-50 transition-all duration-300 flex flex-col ${
        isOpen ? 'w-56' : 'w-16'
      }`}
    >
      {/* Logo Area - Compact */}
      <div className="h-14 flex items-center justify-center border-b border-slate-700 flex-shrink-0">
        {institution.logo ? (
          <img src={institution.logo} alt={institution.name} className="w-8 h-8 rounded-lg object-contain bg-white p-0.5" />
        ) : (
          <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
        )}
        {isOpen && (
          <span className="ml-2 font-bold text-sm whitespace-nowrap overflow-hidden text-ellipsis">{institution.name}</span>
        )}
      </div>

      {/* Menu Items - Scrollable, tek sütun hizalı */}
      <nav className="flex-1 overflow-y-auto py-2 px-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={!isOpen ? item.label : undefined}
              className={`w-full flex items-center gap-2 px-2 py-2.5 rounded-lg mb-0.5 transition-all duration-200 ${
                isActive
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
              {isOpen && (
                <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
