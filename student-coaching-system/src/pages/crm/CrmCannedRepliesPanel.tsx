import { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquareText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  CANNED_CATEGORIES,
  crmDeleteCanned,
  crmListCanned,
  crmSaveCanned,
  type CrmCannedReply
} from '../../lib/crmInboxApi';

type Draft = Partial<CrmCannedReply> & { category: string; title: string; body: string };

const EMPTY: Draft = { category: 'Genel', title: '', body: '', sort_order: 100, is_active: true };

/** FAZ 5 — yönetici: hazır mesajlar (ekle / düzenle / sil). Temsilci gelen kutusunda seçip kendisi gönderir. */
export default function CrmCannedRepliesPanel() {
  const [rows, setRows] = useState<CrmCannedReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    crmListCanned({ all: true })
      .then((r) => setRows(r.data || []))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Hazır mesajlar alınamadı'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const categories = useMemo(() => {
    const extra = [...new Set(rows.map((r) => r.category))].filter((c) => !CANNED_CATEGORIES.includes(c));
    return [...CANNED_CATEGORIES, ...extra];
  }, [rows]);

  const visible = rows.filter((r) => !cat || r.category === cat);

  const save = async () => {
    if (!edit) return;
    if (!edit.title.trim() || !edit.body.trim()) {
      toast.error('Başlık ve mesaj zorunlu');
      return;
    }
    setSaving(true);
    try {
      await crmSaveCanned(edit);
      toast.success(edit.id ? 'Hazır mesaj güncellendi' : 'Hazır mesaj eklendi');
      setEdit(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: CrmCannedReply) => {
    if (!window.confirm(`“${r.title}” silinsin mi?`)) return;
    try {
      await crmDeleteCanned(r.id);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      toast.success('Silindi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    }
  };

  const toggleActive = async (r: CrmCannedReply) => {
    try {
      const res = await crmSaveCanned({ ...r, is_active: !r.is_active });
      setRows((prev) => prev.map((x) => (x.id === r.id ? res.data : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <MessageSquareText className="h-5 w-5 text-emerald-600" />
            Hazır mesajlar
          </h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Temsilciler gelen kutusunda sağ panelden veya “/” ile seçer; mesaj yazma alanına gelir, düzenleyip kendileri
            gönderir. Otomatik gönderim yoktur. Değişkenler: <code className="rounded bg-slate-100 px-1">{'{ad}'}</code>{' '}
            kişi adı, <code className="rounded bg-slate-100 px-1">{'{temsilci}'}</code> gönderen temsilci.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">Tüm kategoriler ({rows.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c} ({rows.filter((r) => r.category === c).length})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setEdit({ ...EMPTY, category: cat || 'Genel' })}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Yeni
          </button>
        </div>
      </div>

      {edit ? (
        <div className="mt-4 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="flex flex-wrap gap-2">
            <input
              list="crm-canned-cats"
              value={edit.category}
              onChange={(e) => setEdit({ ...edit, category: e.target.value })}
              placeholder="Kategori"
              className="w-44 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
            <datalist id="crm-canned-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <input
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              placeholder="Başlık (örn. LGS fiyat bilgisi)"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              value={edit.sort_order ?? 100}
              onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })}
              title="Sıra"
              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <textarea
            value={edit.body}
            onChange={(e) => setEdit({ ...edit, body: e.target.value })}
            rows={5}
            placeholder="Merhaba {ad}, ..."
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={edit.is_active !== false}
                onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })}
              />
              Temsilcilere göster
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
              >
                <X className="h-4 w-4" /> Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500">Bu kategoride hazır mesaj yok.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {visible.map((r) => (
              <div
                key={r.id}
                className={`rounded-xl border p-3 ${r.is_active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="mr-1 rounded bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700">
                      {r.category}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{r.title}</span>
                    {!r.is_active ? <span className="ml-1 text-[10px] text-slate-500">(gizli)</span> : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => void toggleActive(r)}
                      className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100"
                    >
                      {r.is_active ? 'Gizle' : 'Göster'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEdit({ ...r })}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100"
                      aria-label="Düzenle"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(r)}
                      className="rounded p-1 text-rose-500 hover:bg-rose-50"
                      aria-label="Sil"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-xs text-slate-600">{r.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
