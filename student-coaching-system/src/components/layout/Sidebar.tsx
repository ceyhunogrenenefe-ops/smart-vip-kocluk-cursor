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
  Settings2
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { institution } = useApp();

  // Compact menü öğeleri - tüm roller için tek sütun
  const getMenuItems = () => {
    switch (user?.role) {
      case 'super_admin':
        return [
          { path: '/dashboard', icon: LayoutDashboard, label: 'Ana Panel' },
          { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
          { path: '/coaches', icon: Users, label: 'Eğitim Koçları' },
          { path: '/tracking', icon: Calendar, label: 'Haftalık Takip' },
          { path: '/topics', icon: BookOpen, label: 'Konu Havuzu' },
          { path: '/topic-tracking', icon: CheckSquare, label: 'Konu Takibi' },
          { path: '/exam-tracking', icon: ClipboardList, label: 'Deneme Sınavları' },
          { path: '/book-tracking', icon: BookMarked, label: 'Kitap Takibi' },
          { path: '/written-exam', icon: FileCheck, label: 'Yazılı Takip' },
          { path: '/pdf-import', icon: Upload, label: 'PDF İçe Aktar' },
          { path: '/analytics', icon: BarChart3, label: 'Analiz Paneli' },
          { path: '/ai-coach', icon: Brain, label: 'AI Koç' },
          { path: '/webhooks', icon: Webhook, label: 'Webhook Ayarları' },
          { path: '/whatsapp', icon: MessageCircle, label: 'WhatsApp Rapor' },
          { path: '/subscription', icon: CreditCard, label: 'Abonelik' },
          { path: '/user-management', icon: UserCog, label: 'Kullanıcı Yönetimi' },
          { path: '/system-management', icon: Server, label: 'Sistem Yönetimi' },
          { path: '/settings', icon: Settings, label: 'Ayarlar' },
        ];
      case 'admin':
        return [
          { path: '/dashboard', icon: LayoutDashboard, label: 'Ana Panel' },
          { path: '/students', icon: GraduationCap, label: 'Öğrenciler' },
          { path: '/coaches', icon: Users, label: 'Eğitim Koçları' },
          { path: '/tracking', icon: Calendar, label: 'Haftalık Takip' },
          { path: '/topics', icon: BookOpen, label: 'Konu Havuzu' },
          { path: '/topic-tracking', icon: CheckSquare, label: 'Konu Takibi' },
          { path: '/exam-tracking', icon: ClipboardList, label: 'Deneme Sınavları' },
          { path: '/book-tracking', icon: BookMarked, label: 'Kitap Takibi' },
          { path: '/written-exam', icon: FileCheck, label: 'Yazılı Takip' },
          { path: '/pdf-import', icon: Upload, label: 'PDF İçe Aktar' },
          { path: '/analytics', icon: BarChart3, label: 'Analiz Paneli' },
          { path: '/ai-coach', icon: Brain, label: 'AI Koç' },
          { path: '/webhooks', icon: Webhook, label: 'Webhook Ayarları' },
          { path: '/whatsapp', icon: MessageCircle, label: 'WhatsApp Rapor' },
          { path: '/settings', icon: Settings, label: 'Ayarlar' },
        ];
      case 'coach':
        return [
          { path: '/coach-dashboard', icon: LayoutDashboard, label: 'Koç Paneli' },
          { path: '/tracking', icon: Calendar, label: 'Haftalık Takip' },
          { path: '/book-tracking', icon: BookMarked, label: 'Kitap Takibi' },
          { path: '/written-exam', icon: FileCheck, label: 'Yazılı Takip' },
          { path: '/analytics', icon: BarChart3, label: 'Analiz Paneli' },
          { path: '/coach-reports', icon: ClipboardList, label: 'Deneme Raporları' },
        ];
      case 'student':
        return [
          { path: '/student-dashboard', icon: LayoutDashboard, label: 'Öğrenci Paneli' },
          { path: '/student-reports', icon: BookMarked, label: 'Benim Raporlarım' },
          { path: '/student-analytics', icon: BarChart3, label: 'Analizlerim' },
        ];
      default:
        return [];
    }
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
