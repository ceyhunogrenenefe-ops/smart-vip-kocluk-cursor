'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatRelativeTr } from '@/lib/utils';
import { EmptyState, PageHeader, StatusBadge } from '@/components/ui/page';

function statusTone(status?: string | null) {
  const s = (status || '').toUpperCase();
  if (s === 'COMPLETED') return 'success' as const;
  if (s === 'CANCELLED') return 'neutral' as const;
  if (s === 'IN_PROGRESS') return 'info' as const;
  return 'warning' as const;
}

function statusLabel(status?: string | null) {
  const map: Record<string, string> = {
    OPEN: 'Açık',
    TODO: 'Yapılacak',
    IN_PROGRESS: 'Devam ediyor',
    COMPLETED: 'Tamamlandı',
    CANCELLED: 'İptal',
  };
  return map[(status || '').toUpperCase()] || status || '—';
}

export function TasksView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.tasks({ take: 50 }),
  });

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Görevler"
        description="Takip edilmesi gereken işler ve hatırlatmalar"
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Görevler yüklenemedi.
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
            <EmptyState title="Görev yok" description="Henüz görev kaydı yok." />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((task) => {
              const overdue =
                task.dueAt &&
                new Date(task.dueAt).getTime() < Date.now() &&
                !['COMPLETED', 'CANCELLED'].includes(
                  (task.status || '').toUpperCase(),
                );
              return (
                <li
                  key={task.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-800">{task.title}</p>
                    {task.description ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                        {task.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={statusTone(task.status)}>
                      {statusLabel(task.status)}
                    </StatusBadge>
                    {task.dueAt ? (
                      <StatusBadge tone={overdue ? 'danger' : 'neutral'}>
                        {overdue ? 'Gecikmiş · ' : 'Vade · '}
                        {formatRelativeTr(task.dueAt)}
                      </StatusBadge>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
