import { describe, expect, it } from 'vitest';
import {
  assignmentSourceFromRoles,
  buildAssignmentInserts,
  buildPackageUpdatePatch,
  resolvePackagePriceKurus,
  sumUniqueBookOfferPrices,
  normalizeAssignmentType,
  slugifyPackageName,
  staffCanManageStore,
  uniqueIds
} from './commerce-store-staff.js';

describe('commerce-store-staff', () => {
  it('allows teacher coach admin super_admin', () => {
    expect(staffCanManageStore(new Set(['teacher']))).toBe(true);
    expect(staffCanManageStore(new Set(['student']))).toBe(false);
  });

  it('maps teacher role to teacher source', () => {
    expect(assignmentSourceFromRoles(new Set(['teacher', 'admin']))).toBe('teacher');
    expect(assignmentSourceFromRoles(new Set(['coach']))).toBe('coach');
    expect(assignmentSourceFromRoles(new Set(['admin']))).toBe('admin');
  });

  it('builds one row per student×book', () => {
    const rows = buildAssignmentInserts({
      institutionId: 'inst',
      studentIds: ['s1', 's1', 's2'],
      bookIds: ['b1'],
      assignmentType: 'required',
      source: 'teacher',
      assignedBy: 'u1'
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].assignment_type).toBe('required');
    expect(rows[0].status).toBe('assigned');
  });

  it('slugifies package names in Turkish', () => {
    expect(slugifyPackageName('8-F LGS Paketi')).toBe('8-f-lgs-paketi');
    expect(normalizeAssignmentType('foo')).toBe('recommended');
    expect(uniqueIds(['a', '', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('builds a package patch without inventing a price', () => {
    const patch = buildPackageUpdatePatch({
      name: '  5. Sınıf Full Paket  ',
      description: '',
      class_level: '5',
      price_kurus: 0,
    }, 'u1');
    expect(patch.name).toBe('5. Sınıf Full Paket');
    expect(patch.description).toBe(null);
    expect(patch.class_level).toBe('5');
    expect(patch.price_kurus).toBe(0);
    expect(patch.updated_by).toBe('u1');
  });

  it('sums one priced offer per book and skips unpriced', () => {
    expect(sumUniqueBookOfferPrices([
      { book_id: 'a', price_kurus: 10000, status: 'approved' },
      { book_id: 'a', price_kurus: 8000, status: 'approved' },
      { book_id: 'b', price_kurus: 25000, status: 'approved' },
      { book_id: 'c', price_kurus: 0, status: 'approved' },
      { book_id: 'd', price_kurus: 5000, status: 'draft' },
    ])).toBe(33000);
    expect(resolvePackagePriceKurus(0, [
      { book_id: 'a', price_kurus: 12000, status: 'approved' },
    ])).toBe(12000);
    expect(resolvePackagePriceKurus(9900, [
      { book_id: 'a', price_kurus: 12000, status: 'approved' },
    ])).toBe(9900);
  });
});
