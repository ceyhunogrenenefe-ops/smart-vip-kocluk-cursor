import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, Ban, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/session';

type Row = {
  id: string;
  slug: string;
  status: string;
  completion_pct: number;
  sync_status?: string;
  sync_error?: string | null;
  display_name?: string | null;
  branch?: string | null;
  rejection_reason?: string | null;
  user?: { name?: string; email?: string } | null;
  missing_required?: string[];
};

const FILTERS = [
  '',
  'pending_approval',
  'changes_pending',
  'incomplete',
  'published',
  'rejected',
  'passive',
  'draft'
] as const;

const STATUS_TR: Record<string, string> = {
  incomplete: 'Eksik',
  draft: 'Taslak',
  pending_approval: 'Onay bekliyor',
  published: 'Yayında',
  changes_pending: 'Değişiklik bekliyor',
  rejected: 'Reddedildi',
  passive: 'Pasif'
};

export default function TeacherProfileApprovalsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending_approval');
  const [busyId, setBusyId] = useState('');
  const [rejectId, setRejectId] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await apiFetch(`/api/teacher-profiles-admin${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      setRows(j.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Liste alınamadı');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const statsHint = useMemo(() => {
    if (filter === 'pending_approval') return 'İlk yayın onayı bekleyenler';
    if (filter === 'changes_pending') return 'Yayındaki profilin güncelleme onayı';
    return 'Filtreye göre öğretmen vitrin profilleri';
  }, [filter]);

  const act = async (id: string, op: string, body?: Record<string, string>) => {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/teacher-profiles-admin?op=${op}&id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.message || res.statusText);
      toast.success('İşlem tamam');
      setRejectId('');
      setRejectReason('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Öğretmen Profil Onayları</h1>
          <p className="mt-1 text-sm text-slate-600">{statsHint}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Yenile
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              filter === f ? 'bg-[#1a3fad] text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {f ? STATUS_TR[f] || f : 'Tümü'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          Kayıt yok
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">
                    {row.display_name || row.user?.name || row.slug}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.branch || '—'} · /{row.slug} · %{row.completion_pct} · sync: {row.sync_status || '—'}
                  </div>
                  <div className="mt-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {STATUS_TR[row.status] || row.status}
                    </span>
                  </div>
                  {row.sync_error ? (
                    <div className="mt-2 text-xs text-amber-700">{row.sync_error}</div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(row.status === 'pending_approval' || row.status === 'changes_pending' || row.status === 'draft') && (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void act(row.id, 'approve')}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Onayla
                    </button>
                  )}
                  {(row.status === 'pending_approval' || row.status === 'changes_pending') && (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => setRejectId(row.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Reddet
                    </button>
                  )}
                  {row.status !== 'passive' ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void act(row.id, 'deactivate')}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                    >
                      <Ban className="h-3.5 w-3.5" /> Pasif
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void act(row.id, 'activate')}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                    >
                      Aktifleştir
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void act(row.id, 'retry-sync')}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Sync
                  </button>
                </div>
              </div>

              {rejectId === row.id ? (
                <div className="mt-3 space-y-2 rounded-xl bg-red-50 p-3">
                  <textarea
                    className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Ret gerekçesi"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white"
                      onClick={() => void act(row.id, 'reject', { rejection_reason: rejectReason })}
                    >
                      Reddi kaydet
                    </button>
                    <button type="button" className="text-xs font-semibold text-slate-600" onClick={() => setRejectId('')}>
                      Vazgeç
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
