import { describe, expect, it } from 'vitest';
import {
  assignmentSourceFromRoles,
  buildAssignmentInserts,
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
});
