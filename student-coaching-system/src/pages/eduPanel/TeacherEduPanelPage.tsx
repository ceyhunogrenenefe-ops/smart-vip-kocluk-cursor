import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, GraduationCap, Layers, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import EduAnimationPreviewModal from '../../components/eduPanel/EduAnimationPreviewModal';
import TeacherEduTopicCard from '../../components/eduPanel/TeacherEduTopicCard';
import { useEduAnimationPreview } from '../../components/eduPanel/useEduAnimationPreview';
import type { EduClass, LessonRowFormValues, SubjectColor } from '../../types/eduPanel.types';
import { buildLevelGroups, filterRows, subjectsForLevel } from '../../lib/eduPanel/eduPanelUi';
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

export default function TeacherEduPanelPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchEduLessonRows>>>([]);
  const [classes, setClasses] = useState<EduClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [levelKey, setLevelKey] = useState<string>(ALL_LEVELS);
  const [subjectName, setSubjectName] = useState<string>(ALL_SUBJECTS);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<LessonRowFormValues>({
    class_id: '',
    title: '',
    subject_name: 'Matematik',
    subject_color: 'blue',
    lesson_date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    notes: ''
  });

  const [hwTitle, setHwTitle] = useState<Record<string, string>>({});
  const preview = useEduAnimationPreview();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([fetchEduLessonRows(), fetchEduClasses()]);
      setRows(r);
      setClasses(c);
      if (c.length) {
        setForm((f) => (f.class_id ? f : { ...f, class_id: c[0].id }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const onSelectLevel = (key: string) => {
    setLevelKey(key);
    setSubjectName(ALL_SUBJECTS);
    if (key === ALL_LEVELS) {
      setForm((f) => ({ ...f, class_id: classes[0]?.id || '' }));
    } else {
      const lg = levelGroups.find((g) => g.levelKey === key);
      const first = lg?.classIds[0];
      if (first) setForm((f) => ({ ...f, class_id: first }));
    }
  };

  const onCreateRow = async () => {
    if (!form.class_id || !form.title.trim()) {
      toast.error('Sınıf ve konu başlığı zorunlu');
      return;
    }
    setBusy(true);
    try {
      const created = await createEduLessonRow(form);
      toast.success(`「${form.title}」 konusu oluşturuldu`);
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
    const title = (hwTitle[rowId] || '').trim();
    if (!title) return;
    setBusy(true);
    try {
      const hw = await createEduHomework(rowId, { title, status: 'draft' });
      await publishEduHomework(hw.id);
      toast.success(`Ödev 「${rowTitle}」 konusuna eklendi`);
      setHwTitle((h) => ({ ...h, [rowId]: '' }));
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
        <h1 className="text-2xl font-bold">Ders içerik paneli</h1>
        <p className="mt-1 text-sm text-violet-100">
          Önce sınıf kademesini, sonra dersi seçin. Her ders altındaki konu kartları öğrenciye yalnızca
          ilgili sınıf ve ders bağlamında gösterilir.
        </p>
      </div>

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
              Konuyu bir sınıfa ve derse bağlayın. Üst kademe seçici otomatik kullanılır.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-slate-600">Sınıf</span>
                <select
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={form.class_id}
                  onChange={(e) => setForm((f) => ({ ...f, class_id: e.target.value }))}
                >
                  <option value="">Seçin…</option>
                  {(activeLevel ? activeLevel.classes : classes).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Ders tarihi</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={form.lesson_date}
                  onChange={(e) => setForm((f) => ({ ...f, lesson_date: e.target.value }))}
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
              className={classNameById.get(row.class_id) || 'Sınıf'}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
              busy={busy}
              hwTitle={hwTitle[row.id] || ''}
              onHwTitleChange={(v) => setHwTitle((h) => ({ ...h, [row.id]: v }))}
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
              onPublish={() =>
                void updateEduLessonRow(row.id, { status: 'active' }).then(() => {
                  toast.success('Konu yayında');
                  void load();
                })
              }
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
