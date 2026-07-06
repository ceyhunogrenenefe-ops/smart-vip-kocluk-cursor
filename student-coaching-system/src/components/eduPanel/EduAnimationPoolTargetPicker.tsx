import {
  ANIMATION_POOL_TARGET_GROUPS,
  poolTargetKey,
  type AnimationPoolProgram
} from '../../lib/eduPanel/eduAnimationPoolCatalog';

type Props = {
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
};

export default function EduAnimationPoolTargetPicker({ selected, onChange, disabled }: Props) {
  const toggle = (key: string) => {
    if (disabled) return;
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  return (
    <div className="space-y-4">
      {ANIMATION_POOL_TARGET_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.items.map((item) => {
              const key = poolTargetKey(item.program, item.classLevel);
              const active = selected.includes(key);
              return (
                <label
                  key={key}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    active
                      ? 'border-violet-400 bg-violet-50 text-violet-900 ring-1 ring-violet-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/40'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-400"
                    checked={active}
                    disabled={disabled}
                    onChange={() => toggle(key)}
                  />
                  <span>
                    {item.label}
                    {item.badge ? (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {selected.length === 0 ? (
        <p className="text-xs text-amber-700">En az bir sınıf veya program seçin.</p>
      ) : (
        <p className="text-xs text-slate-500">{selected.length} kategori seçildi</p>
      )}
    </div>
  );
}

export function targetsToKeys(
  targets: { program: AnimationPoolProgram; class_level: string }[]
): string[] {
  return targets.map((t) => poolTargetKey(t.program, t.class_level));
}
