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

  it('ignores junk kitap_icerigi placeholders like "."', () => {
    const parsed = parseFormImportLine('LGS Deneme — .');
    expect(parsed.setName).toBe('LGS Deneme');
    expect(parsed.contents).toEqual([]);
    const snap = parseFormImportLine('LGS Deneme (1 kitap): .');
    expect(snap.setName).toBe('LGS Deneme');
    expect(snap.contents).toEqual([]);
  });

  it('treats Kitap siparişi as placeholder line', () => {
    const parsed = parseFormImportLine('Kitap siparişi');
    expect(parsed.setName).toBe('Kitap seti (form)');
    expect(parsed.contents).toEqual([]);
  });

  it('prefers set ids over placeholder kitaplar text', () => {
    const setRowsById = new Map([
      [
        'set-1',
        {
          id: 'set-1',
          name: 'VIP 8 Set',
          kitap_icerigi: 'Türkçe, Matematik',
        },
      ],
    ]);
    const lines = resolveFormImportSetLines(
      { kitap_set_ids: ['set-1'], kitaplar: 'Kitap siparişi' },
      setRowsById
    );
    expect(lines[0].setName).toBe('VIP 8 Set');
    expect(lines[0].contents.map((c) => c.title)).toEqual(['Türkçe', 'Matematik']);
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

  it('cleans junk snapshot titles for form imports without inventing books', () => {
    const notes = `${FORM_IMPORT_MARKER}11111111-2222-3333-4444-555555555555`;
    const items = attachFormImportPackageContents(
      [{ title_snapshot: 'LGS Deneme (1 kitap): .', quantity: 1 }],
      notes
    );
    expect(items[0].package_name).toBe('LGS Deneme');
    expect(items[0].title_snapshot).toBe('LGS Deneme');
    expect(items[0].package_contents).toBeNull();
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
