// Türkçe: Ücretsiz deneme kayıt sayfası
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Lock, Mail, Phone, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    setLoading(true);
    try {
      const key = 'coaching_trial_users';
      const raw = localStorage.getItem(key);
      const users = raw ? JSON.parse(raw) : [];
      const exists = users.some((u: { email: string }) => u.email?.toLowerCase() === formData.email.toLowerCase());
      if (exists) {
        setError('Bu e-posta ile daha önce kayıt oluşturulmuş.');
        setLoading(false);
        return;
      }

      const newUser = {
        id: `trial-${Date.now()}`,
        name: formData.name,
        email: formData.email.toLowerCase().trim(),
        phone: formData.phone,
        password: formData.password,
        role: 'admin',
        package: 'trial',
        createdAt: new Date().toISOString()
      };

      users.push(newUser);
      localStorage.setItem(key, JSON.stringify(users));
      setSuccess('Deneme hesabınız oluşturuldu! Giriş sayfasına yönlendiriliyorsunuz...');
      setTimeout(() => navigate('/login'), 1200);
    } catch {
      setError('Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-xl">
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
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-green-800 text-sm flex items-start gap-2">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">30 Gün Ücretsiz Deneme</p>
                <p>Yönetici hesabınız oluşturulur ve tüm panelleri test edebilirsiniz.</p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-red-700 text-sm flex items-start gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-green-700 text-sm">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Adınız Soyadınız"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail className="w-4 h-4 inline mr-1" />
                  E-posta
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="ornek@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Telefon
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="05xx xxx xx xx"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Lock className="w-4 h-4 inline mr-1" />
                  Şifre
                </label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="En az 6 karakter"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Şifre Tekrar</label>
                <input
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Şifrenizi tekrar girin"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Hesap oluşturuluyor...' : 'Ücretsiz Deneme Hesabı Oluştur'}
              </button>
            </form>

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
              Deneme hesabı yerel olarak oluşturulur. Üretimde kalıcı hesaplar admin panelinden yönetilmelidir.
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
