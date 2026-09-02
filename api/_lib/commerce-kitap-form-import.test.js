import { describe, expect, it } from 'vitest';
import {
  FORM_IMPORT_MARKER,
  buildFormImportNotes,
  formImportNoteId,
  mapFormStatusToOrderStatus,
  mapFormStatusToVendorStatus,
  parseKitapLineTitles,
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
