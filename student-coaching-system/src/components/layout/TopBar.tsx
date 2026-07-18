// Türkçe: Üst bar bileşeni - Yetkilendirme ile
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import { useApp } from '../../context/AppContext';
import { cn } from '../../lib/utils';
import { Menu, User, ChevronDown, LogOut, Undo2 } from 'lucide-react';
import { getAuthToken } from '../../lib/session';
import NotificationBell from '../notifications/NotificationBell';
import { useMobileAppShell } from '../../hooks/useMobileAppShell';
import { APP_DISPLAY_NAME, displayInstitutionName } from '../../lib/appBrand';

type TopBarProps = {
  onMenuClick: () => void;
  /** Mobil menü açıkken ana kolon scrim altında; stacking için işaret */
  drawerOpen?: boolean;
  /** Öğrenci mobil kabukta hamburger gizlenir */
  hideMenuButton?: boolean;
};

export default function TopBar({ onMenuClick, drawerOpen = false, hideMenuButton = false }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, effectiveUser, isImpersonating, stopImpersonation, logout } = useAuth();
  const { institution } = useApp();
  const mobileAppShell = useMobileAppShell();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showUserMenu) return;
    const onDoc = (e: Event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [showUserMenu]);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/student-analytics')) return 'Analizlerim';

    const titles: { [key: string]: string } = {
      '/dashboard': 'Ana Panel',
      '/coach-dashboard': 'Koç Paneli',
      '/coach-kilavuz': 'Kullanım kılavuzu',
      '/teacher-panel': 'Öğretmen Paneli',
      '/students': 'Öğrenci Yönetimi',
      '/teachers': 'Öğretmen Yönetimi',
      '/coaches': 'Koçlar',
      '/tracking': 'Haftalık Takip',
      '/book-tracking': 'Kitap Takibi',
      '/edu-panel': 'Ödevlerim ve Animasyonlarım',
      '/edu-derslerim': 'Ödevlerim ve Animasyonlarım',
      '/exam-tracking': 'Sınav Takibi (Denemelerim)',
      '/topics': 'Konu Havuzu',
      '/analytics': 'Analiz Paneli',
      '/reports': 'Raporlar',
      '/ai-coach': 'Yapay Zeka Koçu',
      '/whatsapp': 'WhatsApp · Mesaj gönder',
      '/message-templates': 'WhatsApp · Şablonlar',
      '/coach-whatsapp-settings': 'WhatsApp merkezi',
      '/settings': 'Ayarlar',
      '/class-schedule': 'Canlı derslerim',
      '/class-live-lessons': 'Canlı Grup Dersi',
      '/schedule-planner': 'Ders Programı Planlayıcı',
      '/live-lessons': 'Canlı özel dersler',
      '/canli-ozel-ders': 'Canlı Özel Ders',
      '/canli-ozel-ders/derslerim': 'Özel Derslerim',
      '/canli-ozel-ders/takvim': 'Özel Ders Takvimi',
      '/canli-ozel-ders/ogrenciler': 'Özel Ders Öğrencileri',
      '/canli-ozel-ders/paketler': 'Özel Ders Paketleri',
      '/canli-ozel-ders/odemeler': 'Özel Ders Ödemeleri',
      '/canli-ozel-ders/gecmis': 'Özel Ders Geçmişi',
      '/canli-ozel-ders/raporlar': 'Özel Ders Raporları',
      '/attendance-report': 'Yoklama raporu',
      '/coach-stats': 'Koç İstatistikleri',
      '/teacher-dashboard': 'Öğretmen Paneli',
      '/user-management': 'Kullanıcı Yönetimi',
      '/veli-onay': 'Veli onayı & e-imza',
      '/tahsilat-muhasebe': 'Muhasebe',
      '/muhasebe': 'Muhasebe',
      '/kitap-siparisleri': 'Kitap siparişleri',
      '/ozel-ders-talepleri': 'Özel ders talepleri',
      '/ogretmen-profil-onaylari': 'Öğretmen profil onayları',
      '/profilimi-duzenle': 'Profilimi Düzenle',
      '/login': 'Giriş',
      '/notifications': 'Bildirimler',
      '/my-profile': 'Profilim',
      '/academic-center': 'Akademik Merkez',
      '/weekly-planner': 'Haftalık Plan',
      '/mobile/dersler': 'Ders & Görüşmeler',
      '/mobile/akademik': 'Akademik Takip',
      '/mobile/yonetim': 'Yönetim'
    };
    return titles[path] || APP_DISPLAY_NAME;
  };

  const roleLabels: { [key: string]: string } = {
    super_admin: 'Süper Admin',
    admin: 'Yönetici',
    teacher: 'Öğretmen',
    coach: 'Koç',
    student: 'Öğrenci'
  };

  const handleStopImpersonation = () => {
    const back = stopImpersonation();
    setShowUserMenu(false);
    if (back && !back.startsWith('/login')) {
      navigate(back);
      return;
    }
    const role = user?.role;
    if (role === 'coach') navigate('/coach-dashboard');
    else if (role === 'teacher') navigate('/teacher-panel');
    else navigate('/dashboard');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    setShowUserMenu(false);
  };

  return (
    <header
      className={cn(
        'z-30 flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/92 sm:gap-4 sm:px-5 lg:flex-shrink-0 lg:px-6 pt-safe',
        mobileAppShell ? 'min-h-12 py-1.5' : 'min-h-14 py-2 sm:py-0 lg:min-h-16',
        'max-lg:sticky max-lg:top-0',
        drawerOpen && 'max-lg:z-0 max-lg:shadow-none'
      )}
    >
      {/* Left Side */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        {!hideMenuButton ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="touch-manipulation rounded-lg p-2.5 hover:bg-gray-100 active:bg-gray-200 lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Menüyü aç veya kapat"
          >
            <Menu className="h-5 w-5 shrink-0 text-gray-600" />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight text-slate-800 sm:text-lg lg:text-xl">
            {getPageTitle()}
          </h1>
          {!mobileAppShell ? (
            <p className="truncate text-xs text-gray-500 sm:text-sm">
              {displayInstitutionName(institution?.name)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Right Side */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-3 lg:gap-4">
        {isImpersonating && user && effectiveUser && (
          <div className="flex max-w-[min(100%,20rem)] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 sm:max-w-[280px] sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
            <span className="min-w-0 truncate" title={effectiveUser?.email}>
              <strong>{effectiveUser?.name}</strong>
              <span className="hidden sm:inline"> olarak görüntüleniyor</span>
            </span>
            <button
              type="button"
              onClick={handleStopImpersonation}
              className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 font-semibold hover:bg-amber-200 sm:gap-1 sm:px-2"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">Geri dön</span>
            </button>
          </div>
        )}

        {user && getAuthToken() ? <NotificationBell /> : null}

        {/* Kullanıcı Menüsü */}
        {user && (
          <div className="relative" ref={userMenuRef}>
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
              <div className="absolute right-0 z-[210] mt-2 max-h-[min(70vh,22rem)] w-[min(calc(100vw-1.5rem),14rem)] overflow-y-auto rounded-xl border border-gray-100 bg-white py-2 shadow-lg sm:w-56">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-slate-700">{effectiveUser?.name || user.name}</p>
                  <p className="text-xs text-gray-500">{effectiveUser?.email || user.email}</p>
                </div>

                {isImpersonating && (
                  <button
                    type="button"
                    onClick={handleStopImpersonation}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
                  >
                    <Undo2 className="w-4 h-4" />
                    Kendi hesabıma dön
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    navigate('/my-profile');
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-gray-50"
                >
                  <User className="w-4 h-4" />
                  Profilimi düzenle
                </button>

                <button
                  type="button"
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
