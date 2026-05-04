// Türkçe: Üst bar bileşeni - Yetkilendirme ile
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { Menu, Bell, User, ChevronDown, LogOut, Undo2 } from 'lucide-react';

export default function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, effectiveUser, isImpersonating, stopImpersonation, logout } = useAuth();
  const { institution } = useApp();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const getPageTitle = () => {
    const path = location.pathname;
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
      '/student-dashboard': 'Öğrenci Paneli',
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
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
      {/* Left Side */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>

        <div>
          <h1 className="text-xl font-bold text-slate-800">{getPageTitle()}</h1>
          <p className="text-sm text-gray-500">{institution.name}</p>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-4">
        {isImpersonating && user && effectiveUser && (
          <div className="hidden md:flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <span>{`[${effectiveUser.role}] olarak görüntüleniyor`}</span>
            <button
              onClick={stopImpersonation}
              className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-medium hover:bg-amber-200"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Süper Admin'e Dön
            </button>
          </div>
        )}

        {/* Bildirimler */}
        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5 text-gray-600" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* Kullanıcı Menüsü */}
        {user && (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {user.name.charAt(0)}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-slate-700">{effectiveUser?.name || user.name}</p>
                <p className="text-xs text-gray-500">{roleLabels[effectiveUser?.role || user.role]}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {/* Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
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
                    Süper Admin'e Dön
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
