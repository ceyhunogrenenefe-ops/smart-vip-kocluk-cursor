import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECLARATION_KINDS,
  compareDetails,
  compareTotals,
  compareValue,
  periodLabel,
  periodRange,
  previousPeriod,
  sumByKind,
  summarizeDeclarations
} from './teacher-declaration-core.js';

describe('dönem hesabı', () => {
  it('ayın 1inde bir önceki ay istenir', () => {
    assert.equal(previousPeriod(new Date(2026, 10, 1)), '2026-10-01'); // 1 Kasım → Ekim
    assert.equal(previousPeriod(new Date(2026, 9, 1)), '2026-09-01'); // 1 Ekim → Eylül
  });

  it('yıl başında bir önceki yıla döner', () => {
    assert.equal(previousPeriod(new Date(2027, 0, 1)), '2026-12-01'); // 1 Ocak 2027 → Aralık 2026
  });

  it('ayın ortasında da aynı dönemi verir', () => {
    assert.equal(previousPeriod(new Date(2026, 10, 17)), '2026-10-01');
  });

  it('dönem aralığı ayın son gününü bulur', () => {
    assert.deepEqual(periodRange('2026-10-01'), { from: '2026-10-01', to: '2026-10-31' });
    assert.deepEqual(periodRange('2026-02-01'), { from: '2026-02-01', to: '2026-02-28' });
    // Artık yıl
    assert.deepEqual(periodRange('2028-02-01'), { from: '2028-02-01', to: '2028-02-29' });
    assert.equal(periodRange('bos'), null);
  });

  it('dönem etiketi Türkçe', () => {
    assert.equal(periodLabel('2026-10-01'), 'Ekim 2026');
    assert.equal(periodLabel('2026-01-01'), 'Ocak 2026');
  });
});

describe('beyan toplamı', () => {
  it('türe göre toplanır', () => {
    const t = sumByKind([
      { kind: 'group', quantity: 12 },
      { kind: 'group', quantity: 9 },
      { kind: 'private', quantity: 4 }
    ]);
    assert.equal(t.group, 21);
    assert.equal(t.private, 4);
    assert.equal(t.guidance, 0);
  });

  it('tanınmayan tür ve sayı olmayan değer atlanır', () => {
    const t = sumByKind([{ kind: 'uydurma', quantity: 5 }, { kind: 'group', quantity: 'abc' }]);
    assert.equal(t.group, 0);
  });
});

describe('karşılaştırma', () => {
  it('grup ve özel derste fark uyuşmazlıktır', () => {
    assert.equal(compareValue('group', 42, 40).state, 'mismatch');
    assert.equal(compareValue('group', 42, 40).diff, 2);
    assert.equal(compareValue('private', 8, 8).state, 'match');
  });

  it('rehberlik ve etütte fark uyuşmazlık sayılmaz', () => {
    // Sistemde güvenilir rehberlik kaydı yok; her ay kırmızı görünmesin
    assert.equal(compareValue('guidance', 16, 0).state, 'info');
    assert.equal(compareValue('etut', 5, 0).state, 'info');
    assert.equal(compareValue('arama', 10, 0).comparable, false);
  });

  it('toplam tablosu yalnız dolu kalemleri gösterir', () => {
    const c = compareTotals(
      [{ kind: 'group', quantity: 42 }, { kind: 'guidance', quantity: 16 }],
      { group: 40, private: 0, guidance: 15 }
    );
    assert.equal(c.rows.length, 2);
    assert.equal(c.mismatch_count, 1);
    assert.equal(c.state, 'mismatch');
  });

  it('hepsi tutuyorsa uyumlu', () => {
    const c = compareTotals([{ kind: 'group', quantity: 40 }], { group: 40 });
    assert.equal(c.state, 'match');
    assert.equal(c.mismatch_count, 0);
  });

  it('rehberlik farkı tek başına uyuşmazlık yapmaz', () => {
    const c = compareTotals(
      [{ kind: 'group', quantity: 40 }, { kind: 'guidance', quantity: 16 }],
      { group: 40, guidance: 0 }
    );
    assert.equal(c.state, 'match');
  });
});

describe('satır bazlı karşılaştırma', () => {
  it('sınıf sınıf eşleşir', () => {
    const rows = compareDetails(
      [
        { kind: 'group', class_id: 'c1', label: '8A', quantity: 12 },
        { kind: 'group', class_id: 'c2', label: '8E', quantity: 10 }
      ],
      [
        { kind: 'group', class_id: 'c1', label: '8A', quantity: 12 },
        { kind: 'group', class_id: 'c2', label: '8E', quantity: 8 }
      ]
    );
    const a = rows.find((r) => r.label === '8A');
    const e = rows.find((r) => r.label === '8E');
    assert.equal(a.state, 'match');
    assert.equal(e.state, 'mismatch');
    assert.equal(e.diff, 2);
  });

  it('beyanda olmayan sistem kaydı da listelenir', () => {
    const rows = compareDetails([], [{ kind: 'group', class_id: 'c9', label: '7B', quantity: 6 }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].declared, 0);
    assert.equal(rows[0].system, 6);
    assert.equal(rows[0].state, 'mismatch');
  });

  it('sistemde olmayan beyan da listelenir', () => {
    const rows = compareDetails([{ kind: 'private', student_id: 's1', label: 'Öykü', quantity: 4 }], []);
    assert.equal(rows[0].declared, 4);
    assert.equal(rows[0].system, 0);
  });

  it('uyuşmazlıklar üste sıralanır', () => {
    const rows = compareDetails(
      [{ kind: 'group', class_id: 'a', label: 'AA', quantity: 5 }, { kind: 'group', class_id: 'b', label: 'BB', quantity: 5 }],
      [{ kind: 'group', class_id: 'a', label: 'AA', quantity: 5 }, { kind: 'group', class_id: 'b', label: 'BB', quantity: 3 }]
    );
    assert.equal(rows[0].label, 'BB');
  });

  it('aynı sınıfın iki satırı toplanır', () => {
    const rows = compareDetails(
      [
        { kind: 'group', class_id: 'c1', label: '8A', quantity: 6 },
        { kind: 'group', class_id: 'c1', label: '8A', quantity: 6 }
      ],
      [{ kind: 'group', class_id: 'c1', label: '8A', quantity: 12 }]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].declared, 12);
    assert.equal(rows[0].state, 'match');
  });
});

describe('özet', () => {
  it('durumlar sayılır', () => {
    const s = summarizeDeclarations([
      { status: 'pending' },
      { status: 'opened' },
      { status: 'submitted', comparison: { state: 'match' } },
      { status: 'submitted', comparison: { state: 'mismatch' } }
    ]);
    assert.equal(s.total, 4);
    assert.equal(s.pending, 1);
    assert.equal(s.opened, 1);
    assert.equal(s.submitted, 2);
    assert.equal(s.match, 1);
    assert.equal(s.mismatch, 1);
  });
});

describe('tür tanımları', () => {
  it('istenen çalışma türlerinin hepsi var', () => {
    const ids = DECLARATION_KINDS.map((k) => k.id);
    for (const id of ['group', 'private', 'guidance', 'etut', 'yazili', 'telafi', 'deneme', 'arama', 'other']) {
      assert.ok(ids.includes(id), id + ' eksik');
    }
  });
});

describe('bozuk kimlik koruması', () => {
  it('UUID olmayan değer sorguya girmemeli', async () => {
    const { isUuid } = await import('./teacher-declaration-notify.js');
    assert.equal(isUuid('73323d75-eea1-4552-8bba-d50555423589'), true);
    // Gerçek veride görülen bozuk değer: tek başına bütün listeyi düşürüyordu
    assert.equal(isUuid('demo-coach'), false);
    assert.equal(isUuid(''), false);
    assert.equal(isUuid(null), false);
    assert.equal(isUuid('123'), false);
  });
});
