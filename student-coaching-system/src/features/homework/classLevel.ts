/**
 * Denenecek sınıf düzeyi yazımları. 8. sınıf ile LGS aynı konu havuzunu paylaşır;
 * sınıf kaydında hangisi yazılıysa diğeri de denenir.
 */
export function levelCandidates(classLevel?: string | number | null): Array<string | number> {
  const raw = String(classLevel ?? '').trim();
  if (!raw) return [];
  const out: Array<string | number> = [raw];
  const n = Number(raw);
  if (Number.isFinite(n)) out.push(n);
  if (raw.toLocaleUpperCase('tr') === 'LGS') out.push(8, '8');
  if (n === 8) out.push('LGS');
  return out;
}
