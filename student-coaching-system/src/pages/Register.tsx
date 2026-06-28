// Türkçe: Kayıt ol sayfası (yönetici onaylı)
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Lock, Mail, Phone, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { fetchPublicPost } from '../lib/session';
import { db } from '../lib/database';

type InstitutionOption = { id: string; name: string };

const REGISTRATION_CLASS_OPTIONS = [
  { value: '3', label: '3. Sınıf' },
  { value: '4', label: '4. Sınıf' },
  { value: '5', label: '5. Sınıf' },
  { value: '6', label: '6. Sınıf' },
  { value: '7', label: '7. Sınıf' },
  { value: 'LGS', label: 'LGS (8. Sınıf)' },
  { value: '9', label: '9. Sınıf' },
  { value: '10', label: '10. Sınıf' },
  { value: '11', label: '11. Sınıf' },
  { value: 'YKS', label: 'YKS' },
  { value: 'YOS', label: 'YÖS' },
  { value: 'Diğer', label: 'Diğer' }
] as const;

const ROLE_OPTIONS = [
  { value: 'student', label: 'Öğrenci' },
  { value: 'coach', label: 'Koç' },
  { value: 'teacher', label: 'Öğretmen' },
  { value: 'admin', label: 'Yönetici' }
] as const;

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    tcIdentityNo: '',
    email: '',
    phone: '',
    classLevel: '',
    parentName: '',
    parentPhone: '',
    birthDate: '',
    password: '',
    confirmPassword: '',
    role: 'student',
    institutionId: ''
  });
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await db.getInstitutions();
        if (cancelled) return;
        setInstitutions((list || []).map((i) => ({ id: String(i.id), name: i.name })));
      } catch {
        if (!cancelled) setInstitutions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const tc = formData.tcIdentityNo.replace(/\D/g, '');
    if (tc.length !== 11) {
      setError('TC kimlik numarası 11 haneli olmalıdır.');
      return;
    }
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
      const res = await fetchPublicPost('/api/auth-register', {
        first_name: formData.firstName,
        last_name: formData.lastName,
        tc_identity_no: tc,
        email: formData.email,
        phone: formData.phone,
        class_level: formData.classLevel || null,
        parent_name: formData.parentName || null,
        parent_phone: formData.parentPhone || null,
        birth_date: formData.birthDate || null,
        password: formData.password,
        role: formData.role,
        institution_id: formData.institutionId || null
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const serverError = String(payload?.error || '').trim();
        if (serverError === 'tc_11_hane_olmali') throw new Error('TC kimlik numarası 11 haneli olmalıdır.');
        if (serverError === 'gecersiz_email') throw new Error('Geçerli bir e-posta adresi girin.');
        if (serverError === 'gecersiz_telefon_e164') throw new Error('Telefon numarasını geçerli formatta girin. (05xx…, +90… veya yurt dışı +ülke kodu)');
        if (serverError === 'bu_email_icin_bekleyen_kayit_var') throw new Error('Bu e-posta için bekleyen bir kayıt zaten var.');
        if (serverError === 'bu_tc_icin_bekleyen_kayit_var') throw new Error('Bu TC için bekleyen bir kayıt zaten var.');
        if (serverError === 'email_zaten_kullanimda') throw new Error('Bu e-posta zaten kullanımda.');
        if (serverError === 'too_many_requests') throw new Error('Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.');
        throw new Error(String(payload?.hint || payload?.error || 'Kayıt sırasında bir hata oluştu.'));
      }

      setSuccess('Kaydınız alındı. Yönetici onayından sonra hesabınız aktif olacaktır.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.');
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
            <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl">Online VIP Ders ve Koçluk</h1>
            <p className="text-slate-300 mt-1">Öğrenci Takip Sistemi</p>
          </div>

          {/* Content */}
          <div className="p-8">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-green-800 text-sm flex items-start gap-2">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Yönetici Onaylı Kayıt</p>
                <p>Formu gönderdikten sonra kayıt talebiniz kullanıcı yönetimi ekranında onaya düşer.</p>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ad</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Adınız"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Soyad</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Soyadınız"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">TC Kimlik No</label>
                <input
                  type="text"
                  required
                  maxLength={11}
                  value={formData.tcIdentityNo}
                  onChange={(e) => setFormData(prev => ({ ...prev, tcIdentityNo: e.target.value.replace(/\D/g, '') }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="11 haneli TC kimlik numarası"
                />
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
                  placeholder="05xx… veya +49 151…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf</label>
                <select
                  required
                  value={formData.classLevel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, classLevel: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Sınıf seçin</option>
                  {REGISTRATION_CLASS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Şube bilgisi kurum tarafından atanır.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Veli Adı</label>
                  <input
                    type="text"
                    value={formData.parentName}
                    onChange={(e) => setFormData(prev => ({ ...prev, parentName: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Veli adı soyadı"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Veli Telefon</label>
                  <input
                    type="tel"
                    value={formData.parentPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, parentPhone: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="05xx… veya +49 151…"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Doğum Tarihi</label>
                  <input
                    type="date"
                    value={formData.birthDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, birthDate: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kurum (opsiyonel)</label>
                <select
                  value={formData.institutionId}
                  onChange={(e) => setFormData(prev => ({ ...prev, institutionId: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Kurum seçilmedi</option>
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
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
                {loading ? 'Kayıt gönderiliyor...' : 'Kayıt Talebi Gönder'}
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
              Hesabınız yönetici tarafından onaylandığında aktif olur ve giriş yapabilirsiniz.
            </p>
          </div>
        </div>

        <p className="text-center text-slate-400 text-sm mt-6">
          © 2024 Online VIP Ders ve Koçluk
        </p>
      </div>
    </div>
  );
}
