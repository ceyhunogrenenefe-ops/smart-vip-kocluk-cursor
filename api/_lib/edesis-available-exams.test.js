import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferEdesisExamProgramKeys,
  edesisCatalogExamMatchesProgram,
  buildStudentAvailableEdesisExamItems,
  pickEdesisCatalogExamId,
  pickEdesisResultExamId,
  resultRowBelongsToStudent
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

  it('matches student id on result rows', () => {
    assert.equal(resultRowBelongsToStudent({ studentId: 7105077 }, '7105077'), true);
    assert.equal(resultRowBelongsToStudent({ ogrenciId: '111' }, '7105077'), false);
    assert.equal(resultRowBelongsToStudent({ examId: 1 }, '7105077'), true);
  });
});
