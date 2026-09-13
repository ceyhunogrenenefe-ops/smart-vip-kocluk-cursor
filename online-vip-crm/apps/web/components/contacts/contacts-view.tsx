'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { contactDisplayName, formatRelativeTr } from '@/lib/utils';
import { EmptyState, PageHeader } from '@/components/ui/page';

export function ContactsView() {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['contacts', submitted],
    queryFn: () => api.contacts({ q: submitted || undefined, take: 50 }),
  });

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Kişiler"
        description="Veliler, adaylar ve diğer iletişim kayıtları"
      />

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="İsim, telefon veya e-posta ara…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-secondary/40 focus:ring-2 focus:ring-brand-secondary/15"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-brand-secondary px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          Ara
        </button>
      </form>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Kişiler yüklenemedi.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg skeleton" />
            ))}
          </div>
        ) : !data?.items?.length ? (
          <div className="p-4">
            <EmptyState title="Kişi bulunamadı" />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Ad</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">
                  Telefon
                </th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">
                  E-posta
                </th>
                <th className="px-4 py-3 font-semibold">Güncelleme</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-50 hover:bg-slate-50/70"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="font-medium text-brand-secondary hover:underline"
                    >
                      {contactDisplayName(c)}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                    {c.primaryPhone || '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                    {c.primaryEmail || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {formatRelativeTr(c.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data ? (
        <p className="mt-3 text-xs text-slate-400">
          Toplam {data.total} kayıt
        </p>
      ) : null}
    </div>
  );
}
