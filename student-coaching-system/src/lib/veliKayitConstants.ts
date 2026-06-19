/** Veli kayıt formunda aynı anda seçilebilecek en fazla program sayısı. */
export const VELI_KAYIT_MAX_PROGRAMS = 2;

/** "TYT yaz kampı + TYT dönem programı" gibi birleşik program adını parçalar. */
export function splitVeliProgramAdi(raw: string): string[] {
  return String(raw || '')
    .split(/\s*\+\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function joinVeliProgramAdlari(programs: string[]): string {
  return programs.map((x) => x.trim()).filter(Boolean).join(' + ');
}

/** Veli kayıt formunda seçilecek program listesi (sabit). */
export const VELI_KAYIT_PROGRAM_SECENEKLERI: string[] = [
  '3. Sınıf dönem programı',
  '4. Sınıf dönem programı',
  '5, 6, 7. Sınıf dönem programı',
  'LGS dönem programı',
  'YÖS dönem programı',
  '9, 10, 11. Sınıf dönem programı',
  'TYT dönem programı',
  'AYT dönem programı',
  'TYT + AYT dönem programı',
  'TYT Maarif Model yaz kampı',
  'TYT yaz kampı',
  'LGS yaz kampı',
  '5, 6, 7. Sınıf yaz kampı',
  'Kitap Okuma Atölyesi',
  '3 ve 4. Sınıf yaz kampı'
];
