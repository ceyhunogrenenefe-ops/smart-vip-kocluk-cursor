/** Türkçe ad/soyad — UserManagement ile uyumlu ayırma ve ada göre sıralama */

export function splitPersonName(fullName: string): { firstName: string; lastName: string } {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1]!
  };
}

const TR_COLLATOR = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });

/** Önce ada, eşitse soyada göre (tr locale) */
export function compareByFirstName(aName: string, bName: string): number {
  const a = splitPersonName(aName);
  const b = splitPersonName(bName);
  const byFirst = TR_COLLATOR.compare(a.firstName, b.firstName);
  if (byFirst !== 0) return byFirst;
  return TR_COLLATOR.compare(a.lastName, b.lastName);
}

export function sortByFirstName<T>(items: readonly T[], getName: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareByFirstName(getName(a), getName(b)));
}
