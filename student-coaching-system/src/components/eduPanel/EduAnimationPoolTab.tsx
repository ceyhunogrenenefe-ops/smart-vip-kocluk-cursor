import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clapperboard,
  Loader2,
  Search,
  Upload,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import EduAnimationPoolCard from './EduAnimationPoolCard';
import {
  ANIMATION_POOL_PROGRAMS,
  subjectsForPoolClass,
  type AnimationPoolProgram
} from '../../lib/eduPanel/eduAnimationPoolCatalog';
import {
  attachPoolAnimationToLessonRow,
  deleteEduPoolAnimation,
  fetchEduAnimationPool,
  updateEduPoolAnimation,
  uploadEduPoolAnimation
} from '../../lib/eduPanel/eduPanelApi';
import type { EduAnimationPoolItem, EduLessonRow } from '../../types/eduPanel.types';
import { useAuth } from '../../context/AuthContext';

type Props = {
  rows: EduLessonRow[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onPreview: (item: EduAnimationPoolItem) => void;
  onAttached?: () => void;
};

export default function EduAnimationPoolTab({
  rows,
  busy,
  setBusy,
  onPreview,
  onAttached
}: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EduAnimationPoolItem[]>([]);
  const [search, setSearch] = useState('');
  const [program, setProgram] = useState<AnimationPoolProgram | null>(null);
  const [classLevel, setClassLevel] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    program: 'tyt' as AnimationPoolProgram,
    class_level: '9',
    subject_name: 'Matematik',
    topic_name: '',
    file: null as File | null
  });

  const [attachItem, setAttachItem] = useState<EduAnimationPoolItem | null>(null);
  const [editItem, setEditItem] = useState<EduAnimationPoolItem | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    topic_name: '',
    subject_name: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEduAnimationPool({
        program: program || undefined,
        class_level: classLevel || undefined,
        subject_name: subjectName || undefined,
        q: search.trim() || undefined
      });
      setItems(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Havuz yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [program, classLevel, subjectName, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeProgram = useMemo(
    () => ANIMATION_POOL_PROGRAMS.find((p) => p.key === program) || null,
    [program]
  );

  const subjects = useMemo(
    () => (classLevel ? subjectsForPoolClass(classLevel) : []),
    [classLevel]
  );

  const uploadSubjects = useMemo(
    () => subjectsForPoolClass(uploadForm.class_level),
    [uploadForm.class_level]
  );

  const showingSearchResults = search.trim().length > 0;

  const canManage = (item: EduAnimationPoolItem) =>
    isAdmin || String(item.teacher_user_id) === String(user?.id);

  const onUpload = async () => {
    if (!uploadForm.title.trim() || !uploadForm.topic_name.trim() || !uploadForm.file) {
      toast.error('Tüm alanları doldurun ve .html dosyası seçin');
      return;
    }
    if (!uploadForm.file.name.toLowerCase().endsWith('.html')) {
      toast.error('Sadece .html dosyası');
      return;
    }
    setBusy(true);
    try {
      await uploadEduPoolAnimation({
        title: uploadForm.title.trim(),
        program: uploadForm.program,
        class_level: uploadForm.class_level,
        subject_name: uploadForm.subject_name,
        topic_name: uploadForm.topic_name.trim(),
        file: uploadForm.file
      });
      toast.success('Animasyon havuza eklendi');
      setShowUpload(false);
      setUploadForm((f) => ({ ...f, title: '', topic_name: '', file: null }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editItem) return;
    setBusy(true);
    try {
      await updateEduPoolAnimation(editItem.id, {
        title: editForm.title.trim(),
        topic_name: editForm.topic_name.trim(),
        subject_name: editForm.subject_name.trim()
      });
      toast.success('Animasyon güncellendi');
      setEditItem(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (item: EduAnimationPoolItem) => {
    if (!window.confirm(`「${item.title}」 havuzdan silinsin mi?`)) return;
    setBusy(true);
    try {
      await deleteEduPoolAnimation(item.id);
      toast.success('Animasyon silindi');
      await load();
      onAttached?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  const onAttachToTopic = async (rowId: string) => {
    if (!attachItem) return;
    setBusy(true);
    try {
      await attachPoolAnimationToLessonRow(rowId, attachItem.id);
      toast.success(`「${attachItem.title}」 konuya eklendi`);
      setAttachItem(null);
      onAttached?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const attachCandidates = useMemo(() => {
    if (!attachItem) return rows;
    return rows.filter(
      (r) =>
        String(r.teacher_user_id) === String(user?.id) &&
        (!attachItem.subject_name || r.subject_name === attachItem.subject_name)
    );
  }, [attachItem, rows, user?.id]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
        <p className="text-sm text-violet-900">
          Kurumdaki öğretmenlerin paylaştığı animasyonları buradan bulun. Aynı dosyayı tekrar
          yüklemenize gerek kalmaz — havuzdan seçip doğrudan konuya veya ödeve ekleyebilirsiniz.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Animasyon adı, ders veya konu ara…"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowUpload((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
        >
          <Upload className="h-4 w-4" />
          Yeni animasyon yükle
        </button>
      </div>

      {showUpload ? (
        <section className="rounded-xl border-2 border-dashed border-violet-300 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-violet-900">
            <Clapperboard className="h-4 w-4" />
            Havuza animasyon yükle
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">Animasyon adı *</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={uploadForm.title}
                onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Program *</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={uploadForm.program}
                onChange={(e) => {
                  const p = e.target.value as AnimationPoolProgram;
                  const grp = ANIMATION_POOL_PROGRAMS.find((g) => g.key === p);
                  setUploadForm((f) => ({
                    ...f,
                    program: p,
                    class_level: grp?.levels[0]?.value || f.class_level
                  }));
                }}
              >
                {ANIMATION_POOL_PROGRAMS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Sınıf *</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={uploadForm.class_level}
                onChange={(e) =>
                  setUploadForm((f) => ({
                    ...f,
                    class_level: e.target.value,
                    subject_name: subjectsForPoolClass(e.target.value)[0] || f.subject_name
                  }))
                }
              >
                {(ANIMATION_POOL_PROGRAMS.find((g) => g.key === uploadForm.program)?.levels || []).map(
                  (lvl) => (
                    <option key={lvl.value} value={lvl.value}>
                      {lvl.label}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Ders *</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={uploadForm.subject_name}
                onChange={(e) => setUploadForm((f) => ({ ...f, subject_name: e.target.value }))}
              >
                {uploadSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Konu *</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Örn. Üslü sayılar"
                value={uploadForm.topic_name}
                onChange={(e) => setUploadForm((f) => ({ ...f, topic_name: e.target.value }))}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">Animasyon dosyası (.html) *</span>
              <input
                type="file"
                accept=".html,text/html"
                className="mt-1 block w-full text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setUploadForm((f) => ({ ...f, file }));
                }}
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUpload()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              Yükle
            </button>
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              İptal
            </button>
          </div>
        </section>
      ) : null}

      {!showingSearchResults ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {ANIMATION_POOL_PROGRAMS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setProgram(p.key);
                  setClassLevel(null);
                  setSubjectName(null);
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  program === p.key
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {activeProgram ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sınıf</p>
              <div className="flex flex-wrap gap-2">
                {activeProgram.levels.map((lvl) => (
                  <button
                    key={lvl.value}
                    type="button"
                    onClick={() => {
                      setClassLevel(lvl.value);
                      setSubjectName(null);
                    }}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
                      classLevel === lvl.value
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-indigo-900 ring-1 ring-indigo-100 hover:bg-indigo-50'
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {classLevel ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ders</p>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubjectName(s)}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
                      subjectName === s
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white text-emerald-900 ring-1 ring-emerald-100 hover:bg-emerald-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500">
            {showingSearchResults
              ? 'Aramanızla eşleşen animasyon bulunamadı.'
              : subjectName
                ? 'Bu derste henüz animasyon yok. İlk siz yükleyebilirsiniz.'
                : 'Kategori seçin veya arama yapın.'}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <EduAnimationPoolCard
                key={item.id}
                item={item}
                busy={busy}
                canManage={canManage(item)}
                onPreview={() => onPreview(item)}
                onAddToHomework={() => setAttachItem(item)}
                onEdit={() => {
                  setEditItem(item);
                  setEditForm({
                    title: item.title,
                    topic_name: item.topic_name,
                    subject_name: item.subject_name
                  });
                }}
                onDelete={() => void onDelete(item)}
              />
            ))}
          </div>
        )}
      </div>

      {attachItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-bold text-slate-900">Konu seçin</h3>
              <button type="button" onClick={() => setAttachItem(null)} className="p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="border-b px-4 py-2 text-xs text-slate-600">
              「{attachItem.title}」 animasyonunu hangi konuya eklemek istiyorsunuz?
            </p>
            <div className="max-h-64 overflow-y-auto p-2">
              {attachCandidates.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">Uygun konu bulunamadı. Önce konu oluşturun.</p>
              ) : (
                attachCandidates.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void onAttachToTopic(row.id)}
                    className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-violet-50"
                  >
                    <span className="text-sm font-medium text-slate-800">{row.title}</span>
                    <span className="text-xs text-slate-500">
                      {row.subject_name} · {row.lesson_date}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {editItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <h3 className="mb-3 font-bold text-slate-900">Animasyonu düzenle</h3>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-xs text-slate-600">Ad</span>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs text-slate-600">Ders</span>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={editForm.subject_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, subject_name: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs text-slate-600">Konu</span>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={editForm.topic_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, topic_name: e.target.value }))}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSaveEdit()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Kaydet
              </button>
              <button type="button" onClick={() => setEditItem(null)} className="px-4 py-2 text-sm">
                İptal
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
