import {
  ANIMATION_POOL_CLASS_CARDS,
  ANIMATION_POOL_EXTRA_TARGETS,
  classCardForLevel,
  subjectsForPoolClass
} from '../../lib/eduPanel/eduAnimationPoolCatalog';

type Props = {
  selectedClassLevel: string | null;
  selectedSubject: string | null;
  showingSearchResults: boolean;
  onSelectClass: (classLevel: string) => void;
  onSelectSubject: (subject: string) => void;
};

function ClassButton({
  classLevel,
  label,
  badge,
  selected,
  onSelect
}: {
  classLevel: string;
  label: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
        selected
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'bg-white text-indigo-900 ring-1 ring-indigo-100 hover:bg-indigo-50'
      }`}
    >
      <span>{label}</span>
      {badge ? (
        <span
          className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            selected ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export default function EduAnimationPoolClassNav({
  selectedClassLevel,
  selectedSubject,
  showingSearchResults,
  onSelectClass,
  onSelectSubject
}: Props) {
  if (showingSearchResults) return null;

  const activeCard = classCardForLevel(selectedClassLevel);
  const subjects = selectedClassLevel ? subjectsForPoolClass(selectedClassLevel) : [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sınıf</p>
        <div className="flex flex-wrap gap-2">
          {ANIMATION_POOL_CLASS_CARDS.map((card) => (
            <ClassButton
              key={card.classLevel}
              classLevel={card.classLevel}
              label={card.label}
              badge={card.badge}
              selected={selectedClassLevel === card.classLevel}
              onSelect={() => onSelectClass(card.classLevel)}
            />
          ))}
        </div>
      </div>

      {ANIMATION_POOL_EXTRA_TARGETS.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Program & Kamp
          </p>
          <div className="flex flex-wrap gap-2">
            {ANIMATION_POOL_EXTRA_TARGETS.map((card) => (
              <ClassButton
                key={card.classLevel}
                classLevel={card.classLevel}
                label={card.label}
                badge={card.badge}
                selected={selectedClassLevel === card.classLevel}
                onSelect={() => onSelectClass(card.classLevel)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {activeCard ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ders</p>
          <div className="flex flex-wrap gap-2">
            {subjects.map((subject) => (
              <button
                key={subject}
                type="button"
                onClick={() => onSelectSubject(subject)}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
                  selectedSubject === subject
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-emerald-900 ring-1 ring-emerald-100 hover:bg-emerald-50'
                }`}
              >
                {subject}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
