// Etkinlik katılımcıları — Excel/CSV içe aktarma
import * as XLSX from 'xlsx';
import {
  normalizeImportedPhone,
  readUserImportFileAsGrid,
  turkishFold
} from './userBulkImport';

export const EVENT_PARTICIPANT_TEMPLATE_HEADERS = ['Ad Soyad', 'Telefon'] as const;

export type ParsedEventParticipantRow = {
  display_name: string;
  phone: string;
  rowNumber: number;
};

export type EventParticipantImportResult = {
  rows: ParsedEventParticipantRow[];
  skipped: number;
  headerError: string | null;
};

function cellValueToString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function headerToKey(h: string): 'name' | 'phone' | null {
  const n = turkishFold(h);
  if (!n) return null;
  if (
    /^(ad soyad|adi soyadi|isim|katilimci|katilimci adi|name|full name|participant)/.test(n) ||
    /^(ad|adi)$/.test(n)
  ) {
    return 'name';
  }
  if (
    /(telefon|tel|gsm|cep|mobile|phone)/.test(n)
  ) {
    return 'phone';
  }
  return null;
}

function buildColumnMap(headerRow: unknown[]): Map<'name' | 'phone', number> {
  const map = new Map<'name' | 'phone', number>();
  headerRow.forEach((h, i) => {
    const key = headerToKey(cellValueToString(h));
    if (key != null && !map.has(key)) map.set(key, i);
  });
  return map;
}

export function parseEventParticipantGrid(grid: unknown[][]): EventParticipantImportResult {
  if (!grid.length) {
    return { rows: [], skipped: 0, headerError: 'Dosya boş.' };
  }

  let headerIdx = 0;
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const row = grid[i] || [];
    const keys = row.map((c) => headerToKey(cellValueToString(c))).filter(Boolean);
    if (keys.length >= 1) {
      headerIdx = i;
      break;
    }
  }

  const headerRow = grid[headerIdx] || [];
  const colMap = buildColumnMap(headerRow);
  if (!colMap.has('name') || !colMap.has('phone')) {
    return {
      rows: [],
      skipped: 0,
      headerError: 'Ad ve Telefon sütunları bulunamadı. Örnek şablonu indirip kullanın.'
    };
  }

  const nameCol = colMap.get('name')!;
  const phoneCol = colMap.get('phone')!;
  const out: ParsedEventParticipantRow[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const line = grid[i] || [];
    const display_name = cellValueToString(line[nameCol]);
    const phone = normalizeImportedPhone(line[phoneCol]);
    if (!display_name && !phone) continue;
    if (!display_name || !phone) {
      skipped++;
      continue;
    }
    out.push({ display_name, phone, rowNumber: i + 1 });
  }

  return { rows: out, skipped, headerError: null };
}

export async function readEventParticipantImportFile(file: File): Promise<EventParticipantImportResult> {
  const grid = await readUserImportFileAsGrid(file);
  return parseEventParticipantGrid(grid);
}

export function downloadEventParticipantTemplateXlsx(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    [...EVENT_PARTICIPANT_TEMPLATE_HEADERS],
    ['Ayşe Yılmaz', '05551112233'],
    ['Mehmet Kaya', '05552223344']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Katilimcilar');
  XLSX.writeFile(wb, 'etkinlik_katilimci_sablonu.xlsx');
}
