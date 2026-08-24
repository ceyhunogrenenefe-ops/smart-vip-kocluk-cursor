import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferEdesisExamProgramKeys,
  edesisCatalogExamMatchesProgram,
  buildStudentAvailableEdesisExamItems,
  resolveAssignedCatalogRowsForStudent,
  collectExplicitlyAssignedCatalogRows,
  collectRecentUnpublishedProgramExams,
  collectClassroomAssignedCatalogRows,
  pickEdesisCatalogExamId,
  parseEdesisOgrenciSinavIdsResponse,
  parseEdesisOgrenciSinavListesiResponse,
  collectCatalogRowsForSinavIds,
  pickEdesisResultExamId,
  resultRowBelongsToStudent,
  collectEdesisBookletFiles,
  pickEdesisBookletFile,
  detectEdesisExamFamily,
  edesisOpticalUi,
  pickEdesisBookletLessons,
  extractEdesisStructureRows,
  normalizeKitapcikCode,
  listEdesisBookletCodes,
  canonicalEdesisStructureLessons,
  looksLikePdfBuffer,
  catalogLooksStudentFiltered,
  catalogQueryLooksFiltered,
  catalogExamAssignedToStudent,
  examAssignedViaOnlineFlag,
  examResultRowsAssignStudent,
  examRosterIncludesStudent,
  trustEdesisStudentCatalogList,
  looksLikePersonalExamList,
  resolveEdesisFileUrl,
  expandEdesisFileUrlCandidates
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

  it('offers recent open program exams from GET /exams catalog (v1.5 has no assignment filter)', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now
    });
    assert.ok(items.some((x) => x.examId === '4' && x.canTake), 'LGS Yeni (None) must be takeable');
    assert.equal(items.some((x) => x.examId === '3'), false, 'YÖS must not leak to LGS');
    assert.equal(items.some((x) => x.examId === '5'), false, '3-4. sınıf must not leak to LGS');
    assert.equal(items.some((x) => x.examId === '1'), false, 'old Ready LGS must not dump');
  });

  it('with allowRecencyFallback offers recent program exams when assignment unknown', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now,
      allowRecencyFallback: true
    });
    assert.ok(items.some((x) => x.examId === '4'));
    assert.equal(items.some((x) => x.examId === '3'), false);
  });

  it('requireExplicitAssignment hides unassigned program exams', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      assignedCatalogRows: [],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now,
      requireExplicitAssignment: true
    });
    assert.equal(items.some((x) => x.canTake), false);
  });

  it('requireExplicitAssignment shows only studentIds-assigned exams', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const assigned = [
      {
        id: 4,
        name: 'LGS Yeni',
        examType: 'LGS',
        resultStatus: 'None',
        examDate: '2026-08-10',
        studentIds: [7105077]
      }
    ];
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      assignedCatalogRows: assigned,
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now,
      requireExplicitAssignment: true
    });
    assert.deepEqual(items.map((x) => x.examId), ['4']);
  });

  it('resolveAssignedCatalogRowsForStudent merges ogrenciIds and StudentId catalog', () => {
    const full = catalog;
    const personal = [{ id: 99, name: 'Tek öğrenci denemesi', examType: 'LGS', resultStatus: 'None' }];
    const assigned = resolveAssignedCatalogRowsForStudent({
      catalogRows: [
        ...full,
        {
          id: 41,
          name: 'Safiye LGS',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-03-01',
          studentIds: [7105077]
        }
      ],
      studentCatalogRows: personal,
      edesisStudentId: '7105077'
    });
    assert.ok(assigned.some((x) => String(pickEdesisCatalogExamId(x)) === '41'));
    assert.ok(assigned.some((x) => String(pickEdesisCatalogExamId(x)) === '99'));
  });

  it('offers assigned exam even when examType/name has no program keyword', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 92,
          name: 'Deneme Tanım',
          examType: '',
          resultStatus: 'None',
          examDate: '2026-03-01',
          studentIds: [7105077]
        }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now
    });
    assert.deepEqual(items.map((x) => x.examId), ['92']);
  });

  it('does not offer last year\'s open LGS catalog exams', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        { id: 40, name: 'LGS Eski', examType: 'LGS', resultStatus: 'None', examDate: '2025-03-01' }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now
    });
    assert.equal(items.length, 0);
  });

  it('offers an old-dated exam when studentIds includes this student', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 41,
          name: 'Safiye LGS',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-03-01',
          studentIds: [7105077, 99]
        }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now
    });
    assert.deepEqual(items.map((x) => x.examId), ['41']);
  });

  it('offers a StudentId-filtered catalog exam without studentIds on the row', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const assigned = [
      { id: 4, name: 'LGS Yeni', examType: 'LGS', resultStatus: 'None', examDate: '2026-08-10' }
    ];
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      assignedCatalogRows: assigned,
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now
    });
    assert.deepEqual(items.map((x) => x.examId), ['4']);
    assert.equal(items[0].canTake, true);
  });

  it('empty assignedCatalogRows array does not block catalog (assignedOnly=false)', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      assignedCatalogRows: [],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now
    });
    assert.ok(items.some((x) => x.examId === '4' && x.canTake));
  });

  it('looksLikePersonalExamList trusts a single-exam StudentId response', () => {
    const full = catalog;
    const personal = [{ id: 99, name: 'Tek öğrenci denemesi', examType: 'LGS', resultStatus: 'None' }];
    assert.equal(trustEdesisStudentCatalogList(full, personal), true);
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: full,
      assignedCatalogRows: personal,
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' })
    });
    assert.deepEqual(items.map((x) => x.examId), ['99']);
  });

  it('does not trust near-full catalog as personal StudentId list', () => {
    const full = Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }));
    const dump = Array.from({ length: 30 }, (_, i) => ({ id: i + 1 }));
    assert.equal(trustEdesisStudentCatalogList(full, dump), false);
  });

  it('does not treat a near-full StudentId response as assigned', () => {
    assert.equal(
      catalogLooksStudentFiltered(
        Array.from({ length: 40 }, (_, i) => ({ id: i + 1 })),
        Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }))
      ),
      false
    );
    assert.equal(
      catalogLooksStudentFiltered(
        Array.from({ length: 40 }, (_, i) => ({ id: i + 1 })),
        [{ id: 4 }, { id: 7 }]
      ),
      true
    );
  });

  it('does not treat a near-full program dump as assigned', () => {
    assert.equal(
      catalogLooksStudentFiltered(
        Array.from({ length: 40 }, (_, i) => ({ id: i + 1 })),
        Array.from({ length: 30 }, (_, i) => ({ id: i + 1 }))
      ),
      false
    );
  });

  it('detects nested result.ogrenciIds assignment', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 91,
          name: 'Safiye atanan',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-14',
          result: { ogrenciIds: [7105077] }
        }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' })
    });
    assert.deepEqual(items.map((x) => x.examId), ['91']);
  });

  it('hides a recent exam assigned to other students', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 42,
          name: 'Başka öğrenci LGS',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-14',
          studentIds: [111]
        }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now
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

  it('keeps submitted cross-program results so retake stays blocked', () => {
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
    const five = items.find((x) => /5\.SINIF/i.test(x.name || ''));
    assert.ok(five, 'submitted 5. sınıf row must remain (retake block)');
    assert.equal(five.hasStudentResult, true);
    assert.equal(five.canTake, false);
    assert.equal(items.some((x) => /LGS İNKILAP/i.test(x.name || '')), true);
  });

  it('keeps this student\'s result-row exams even when class is unknown', () => {
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
    assert.equal(items.length, 5);
    assert.ok(items.some((x) => /5\.SINIF/i.test(x.name)));
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

  it('offers Ready exams when this student is in studentIds (classmate already finished)', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 77,
          name: 'LGS TÜRKÇE KTT 1',
          examType: 'LGS',
          resultStatus: 'Ready',
          examDate: '2026-04-18',
          studentIds: [7105077]
        }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' })
    });
    assert.deepEqual(items.map((x) => x.examId), ['77']);
    assert.equal(items[0].canTake, true);
  });

  it('offers program-matched None exam even without studentIds (v1.5 catalog DTO)', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 88,
          name: 'Tek öğrenciye tanımlı',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-16',
          classroomId: 501
        }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      classroomId: '501',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '7' })
    });
    assert.deepEqual(items.map((x) => x.examId), ['88']);
    assert.equal(items[0].canTake, true);
  });

  it('hides exam assigned to another student even when classroom matches', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 89,
          name: 'Başka öğrenci',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-16',
          classroomId: 501,
          ogrenciIds: [111]
        }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      classroomId: '501',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '7' })
    });
    assert.equal(items.length, 0);
    assert.equal(
      catalogExamAssignedToStudent(
        { id: 89, classroomId: 501, ogrenciIds: [111] },
        { edesisStudentId: '7105077', classroomId: '501' }
      ),
      false
    );
  });

  it('prefers nested ogrenciIds over top-level classroomId', () => {
    assert.equal(
      catalogExamAssignedToStudent(
        { id: 90, classroomId: 501, result: { ogrenciIds: [7105077] } },
        { edesisStudentId: '7105077', classroomId: '501' }
      ),
      true
    );
    assert.equal(
      catalogExamAssignedToStudent(
        { id: 90, classroomId: 501, result: { ogrenciIds: [999] } },
        { edesisStudentId: '7105077', classroomId: '501' }
      ),
      false
    );
  });

  it('reads PascalCase OgrenciIds as assignment', () => {
    assert.equal(
      catalogExamAssignedToStudent(
        { Id: 1102253, OgrenciIds: [7105077], ExamType: 'YÖS' },
        { edesisStudentId: '7105077' }
      ),
      true
    );
    assert.equal(
      catalogExamAssignedToStudent(
        { Id: 1102253, OgrenciIds: [111], ExamType: 'YÖS' },
        { edesisStudentId: '7105077' }
      ),
      false
    );
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          Id: 1102253,
          name: 'YÖS SARMAL DENEME-12',
          examType: 'YÖS',
          resultStatus: 'None',
          examDate: '2026-08-16',
          OgrenciIds: [7105077]
        }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '12' })
    });
    assert.ok(items.some((x) => x.examId === '1102253' && x.canTake));
  });

  it('keeps assigned YÖS takeable for YKS class student (program filter)', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 88,
          name: 'YÖS SARMAL',
          examType: 'YÖS',
          resultStatus: 'None',
          examDate: '2026-08-16',
          studentIds: [7105077]
        }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '12' })
    });
    assert.deepEqual(items.map((x) => x.examId), ['88']);
    assert.equal(items[0].canTake, true);
  });

  it('online flag on StudentId row is assignment when full catalog lacks it', () => {
    assert.equal(
      examAssignedViaOnlineFlag(
        { id: 7, isOnlineSinavForStudent: true },
        { id: 7, isOnlineSinavForStudent: false }
      ),
      true
    );
    assert.equal(
      examAssignedViaOnlineFlag(
        { id: 7, isOnlineSinavForStudent: true },
        { id: 7, isOnlineSinavForStudent: true }
      ),
      false
    );
  });

  it('examResultRowsAssignStudent requires matching studentId', () => {
    assert.equal(
      examResultRowsAssignStudent([{ examId: 1, studentId: 7105077 }], '7105077'),
      true
    );
    assert.equal(
      examResultRowsAssignStudent([{ examId: 1, studentId: 111 }], '7105077'),
      false
    );
    assert.equal(examResultRowsAssignStudent([{ examId: 1 }], '7105077'), false);
  });

  it('requireStudentIdMatch ignores isAllClasses without ogrenciIds', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 91,
          name: 'Tüm sınıflar',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-16',
          isAllClasses: true
        }
      ],
      assignedCatalogRows: [],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '7' }),
      now,
      requireExplicitAssignment: true
    });
    assert.equal(items.length, 0);
  });

  it('offers isAllClasses exam when requireStudentIdMatch is off', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 91,
          name: 'Tüm sınıflar',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-16',
          isAllClasses: true
        }
      ],
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '7' })
    });
    assert.deepEqual(items.map((x) => x.examId), ['91']);
  });

  it('keeps submitted YÖS result for YKS (class 12) student', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 1102253,
          name: 'YÖS SARMAL DENEME-12',
          examType: 'YÖS',
          resultStatus: 'Ready',
          examDate: '2026-08-10'
        }
      ],
      resultRows: [
        {
          examId: 1102253,
          studentId: 7105077,
          examName: 'YÖS SARMAL DENEME-12',
          examType: 'YÖS',
          toplamNet: 42.5,
          resultStatus: 'Ready'
        }
      ],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '12' })
    });
    assert.ok(items.some((x) => x.examId === '1102253' && x.hasStudentResult));
  });

  it('still hides untaken YÖS catalog for YKS student without assignment', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '12' }),
      now,
      allowRecencyFallback: true
    });
    assert.equal(items.some((x) => x.examId === '3'), false);
  });

  it('offers many admin-assigned sinavIds without ogrenciIds on catalog rows', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const sinavIds = Array.from({ length: 55 }, (_, i) => String(5000 + i));
    const catalogRows = sinavIds.map((id) => ({
      id,
      name: `Atanan deneme ${id}`,
      examType: 'LGS',
      resultStatus: 'None',
      examDate: '2026-08-10'
    }));
    const assignedCatalogRows = collectCatalogRowsForSinavIds(catalogRows, sinavIds);
    assert.equal(assignedCatalogRows.length, 55);
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows,
      assignedCatalogRows,
      resultRows: [],
      edesisStudentId: '7105077',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now,
      requireExplicitAssignment: true
    });
    assert.equal(items.filter((x) => x.canTake).length, 55);
  });

  it('rejects StudentId full-catalog dump as filtered query', () => {
    const full = Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }));
    assert.equal(catalogQueryLooksFiltered(full, full), false);
    assert.equal(catalogQueryLooksFiltered(full, [{ id: 4 }, { id: 7 }]), true);
  });

  it('collectClassroomAssignedCatalogRows keeps class exams not locked to others', () => {
    const full = [
      { id: 1, name: 'Şube LGS', examType: 'LGS', resultStatus: 'None', classroomId: 501 },
      { id: 2, name: 'Başka öğrenci', examType: 'LGS', resultStatus: 'None', classroomId: 501, ogrenciIds: [111] }
    ];
    const classroom = [
      { id: 1, name: 'Şube LGS', examType: 'LGS', resultStatus: 'None' },
      { id: 2, name: 'Başka öğrenci', examType: 'LGS', resultStatus: 'None', ogrenciIds: [111] }
    ];
    const rows = collectClassroomAssignedCatalogRows({
      fullCatalog: full,
      classroomCatalogRows: classroom,
      edesisStudentId: '7105077',
      classroomId: '501'
    });
    assert.deepEqual(
      rows.map((x) => String(pickEdesisCatalogExamId(x))),
      ['1']
    );
  });

  it('examRosterIncludesStudent matches ids', () => {
    assert.equal(examRosterIncludesStudent([7105077, 99], '7105077'), true);
    assert.equal(examRosterIncludesStudent([111], '7105077'), false);
  });
});

describe('parseEdesisOgrenciSinavIdsResponse', () => {
  it('reads sinavId array from ABP result wrapper', () => {
    assert.deepEqual(
      parseEdesisOgrenciSinavIdsResponse({ result: { sinavId: [101, 102, '103'] } }),
      ['101', '102', '103']
    );
  });

  it('deduplicates ids', () => {
    assert.deepEqual(parseEdesisOgrenciSinavIdsResponse({ sinavId: [4, 4, 7] }), ['4', '7']);
  });
});

describe('parseEdesisOgrenciSinavListesiResponse', () => {
  it('extracts sinavId from AnalizSinavDto sinavlar', () => {
    const ids = parseEdesisOgrenciSinavListesiResponse([
      {
        sinavTuru: 'LGS',
        sinavTuruId: 1,
        sinavlar: [
          { sinavAdi: 'Deneme 1', sinavId: 111, isChecked: true },
          { sinavAdi: 'Deneme 2', sinavId: 222, isChecked: false }
        ]
      }
    ]);
    assert.deepEqual(ids, ['111', '222']);
  });

  it('extracts from ByDonemIds wrapper', () => {
    const ids = parseEdesisOgrenciSinavListesiResponse({
      result: [
        {
          donemAdi: '2025-2026',
          donemId: 9,
          donemSinavlar: [
            {
              sinavTuru: 'LGS',
              sinavlar: [{ sinavId: 555 }]
            }
          ]
        }
      ]
    });
    assert.deepEqual(ids, ['555']);
  });
});

describe('requireExplicitAssignment never dumps catalog', () => {
  it('empty assignment + no fallback → no takeable exams', () => {
    const catalog = [
      { id: 1, name: 'LGS Yeni', examType: 'LGS', resultStatus: 'None', examDate: '2026-08-10' },
      { id: 2, name: 'TYT', examType: 'TYT', resultStatus: 'None', examDate: '2026-08-11' }
    ];
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      assignedCatalogRows: [],
      resultRows: [],
      edesisStudentId: '2086573',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      now: new Date('2026-08-14T12:00:00Z'),
      allowRecencyFallback: false,
      requireExplicitAssignment: true
    });
    assert.equal(items.filter((x) => x.canTake).length, 0);
  });

  it('shows only admin-assigned open exams for Safiye id', () => {
    const catalog = [
      {
        id: 1569664,
        name: 'Safiye Atanan Açık',
        examType: 'LGS',
        resultStatus: 'None',
        examDate: '2026-08-20',
        studentIds: [2086573]
      },
      {
        id: 1574084,
        name: 'Başkasının TYT',
        examType: 'TYT',
        resultStatus: 'None',
        examDate: '2026-08-24',
        studentIds: [999]
      },
      { id: 4, name: 'Atamasız LGS', examType: 'LGS', resultStatus: 'None', examDate: '2026-08-10' }
    ];
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      assignedCatalogRows: [catalog[0]],
      resultRows: [],
      edesisStudentId: '2086573',
      programKeys: inferEdesisExamProgramKeys({ classLevel: 'LGS' }),
      now: new Date('2026-08-24T12:00:00Z'),
      allowRecencyFallback: false,
      requireExplicitAssignment: true
    });
    assert.deepEqual(
      items.filter((x) => x.canTake).map((x) => x.examId),
      ['1569664']
    );
  });

  it('offers recent unpublished program exams from v1 catalog without ABP studentIds', () => {
    const catalog = [
      {
        id: 1559901,
        name: 'VİP MÜFREDAT İZLEME LGS-1',
        examType: 'LGS',
        resultStatus: 'None',
        examDate: '2026-08-14'
      },
      {
        id: 1561043,
        name: 'VİP MÜFREDAT İZLEME 2',
        examType: 'LGS',
        resultStatus: 'Ready',
        examDate: '2026-08-15'
      },
      {
        id: 9,
        name: 'Eski açık LGS',
        examType: 'LGS',
        resultStatus: 'None',
        examDate: '2026-01-01'
      },
      {
        id: 10,
        name: 'Açık TYT',
        examType: 'TYT',
        resultStatus: 'None',
        examDate: '2026-08-20'
      }
    ];
    const unpublished = collectRecentUnpublishedProgramExams(catalog, {
      programKeys: inferEdesisExamProgramKeys({ classLevel: 'LGS' }),
      now: new Date('2026-08-24T12:00:00Z'),
      windowDays: 45
    });
    assert.deepEqual(
      unpublished.map((r) => pickEdesisCatalogExamId(r)),
      ['1559901']
    );

    const assigned = resolveAssignedCatalogRowsForStudent({
      catalogRows: catalog,
      edesisStudentId: '2086573',
      classroomId: '294965',
      programKeys: inferEdesisExamProgramKeys({ classLevel: 'LGS' }),
      now: new Date('2026-08-24T12:00:00Z')
    });
    assert.deepEqual(
      assigned.map((r) => pickEdesisCatalogExamId(r)),
      ['1559901']
    );

    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      assignedCatalogRows: assigned,
      resultRows: [
        {
          examId: 1561043,
          studentId: 2086573,
          resultStatus: 'Ready'
        }
      ],
      edesisStudentId: '2086573',
      programKeys: inferEdesisExamProgramKeys({ classLevel: 'LGS' }),
      now: new Date('2026-08-24T12:00:00Z'),
      allowRecencyFallback: false,
      requireExplicitAssignment: true
    });
    assert.deepEqual(
      items.filter((x) => x.canTake && !x.hasStudentResult).map((x) => x.examId),
      ['1559901']
    );
    assert.equal(items.find((x) => x.examId === '1561043')?.hasStudentResult, true);
    assert.equal(items.some((x) => x.examId === '9' || x.examId === '10'), false);
  });
});

describe('collectEdesisBookletFiles', () => {
  it('collects bare UUID denemeUrl as booklet file', () => {
    const files = collectEdesisBookletFiles({
      denemeUrl: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      sinavUrl: 'https://cdn.example.com/kitapcik.pdf'
    });
    assert.equal(files.some((f) => f.url.includes('a1b2c3d4-e5f6-7890-abcd-ef1234567890')), true);
    assert.equal(files.some((f) => /kitapcik\.pdf/i.test(f.url)), true);
  });

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

  it('extracts denemeUrl and sinavUrl from exam entity', () => {
    const files = collectEdesisBookletFiles({
      denemeUrl: 'https://cdn.edesis.com/deneme/abc-guid',
      sinavUrl: 'https://cdn.edesis.com/sinav/tyt-a.pdf',
      kitapcikTuru: 'A'
    });
    assert.ok(files.some((f) => /deneme\/abc-guid/.test(f.url)));
    assert.ok(files.some((f) => /tyt-a\.pdf/.test(f.url)));
  });

  it('extracts nested result.denemeUrl', () => {
    const files = collectEdesisBookletFiles({
      result: { denemeUrl: 'https://files.edesis.com/kitapcik/yos-a', name: 'YÖS A' }
    });
    assert.equal(files.length, 1);
    assert.match(files[0].url, /yos-a/);
  });

  it('reads PascalCase DenemeUrl', () => {
    const files = collectEdesisBookletFiles({
      DenemeUrl: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      KitapcikTuru: 'B'
    });
    assert.ok(files.some((f) => f.url.includes('b2c3d4e5-f6a7-8901-bcde-f12345678901')));
  });

  it('harvestLooseBookletRefs picks nested uuid file fields', async () => {
    const { harvestLooseBookletRefs } = await import('./edesis-client.js');
    const files = harvestLooseBookletRefs(
      {
        id: 1102253,
        name: 'YÖS SARMAL DENEME-12',
        extra: { paketGuid: 'c3d4e5f6-a7b8-9012-cdef-123456789012' }
      },
      '1102253'
    );
    assert.ok(files.some((f) => f.url.includes('c3d4e5f6-a7b8-9012-cdef-123456789012')));
  });
});

describe('resolveEdesisFileUrl / expandEdesisFileUrlCandidates', () => {
  it('prefers tenant web host over api.edesis.com for bare UUID', () => {
    const cfg = { baseUrl: 'https://onlinevipdershane.api.edesis.com' };
    const url = resolveEdesisFileUrl('a1b2c3d4-e5f6-7890-abcd-ef1234567890', cfg);
    assert.match(url, /^https:\/\/onlinevipdershane\.edesis\.com\/files\//);
    assert.equal(url.includes('.api.edesis.com'), false);
  });

  it('expands UUID across CDN hosts', () => {
    const cfg = { baseUrl: 'https://onlinevipdershane.api.edesis.com' };
    const cands = expandEdesisFileUrlCandidates('/files/a1b2c3d4-e5f6-7890-abcd-ef1234567890', cfg);
    assert.ok(cands.some((u) => u.includes('cdn.edesis.com')));
    assert.ok(cands.some((u) => u.includes('onlinevipdershane.edesis.com')));
    assert.ok(cands[0].includes('onlinevipdershane.edesis.com') || cands[0].includes('cdn.edesis.com'));
  });
});

describe('detectEdesisExamFamily', () => {
  it('maps LGS to dual sözel/sayısal A–D', () => {
    assert.equal(detectEdesisExamFamily('LGS Sarmal 4', 'LGS'), 'lgs');
    assert.equal(edesisOpticalUi('lgs').bookletMode, 'dual-sozel-sayisal');
    assert.equal(edesisOpticalUi('lgs').choiceCount, 4);
  });

  it('maps TYT/YKS to single kitapçık A–E', () => {
    assert.equal(detectEdesisExamFamily('TYT Deneme 12', 'TYT'), 'yks');
    assert.equal(edesisOpticalUi('yks').bookletMode, 'single');
    assert.equal(edesisOpticalUi('yks').choiceCount, 5);
  });

  it('maps YÖS SARMAL to yos with 5 choices', () => {
    assert.equal(detectEdesisExamFamily('YÖS SARMAL DENEME-12', ''), 'yos');
    assert.equal(detectEdesisExamFamily('YOS Sarmal 12', 'YÖS'), 'yos');
    assert.equal(edesisOpticalUi('yos').choiceCount, 5);
    assert.equal(edesisOpticalUi('yos').bookletMode, 'single');
  });
});

describe('pickEdesisBookletLessons', () => {
  it('falls back to shared structure when selected letter has no separate rows', () => {
    const structure = {
      rows: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 10, lessonName: 'Türkçe', questionCount: 20 }],
      booklets: [
        {
          kitapcikTuru: 'A',
          lessons: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 10, lessonName: 'Türkçe', questionCount: 20 }]
        }
      ]
    };
    const lessons = pickEdesisBookletLessons(structure, 'C');
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].lessonName, 'Türkçe');
  });

  it('matches booklet B case-insensitively', () => {
    const structure = {
      rows: [],
      booklets: [
        {
          kitapcikTuru: 'B',
          lessons: [{ kitapcikTuru: 'B', lessonId: 2, dersGrupId: 11, lessonName: 'Matematik', questionCount: 40 }]
        }
      ]
    };
    const lessons = pickEdesisBookletLessons(structure, 'b');
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].lessonName, 'Matematik');
  });

  it('canonicalEdesisStructureLessons dedupes shared rows', () => {
    const structure = {
      rows: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 10, lessonName: 'Türkçe', questionCount: 20 }],
      booklets: [
        {
          kitapcikTuru: 'A',
          lessons: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 10, lessonName: 'Türkçe', questionCount: 20 }]
        }
      ]
    };
    const lessons = canonicalEdesisStructureLessons(structure);
    assert.equal(lessons.length, 1);
  });
});

describe('listEdesisBookletCodes', () => {
  it('prefers answer key booklet codes from deneme API', () => {
    const codes = listEdesisBookletCodes({
      rows: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 1, questionCount: 10 }],
      booklets: [{ kitapcikTuru: 'A', lessons: [] }],
      answerKeyBookletCodes: ['A', 'B']
    });
    assert.deepEqual(codes, ['A', 'B']);
  });

  it('merges partial answer keys with A-D when structure exists', () => {
    const codes = listEdesisBookletCodes({
      rows: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 1, questionCount: 10 }],
      booklets: [{ kitapcikTuru: 'A', lessons: [] }],
      answerKeyBookletCodes: ['A']
    });
    assert.deepEqual(codes, ['A', 'B', 'C', 'D']);
  });
});

describe('extractEdesisStructureRows / normalizeKitapcikCode', () => {
  it('reads PascalCase KitapcikTuru from structure rows', () => {
    const rows = extractEdesisStructureRows([
      { KitapcikTuru: 'B', lessonId: 3, dersGrupId: 12, lessonName: 'Fen', questionCount: 20 }
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kitapcikTuru, 'B');
  });

  it('expands nested booklets with lessons', () => {
    const rows = extractEdesisStructureRows({
      booklets: [
        {
          kitapcikTuru: 'A',
          lessons: [{ lessonId: 1, dersGrupId: 1, lessonName: 'Türkçe', questionCount: 40 }]
        },
        {
          kitapcikTuru: 'B',
          lessons: [{ lessonId: 1, dersGrupId: 1, lessonName: 'Türkçe', questionCount: 40 }]
        }
      ]
    });
    assert.equal(rows.length, 2);
    assert.deepEqual(listEdesisBookletCodes({ rows, booklets: [] }).sort(), ['A', 'B']);
  });

  it('maps numeric booklet codes to letters', () => {
    assert.equal(normalizeKitapcikCode('2'), 'B');
    assert.equal(normalizeKitapcikCode('b'), 'B');
  });
});

describe('looksLikePdfBuffer', () => {
  it('accepts %PDF magic even without content-type', () => {
    assert.equal(looksLikePdfBuffer(Buffer.from('%PDF-1.7\n...')), true);
    assert.equal(looksLikePdfBuffer(Buffer.from('{"error":"no"}')), false);
  });
});
