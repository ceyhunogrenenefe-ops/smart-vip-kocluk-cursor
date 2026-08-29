import { describe, expect, it } from 'vitest';
import {
  buildCatalogListRows,
  catalogOfferFromBook,
  filterCatalogListRows,
  pickBestApprovedOffer
} from './commerce-store-catalog.js';

const book = {
  id: 'b1',
  title: 'PARAF LGS Deneme',
  author: 'Paraf',
  publisher: 'Paraf',
  subject: 'Matematik',
  class_levels: ['8', 'LGS'],
  is_catalog_active: true,
  metadata: { series: 'lgs-8-denemeler' },
  created_at: '2026-08-20T00:00:00Z'
};

describe('commerce-store-catalog', () => {
  it('picks cheapest buyable approved offer', () => {
    const best = pickBestApprovedOffer([
      { id: 'o1', status: 'approved', stock_quantity: 3, price_kurus: 40000 },
      { id: 'o2', status: 'approved', stock_quantity: 2, price_kurus: 25000 },
      { id: 'o3', status: 'pending', stock_quantity: 9, price_kurus: 1000 }
    ]);
    expect(best.id).toBe('o2');
  });

  it('includes catalog-active books without a priced offer', () => {
    const rows = buildCatalogListRows([
      { ...book, commerce_vendor_offers: [] },
      { ...book, id: 'b2', title: 'Gizli', is_catalog_active: false }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].unpriced).toBe(true);
    expect(rows[0].commerce_books.title).toBe('PARAF LGS Deneme');
  });

  it('filters by class without hiding LGS-only books from 8', () => {
    const priced = catalogOfferFromBook(book, {
      id: 'o1',
      status: 'approved',
      stock_quantity: 1,
      price_kurus: 12000,
      commerce_vendors: { id: 'v', name: 'VIP' }
    });
    const filtered = filterCatalogListRows([priced], { class_level: '8' });
    expect(filtered).toHaveLength(1);
  });

  it('does not apply a default class filter — all books stay visible', () => {
    const tyt = catalogOfferFromBook({
      ...book,
      id: 'b3',
      title: 'TYT Mat',
      class_levels: ['11', 'TYT']
    });
    const lgs = catalogOfferFromBook(book);
    const all = filterCatalogListRows([tyt, lgs], {});
    expect(all.map((r) => r.commerce_books.id).sort()).toEqual(['b1', 'b3']);
  });
});
