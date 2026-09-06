/**
 * Planlayıcı grup adı ↔ canlı sınıf adı eşleştirme.
 * "8F" / "8-F" / "8 F" / "LGS 8F" gibi varyasyonları yakalar.
 */

export function normalizePlannerLabel(s: string): string {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/** Tire/nokta/boşluksuz anahtar: "8-F" → "8f" */
export function compactClassKey(s: string): string {
  return normalizePlannerLabel(s).replace(/[-_./\s]/g, '');
}

/** "8F", "8-F", "8 F A Şubesi" → "8f" */
export function extractGradeBranchKey(s: string): string | null {
  const compact = compactClassKey(s);
  const m = compact.match(/(?:^|[^0-9])([3-9]|1[0-2])([a-z])(?:$|[^a-z0-9])/i) || compact.match(/^([3-9]|1[0-2])([a-z])$/i);
  if (m) return `${m[1]}${m[2]}`.toLocaleLowerCase('tr-TR');
  // "8f..." başı
  const head = compact.match(/^([3-9]|1[0-2])([a-z])/i);
  return head ? `${head[1]}${head[2]}`.toLocaleLowerCase('tr-TR') : null;
}

export type NamedRow = { id: string; name: string };

export function pickClassForPlannerGroup<T extends NamedRow>(groupName: string, rows: T[]): T | null {
  const gn = normalizePlannerLabel(groupName);
  if (!gn || !Array.isArray(rows) || !rows.length) return null;

  const exact = rows.find((c) => normalizePlannerLabel(c.name) === gn);
  if (exact) return exact;

  const gKey = compactClassKey(groupName);
  const compactHit = rows.find((c) => compactClassKey(c.name) === gKey);
  if (compactHit) return compactHit;

  const gBranch = extractGradeBranchKey(groupName);
  if (gBranch) {
    const branchExact = rows.filter((c) => extractGradeBranchKey(c.name) === gBranch);
    if (branchExact.length === 1) return branchExact[0];
    if (branchExact.length > 1) {
      // En kısa / en yakın ad
      return [...branchExact].sort(
        (a, b) => compactClassKey(a.name).length - compactClassKey(b.name).length
      )[0];
    }
  }

  return (
    rows.find((c) => {
      const cn = normalizePlannerLabel(c.name);
      return cn.includes(gn) || gn.includes(cn);
    }) || null
  );
}
