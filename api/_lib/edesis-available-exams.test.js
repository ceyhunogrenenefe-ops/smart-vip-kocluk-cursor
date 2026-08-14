import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferEdesisExamProgramKeys,
  edesisCatalogExamMatchesProgram,
  buildStudentAvailableEdesisExamItems,
  pickEdesisCatalogExamId,
  pickEdesisResultExamId,
  resultRowBelongsToStudent,
  collectEdesisBookletFiles,
  pickEdesisBookletFile
} from './edesis-client.js';

describe('inferEdesisExamProgramKeys', () => {
  it('maps 8. sınıf / LGS to lgs', () => {
    const keys = inferEdesisExamProgramKeys({ classLevel: '8. Sınıf' });
    assert.equal(keys.has('lgs'), true);
    assert.equal(keys.has('yks'), false);
  });

  it('maps TYT exam type to yks', () => {
    const keys = inferEdesisExamProgramKeys({ examType: 'TYT' });
    assert.equal(keys.has('yks'), true);
  });
});

describe('buildStudentAvailableEdesisExamItems', () => {
  const catalog = [
    { id: 1, name: 'LGS Deneme 1', examType: 'LGS', resultStatus: 'Ready', examDate: '2026-03-01' },
    { id: 2, name: 'TYT Deneme', examType: 'TYT', resultStatus: 'Ready', examDate: '2026-03-02' },
    { id: 3, name: 'YÖS Deneme', examType: 'YÖS', resultStatus: 'None', examDate: '2026-08-01' },
    { id: 4, name: 'LGS Yeni', examType: 'LGS', resultStatus: 'None', examDate: '2026-08-10' },
    { id: 5, name: '3-4. Sınıf Deneme', examType: '3-4. Sınıf', resultStatus: 'None', examDate: '2026-08-11' }
  ];

  it('does not dump the catalog when the student has no results', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      resultRows: [],
      edesisStudentId: '7105077'
    });
    assert.equal(items.length, 0);
  });

  it('includes only the student result exam, not other LGS catalog rows', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      resultRows: [{ examId: 1, examName: 'LGS Deneme 1', score: 12.5, studentId: 7105077 }],
      edesisStudentId: '7105077'
    });
    assert.deepEqual(items.map((x) => x.examId), ['1']);
    assert.equal(items[0].hasStudentResult, true);
    assert.equal(items[0].canTake, false);
    assert.equal(items[0].studentNet, 12.5);
    assert.equal(items[0].name, 'LGS Deneme 1');
  });

  it('drops result rows that belong to another student', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      resultRows: [
        { examId: 1, examName: 'LGS Deneme 1', studentId: 111 },
        { examId: 2, examName: 'TYT Deneme', studentId: 7105077 }
      ],
      edesisStudentId: '7105077'
    });
    assert.deepEqual(items.map((x) => x.examId), ['2']);
  });

  it('picks catalog vs result exam ids', () => {
    assert.equal(pickEdesisCatalogExamId({ id: 99, examId: 1 }), '99');
    assert.equal(pickEdesisResultExamId({ id: 500, examId: 12 }), '12');
  });

  it('does not match YÖS catalog to LGS program', () => {
    assert.equal(
      edesisCatalogExamMatchesProgram({ examType: 'YÖS', name: 'YÖS Deneme' }, new Set(['lgs'])),
      false
    );
    assert.equal(
      edesisCatalogExamMatchesProgram({ examType: 'LGS', name: 'LGS Yeni' }, new Set(['lgs'])),
      true
    );
  });

  it('hides 5. sınıf denemesinden LGS öğrencisini', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        { id: 10, name: '5.SINIF MAT FEN KTT 2 y', examType: '5-6. Sınıf', examDate: '2026-08-14' },
        { id: 11, name: 'LGS İNKILAP TARİHİ KTT 1', examType: 'LGS', examDate: '2026-07-25' },
        { id: 12, name: 'LGS İNGİLİZCE KTT 1', examType: 'LGS', examDate: '2026-07-24' }
      ],
      resultRows: [
        { examId: 10, examName: '5.SINIF MAT FEN KTT 2 y', studentId: 7105077, score: -1.33 },
        { examId: 11, examName: 'LGS İNKILAP TARİHİ KTT 1', studentId: 7105077, score: 25 },
        { examId: 12, examName: 'LGS İNGİLİZCE KTT 1', studentId: 7105077, score: 10 }
      ],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' })
    });
    const names = items.map((x) => x.name);
    assert.equal(names.some((n) => /5\.SINIF/i.test(n)), false);
    assert.equal(names.some((n) => /LGS İNKILAP/i.test(n)), true);
  });

  it('majority LGS results drop a stray 5. sınıf row when class is unknown', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [],
      resultRows: [
        { examId: 10, examName: '5.SINIF MAT FEN KTT 2 y', studentId: 7105077 },
        { examId: 11, examName: 'LGS İNKILAP TARİHİ KTT 1', studentId: 7105077 },
        { examId: 12, examName: 'LGS İNGİLİZCE KTT 1', studentId: 7105077 },
        { examId: 13, examName: 'LGS TÜRKÇE KTT 1', studentId: 7105077 },
        { examId: 14, examName: 'LGS MATEMATİK KTT 2', studentId: 7105077 }
      ],
      edesisStudentId: '7105077'
    });
    assert.equal(items.some((x) => /5\.SINIF/i.test(x.name)), false);
    assert.equal(items.length, 4);
  });

  it('allows take when the result row has no scores yet', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      resultRows: [{ examId: 4, examName: 'LGS Yeni', studentId: 7105077 }],
      edesisStudentId: '7105077'
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].canTake, true);
    assert.equal(items[0].hasStudentResult, false);
  });
});

describe('collectEdesisBookletFiles', () => {
  it('extracts bookletUrl even without .pdf extension', () => {
    const files = collectEdesisBookletFiles({
      bookletUrl: 'https://cdn.edesis.com/files/1e373580-3cda-4595-a424-26fdb363cc670',
      kitapcikTuru: 'A',
      bookletName: 'TYT A'
    });
    assert.equal(files.length, 1);
    assert.equal(files[0].kitapcikTuru, 'A');
    assert.match(files[0].url, /1e373580/);
  });

  it('picks matching kitapçık from nested booklets', () => {
    const files = collectEdesisBookletFiles({
      booklets: [
        { kitapcikTuru: 'B', url: 'https://files.edesis.com/b-kitapcik' },
        { kitapcikTuru: 'A', bookletUrl: 'https://files.edesis.com/a.pdf' }
      ]
    });
    const picked = pickEdesisBookletFile(files, 'A');
    assert.equal(picked?.kitapcikTuru, 'A');
    assert.match(picked.url, /a\.pdf/);
  });
});
