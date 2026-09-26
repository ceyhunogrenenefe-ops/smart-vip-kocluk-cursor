import { useCallback, useEffect, useState } from 'react';
import { Archive, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

type DeletedClass = {
  id: string;
  class_id: string;
  class_name: string;
  deleted_at: string;
  deleted_by_name: string | null;
  row_counts: Record<string, number> | null;
};

/** Arşivdeki satır sayılarını "12 öğrenci · 843 ders · 1074 yoklama" gibi özetler. */
function summarize(counts: Record<string, number> | null): string {
  if (!counts) return '';
  const parts: string[] = [];
  const add = (key: string, label: string) => {
    const n = Number(counts[key] || 0);
    if (n > 0) parts.push(`${n} ${label}`);
  };
  add('class_students', 'öğrenci');
  add('class_weekly_slots', 'haftalık blok');
  add('class_sessions', 'ders');
  add('class_session_attendance', 'yoklama');
  add('edu_lesson_rows', 'ödev');
  return parts.join(' · ');
}

/**
 * Silinen grup sınıfları — yalnız yönetici görür.
 * Silme artık kalıcı değil: sınıf öğrencileri, programı, dersleri, yoklamaları ve
 * ödevleriyle arşivlenir; buradan tek tıkla aynen geri alınır.
 */
export default function DeletedClassesPanel({ onRestored }: { onRestored?: () => void }) {
  const [items, setItems] = useState<DeletedClass[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/class-live-lessons?op=deleted-classes');
      if (res.status === 403) {
        setItems([]);
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Liste alınamadı');
      setItems(Array.isArray(j.data) ? j.data : []);
    } catch (e) {
      console.warn('[deleted-classes]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (row: DeletedClass) => {
    if (!window.confirm(`«${row.class_name}» sınıfı tüm kayıtlarıyla geri alınacak. Onaylıyor musunuz?`)) return;
    setBusyId(row.id);
    try {
      const res = await apiFetch('/api/class-live-lessons?op=restore-class', {
        method: 'POST',
        body: JSON.stringify({ archive_id: row.id })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.hint || j.error || 'Geri alınamadı');
      toast.success(`«${row.class_name}» geri alındı`);
      await load();
      onRestored?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Geri alınamadı');
    } finally {
      setBusyId(null);
    }
  };

  if (!items.length && !loading) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Archive className="h-4 w-4 text-slate-500" />
          Silinen sınıflar
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {items.length}
          </span>
        </span>
        <span className="text-xs text-slate-500">{open ? 'gizle' : 'göster'}</span>
      </button>

      {open ? (
        <div className="space-y-2 border-t border-slate-100 p-3">
          <p className="text-[11px] text-slate-500">
            Silinen sınıflar kaybolmaz; öğrencileri, programı, dersleri, yoklamaları ve ödevleriyle
            saklanır. Geri al dediğinizde hepsi aynen döner.
          </p>
          {items.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{row.class_name}</p>
                <p className="text-[11px] text-slate-500">
                  {new Date(row.deleted_at).toLocaleString('tr-TR')}
                  {row.deleted_by_name ? ` · ${row.deleted_by_name}` : ''}
                </p>
                {summarize(row.row_counts) ? (
                  <p className="text-[11px] text-slate-500">{summarize(row.row_counts)}</p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => void restore(row)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
              >
                {busyId === row.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Geri al
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
