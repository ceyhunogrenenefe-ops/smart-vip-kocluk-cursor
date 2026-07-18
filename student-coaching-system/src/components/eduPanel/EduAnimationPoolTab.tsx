import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clapperboard,
  Loader2,
  Search,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import EduAnimationPoolCard from './EduAnimationPoolCard';
import EduAnimationPoolClassNav from './EduAnimationPoolClassNav';
import EduAnimationPoolHomeworkModal from './EduAnimationPoolHomeworkModal';
import EduAnimationPoolTargetPicker, {
  targetsToKeys
} from './EduAnimationPoolTargetPicker';
import {
  classCardForLevel,
  parsePoolTargetKey,
  poolTargetKey,
  subjectsForPoolClass,
  targetsFromKeys
} from '../../lib/eduPanel/eduAnimationPoolCatalog';
import {
  deleteEduPoolAnimation,
  fetchEduAnimationPool,
  updateEduPoolAnimation,
  uploadEduPoolAnimation
} from '../../lib/eduPanel/eduPanelApi';
import type { EduAnimationPoolItem, EduClass, EduLessonRow } from '../../types/eduPanel.types';
import { useAuth } from '../../context/AuthContext';

type Props = {
  rows: EduLessonRow[];
  classes: EduClass[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onPreview: (item: EduAnimationPoolItem) => void;
  onAttached?: () => void;
};

export default function EduAnimationPoolTab({
  rows,
  classes,
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
  const [classLevel, setClassLevel] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'code' | 'link'>('file');
  const [uploadForm, setUploadForm] = useState({
    title: '',
    targetKeys: [poolTargetKey('tyt', '9')],
    subject_name: 'Matematik',
    topic_name: '',
    file: null as File | null,
    html_code: '',
    external_url: ''
  });

  const [homeworkItem, setHomeworkItem] = useState<EduAnimationPoolItem | null>(null);
  const [editItem, setEditItem] = useState<EduAnimationPoolItem | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    topic_name: '',
    subject_name: '',
    targetKeys: [] as string[]
  });

  const activeClassCard = useMemo(() => classCardForLevel(classLevel), [classLevel]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEduAnimationPool({
        program: activeClassCard?.program,
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
  }, [activeClassCard?.program, classLevel, subjectName, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadPrimaryTarget = useMemo(() => {
    const first = uploadForm.targetKeys[0];
    return first ? parsePoolTargetKey(first) : null;
  }, [uploadForm.targetKeys]);

  const uploadSubjects = useMemo(() => {
    const level = uploadPrimaryTarget?.class_level || '9';
    return subjectsForPoolClass(level);
  }, [uploadPrimaryTarget?.class_level]);

  const showingSearchResults = search.trim().length > 0;

  const canManage = (item: EduAnimationPoolItem) =>
    isAdmin || String(item.teacher_user_id) === String(user?.id);

  const onUpload = async () => {
    const hasFile = Boolean(uploadForm.file);
    const hasCode = Boolean(uploadForm.html_code.trim());
    const hasLink = Boolean(uploadForm.external_url.trim());
    if (!uploadForm.title.trim() || !uploadForm.topic_name.trim() || (!hasFile && !hasCode && !hasLink)) {
      toast.error('Tüm alanları doldurun; dosya, HTML kodu veya link ekleyin');
      return;
    }
    if (!uploadForm.targetKeys.length) {
      toast.error('En az bir sınıf veya program seçin');
      return;
    }
    if (hasFile && uploadForm.file && !uploadForm.file.name.toLowerCase().endsWith('.html')) {
      toast.error('Dosya için sadece .html kabul edilir');
      return;
    }
    const targets = targetsFromKeys(uploadForm.targetKeys);
    const primary = targets[0];
    setBusy(true);
    try {
      await uploadEduPoolAnimation({
        title: uploadForm.title.trim(),
        program: primary.program,
        class_level: primary.class_level,
        targets,
        subject_name: uploadForm.subject_name,
        topic_name: uploadForm.topic_name.trim(),
        file: hasFile ? uploadForm.file : null,
        html_code: !hasFile && hasCode ? uploadForm.html_code : undefined,
        external_url: !hasFile && !hasCode && hasLink ? uploadForm.external_url : undefined
      });
      toast.success(hasLink ? 'Link havuza eklendi' : 'Animasyon havuza eklendi');
      setShowUpload(false);
      setUploadMode('file');
      setUploadForm((f) => ({
        ...f,
        title: '',
        topic_name: '',
        file: null,
        html_code: '',
        external_url: ''
      }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editItem) return;
    if (!editForm.targetKeys.length) {
      toast.error('En az bir sınıf veya program seçin');
      return;
    }
    setBusy(true);
    try {
      await updateEduPoolAnimation(editItem.id, {
        title: editForm.title.trim(),
        topic_name: editForm.topic_name.trim(),
        subject_name: editForm.subject_name.trim(),
        targets: targetsFromKeys(editForm.targetKeys)
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

  const onHomeworkCreated = () => {
    toast.success('Animasyon ödeve eklendi ve yayınlandı');
    onAttached?.();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
        <p className="text-sm text-violet-900">
          Kurumdaki öğretmenlerin paylaştığı animasyonları buradan bulun. Aynı dosyayı tekrar
          yüklemenize gerek kalmaz — havuzdan seçip konu havuzundaki uygun konuya ödev olarak
          ekleyebilirsiniz.
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
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">
                Sınıf / Program (birden fazla seçilebilir) *
              </span>
              <div className="mt-2">
                <EduAnimationPoolTargetPicker
                  selected={uploadForm.targetKeys}
                  onChange={(keys) => {
                    const primary = keys[0] ? parsePoolTargetKey(keys[0]) : null;
                    const subjects = primary
                      ? subjectsForPoolClass(primary.class_level)
                      : uploadSubjects;
                    setUploadForm((f) => ({
                      ...f,
                      targetKeys: keys,
                      subject_name: subjects.includes(f.subject_name)
                        ? f.subject_name
                        : subjects[0] || f.subject_name
                    }));
                  }}
                />
              </div>
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
            <div className="sm:col-span-2 space-y-2">
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setUploadMode('file')}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold ${
                    uploadMode === 'file'
                      ? 'bg-white text-violet-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  .html dosya
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('code')}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold ${
                    uploadMode === 'code'
                      ? 'bg-white text-violet-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  HTML kodu
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('link')}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold ${
                    uploadMode === 'link'
                      ? 'bg-white text-violet-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  Link (NotebookLM)
                </button>
              </div>
              {uploadMode === 'file' ? (
                <label className="block text-sm">
                  <span className="text-xs font-medium text-slate-600">Animasyon dosyası (.html) *</span>
                  <input
                    type="file"
                    accept=".html,text/html"
                    className="mt-1 block w-full text-sm"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setUploadForm((f) => ({ ...f, file, html_code: '', external_url: '' }));
                    }}
                  />
                </label>
              ) : uploadMode === 'code' ? (
                <label className="block text-sm">
                  <span className="text-xs font-medium text-slate-600">HTML kodu *</span>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed min-h-[160px]"
                    placeholder={'<!DOCTYPE html>\n<html>\n...</html>\n\nveya sadece body içeriği'}
                    value={uploadForm.html_code}
                    onChange={(e) =>
                      setUploadForm((f) => ({
                        ...f,
                        html_code: e.target.value,
                        file: null,
                        external_url: ''
                      }))
                    }
                  />
                  <span className="mt-1 block text-[10px] text-slate-500">
                    Tam HTML veya sadece içerik yapıştırabilirsiniz; eksikse otomatik sarılır.
                  </span>
                </label>
              ) : (
                <label className="block text-sm">
                  <span className="text-xs font-medium text-slate-600">
                    Dış link (NotebookLM, Canva, Google Sites…) *
                  </span>
                  <input
                    type="url"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="https://notebooklm.google.com/…"
                    value={uploadForm.external_url}
                    onChange={(e) =>
                      setUploadForm((f) => ({
                        ...f,
                        external_url: e.target.value,
                        file: null,
                        html_code: ''
                      }))
                    }
                  />
                  <span className="mt-1 block text-[10px] text-slate-500">
                    Öğrenci izlerken ortalanmış sayfada “NotebookLM’de aç” butonu görür (iframe
                    engelli siteler için).
                  </span>
                </label>
              )}
            </div>
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

      <EduAnimationPoolClassNav
        selectedClassLevel={classLevel}
        selectedSubject={subjectName}
        showingSearchResults={showingSearchResults}
        onSelectClass={(level) => {
          setClassLevel(level);
          setSubjectName(null);
        }}
        onSelectSubject={setSubjectName}
      />

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
                : classLevel
                  ? 'Bir ders seçin.'
                  : 'Sınıf seçin veya arama yapın.'}
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
                onAddToHomework={() => setHomeworkItem(item)}
                onEdit={() => {
                  setEditItem(item);
                  setEditForm({
                    title: item.title,
                    topic_name: item.topic_name,
                    subject_name: item.subject_name,
                    targetKeys: targetsToKeys(item.targets?.length ? item.targets : [{ program: item.program, class_level: item.class_level }])
                  });
                }}
                onDelete={() => void onDelete(item)}
              />
            ))}
          </div>
        )}
      </div>

      <EduAnimationPoolHomeworkModal
        item={homeworkItem}
        classes={classes}
        rows={rows}
        busy={busy}
        setBusy={setBusy}
        filterClassLevel={classLevel}
        filterProgram={activeClassCard?.program}
        onClose={() => setHomeworkItem(null)}
        onSubmit={onHomeworkCreated}
      />

      {editItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
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
              <div className="block text-sm">
                <span className="text-xs text-slate-600">Sınıf / Program</span>
                <div className="mt-2">
                  <EduAnimationPoolTargetPicker
                    selected={editForm.targetKeys}
                    onChange={(keys) => setEditForm((f) => ({ ...f, targetKeys: keys }))}
                  />
                </div>
              </div>
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
