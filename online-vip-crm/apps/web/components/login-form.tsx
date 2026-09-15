'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';

const schema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
  password: z.string().min(1, 'Şifre gerekli'),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    const data = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    if (!res.ok) {
      setServerError(data?.message || 'Giriş başarısız');
      return;
    }
    router.replace(next.startsWith('/') ? next : '/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-slate-200"
        >
          E-posta
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm text-white outline-none ring-brand-accent/40 placeholder:text-slate-400 focus:border-brand-accent/50 focus:ring-2"
          placeholder="ornek@onlinevip.com"
          {...register('email')}
        />
        {errors.email ? (
          <p className="mt-1 text-xs text-red-300">{errors.email.message}</p>
        ) : null}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-200"
          >
            Şifre
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-sky-300 hover:text-sky-200"
          >
            Şifremi unuttum
          </Link>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm text-white outline-none ring-brand-accent/40 placeholder:text-slate-400 focus:border-brand-accent/50 focus:ring-2"
          placeholder="••••••••"
          {...register('password')}
        />
        {errors.password ? (
          <p className="mt-1 text-xs text-red-300">{errors.password.message}</p>
        ) : null}
      </div>

      {serverError ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-100">
          {serverError}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl bg-gradient-to-r from-brand-primary to-[#c91d24] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-primary/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
      </button>
    </form>
  );
}
