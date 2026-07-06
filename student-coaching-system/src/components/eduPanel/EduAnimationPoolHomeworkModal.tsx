import { useMemo, useState } from 'react';
import { BookOpen, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  assignPoolAnimationHomework,
  classesMatchingPoolItem
} from '../../lib/eduPanel/eduAnimationHomeworkFlow';
import {
  classCardForPoolItem,
  poolClassLevelLabel
} from '../../lib/eduPanel/eduAnimationPoolCatalog';
import { listTopicsForPoolAnimation } from '../../lib/eduPanel/eduAnimationTopicBridge';
import type { EduAnimationPoolItem, EduClass, EduLessonRow } from '../../types/eduPanel.types';

type Props = {
  item: EduAnimationPoolItem | null;
  classes: EduClass[];
  rows: EduLessonRow[];
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
  setBusy: (v: boolean) => void;
  filterClassLevel?: string | null;
  filterProgram?: string | null;
};

export default function EduAnimationPoolHomeworkModal({
  item,
  classes,
  rows,
  busy,
  onClose,
  onSubmit,
  setBusy,
  filterClassLevel,
  filterProgram
}: Props) {
  const { user } = useAuth();
  const { getTopics, getTopicsByClass } = useApp();
  const [search, setSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');

  const filterContext = useMemo(
    () =>
      filterClassLevel || filterProgram
        ? { classLevel: filterClassLevel || undefined, program: filterProgram || undefined }
        : undefined,
    [filterClassLevel, filterProgram]
  );

  const matchingClasses = useMemo(
    () => (item ? classesMatchingPoolItem(classes, item, filterContext) : []),
    [classes, item, filterContext]
  );

  const activeClassId = selectedClassId || matchingClasses[0]?.id || classes[0]?.id || '';

  const topicOptions = useMemo(() => {
    if (!item) return [];
    return listTopicsForPoolAnimation(item, getTopics, getTopicsByClass, filterContext);
  }, [item, getTopics, getTopicsByClass, filterContext]);

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return topicOptions;
    return topicOptions.filter((opt) => opt.topic.toLocaleLowerCase('tr').includes(q));
  }, [topicOptions, search]);

  if (!item) return null;

  const classCard = classCardForPoolItem(item, filterContext);
  const classLabel = classCard
    ? classCard.badge
      ? `${classCard.label} (${classCard.badge})`
      : classCard.label
    : poolClassLevelLabel(item.program, item.class_level);

  const onPickTopic = async (topic: string, subjectKey: string) => {
    if (!activeClassId || !user?.id) return;
    setBusy(true);
    try {
      await assignPoolAnimationHomework({
        poolItem: item,
        topicTitle: topic,
        subjectKey,
        classId: activeClassId,
        classIds: [activeClassId],
        existingRows: rows,
        teacherUserId: String(user.id)
      });
      onSubmit();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ödev oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-bold text-slate-900">Konu seçin</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b bg-violet-50/60 px-4 py-3 text-sm text-violet-950">
          <p className="font-semibold">「{item.title}」</p>
          <p className="mt-1 text-xs text-violet-800">
            {classLabel} · {item.subject_name} — konu havuzundan seçim yapın
          </p>
        </div>

        {matchingClasses.length > 1 ? (
          <div className="border-b px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sınıf grubu
            </p>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={activeClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              {matchingClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : matchingClasses.length === 1 ? (
          <div className="border-b px-4 py-2 text-xs text-slate-600">
            Sınıf: <strong>{matchingClasses[0].name}</strong>
          </div>
        ) : classes.length ? (
          <div className="border-b px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sınıf grubu
            </p>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={activeClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="border-b px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Konu ara…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredTopics.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-slate-500">
              <BookOpen className="h-8 w-8 text-slate-300" />
              <p>
                {topicOptions.length === 0
                  ? `${classLabel} ${item.subject_name} için konu havuzunda kayıt bulunamadı.`
                  : 'Aramanızla eşleşen konu yok.'}
              </p>
            </div>
          ) : (
            filteredTopics.map((opt) => (
              <button
                key={`${opt.subjectKey}::${opt.topic}`}
                type="button"
                disabled={busy || !activeClassId}
                onClick={() => void onPickTopic(opt.topic, opt.subjectKey)}
                className="flex w-full flex-col rounded-lg px-3 py-2.5 text-left hover:bg-violet-50 disabled:opacity-50"
              >
                <span className="text-sm font-medium text-slate-800">{opt.topic}</span>
                <span className="text-xs text-slate-500">{opt.subjectKey}</span>
              </button>
            ))
          )}
        </div>

        {busy ? (
          <div className="flex items-center justify-center gap-2 border-t px-4 py-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ödev oluşturuluyor…
          </div>
        ) : null}
      </div>
    </div>
  );
}
