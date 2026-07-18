import React, { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  PRIVATE_LIVE_SQL_HINT,
  formatPrivateLiveError,
  privateLiveApi,
  type PrivateLessonPackage
} from '../../lib/privateLiveApi';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
  AppModalHeader
} from '../../components/ui/AppModal';

const emptyForm = {
  name: '',
  lesson_count: '8',
  is_unlimited: false,
  price: '0',
  discount: '0',
  duration_minutes: '60'
};

export default function PrivateLivePackagesPage() {
  const [rows, setRows] = useState<PrivateLessonPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sqlMissing, setSqlMissing] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const reload = async () => {
    setLoading(true);
    try {
      const result = await privateLiveApi().packages();
      setRows(result.data);
      setSqlMissing(result.sqlMissing);
      setError(result.sqlMissing ? PRIVATE_LIVE_SQL_HINT : '');
    } catch (e) {
      setRows([]);
      setSqlMissing(false);
      setError(formatPrivateLiveError(e instanceof Error ? e.message : 'Yüklenemedi'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const closeModal = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: PrivateLessonPackage) => {
    setEditingId(p.id);
    setForm({
      name: p.name || '',
      lesson_count: String(p.lesson_count ?? 8),
      is_unlimited: Boolean(p.is_unlimited),
      price: String(p.price ?? 0),
      discount: String(p.discount ?? 0),
      duration_minutes: String(p.duration_minutes ?? 60)
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        lesson_count: form.is_unlimited ? null : Number(form.lesson_count || 0),
        is_unlimited: form.is_unlimited,
        price: Number(form.price || 0),
        discount: Number(form.discount || 0),
        duration_minutes: Number(form.duration_minutes || 60)
      };
      if (editingId) {
        await privateLiveApi().patchPackage({ id: editingId, ...payload });
      } else {
        await privateLiveApi().createPackage(payload);
      }
      closeModal();
      await reload();
    } catch (e) {
      setError(formatPrivateLiveError(e instanceof Error ? e.message : 'Kayıt başarısız'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">8 / 12 / 16 / 24 / 32 ders veya sınırsız paket tanımlayın.</p>
        <button
          type="button"
          disabled={sqlMissing}
          onClick={openCreate}
          className="min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Yeni paket
        </button>
      </div>
      {error ? (
        <div className="whitespace-pre-line rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <div key={p.id} className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <button
                type="button"
                disabled={sqlMissing}
                onClick={() => openEdit(p)}
                className="absolute right-3 top-3 inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                aria-label={`${p.name} paketini düzenle`}
                title="Düzenle"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <h3 className="pr-12 font-semibold text-slate-900">{p.name}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {p.is_unlimited ? 'Sınırsız ders' : `${p.lesson_count ?? 0} ders`} · {p.duration_minutes ?? 60}{' '}
                dk
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">
                {Number(p.price || 0).toLocaleString('tr-TR')} ₺
                {Number(p.discount || 0) > 0 ? (
                  <span className="ml-2 text-sm font-medium text-emerald-700">
                    −{Number(p.discount).toLocaleString('tr-TR')} ₺
                  </span>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <AppModal open onClose={closeModal} panelClassName="max-w-md">
          <AppModalHeader>
            <h3 className="font-semibold">{editingId ? 'Paketi düzenle' : 'Yeni paket'}</h3>
          </AppModalHeader>
          <AppModalBody className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">
              Ad
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={form.is_unlimited}
                onChange={(e) => setForm((f) => ({ ...f, is_unlimited: e.target.checked }))}
              />
              Sınırsız
            </label>
            {!form.is_unlimited ? (
              <label className="block text-xs font-medium text-slate-600">
                Ders sayısı
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={form.lesson_count}
                  onChange={(e) => setForm((f) => ({ ...f, lesson_count: e.target.value }))}
                />
              </label>
            ) : null}
            <label className="block text-xs font-medium text-slate-600">
              Ücret
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              İndirim
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.discount}
                onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Süre (dk)
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.duration_minutes}
                onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
              />
            </label>
          </AppModalBody>
          <AppModalFooter className="gap-2">
            <button type="button" className="min-h-[44px] flex-1 rounded-lg border" onClick={closeModal}>
              İptal
            </button>
            <button
              type="button"
              disabled={saving || !form.name.trim()}
              className="min-h-[44px] flex-1 rounded-lg bg-indigo-600 font-semibold text-white disabled:opacity-50"
              onClick={() => void submit()}
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </AppModalFooter>
        </AppModal>
      ) : null}
    </div>
  );
}
