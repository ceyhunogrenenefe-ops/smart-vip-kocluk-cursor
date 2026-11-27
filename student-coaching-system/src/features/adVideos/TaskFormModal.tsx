import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { AppModal } from '../../components/ui/AppModal';
import { matchesSearch } from '../../lib/turkishSearch';
import { adVideosApi, type AdVideoTask, type PersonOption } from './api';
import { fromLocalInput, toLocalInput } from './format';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Düzenleme modunda görev; yoksa yeni görev */
  task?: AdVideoTask | null;
};

const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';
const label = 'mb-1 block text-xs font-semibold text-slate-600';

export default function TaskFormModal({ open, onClose, onSaved, task }: Props) {
  const editing = Boolean(task);
  const [teachers, setTeachers] = useState<PersonOption[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    idea: '',
    theme: '',
    shoot_note: '',
    reference_url: '',
    planned_shoot_at: '',
    due_at: ''
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      title: task?.title || '',
      idea: task?.idea || '',
      theme: task?.theme || '',
      shoot_note: task?.shoot_note || '',
      reference_url: task?.reference_url || '',
      planned_shoot_at: toLocalInput(task?.planned_shoot_at),
      due_at: toLocalInput(task?.due_at)
    });
    setSelected(new Set());
    setQ('');
    if (!task) {
      setLoadingTeachers(true);
      adVideosApi
        .teachers()
        .then((r) => setTeachers(r.teachers))
        .catch((e) => toast.error(e.message))
        .finally(() => setLoadingTeachers(false));
    }
  }, [open, task]);

  const filtered = useMemo(() => teachers.filter((t) => matchesSearch(`${t.name} ${t.email || ''}`, q)), [teachers, q]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = async () => {
    if (!form.title.trim()) return toast.error('Video başlığı gerekli');
    if (!form.due_at) return toast.error('Son teslim günü ve saati gerekli');
    if (!editing && !selected.size) return toast.error('En az bir öğretmen seçin');
    const payload = {
      title: form.title,
      idea: form.idea,
      theme: form.theme,
      shoot_note: form.shoot_note,
      reference_url: form.reference_url,
      planned_shoot_at: fromLocalInput(form.planned_shoot_at),
      due_at: fromLocalInput(form.due_at)
    };
    setSaving(true);
    try {
      if (editing && task) {
        await adVideosApi.update({ id: task.id, ...payload });
        toast.success('Görev güncellendi');
      } else {
        const r = await adVideosApi.create({ ...payload, teacher_ids: [...selected] });
        toast.success(r.tasks.length > 1 ? `${r.tasks.length} öğretmene ayrı görev atandı` : 'Görev atandı');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal open={open} onClose={saving ? undefined : onClose} panelClassName="sm:max-w-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-base font-semibold text-slate-900">{editing ? 'Görevi düzenle' : 'Yeni reklam videosu görevi'}</h3>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Kapat">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!editing ? (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={label}>Öğretmen ({selected.size} seçili)</span>
              {filtered.length ? (
                <button
                  type="button"
                  className="text-xs font-medium text-indigo-700 hover:underline"
                  onClick={() =>
                    setSelected((s) =>
                      filtered.every((t) => s.has(t.id)) ? new Set() : new Set([...s, ...filtered.map((t) => t.id)])
                    )
                  }
                >
                  {filtered.every((t) => selected.has(t.id)) ? 'Seçimi kaldır' : 'Tümünü seç'}
                </button>
              ) : null}
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Öğretmen ara" className={`${field} pl-9`} />
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200">
              {loadingTeachers ? (
                <div className="flex items-center justify-center p-6 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filtered.length ? (
                filtered.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0 hover:bg-slate-50">
                    <input type="checkbox" className="h-4 w-4" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{t.name}</span>
                      {t.email ? <span className="block truncate text-xs text-slate-500">{t.email}</span> : null}
                    </span>
                    {t.is_coach ? <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">Koç</span> : null}
                  </label>
                ))
              ) : (
                <p className="p-4 text-center text-sm text-slate-500">Öğretmen bulunamadı.</p>
              )}
            </div>
            {selected.size > 1 ? (
              <p className="mt-1 text-xs text-slate-500">Seçilen her öğretmen için ayrı görev oluşturulur.</p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Öğretmen: <span className="font-semibold">{task?.teacher_name}</span>
          </p>
        )}

        <div>
          <label className={label}>Video başlığı *</label>
          <input value={form.title} onChange={set('title')} className={field} maxLength={200} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Video fikri / konusu</label>
            <textarea value={form.idea} onChange={set('idea')} rows={3} className={field} />
          </div>
          <div>
            <label className={label}>Tema</label>
            <input value={form.theme} onChange={set('theme')} className={field} maxLength={200} />
          </div>
        </div>
        <div>
          <label className={label}>Çekim notu / senaryo</label>
          <textarea value={form.shoot_note} onChange={set('shoot_note')} rows={4} className={field} />
        </div>
        <div>
          <label className={label}>Örnek video bağlantısı</label>
          <input value={form.reference_url} onChange={set('reference_url')} placeholder="https://…" className={field} inputMode="url" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Planlanan çekim günü ve saati</label>
            <input type="datetime-local" value={form.planned_shoot_at} onChange={set('planned_shoot_at')} className={field} />
          </div>
          <div>
            <label className={label}>Son teslim günü ve saati *</label>
            <input type="datetime-local" value={form.due_at} onChange={set('due_at')} className={field} />
          </div>
        </div>
        <p className="text-xs text-slate-500">Saatler Türkiye saatidir.</p>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Vazgeç
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {editing ? 'Kaydet' : 'Görevi ata'}
        </button>
      </div>
    </AppModal>
  );
}
