import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';

export const CRM_LOGIN_PATH = '/crm/giris';

/** CRM’e erişebilen roller (App.tsx /crm rotasıyla aynı) */
const CRM_ROLES = ['super_admin', 'admin', 'crm_agent'];

/** Yalnız /crm altındaki dönüş adreslerine izin ver (açık yönlendirme olmasın). */
function safeCrmNext(raw: string | null): string {
  const v = String(raw || '').trim();
  if (v.startsWith('/crm') && !v.startsWith('//') && !v.startsWith(CRM_LOGIN_PATH)) return v;
  return '/crm';
}

/**
 * CRM’e özel giriş: koçluk sistemindeki e-posta ve şifreyle girilir,
 * giriş sonrası her zaman CRM’e döner (koçluk paneline düşmez).
 */
export default function CrmLoginPage() {
  const { user, effectiveUser, login, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeCrmNext(params.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const tags = userRoleTags(effectiveUser);
  const hasCrmAccess = tags.some((t) => CRM_ROLES.includes(t));

  useEffect(() => {
    if (user && hasCrmAccess) navigate(next, { replace: true });
  }, [user, hasCrmAccess, next, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (!result.success) setError(result.message);
    } catch {
      setError('Giriş sırasında beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const noAccess = Boolean(user) && !hasCrmAccess;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-sky-50 to-emerald-50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-700 to-teal-600 px-8 py-7 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100">Online VIP Dershane</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold">CRM Girişi</h1>
          <p className="mt-1 text-sm text-emerald-50">Koçluk sistemindeki e-posta ve şifrenizle giriş yapın.</p>
        </div>

        {noAccess ? (
          <div className="space-y-4 p-8">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Bu hesabın CRM yetkisi yok</p>
                <p className="mt-1">
                  {effectiveUser?.email} ile giriş yaptınız. CRM erişimi için yöneticinizden temsilci yetkisi isteyin.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => logout()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Başka hesapla gir
              </button>
              <Link to="/" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Koçluk paneline git
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 p-8">
            {error ? (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-700">
                <Mail className="h-4 w-4" />
                E-posta
              </span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@email.com"
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="crm-password" className="flex items-center gap-1 text-sm font-medium text-slate-700">
                  <Lock className="h-4 w-4" />
                  Şifre
                </label>
                <Link to="/forgot-password" className="text-xs font-medium text-emerald-700 hover:underline">
                  Şifremi unuttum
                </Link>
              </div>
              <div className="relative">
                <input
                  id="crm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifrenizi girin"
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-12 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogIn className="h-5 w-5" />
              {loading ? 'Giriş yapılıyor…' : 'CRM’e giriş yap'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
