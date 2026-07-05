import { useCallback, useEffect, useMemo, useState } from 'react';
import { EDU_HOMEWORK_ANIMATIONS_LABEL } from '../../components/layout/sidebar/navModel';
import { BookOpen, Clapperboard, GraduationCap, Layers, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import EduAnimationPreviewModal from '../../components/eduPanel/EduAnimationPreviewModal';
import EduAnimationPoolPickerModal from '../../components/eduPanel/EduAnimationPoolPickerModal';
import EduAnimationPoolTab from '../../components/eduPanel/EduAnimationPoolTab';
import TeacherEduTopicCard from '../../components/eduPanel/TeacherEduTopicCard';
import { useEduAnimationPreview } from '../../components/eduPanel/useEduAnimationPreview';
import { useAuth } from '../../context/AuthContext';
import type { EduAnimationPoolItem, EduClass, EduLessonRow, LessonRowFormValues, SubjectColor } from '../../types/eduPanel.types';
import { buildLevelGroups, filterRows, subjectsForLevel } from '../../lib/eduPanel/eduPanelUi';
import {
  EMPTY_HOMEWORK_DRAFT,
  homeworkTitleForApi,
  validateHomeworkDraft,
  type EduHomeworkDraft
} from '../../lib/eduPanel/eduHomeworkForm';
import { listBookOrderSets } from '../../lib/bookOrdersApi';
import {
  createEduHomework,
  createEduLessonRow,
  deleteEduAnimation,
  deleteEduLessonRow,
  fetchEduClasses,
  fetchEduLessonRows,
  publishEduHomework,
  SUBJECT_COLORS,
  updateEduLessonRow,
  uploadEduAnimation
} from '../../lib/eduPanel/eduPanelApi';

const ALL_LEVELS = '__all__';
const ALL_SUBJECTS = '__all__';
type PageTab = 'topics' | 'pool';

function defaultUntil(from: string): string {
  const d = new Date(`${from.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

export default function TeacherEduPanelPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchEduLessonRows>>>([]);
  const [classes, setClasses] = useState<EduClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [levelKey, setLevelKey] = useState<string>(ALL_LEVELS);
  const [subjectName, setSubjectName] = useState<string>(ALL_SUBJECTS);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pageTab, setPageTab] = useState<PageTab>('topics');
  const [poolPickerRowId, setPoolPickerRowId] = useState<string | null>(null);

  const [form, setForm] = useState<LessonRowFormValues>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      class_id: '',
      class_ids: [],
      title: '',
      subject_name: 'Matematik',
      subject_color: 'blue',
      lesson_date: today,
      available_from: today,
      available_until: defaultUntil(today),
      status: 'draft',
      notes: ''
    };
  });

  const [hwDraft, setHwDraft] = useState<Record<string, EduHomeworkDraft>>({});
  const [bookSuggestions, setBookSuggestions] = useState<string[]>([]);
  const preview = useEduAnimationPreview();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([fetchEduLessonRows(), fetchEduClasses()]);
      setRows(r);
      setClasses(c);
      if (c.length) {
        setForm((f) =>
          f.class_ids?.length
            ? f
            : { ...f, class_id: c[0].id, class_ids: [c[0].id] }
        );
      }
      try {
        const sets = await listBookOrderSets(user?.institutionId);
        setBookSuggestions(
          [...new Set((sets || []).map((s) => s.name).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b, 'tr')
          )
        );
      } catch {
        /* kitap setleri opsiyonel */
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [user?.institutionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const levelGroups = useMemo(() => buildLevelGroups(classes, rows), [classes, rows]);

  const activeLevel = useMemo(
    () => (levelKey === ALL_LEVELS ? null : levelGroups.find((g) => g.levelKey === levelKey) || null),
    [levelGroups, levelKey]
  );

  const classIdsInLevel = useMemo(() => {
    if (activeLevel) return activeLevel.classIds;
    return classes.map((c) => c.id);
  }, [activeLevel, classes]);

  const subjects = useMemo(
    () => subjectsForLevel(rows, classIdsInLevel),
    [rows, classIdsInLevel]
  );

  const filteredRows = useMemo(
    () =>
      filterRows(rows, {
        classIdsInLevel: activeLevel ? activeLevel.classIds : undefined,
        subjectName: subjectName === ALL_SUBJECTS ? null : subjectName
      }),
    [rows, activeLevel, subjectName]
  );

  const classNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of classes) m.set(c.id, c.name);
    return m;
  }, [classes]);

  const classesForForm = useMemo(
    () => (activeLevel ? activeLevel.classes : classes),
    [activeLevel, classes]
  );

  const onSelectLevel = (key: string) => {
    setLevelKey(key);
    setSubjectName(ALL_SUBJECTS);
    if (key === ALL_LEVELS) {
      const first = classes[0]?.id;
      if (first) setForm((f) => ({ ...f, class_id: first, class_ids: [first] }));
    } else {
      const lg = levelGroups.find((g) => g.levelKey === key);
      const first = lg?.classIds[0];
      if (first) setForm((f) => ({ ...f, class_id: first, class_ids: [first] }));
    }
  };

  const rowClassLabels = useCallback(
    (row: EduLessonRow) => {
      const ids = row.class_ids?.length ? row.class_ids : [row.class_id];
      return ids.map((id) => classNameById.get(id) || 'Sınıf').filter(Boolean);
    },
    [classNameById]
  );

  const onEditRow = async (rowId: string, patch: Partial<LessonRowFormValues>) => {
    setBusy(true);
    try {
      const { warning } = await updateEduLessonRow(rowId, patch);
      toast.success('Konu güncellendi');
      if (warning) {
        toast.warning(
          'Çoklu sınıf tablosu henüz yok — yalnızca birincil sınıf kaydedildi. Supabase\'de 2026-06-25-edu-lesson-row-classes.sql çalıştırın.'
        );
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const onCreateRow = async () => {
    const classIds = form.class_ids?.length
      ? form.class_ids
      : form.class_id
        ? [form.class_id]
        : [];
    if (!classIds.length || !form.title.trim()) {
      toast.error('En az bir sınıf ve konu başlığı zorunlu');
      return;
    }
    setBusy(true);
    try {
      const { data: created, warning, hint } = await createEduLessonRow({
        ...form,
        class_ids: classIds,
        class_id: classIds[0]
      });
      toast.success(`「${form.title}」 konusu oluşturuldu`);
      if (warning) {
        toast.warning(
          hint ||
            'Çoklu sınıf tablosu henüz yok — yalnızca birincil sınıf kaydedildi. Supabase\'de 2026-06-25-edu-lesson-row-classes.sql çalıştırın.'
        );
      }
      setForm((f) => ({ ...f, title: '', notes: '' }));
      setExpandedId(created.id);
      setShowCreate(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const onUploadHtml = async (rowId: string, rowTitle: string, file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.html')) {
      toast.error('Sadece .html dosyası');
      return;
    }
    setBusy(true);
    try {
      const anim = await uploadEduAnimation(rowId, file);
      toast.success(`Animasyon 「${rowTitle}」 konusuna eklendi`);
      setExpandedId(rowId);
      void load();
      try {
        await preview.open(anim.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Önizleme açılamadı');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const onAddHomework = async (rowId: string, rowTitle: string) => {
    const draft = hwDraft[rowId] || EMPTY_HOMEWORK_DRAFT;
    const err = validateHomeworkDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const hw = await createEduHomework(rowId, {
        title: homeworkTitleForApi(draft),
        book_name: draft.book_name.trim() || undefined,
        question_range: draft.question_range.trim() || undefined,
        status: 'draft',
        pool_animation_id: draft.pool_animation_id
      });
      await publishEduHomework(hw.id);
      toast.success(`Ödev eklendi: ${homeworkTitleForApi(draft)}`);
      setHwDraft((h) => ({ ...h, [rowId]: { ...EMPTY_HOMEWORK_DRAFT } }));
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ödev eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white">
        <h1 className="text-2xl font-bold">{EDU_HOMEWORK_ANIMATIONS_LABEL}</h1>
        <p className="mt-1 text-sm text-violet-100">
          Önce sınıf kademesini, sonra dersi seçin. Her ders altındaki konu kartları öğrenciye yalnızca
          ilgili sınıf ve ders bağlamında gösterilir.
        </p>
      </div>

      <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setPageTab('topics')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            pageTab === 'topics'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Animasyonlarım
        </button>
        <button
          type="button"
          onClick={() => setPageTab('pool')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            pageTab === 'pool'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Clapperboard className="h-4 w-4" />
          Animasyon Havuzu
        </button>
      </div>

      {pageTab === 'pool' ? (
        <EduAnimationPoolTab
          rows={rows}
          busy={busy}
          setBusy={setBusy}
          onPreview={(item) =>
            void preview.openPool(item.id).catch((e) =>
              toast.error(e instanceof Error ? e.message : 'Önizleme açılamadı')
            )
          }
          onAttached={() => void load()}
        />
      ) : (
        <>
      {/* 1. Seviye — Sınıf kademesi */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Layers className="h-3.5 w-3.5 text-violet-600" />
          Sınıf
        </div>
        <div className="flex flex-wrap gap-2">
          <LevelChip
            label="Tümü"
            count={rows.length}
            active={levelKey === ALL_LEVELS}
            onClick={() => onSelectLevel(ALL_LEVELS)}
          />
          {levelGroups.map((g) => (
            <LevelChip
              key={g.levelKey}
              label={g.levelLabel}
              count={g.rowCount}
              active={levelKey === g.levelKey}
              onClick={() => onSelectLevel(g.levelKey)}
              subLabel={
                g.classes.length > 1 ? `${g.classes.length} sınıf` : g.classes[0]?.name
              }
            />
          ))}
          {levelGroups.length === 0 ? (
            <p className="text-xs text-slate-500">
              Henüz sınıf yok. Önce «Canlı dersler»den sınıf oluşturun.
            </p>
          ) : null}
        </div>
      </section>

      {/* 2. Seviye — Dersler */}
      {activeLevel || classes.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <BookOpen className="h-3.5 w-3.5 text-violet-600" />
            Ders
            {activeLevel ? (
              <span className="ml-2 text-[11px] font-normal normal-case text-slate-400">
                · {activeLevel.levelLabel}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <SubjectChip
              label="Tümü"
              count={filterRows(rows, {
                classIdsInLevel: activeLevel ? activeLevel.classIds : undefined
              }).length}
              active={subjectName === ALL_SUBJECTS}
              onClick={() => setSubjectName(ALL_SUBJECTS)}
            />
            {subjects.map((s) => (
              <SubjectChip
                key={s.subjectName}
                label={s.subjectName}
                count={s.count}
                active={subjectName === s.subjectName}
                onClick={() => setSubjectName(s.subjectName)}
              />
            ))}
            {subjects.length === 0 ? (
              <p className="text-xs text-slate-500">Bu kademede henüz konu yok.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Yeni konu */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
          onClick={() => setShowCreate((s) => !s)}
        >
          <span className="font-semibold text-slate-800 flex items-center gap-2">
            <Plus className="h-4 w-4 text-violet-600" />
            Yeni konu
          </span>
          <span className="text-xs text-slate-500">{showCreate ? 'Gizle' : 'Aç'}</span>
        </button>
        {showCreate ? (
          <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
            <p className="text-xs text-slate-600">
              Konuyu bir veya birden fazla sınıfa bağlayın. Üst kademe seçici otomatik kullanılır.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm sm:col-span-2">
                <span className="text-slate-600">Sınıflar</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {classesForForm.map((c) => {
                    const checked = (form.class_ids || []).includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                          checked
                            ? 'border-violet-400 bg-violet-50 text-violet-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-violet-600"
                          checked={checked}
                          onChange={(e) => {
                            setForm((f) => {
                              const prev = f.class_ids || (f.class_id ? [f.class_id] : []);
                              const next = e.target.checked
                                ? [...new Set([...prev, c.id])]
                                : prev.filter((id) => id !== c.id);
                              return {
                                ...f,
                                class_ids: next,
                                class_id: next[0] || ''
                              };
                            });
                          }}
                        />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
                {!classesForForm.length ? (
                  <p className="mt-1 text-xs text-slate-500">Önce sınıf oluşturun.</p>
                ) : null}
              </div>
              <label className="text-sm">
                <span className="text-slate-600">Ders tarihi</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={form.lesson_date}
                  onChange={(e) => {
                    const d = e.target.value;
                    setForm((f) => ({
                      ...f,
                      lesson_date: d,
                      available_from: f.available_from || d,
                      available_until: f.available_until || defaultUntil(d)
                    }));
                  }}
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Erişim başlangıcı</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={form.available_from || form.lesson_date}
                  onChange={(e) => setForm((f) => ({ ...f, available_from: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Bitiş (son gün)</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={form.available_until || defaultUntil(form.lesson_date)}
                  onChange={(e) => setForm((f) => ({ ...f, available_until: e.target.value }))}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-slate-600">Konu başlığı</span>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  placeholder="Örn. Üslü sayılar"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-slate-600">Konu notu (isteğe bağlı)</span>
                <textarea
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white min-h-[60px]"
                  placeholder="Öğrenciye kısa açıklama"
                  value={form.notes || ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Ders</span>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  list="edu-subject-suggest"
                  placeholder="Örn. Matematik"
                  value={form.subject_name}
                  onChange={(e) => setForm((f) => ({ ...f, subject_name: e.target.value }))}
                />
                <datalist id="edu-subject-suggest">
                  {subjects.map((s) => (
                    <option key={s.subjectName} value={s.subjectName} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Renk</span>
                <select
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={form.subject_color}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subject_color: e.target.value as SubjectColor }))
                  }
                >
                  {SUBJECT_COLORS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCreateRow()}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Konu oluştur
            </button>
          </div>
        ) : null}
      </div>

      {/* Konular */}
      {filteredRows.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-8">
          Bu seçim için henüz konu yok. «Yeni konu» bölümünden ekleyin.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <GraduationCap className="h-3.5 w-3.5 text-violet-600" />
            <span>{filteredRows.length} konu</span>
          </div>
          {filteredRows.map((row) => (
            <TeacherEduTopicCard
              key={row.id}
              row={row}
              classNames={rowClassLabels(row)}
              classes={classes}
              bookSuggestions={bookSuggestions}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
              busy={busy}
              hwDraft={hwDraft[row.id] || EMPTY_HOMEWORK_DRAFT}
              onHwDraftChange={(draft) =>
                setHwDraft((h) => ({ ...h, [row.id]: draft }))
              }
              onUploadHtml={(file) => void onUploadHtml(row.id, row.title, file)}
              onPreview={(id) =>
                void preview.open(id).catch((e) =>
                  toast.error(e instanceof Error ? e.message : 'Önizleme açılamadı')
                )
              }
              onDeleteAnimation={(id) =>
                void deleteEduAnimation(id).then(() => {
                  toast.success('Animasyon silindi');
                  void load();
                })
              }
              onAddHomework={() => void onAddHomework(row.id, row.title)}
              onOpenPoolPicker={() => setPoolPickerRowId(row.id)}
              onPublish={() =>
                void updateEduLessonRow(row.id, { status: 'active' }).then(() => {
                  toast.success('Konu yayında — öğrenciler görebilir');
                  void load();
                })
              }
              onEdit={(patch) => onEditRow(row.id, patch)}
              onDeleteRow={() =>
                void deleteEduLessonRow(row.id).then(() => {
                  toast.success('Konu silindi');
                  if (expandedId === row.id) setExpandedId(null);
                  void load();
                })
              }
            />
          ))}
        </div>
      )}
        </>
      )}

      <EduAnimationPoolPickerModal
        open={Boolean(poolPickerRowId)}
        onClose={() => setPoolPickerRowId(null)}
        title="Animasyon Seç"
        selectLabel="Ödeve Ekle"
        onPreview={(item) =>
          void preview.openPool(item.id).catch((e) =>
            toast.error(e instanceof Error ? e.message : 'Önizleme açılamadı')
          )
        }
        onSelect={(item: EduAnimationPoolItem) => {
          if (!poolPickerRowId) return;
          setHwDraft((h) => ({
            ...h,
            [poolPickerRowId]: {
              ...(h[poolPickerRowId] || EMPTY_HOMEWORK_DRAFT),
              pool_animation_id: item.id,
              pool_animation_title: item.title
            }
          }));
          setPoolPickerRowId(null);
          toast.success(`「${item.title}」 ödeve eklenecek`);
        }}
      />

      <EduAnimationPreviewModal
        open={preview.isOpen}
        animUrl={preview.animUrl}
        loading={preview.loading}
        onClose={preview.close}
      />
    </div>
  );
}

type LevelChipProps = {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  subLabel?: string;
};

function LevelChip({ label, count, active, onClick, subLabel }: LevelChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-left transition shadow-sm ${
        active
          ? 'bg-violet-600 text-white ring-2 ring-violet-500/40'
          : 'bg-white border border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50/40'
      }`}
    >
      <GraduationCap
        className={`h-4 w-4 ${active ? 'text-white' : 'text-violet-500 group-hover:text-violet-600'}`}
      />
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">{label}</span>
        {subLabel ? (
          <span className={`text-[10px] ${active ? 'text-violet-100' : 'text-slate-400'}`}>
            {subLabel}
          </span>
        ) : null}
      </span>
      <span
        className={`ml-1 inline-flex items-center justify-center rounded-full px-2 text-[10px] font-semibold ${
          active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

type SubjectChipProps = {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
};

function SubjectChip({ label, count, active, onClick }: SubjectChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'bg-indigo-600 text-white shadow'
          : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40'
      }`}
    >
      <BookOpen className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span
        className={`inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
          active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {count}
      </span>
    </button>
  );
}
