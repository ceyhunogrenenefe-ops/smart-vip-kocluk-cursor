'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { contactDisplayName, cn } from '@/lib/utils';
import { EmptyState, PageHeader, StatusBadge } from '@/components/ui/page';
import type { Lead } from '@/lib/types';

type ViewMode = 'list' | 'kanban';

function stageLabel(lead: Lead) {
  return lead.stage?.name || lead.stage?.key || 'Aşamasız';
}

export function LeadsView() {
  const [mode, setMode] = useState<ViewMode>('kanban');
  const { data, isLoading, error } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.leads({ take: 100 }),
  });

  const columns = useMemo(() => {
    const map = new Map<string, { label: string; color?: string | null; items: Lead[] }>();
    for (const lead of data?.items ?? []) {
      const key = lead.stage?.id || lead.stage?.key || 'none';
      const existing = map.get(key);
      if (existing) {
        existing.items.push(lead);
      } else {
        map.set(key, {
          label: stageLabel(lead),
          color: lead.stage?.color,
          items: [lead],
        });
      }
    }
    return Array.from(map.entries());
  }, [data?.items]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Leadler"
        description="Aday kayıtları ve pipeline aşamaları"
        actions={
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setMode('list')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                mode === 'list'
                  ? 'bg-brand-secondary text-white'
                  : 'text-slate-600',
              )}
            >
              Liste
            </button>
            <button
              type="button"
              onClick={() => setMode('kanban')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                mode === 'kanban'
                  ? 'bg-brand-secondary text-white'
                  : 'text-slate-600',
              )}
            >
              Kanban
            </button>
          </div>
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Leadler yüklenemedi.
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl skeleton" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <EmptyState
          title="Lead yok"
          description="Henüz aday kaydı bulunmuyor."
        />
      ) : mode === 'list' ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Başlık / Kişi</th>
                <th className="px-4 py-3 font-semibold">Aşama</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">
                  Kaynak
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-slate-50 hover:bg-slate-50/70"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">
                      {lead.title || contactDisplayName(lead.contact)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {contactDisplayName(lead.contact)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone="info">{stageLabel(lead)}</StatusBadge>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">
                    {lead.source || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map(([key, col]) => (
            <div
              key={key}
              className="w-72 shrink-0 rounded-2xl border border-slate-200 bg-slate-50/80"
            >
              <div className="flex items-center justify-between border-b border-slate-200/80 px-3 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: col.color || 'var(--brand-secondary)',
                    }}
                  />
                  <p className="text-sm font-semibold text-slate-800">
                    {col.label}
                  </p>
                </div>
                <span className="text-xs text-slate-400">{col.items.length}</span>
              </div>
              <div className="space-y-2 p-2">
                {col.items.map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {lead.title || contactDisplayName(lead.contact)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {contactDisplayName(lead.contact)}
                    </p>
                    {lead.source ? (
                      <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                        {lead.source}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
