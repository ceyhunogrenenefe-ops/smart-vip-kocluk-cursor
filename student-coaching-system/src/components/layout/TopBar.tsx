// Türkçe: Üst bar bileşeni - Yetkilendirme ile
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import { useApp } from '../../context/AppContext';
import { cn } from '../../lib/utils';
import { Menu, Bell, User, ChevronDown, LogOut, Undo2 } from 'lucide-react';

type TopBarProps = {
  onMenuClick: () => void;
  /** Mobil menü açıkken ana kolon scrim altında; stacking için işaret */
  drawerOpen?: boolean;
};

export default function TopBar({ onMenuClick, drawerOpen = false }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, effectiveUser, isImpersonating, stopImpersonation, logout } = useAuth();
  const { institution } = useApp();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/student-dashboard')) return 'Öğrenci Paneli';
    if (path.startsWith('/student-analytics')) return 'Analizlerim';

    const titles: { [key: string]: string } = {
      '/dashboard': 'Ana Panel',
      '/coach-dashboard': 'Koç Paneli',
      '/students': 'Öğrenci Yönetimi',
      '/teachers': 'Öğretmen Yönetimi',
      '/tracking': 'Haftalık Takip',
      '/book-tracking': 'Kitap Takibi',
      '/exam-tracking': 'Sınav Takibi (Denemelerim)',
      '/topics': 'Konu Havuzu',
      '/analytics': 'Analiz Paneli',
      '/reports': 'Raporlar',
      '/ai-coach': 'Yapay Zeka Koçu',
      '/whatsapp': 'WhatsApp Panel',
      '/message-templates': 'WhatsApp şablonları',
      '/coach-whatsapp-settings': 'WhatsApp merkezi',
      '/settings': 'Ayarlar',
      '/class-schedule': 'Canlı derslerim',
      '/teacher-dashboard': 'Öğretmen Paneli',
      '/user-management': 'Kullanıcı Yönetimi',
      '/login': 'Giriş'
    };
    return titles[path] || 'Öğrenci Koçluk Sistemi';
  };

  const roleLabels: { [key: string]: string } = {
    super_admin: 'Süper Admin',
    admin: 'Yönetici',
    teacher: 'Öğretmen',
    coach: 'Koç',
    student: 'Öğrenci'
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    setShowUserMenu(false);
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/92 sm:gap-4 sm:px-5 sm:py-0 lg:min-h-16 lg:px-6 pt-safe',
        drawerOpen && 'max-lg:z-0 max-lg:shadow-none'
      )}
    >
      {/* Left Side */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="touch-manipulation rounded-lg p-2.5 hover:bg-gray-100 active:bg-gray-200 lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Menüyü aç veya kapat"
        >
          <Menu className="h-5 w-5 shrink-0 text-gray-600" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight text-slate-800 sm:text-lg lg:text-xl">
            {getPageTitle()}
          </h1>
          <p className="truncate text-xs text-gray-500 sm:text-sm">{institution.name}</p>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-3 lg:gap-4">
        {isImpersonating && user && effectiveUser && (
          <div className="hidden md:flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <span className="max-w-[220px] truncate" title={effectiveUser?.email}>
              <strong>{effectiveUser?.name}</strong> olarak görüntüleniyor
            </span>
            <button
              type="button"
              onClick={stopImpersonation}
              className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-medium hover:bg-amber-200"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Kendi hesabıma dön
            </button>
          </div>
        )}

        {/* Bildirimler */}
        <button
          type="button"
          className="relative touch-manipulation rounded-lg p-2.5 transition-colors hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Bildirimler"
        >
          <Bell className="h-5 w-5 text-gray-600" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* Kullanıcı Menüsü */}
        {user && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex touch-manipulation items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100 sm:gap-3 sm:px-3 sm:py-2 min-h-[44px]"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {user.name.charAt(0)}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-slate-700">{effectiveUser?.name || user.name}</p>
                <p className="text-xs text-gray-500">
                  {userRoleTags(effectiveUser ?? { role: user.role }).map((r) => roleLabels[r] ?? r).join(' · ')}
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {/* Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 z-50 mt-2 max-h-[min(70vh,22rem)] w-[min(calc(100vw-1.5rem),14rem)] overflow-y-auto rounded-xl border border-gray-100 bg-white py-2 shadow-lg sm:w-56">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-slate-700">{effectiveUser?.name || user.name}</p>
                  <p className="text-xs text-gray-500">{effectiveUser?.email || user.email}</p>
                </div>

                {isImpersonating && (
                  <button
                    onClick={() => {
                      stopImpersonation();
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
                  >
                    <Undo2 className="w-4 h-4" />
                    Kendi hesabıma dön
                  </button>
                )}

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4" />
                  Çıkış Yap
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
