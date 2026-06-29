import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { fetchPublicPost } from '../lib/session';
import { DEFAULT_BRAND_LOGO } from '../lib/brandAssets';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token')?.trim() || '', [params]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Geçersiz bağlantı. Lütfen e-postadaki linki kullanın veya yeniden talep edin.');
      return;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      return;
    }
    if (password !== confirm) {
      setError('Şifreler eşleşmiyor.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetchPublicPost('/api/auth-reset-password', { token, password });
      const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        setError(
          j.message ||
            (j.error === 'expired_token'
              ? 'Bağlantının süresi dolmuş.'
              : 'Şifre güncellenemedi. Yeni bağlantı isteyin.')
        );
        return;
      }
      setSuccess(j.message || 'Şifreniz güncellendi.');
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="text-slate-700">Şifre sıfırlama bağlantısı geçersiz veya eksik.</p>
          <Link to="/forgot-password" className="text-red-600 font-medium hover:underline">
            Yeni bağlantı iste
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-8 text-center">
            <img
              src={DEFAULT_BRAND_LOGO}
              alt="Online VIP Dershane"
              className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-white object-contain p-1"
            />
            <h1 className="text-2xl font-bold text-white">Yeni şifre belirle</h1>
          </div>

          <form onSubmit={(ev) => void handleSubmit(ev)} className="p-8 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm flex gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm space-y-3">
                <div className="flex gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  <p>{success}</p>
                </div>
                <Link to="/login" className="block text-center font-medium text-red-600 hover:underline">
                  Giriş yap
                </Link>
              </div>
            )}

            {!success && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Lock className="w-4 h-4 inline mr-1" />
                    Yeni şifre
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                      required
                      className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Yeni şifre tekrar</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={6}
                    required
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 disabled:opacity-50"
                >
                  {loading ? 'Kaydediliyor…' : 'Şifreyi güncelle'}
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
