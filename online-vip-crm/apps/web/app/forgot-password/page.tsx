import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Şifremi unuttum',
};

export default function ForgotPasswordPage() {
  return (
    <div className="login-atmosphere flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-fade-up rounded-3xl border border-white/10 bg-white/10 p-8 text-center shadow-soft backdrop-blur-md">
        <p className="font-display text-3xl font-semibold text-white">
          Online VIP CRM
        </p>
        <h1 className="mt-6 font-display text-2xl font-semibold text-white">
          Şifre sıfırlama
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Şifre sıfırlama akışı bir sonraki fazda eklenecek. Şimdilik yöneticinizle
          iletişime geçin.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
        >
          Girişe dön
        </Link>
      </div>
    </div>
  );
}
