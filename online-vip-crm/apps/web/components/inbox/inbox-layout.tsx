'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { contactDisplayName, cn, formatRelativeTr } from '@/lib/utils';
import { EmptyState, PageHeader, StatusBadge } from '@/components/ui/page';

const CHANNELS = [
  { id: 'all', label: 'Tümü' },
  { id: 'WHATSAPP', label: 'WhatsApp' },
  { id: 'INSTAGRAM', label: 'Instagram' },
  { id: 'MESSENGER', label: 'Messenger' },
  { id: 'SMS', label: 'SMS' },
  { id: 'EMAIL', label: 'E-posta' },
] as const;

export function InboxLayout({
  selectedId,
  detail,
}: {
  selectedId?: string;
  detail?: React.ReactNode;
}) {
  const [channel, setChannel] = useState<string>('all');
  const [q, setQ] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['inbox', 'conversations', channel],
    queryFn: () =>
      api.conversations({
        channel: channel === 'all' ? undefined : channel,
        take: 50,
      }),
  });

  const items = useMemo(() => {
    const list = data?.items ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => {
      const name = contactDisplayName(c.contact).toLowerCase();
      const preview = (c.lastMessagePreview || '').toLowerCase();
      return name.includes(needle) || preview.includes(needle);
    });
  }, [data?.items, q]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Gelen Kutusu"
        description="Tüm kanallardaki konuşmalar"
      />

      <div className="grid h-[calc(100vh-10.5rem)] min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft lg:grid-cols-[220px_minmax(280px,360px)_1fr]">
        {/* Filters */}
        <aside className="hidden border-r border-slate-100 p-4 lg:block">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Filter className="h-3.5 w-3.5" />
            Kanallar
          </div>
          <div className="space-y-1">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                className={cn(
                  'flex w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition',
                  channel === c.id
                    ? 'bg-brand-secondary/10 text-brand-secondary'
                    : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </aside>

        {/* List */}
        <section
          className={cn(
            'flex min-h-0 flex-col border-r border-slate-100',
            selectedId ? 'hidden lg:flex' : 'flex',
          )}
        >
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Konuşma ara…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-secondary/40 focus:ring-2 focus:ring-brand-secondary/15"
              />
            </div>
            <div className="mt-2 flex gap-1 overflow-x-auto lg:hidden">
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannel(c.id)}
                  className={cn(
                    'shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium',
                    channel === c.id
                      ? 'bg-brand-secondary text-white'
                      : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl skeleton" />
                ))}
              </div>
            ) : error ? (
              <div className="p-4 text-sm text-red-600">
                Konuşmalar yüklenemedi.
              </div>
            ) : items.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Konuşma yok"
                  description="Seçili filtrede kayıt bulunamadı."
                />
              </div>
            ) : (
              items.map((c) => {
                const active = selectedId === c.id;
                return (
                  <Link
                    key={c.id}
                    href={`/inbox/${c.id}`}
                    className={cn(
                      'block border-b border-slate-50 px-4 py-3 transition hover:bg-slate-50',
                      active && 'bg-brand-secondary/5',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {contactDisplayName(c.contact)}
                      </p>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatRelativeTr(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {c.provider || c.channel ? (
                        <StatusBadge tone="info">
                          {c.provider || c.channel}
                        </StatusBadge>
                      ) : null}
                      {(c.unreadCount || 0) > 0 ? (
                        <StatusBadge tone="danger">{c.unreadCount}</StatusBadge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {c.lastMessagePreview || 'Mesaj önizlemesi yok'}
                    </p>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        {/* Detail / placeholder */}
        <section
          className={cn(
            'min-h-0 bg-slate-50/50',
            selectedId ? 'flex' : 'hidden lg:flex',
          )}
        >
          {detail || (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <p className="font-medium text-slate-700">
                  Bir konuşma seçin
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Soldaki listeden detayı görüntüleyin.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
