import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/login-form';

export const metadata: Metadata = {
  title: 'Giriş',
};

export default function LoginPage() {
  return (
    <div className="login-atmosphere relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="relative z-10 w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center">
          <p className="font-display text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Online VIP CRM
          </p>
          <p className="mt-3 text-balance text-sm text-slate-300 md:text-base">
            Kurumunuzun tüm iletişimini tek panelden yönetin.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/8 p-6 shadow-soft backdrop-blur-md md:p-8">
          <h1 className="mb-6 font-display text-2xl font-semibold text-white">
            Hesabınıza giriş yapın
          </h1>
          <Suspense fallback={<div className="h-48 skeleton rounded-xl" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
