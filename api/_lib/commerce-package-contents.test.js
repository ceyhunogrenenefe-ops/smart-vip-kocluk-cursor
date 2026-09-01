import { describe, expect, it } from 'vitest';
import {
  attachPackageContents,
  formatSellerItemLabel,
  packageContentsFromRows,
  snapshotPackageTitle
} from './commerce-package-contents.js';

describe('packageContentsFromRows', () => {
  it('lists every book in the set with isbn and qty', () => {
    const contents = packageContentsFromRows(
      [
        { sort_order: 2, quantity: 1, commerce_books: { id: 'b2', title: 'VIP Matematik', isbn: '9782' } },
        { sort_order: 1, quantity: 2, commerce_books: { id: 'b1', title: 'VIP Fen', isbn: '9781', author: 'X' } }
      ],
      1
    );
    expect(contents).toHaveLength(2);
    expect(contents[0].title).toBe('VIP Fen');
    expect(contents[0].quantity).toBe(2);
    expect(contents[1].isbn).toBe('9782');
  });
});

describe('snapshotPackageTitle', () => {
  it('writes set name plus each book so the seller can pack', () => {
    const title = snapshotPackageTitle('8. Sınıf VIP Fen Seti', [
      { title: 'Fen Soru Bankası', isbn: '978111', quantity: 1 },
      { title: 'Fen Deneme', isbn: '978222', quantity: 1 }
    ]);
    expect(title).toContain('8. Sınıf VIP Fen Seti');
    expect(title).toContain('2 kitap');
    expect(title).toContain('Fen Soru Bankası [978111]');
    expect(title).toContain('Fen Deneme');
  });
});

describe('formatSellerItemLabel', () => {
  it('expands attached package_contents instead of the set name alone', () => {
    const label = formatSellerItemLabel({
      title_snapshot: 'VIP Fen Seti',
      package_name: 'VIP Fen Seti',
      quantity: 1,
      package_contents: [
        { title: 'Hücre', isbn: '1', quantity: 1 },
        { title: 'Kuvvet', isbn: '2', quantity: 1 }
      ]
    });
    expect(label).toContain('VIP Fen Seti →');
    expect(label).toContain('Hücre [1]');
    expect(label).toContain('Kuvvet [2]');
  });
});

describe('attachPackageContents', () => {
  it('scales set quantity onto each book', () => {
    const attached = attachPackageContents(
      [{ package_id: 'p1', quantity: 2, title_snapshot: 'Set' }],
      new Map([['p1', [{ title: 'Kitap A', isbn: '9', quantity: 1 }]]]),
      new Map([['p1', 'VIP Set']])
    );
    expect(attached[0].package_name).toBe('VIP Set');
    expect(attached[0].package_contents[0].quantity).toBe(2);
  });
});
