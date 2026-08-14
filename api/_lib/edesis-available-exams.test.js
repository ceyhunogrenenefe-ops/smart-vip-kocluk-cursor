import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferEdesisExamProgramKeys,
  edesisCatalogExamMatchesProgram,
  buildStudentAvailableEdesisExamItems,
  pickEdesisCatalogExamId,
  pickEdesisResultExamId
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

  it('does not dump the full catalog', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      resultRows: [],
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' })
    });
    const ids = items.map((x) => x.examId);
    assert.deepEqual(ids, ['4']);
  });

  it('includes the student result exam even if Ready and other types exist', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      resultRows: [{ examId: 1, examName: 'LGS Deneme 1', score: 12.5 }],
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8. Sınıf' })
    });
    const ids = items.map((x) => x.examId).sort();
    assert.deepEqual(ids, ['1', '4']);
    const taken = items.find((x) => x.examId === '1');
    assert.equal(taken.hasStudentResult, true);
    assert.equal(taken.studentNet, 12.5);
  });

  it('hides other programs when student has no grade and no results', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      resultRows: [],
      programKeys: new Set()
    });
    assert.equal(items.length, 0);
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
});
