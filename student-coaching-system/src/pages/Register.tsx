// Türkçe: Kayıt Sayfası - KAYIT KAPATILDI
import React from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Lock, Mail, Shield, Users, Phone, AlertTriangle, ArrowLeft, CheckCircle } from 'lucide-react';

export default function Register() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-8 text-center">
            <div className="w-16 h-16 bg-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Smart VIP Koçluk</h1>
            <p className="text-slate-300 mt-1">Öğrenci Takip Sistemi</p>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Disabled Notice */}
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 text-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-10 h-10 text-red-500" />
              </div>

              <h2 className="text-2xl font-bold text-slate-800 mb-4">
                Kayıt Sistemi Kapatıldı
              </h2>

              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                Kendi kendinize kayıt olma özelliği güvenlik nedeniyle kapatılmıştır.
                Hesap oluşturmak için kurumunuzun yöneticisiyle iletişime geçin.
              </p>

              {/* Features that admin creates */}
              <div className="bg-white rounded-xl p-6 mb-8 text-left">
                <h3 className="font-semibold text-slate-800 mb-4 text-center">
                  Yönetici Tarafından Sağlanır:
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>Kişisel Giriş Bilgileri</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>Rol Ataması</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>Abonelik Süresi</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>Öğrenci/Koç Ataması</span>
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div className="bg-blue-50 rounded-xl p-6 mb-8 text-left">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  Nasıl Hesap Alabilirim?
                </h3>
                <ol className="space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                    <span>Kurumunuzun yöneticisine başvurun</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                    <span>Bilgilerinizi (ad, e-posta, telefon) verin</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                    <span>E-posta ve geçici şifre alın</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                    <span>Sisteme giriş yapın ve şifrenizi değiştirin</span>
                  </li>
                </ol>
              </div>

              {/* Contact Info */}
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
                <p className="font-medium text-slate-700 mb-2">Kurumunuzun yöneticisine ulaşamıyor musunuz?</p>
                <p>Sistemi kullanan kurumunuzun admin panelinden hesap oluşturulabilir.</p>
              </div>
            </div>

            {/* Back to Login */}
            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Giriş Sayfasına Dön
              </Link>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 text-center">
            <p className="text-sm text-gray-500">
              Güvenlik nedeniyle kayıt sistemi yöneticiler tarafından kontrol edilmektedir.
            </p>
          </div>
        </div>

        <p className="text-center text-slate-400 text-sm mt-6">
          © 2024 Smart VIP Koçluk Sistemi
        </p>
      </div>
    </div>
  );
}
