import { describe, expect, it } from 'vitest';
import { validatePasswordPolicy } from '../src/common/helpers/password-policy';
import { AuthService } from '../src/auth/auth.service';

describe('password policy', () => {
  it('rejects short passwords', () => {
    const result = validatePasswordPolicy('Ab1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least'))).toBe(true);
  });

  it('rejects passwords missing character classes', () => {
    expect(validatePasswordPolicy('abcdefgh').valid).toBe(false);
    expect(validatePasswordPolicy('ABCDEFGH').valid).toBe(false);
    expect(validatePasswordPolicy('Abcdefgh').valid).toBe(false);
    expect(validatePasswordPolicy('Abcdefg1').valid).toBe(false);
  });

  it('accepts strong passwords', () => {
    const result = validatePasswordPolicy('Str0ng!Pass');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('AuthService password check', () => {
  it('comparePassword returns false for empty inputs', async () => {
    const service = Object.create(AuthService.prototype) as AuthService;
    await expect(service.comparePassword('', 'hash')).resolves.toBe(false);
    await expect(service.comparePassword('x', '')).resolves.toBe(false);
  });

  it('comparePassword verifies bcrypt hashes', async () => {
    const service = Object.create(AuthService.prototype) as AuthService;
    // bcrypt hash for "Str0ng!Pass" — generated with cost 4 for speed in tests
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Str0ng!Pass', 4);
    await expect(service.comparePassword('Str0ng!Pass', hash)).resolves.toBe(
      true,
    );
    await expect(service.comparePassword('wrong', hash)).resolves.toBe(false);
  });

  it('checkPasswordPolicy delegates to helper', () => {
    const service = Object.create(AuthService.prototype) as AuthService;
    const ok = service.checkPasswordPolicy('Str0ng!Pass');
    expect(ok.valid).toBe(true);
    const bad = service.checkPasswordPolicy('weak');
    expect(bad.valid).toBe(false);
  });
});
