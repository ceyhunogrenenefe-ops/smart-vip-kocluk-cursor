import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import EduAnimationPoolCard from './EduAnimationPoolCard';
import {
  ANIMATION_POOL_PROGRAMS,
  subjectsForPoolClass,
  type AnimationPoolProgram
} from '../../lib/eduPanel/eduAnimationPoolCatalog';
import { fetchEduAnimationPool } from '../../lib/eduPanel/eduPanelApi';
import type { EduAnimationPoolItem } from '../../types/eduPanel.types';

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (item: EduAnimationPoolItem) => void;
  onPreview: (item: EduAnimationPoolItem) => void;
  selectLabel?: string;
  title?: string;
};

export default function EduAnimationPoolPickerModal({
  open,
  onClose,
  onSelect,
  onPreview,
  selectLabel = 'Seç',
  title = 'Animasyon Havuzu'
}: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EduAnimationPoolItem[]>([]);
  const [search, setSearch] = useState('');
  const [program, setProgram] = useState<AnimationPoolProgram | null>(null);
  const [classLevel, setClassLevel] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);

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
    if (!open) return;
    void load();
  }, [open, load]);

  const activeProgram = useMemo(
    () => ANIMATION_POOL_PROGRAMS.find((p) => p.key === program) || null,
    [program]
  );

  const subjects = useMemo(
    () => (classLevel ? subjectsForPoolClass(classLevel) : []),
    [classLevel]
  );

  const showingSearchResults = search.trim().length > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Animasyon adı, ders veya konu ara…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
            />
          </div>
        </div>

        {!showingSearchResults ? (
          <div className="space-y-3 border-b border-slate-100 px-4 py-3">
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
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                    program === p.key
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {activeProgram ? (
              <div className="flex flex-wrap gap-2">
                {activeProgram.levels.map((lvl) => (
                  <button
                    key={lvl.value}
                    type="button"
                    onClick={() => {
                      setClassLevel(lvl.value);
                      setSubjectName(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      classLevel === lvl.value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            ) : null}

            {classLevel ? (
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubjectName(s)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      subjectName === s
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              {showingSearchResults
                ? 'Aramanızla eşleşen animasyon bulunamadı.'
                : subjectName
                  ? 'Bu derste henüz animasyon yok.'
                  : classLevel
                    ? 'Bir ders seçin.'
                    : program
                      ? 'Bir sınıf seçin.'
                      : 'Kategori seçin veya arama yapın.'}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <EduAnimationPoolCard
                  key={item.id}
                  item={item}
                  busy={loading}
                  onPreview={() => onPreview(item)}
                  onAddToHomework={() => onSelect(item)}
                  addLabel={selectLabel}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
