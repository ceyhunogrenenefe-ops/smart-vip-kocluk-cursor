import { describe, expect, it } from 'vitest';
import { assignedCatalogIfNoStudent, commerceStoreHttpStatus } from './commerce-store-http.js';

describe('assignedCatalogIfNoStudent', () => {
  it('returns empty list for staff without student_id', () => {
    expect(assignedCatalogIfNoStudent(null)).toEqual({ ok: true, assignments: [] });
    expect(assignedCatalogIfNoStudent('')).toEqual({ ok: true, assignments: [] });
    expect(assignedCatalogIfNoStudent(undefined)).toEqual({ ok: true, assignments: [] });
  });

  it('returns null when a student id is present', () => {
    expect(assignedCatalogIfNoStudent('stu-1')).toBe(null);
  });
});

describe('commerceStoreHttpStatus', () => {
  it('maps student_id gerekli to 400 not 500', () => {
    expect(commerceStoreHttpStatus('student_id gerekli')).toBe(400);
  });

  it('maps giris to 401', () => {
    expect(commerceStoreHttpStatus('Giriş gerekli')).toBe(401);
    expect(commerceStoreHttpStatus('Sepet için giriş gerekli')).toBe(401);
  });

  it('keeps unexpected DB errors as 500', () => {
    expect(commerceStoreHttpStatus('column meta does not exist')).toBe(500);
  });
});
