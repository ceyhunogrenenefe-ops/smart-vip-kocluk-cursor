import { useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap, Loader2, MessageCircle, Phone, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { userHasAnyRole } from '../config/rolePermissions';
import {
  deleteOzelDersTalep,
  listOzelDersTalepleri,
  patchOzelDersTalep,
  type OzelDersTalepRow
} from '../lib/ozelDersTalepleriApi';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ödeme bekleniyor',
  paid: 'Ödendi',
  contacted: 'İletişime geçildi',
  enrolled: 'Kayıt edildi',
  cancelled: 'İptal'
};

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  paid: 'bg-emerald-100 text-emerald-900',
  contacted: 'bg-sky-100 text-sky-900',
  enrolled: 'bg-indigo-100 text-indigo-900',
  cancelled: 'bg-slate-200 text-slate-700'
};

const FILTERS = ['', 'pending', 'paid', 'contacted', 'enrolled', 'cancelled'] as const;

function formatTrDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatAmount(kurus?: number | null) {
  if (!kurus) return '—';
  return (kurus / 100).toLocaleString('tr-TR') + ' ₺';
}

function teacherLabel(slug?: string | null) {
  if (!slug) return '—';
  return slug
    .split('-')
    .map((s) => (s ? s[0].toLocaleUpperCase('tr-TR') + s.slice(1) : s))
    .join(' ');
}

function waLink(phone?: string | null) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const intl = digits.startsWith('90') ? digits : digits.startsWith('0') ? '9' + digits : '90' + digits;
  return `https://wa.me/${intl}`;
}

export default function OzelDersTalepleriPage() {
  const { effectiveUser } = useAuth();
  const isSuper = userHasAnyRole(effectiveUser, ['super_admin']);

  const [rows, setRows] = useState<OzelDersTalepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [busyId, setBusyId] = useState<string>('');
  const [loadError, setLoadError] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setRows(await listOzelDersTalepleri());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Talepler alınamadı';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (filter ? rows.filter((r) => r.status === filter) : rows),
    [rows, filter]
  );

  const stats = useMemo(() => {
    const by: Record<string, number> = {};
    for (const r of rows) by[r.status] = (by[r.status] || 0) + 1;
    return by;
  }, [rows]);

  const setStatus = async (row: OzelDersTalepRow, status: string) => {
    setBusyId(row.id);
    try {
      const updated = await patchOzelDersTalep(row.id, { status });
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      toast.success(`Durum: ${STATUS_LABELS[status] || status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setBusyId('');
    }
  };

  const editNotes = async (row: OzelDersTalepRow) => {
    const notes = window.prompt('Talep notu:', row.notes || '');
    if (notes == null) return;
    setBusyId(row.id);
    try {
      const updated = await patchOzelDersTalep(row.id, { notes });
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      toast.success('Not kaydedildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Not kaydedilemedi');
    } finally {
      setBusyId('');
    }
  };

  const removeRow = async (row: OzelDersTalepRow) => {
    if (!window.confirm('Bu talep silinsin mi?')) return;
    setBusyId(row.id);
    try {
      await deleteOzelDersTalep(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success('Talep silindi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Özel Ders Talepleri</h1>
            <p className="text-sm text-slate-500">
              Web sitesinden gelen premium özel ders satışları ve talepleri
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f ? STATUS_LABELS[f] || f : 'Tümü'}
            <span className="ml-1.5 text-xs opacity-75">
              {f ? stats[f] || 0 : rows.length}
            </span>
          </button>
        ))}
      </div>

      {loadError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Yükleniyor…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="font-semibold text-slate-800">Talep yok</p>
          <p className="mt-1 text-sm text-slate-500">
            Web sitesinden özel ders paketi satın alındığında burada görünür.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const wa = waLink(row.phone);
            const busy = busyId === row.id;
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-slate-900">
                        {row.parent_name || 'İsimsiz talep'}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          STATUS_BADGES[row.status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {STATUS_LABELS[row.status] || row.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatTrDate(row.created_at)}
                      {row.merchant_oid ? ` · Sipariş: ${row.merchant_oid}` : ''}
                      {row.source ? ` · ${row.source}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-slate-900">
                      {formatAmount(row.amount_kurus)}
                    </p>
                    <p className="text-xs font-semibold text-slate-500">
                      {row.package_title || row.package_id || '—'}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Telefon</dt>
                    <dd className="font-semibold text-slate-800">{row.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">E-posta</dt>
                    <dd className="break-all font-semibold text-slate-800">{row.email || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Tercih edilen öğretmen
                    </dt>
                    <dd className="font-semibold text-slate-800">{teacherLabel(row.teacher_slug)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Ödeme</dt>
                    <dd className="font-semibold text-slate-800">
                      {row.paid_at ? formatTrDate(row.paid_at) : 'Bekleniyor'}
                    </dd>
                  </div>
                </dl>

                {row.student_info ? (
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-bold">Öğrenci: </span>
                    {row.student_info}
                  </p>
                ) : null}
                {row.notes ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <span className="font-bold">Not: </span>
                    {row.notes}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {row.phone ? (
                    <a
                      href={`tel:${row.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Phone className="h-4 w-4" /> Ara
                    </a>
                  ) : null}
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </a>
                  ) : null}
                  <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
                  {row.status !== 'contacted' && row.status !== 'enrolled' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setStatus(row, 'contacted')}
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      İletişime geçildi
                    </button>
                  ) : null}
                  {row.status !== 'enrolled' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setStatus(row, 'enrolled')}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Kayıt edildi
                    </button>
                  ) : null}
                  {row.status !== 'cancelled' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setStatus(row, 'cancelled')}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      İptal
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void editNotes(row)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Not
                  </button>
                  {isSuper ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeRow(row)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" /> Sil
                    </button>
                  ) : null}
                  {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
