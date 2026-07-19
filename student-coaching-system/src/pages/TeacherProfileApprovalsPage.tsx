import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Eye,
  Loader2,
  LockOpen,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
  X
} from 'lucide-react';
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
  editing_enabled?: boolean;
  deleted_at?: string | null;
  user?: { name?: string; email?: string } | null;
  missing_required?: string[];
};

type CatalogItem = {
  slug: string;
  name: string;
  branch: string;
  university?: string;
  experience?: number;
  photo_url?: string | null;
  linked_profile?: {
    id: string;
    user_id: string;
    status: string;
    display_name?: string | null;
    user?: { name?: string; email?: string } | null;
  } | null;
};

type DetailPayload = {
  profile?: Record<string, unknown>;
  user?: Record<string, unknown> | null;
  working?: Record<string, unknown>;
  approved_data?: Record<string, unknown> | null;
  pending_data?: Record<string, unknown> | null;
  changed_fields?: string[];
  published_preview?: Record<string, unknown> | null;
};

const FILTERS = [
  'pending_approval',
  'update_pending',
  'changes_pending',
  'published',
  'incomplete',
  'passive',
  'rejected',
  'deleted',
  'draft',
  ''
] as const;

const STATUS_TR: Record<string, string> = {
  incomplete: 'Eksik',
  draft: 'Taslak',
  pending_approval: 'Onay bekliyor',
  published: 'Yayında',
  changes_pending: 'Değişiklik bekliyor',
  update_pending: 'Güncelleme onayı bekliyor',
  rejected: 'Reddedildi',
  passive: 'Pasif',
  deleted: 'Silindi'
};

const FIELD_TR: Record<string, string> = {
  display_name: 'Görünen ad',
  first_name: 'Ad',
  last_name: 'Soyad',
  title: 'Unvan',
  branch: 'Branş',
  short_bio: 'Kısa tanıtım',
  full_bio: 'Özgeçmiş',
  city: 'Şehir',
  photo_url: 'Fotoğraf',
  video_url: 'Video',
  university: 'Üniversite',
  department: 'Bölüm',
  grade_levels: 'Seviyeler',
  exam_areas: 'Sınav alanları',
  lesson_duration_min: 'Ders süresi',
  lesson_format: 'Format',
  availability_note: 'Müsaitlik notu',
  accepting_students: 'Öğrenci kabulü'
};

function fmtVal(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export default function TeacherProfileApprovalsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending_approval');
  const [busyId, setBusyId] = useState('');
  const [rejectId, setRejectId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [passiveId, setPassiveId] = useState('');
  const [passiveReason, setPassiveReason] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [importEmails, setImportEmails] = useState<Record<string, string>>({});
  const [importBusy, setImportBusy] = useState('');

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

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await apiFetch('/api/teacher-profiles-admin?op=site-catalog');
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      setCatalog(j.catalog || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Site kadrosu alınamadı');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await apiFetch(`/api/teacher-profiles-admin?id=${encodeURIComponent(id)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      setDetail(j as DetailPayload);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Detay alınamadı');
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const statsHint = useMemo(() => {
    if (filter === 'pending_approval') return 'İlk yayın onayı bekleyenler';
    if (filter === 'update_pending' || filter === 'changes_pending') return 'Yayındaki profilin güncelleme onayı';
    if (filter === 'deleted') return 'Silinmiş profiller';
    if (!filter) return 'Tüm öğretmen vitrin profilleri';
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
      toast.success(j.message || 'İşlem tamam');
      setRejectId('');
      setRejectReason('');
      setPassiveId('');
      setPassiveReason('');
      await load();
      if (selectedId === id) await loadDetail(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusyId('');
    }
  };

  const confirmAct = async (id: string, op: string, message: string, body?: Record<string, string>) => {
    if (!window.confirm(message)) return;
    await act(id, op, body);
  };

  const importFromSite = async (slug: string) => {
    const email = String(importEmails[slug] || '').trim();
    if (!email) {
      toast.error('Kullanıcı e-postasını girin');
      return;
    }
    setImportBusy(slug);
    try {
      const res = await apiFetch('/api/teacher-profiles-admin?op=import-site-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          user_email: email,
          fill_empty_only: true,
          enable_editing: true
        })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      const missing = Array.isArray(j.missing_required) ? j.missing_required.length : 0;
      toast.success(
        missing
          ? `Aktarıldı. ${missing} zorunlu alan eksik — öğretmen tamamlayacak.`
          : 'Aktarıldı. Profil onaya hazır.'
      );
      await loadCatalog();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İçe aktarım başarısız');
    } finally {
      setImportBusy('');
    }
  };

  const changedSet = useMemo(() => new Set(detail?.changed_fields || []), [detail]);
  const compareLeft = useMemo(() => detail?.approved_data || {}, [detail]);
  const compareRight = useMemo(
    () => detail?.pending_data || detail?.working || {},
    [detail]
  );
  const compareKeys = useMemo(() => {
    const keys = new Set([
      ...Object.keys(compareLeft || {}),
      ...Object.keys(compareRight || {}),
      ...(detail?.changed_fields || [])
    ]);
    return [...keys].filter((k) => !['id', 'user_id', 'slug'].includes(k)).sort();
  }, [compareLeft, compareRight, detail]);

  const isDeleted = (row: Row) => row.status === 'deleted' || !!row.deleted_at;
  const isPending = (row: Row) =>
    row.status === 'pending_approval' ||
    row.status === 'update_pending' ||
    row.status === 'changes_pending' ||
    row.status === 'draft';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
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

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Sitedeki kadro → panele aktar</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              onlinevipdershane.com kartındaki bilgiler silinmez; panele ön-doldurulur. Öğretmen eksikleri tamamlar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !showCatalog;
              setShowCatalog(next);
              if (next) void loadCatalog();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[#1a3fad]/30 bg-[#1a3fad]/5 px-3 py-2 text-xs font-bold text-[#1a3fad]"
          >
            <Upload className="h-4 w-4" />
            {showCatalog ? 'Kadro listesini gizle' : 'Site kadrosunu göster'}
          </button>
        </div>
        {showCatalog ? (
          catalogLoading ? (
            <div className="flex justify-center py-8 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {catalog.map((item) => (
                <div
                  key={item.slug}
                  className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">
                      {item.branch} · /{item.slug}
                      {item.university ? ` · ${item.university}` : ''}
                      {item.experience != null ? ` · ${item.experience} yıl` : ''}
                    </div>
                    {item.linked_profile ? (
                      <div className="mt-1 text-xs font-semibold text-emerald-700">
                        Bağlı: {item.linked_profile.user?.email || item.linked_profile.display_name} (
                        {STATUS_TR[item.linked_profile.status] || item.linked_profile.status})
                      </div>
                    ) : (
                      <div className="mt-1 text-xs font-semibold text-amber-700">Henüz panele bağlanmamış</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      placeholder="Kullanıcı e-posta"
                      value={importEmails[item.slug] || ''}
                      onChange={(e) =>
                        setImportEmails((prev) => ({ ...prev, [item.slug]: e.target.value }))
                      }
                      className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      disabled={importBusy === item.slug}
                      onClick={() => void importFromSite(item.slug)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#1a3fad] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {importBusy === item.slug ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {item.linked_profile ? 'Yeniden doldur' : 'İçe aktar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>

      <div className={`grid gap-4 ${selectedId ? 'lg:grid-cols-[1fr_minmax(320px,420px)]' : ''}`}>
        <div>
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
                <div
                  key={row.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${
                    selectedId === row.id ? 'border-[#1a3fad]' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">
                        {row.display_name || row.user?.name || row.slug}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {row.branch || '—'} · /{row.slug} · %{row.completion_pct} · sync: {row.sync_status || '—'}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {STATUS_TR[row.status] || row.status}
                        </span>
                        {row.editing_enabled ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Düzenleme açık
                          </span>
                        ) : null}
                      </div>
                      {row.sync_error ? (
                        <div className="mt-2 text-xs text-amber-700">{row.sync_error}</div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void loadDetail(row.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#1a3fad]"
                      >
                        <Eye className="h-3.5 w-3.5" /> Görüntüle
                      </button>
                      {isPending(row) && !isDeleted(row) ? (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void act(row.id, 'approve')}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> Onayla
                        </button>
                      ) : null}
                      {(row.status === 'pending_approval' ||
                        row.status === 'update_pending' ||
                        row.status === 'changes_pending') &&
                      !isDeleted(row) ? (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => setRejectId(row.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" /> Reddet
                        </button>
                      ) : null}
                      {!isDeleted(row) ? (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() =>
                            void confirmAct(
                              row.id,
                              'enable-editing',
                              'Bu profil için düzenlemeyi açmak istiyor musunuz?'
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-[#1a3fad]/40 bg-[#1a3fad]/5 px-3 py-1.5 text-xs font-bold text-[#1a3fad]"
                        >
                          <LockOpen className="h-3.5 w-3.5" /> Düzenlemeye Aç
                        </button>
                      ) : null}
                      {row.status !== 'passive' && !isDeleted(row) ? (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => setPassiveId(row.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                        >
                          <Ban className="h-3.5 w-3.5" /> Pasife Al
                        </button>
                      ) : null}
                      {(row.status === 'passive' || row.status === 'published') && !isDeleted(row) ? (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() =>
                            void confirmAct(
                              row.id,
                              row.status === 'passive' ? 'activate' : 'republish',
                              row.status === 'passive'
                                ? 'Profili yeniden yayınlamak istiyor musunuz?'
                                : 'Profili yeniden senkronlayıp yayınlamak istiyor musunuz?'
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700"
                        >
                          Yeniden Yayınla
                        </button>
                      ) : null}
                      {!isDeleted(row) ? (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() =>
                            void confirmAct(
                              row.id,
                              'soft-delete',
                              'Profili silmek istiyor musunuz? (soft-delete)'
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Profili Sil
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() =>
                            void confirmAct(row.id, 'restore', 'Profili geri yüklemek istiyor musunuz?')
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                        >
                          <Undo2 className="h-3.5 w-3.5" /> Geri Yükle
                        </button>
                      )}
                      {!isDeleted(row) ? (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void act(row.id, 'retry-sync')}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Sync
                        </button>
                      ) : null}
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
                          onClick={() => {
                            if (!rejectReason.trim()) {
                              toast.error('Ret gerekçesi gerekli');
                              return;
                            }
                            if (!window.confirm('Profili reddetmek istiyor musunuz?')) return;
                            void act(row.id, 'reject', { rejection_reason: rejectReason });
                          }}
                        >
                          Reddi kaydet
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-slate-600"
                          onClick={() => setRejectId('')}
                        >
                          Vazgeç
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {passiveId === row.id ? (
                    <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                      <textarea
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        rows={2}
                        placeholder="Pasife alma gerekçesi"
                        value={passiveReason}
                        onChange={(e) => setPassiveReason(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white"
                          onClick={() => {
                            if (!window.confirm('Profili pasife almak istiyor musunuz?')) return;
                            void act(row.id, 'deactivate', {
                              passivation_reason: passiveReason || 'Pasife alındı'
                            });
                          }}
                        >
                          Pasife Al
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-slate-600"
                          onClick={() => setPassiveId('')}
                        >
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

        {selectedId ? (
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">Profil detayı</h2>
              <button
                type="button"
                className="text-xs font-semibold text-slate-500"
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                }}
              >
                Kapat
              </button>
            </div>
            {detailLoading ? (
              <div className="flex justify-center py-10 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : detail ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800">
                    {String(
                      (detail.profile as { display_name?: string })?.display_name ||
                        detail.user?.name ||
                        '—'
                    )}
                  </div>
                  <div className="mt-1">
                    Durum:{' '}
                    {STATUS_TR[String((detail.profile as { status?: string })?.status || '')] ||
                      String((detail.profile as { status?: string })?.status || '—')}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Onaylı vs Bekleyen
                  </div>
                  <div className="space-y-2">
                    {compareKeys.length === 0 ? (
                      <p className="text-xs text-slate-500">Karşılaştırılacak alan yok</p>
                    ) : (
                      compareKeys.map((key) => {
                        const changed = changedSet.has(key);
                        return (
                          <div
                            key={key}
                            className={`rounded-xl border p-2 ${
                              changed ? 'border-[#e8232a]/40 bg-red-50/60' : 'border-slate-100'
                            }`}
                          >
                            <div
                              className={`mb-1 text-[11px] font-bold ${
                                changed ? 'text-[#e8232a]' : 'text-[#1a3fad]'
                              }`}
                            >
                              {FIELD_TR[key] || key}
                              {changed ? ' · değişti' : ''}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <div className="font-semibold text-slate-500">Onaylı</div>
                                <div className="break-words text-slate-800">
                                  {fmtVal((compareLeft as Record<string, unknown>)[key])}
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold text-slate-500">Bekleyen / çalışma</div>
                                <div
                                  className={`break-words ${
                                    changed ? 'font-semibold text-[#1a3fad]' : 'text-slate-800'
                                  }`}
                                >
                                  {fmtVal((compareRight as Record<string, unknown>)[key])}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {detail.published_preview ? (
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Yayın önizleme
                    </div>
                    <pre className="max-h-64 overflow-auto rounded-xl bg-slate-900 p-3 text-[10px] text-slate-100">
                      {JSON.stringify(detail.published_preview, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Henüz yayın önizlemesi yok</p>
                )}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
