import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { fetchPublicPost } from '../lib/session';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetchPublicPost('/api/auth-forgot-password', { email: email.trim() });
      const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        if (j.error === 'email_not_configured') {
          setError(
            j.message ||
              'E-posta servisi yapılandırılmamış. Kurum yöneticinizle iletişime geçin.'
          );
        } else if (j.error === 'email_send_failed') {
          setError(j.message || 'E-posta gönderilemedi. Lütfen tekrar deneyin.');
        } else {
          setError('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
        }
        return;
      }
      setSuccess(
        j.message ||
          'Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı birkaç dakika içinde gönderilir.'
      );
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-8 text-center">
            <div className="w-16 h-16 bg-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Şifremi unuttum</h1>
            <p className="text-slate-300 mt-1 text-sm">Kayıtlı e-postanıza sıfırlama bağlantısı gönderilir</p>
          </div>

          <form onSubmit={(ev) => void handleSubmit(ev)} className="p-8 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-red-700 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3 text-green-700 text-sm">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <p>{success}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-1" />
                E-posta
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@email.com"
                required
                disabled={Boolean(success)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || Boolean(success)}
              className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 disabled:opacity-50"
            >
              {loading ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
            </button>

            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-sm text-slate-600 hover:text-red-600"
            >
              <ArrowLeft className="w-4 h-4" />
              Giriş sayfasına dön
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
