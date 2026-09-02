import { describe, expect, it } from 'vitest';
import {
  FORM_IMPORT_MARKER,
  attachFormImportPackageContents,
  buildFormImportNotes,
  formImportNoteId,
  mapFormStatusToOrderStatus,
  mapFormStatusToVendorStatus,
  parseFormImportLine,
  parseKitapLineTitles,
  resolveFormImportSetLines,
  splitKitapDetail,
} from './commerce-kitap-form-import.js';

describe('commerce-kitap-form-import helpers', () => {
  it('extracts form id from import notes', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(formImportNoteId(`${FORM_IMPORT_MARKER}${id}\nVeli: X`)).toBe(id);
    expect(formImportNoteId('other')).toBeNull();
  });

  it('maps form status to vendor status', () => {
    expect(mapFormStatusToVendorStatus('shipped')).toBe('shipped');
    expect(mapFormStatusToVendorStatus('approved')).toBe('pending');
    expect(mapFormStatusToVendorStatus('confirmed')).toBe('confirmed');
  });

  it('maps form status to commerce order status', () => {
    expect(mapFormStatusToOrderStatus('shipped')).toBe('shipped');
    expect(mapFormStatusToOrderStatus('pending')).toBe('confirmed');
  });

  it('splits kitap set titles', () => {
    expect(parseKitapLineTitles('Set A — detay | Set B')).toEqual(['Set A — detay', 'Set B']);
    expect(parseKitapLineTitles('')).toEqual(['Kitap seti (form)']);
  });

  it('parses set line with book list', () => {
    const parsed = parseFormImportLine('VIP 8 Kitap Seti — Fizik, Kimya, Biyoloji');
    expect(parsed.setName).toBe('VIP 8 Kitap Seti');
    expect(parsed.contents.map((c) => c.title)).toEqual(['Fizik', 'Kimya', 'Biyoloji']);
  });

  it('ignores broken promise titles', () => {
    const parsed = parseFormImportLine('[object Promise]');
    expect(parsed.contents).toEqual([]);
  });

  it('resolves set lines from kitap_set_ids', () => {
    const setRowsById = new Map([
      [
        'set-1',
        {
          id: 'set-1',
          name: 'LGS Deneme',
          kitap_icerigi: 'Türkçe, Matematik, Fen',
        },
      ],
    ]);
    const lines = resolveFormImportSetLines(
      { kitap_set_ids: ['set-1'], kitaplar: null },
      setRowsById
    );
    expect(lines[0].setName).toBe('LGS Deneme');
    expect(lines[0].contents.map((c) => c.title)).toEqual(['Türkçe', 'Matematik', 'Fen']);
  });

  it('attaches package_contents for form import orders', () => {
    const notes = `${FORM_IMPORT_MARKER}11111111-2222-3333-4444-555555555555`;
    const items = attachFormImportPackageContents(
      [{ title_snapshot: 'Set X — A, B', quantity: 1 }],
      notes
    );
    expect(items[0].package_name).toBe('Set X');
    expect(items[0].package_contents).toHaveLength(2);
  });

  it('splits comma-separated kitap detail', () => {
    expect(splitKitapDetail('Fizik, Kimya, Biyoloji')).toEqual(['Fizik', 'Kimya', 'Biyoloji']);
  });

  it('builds import notes with marker', () => {
    const notes = buildFormImportNotes({
      id: '11111111-2222-3333-4444-555555555555',
      veli_ad_soyad: 'Veli Test',
      sinif: '8',
      ucret_durumu: 'Ödendi',
      siparis_notu: 'Acil',
    });
    expect(notes).toContain(FORM_IMPORT_MARKER);
    expect(notes).toContain('Veli: Veli Test');
    expect(notes).toContain('Sınıf: 8');
  });
});
