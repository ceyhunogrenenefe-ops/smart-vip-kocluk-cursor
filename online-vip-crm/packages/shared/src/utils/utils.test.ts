import { describe, expect, it } from 'vitest';
import { normalizePhone } from './normalize-phone';
import { normalizeEmail } from './normalize-email';
import { renderTemplate } from './render-template';
import { hashPayload } from './hash-payload';

describe('normalizePhone', () => {
  it('normalizes Turkish local mobile with leading 0', () => {
    expect(normalizePhone('0532 111 22 33')).toBe('+905321112233');
  });

  it('normalizes Turkish mobile without leading 0', () => {
    expect(normalizePhone('5321112233')).toBe('+905321112233');
  });

  it('keeps valid E.164', () => {
    expect(normalizePhone('+905321112233')).toBe('+905321112233');
  });

  it('returns null for empty or invalid', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Parent@Example.COM ')).toBe('parent@example.com');
  });

  it('returns null for invalid', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe('renderTemplate', () => {
  it('replaces known variables', () => {
    expect(renderTemplate('Merhaba {{name}}, {{program}} için yazıyoruz.', {
      name: 'Ayşe',
      program: 'LGS',
    })).toBe('Merhaba Ayşe, LGS için yazıyoruz.');
  });

  it('keeps unknown placeholders by default', () => {
    expect(renderTemplate('Hi {{name}}', {})).toBe('Hi {{name}}');
  });

  it('can empty missing placeholders', () => {
    expect(renderTemplate('Hi {{name}}', {}, { missing: 'empty' })).toBe('Hi ');
  });
});

describe('hashPayload', () => {
  it('is stable regardless of key order', () => {
    const a = hashPayload({ b: 2, a: 1 });
    const b = hashPayload({ a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs for different payloads', () => {
    expect(hashPayload({ x: 1 })).not.toBe(hashPayload({ x: 2 }));
  });

  it('hashes raw strings', () => {
    expect(hashPayload('hello')).toMatch(/^[a-f0-9]{64}$/);
  });
});
