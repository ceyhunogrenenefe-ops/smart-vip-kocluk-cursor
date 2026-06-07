/** Veli kayıt programı → konu havuzu sınıf anahtarı (students.class_level) */
export const MAARIF_VELI_PROGRAMS = new Set(['TYT yaz kampı', 'TYT Maarif Model yaz kampı']);

export function isMaarifVeliProgram(program: string): boolean {
  return MAARIF_VELI_PROGRAMS.has(String(program || '').trim());
}

export function resolveSinifFromVeliKayit(program: string, sinifForm?: string): string {
  const p = String(program || '').trim();
  if (isMaarifVeliProgram(p)) return 'TYT-Maarif';
  if (p === 'YÖS dönem programı') return 'YOS';
  if (p === 'LGS dönem programı' || p === 'LGS yaz kampı') return 'LGS';
  return String(sinifForm || '').trim();
}
