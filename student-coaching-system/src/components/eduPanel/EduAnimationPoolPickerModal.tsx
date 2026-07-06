import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import EduAnimationPoolCard from './EduAnimationPoolCard';
import EduAnimationPoolClassNav from './EduAnimationPoolClassNav';
import { classCardForLevel } from '../../lib/eduPanel/eduAnimationPoolCatalog';
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
  const [classLevel, setClassLevel] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);

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
    if (!open) return;
    void load();
  }, [open, load]);

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

        <div className="border-b border-slate-100 px-4 py-3">
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
        </div>

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
                    : 'Sınıf seçin veya arama yapın.'}
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
