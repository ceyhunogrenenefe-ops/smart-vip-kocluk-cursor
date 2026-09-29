'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  MessageCircle,
  MessagesSquare,
  Target,
} from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page';

const CARDS = [
  {
    key: 'messagesToday' as const,
    label: 'Bugünkü mesajlar',
    icon: MessagesSquare,
    accent: 'from-brand-primary/15 to-brand-primary/5 text-brand-primary',
  },
  {
    key: 'unreadConversations' as const,
    label: 'Okunmamış konuşmalar',
    icon: MessageCircle,
    accent: 'from-brand-secondary/15 to-brand-secondary/5 text-brand-secondary',
  },
  {
    key: 'openLeads' as const,
    label: 'Açık leadler',
    icon: Target,
    accent: 'from-brand-accent/15 to-brand-accent/5 text-sky-600',
  },
  {
    key: 'overdueTasks' as const,
    label: 'Gecikmiş görevler',
    icon: AlertTriangle,
    accent: 'from-amber-500/15 to-amber-500/5 text-amber-600',
  },
];

export function DashboardView() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.dashboardSummary(),
  });

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Dashboard"
        description="Kurumunuzun günlük iletişim ve satış özeti"
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {isFetching ? 'Yenileniyor…' : 'Yenile'}
          </button>
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Özet yüklenemedi. API bağlantısını ve yetkilerinizi kontrol edin.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const value = data?.[card.key];
          return (
            <div
              key={card.key}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {card.label}
                  </p>
                  {isLoading ? (
                    <div className="mt-3 h-8 w-16 rounded-md skeleton" />
                  ) : (
                    <p className="mt-2 font-display text-3xl font-semibold text-brand-text">
                      {value ?? '—'}
                    </p>
                  )}
                </div>
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {data?.asOf ? (
        <p className="mt-4 text-xs text-slate-400">
          Son güncelleme:{' '}
          {new Date(data.asOf).toLocaleString('tr-TR', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </p>
      ) : null}
    </div>
  );
}
