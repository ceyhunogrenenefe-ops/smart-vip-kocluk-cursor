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
  parseEdesisOgrenciSinavAssignmentResponse,
  buildEdesisGetOgrenciSinavIdsPath,
  examCompatibleWithStudentGrade,
  examCompatibleWithStudentProgramSoft,
  isThinOnlineRosterExam,
  catalogExamTakeableWithoutRosterProbe,
  catalogExamOpenTakeableCandidate,
  edesisExamGradeIdMatchesStudent,
  collectOpenOnlineProgramExams,
  pickEdesisExamSinavTuruId,
  collectCatalogRowsForSinavIds,
  mergeAssignedCatalogWithAdminSinavIds,
  collectAssignedRowsFromStudentRaporViews,
  overlayAssignedCatalogWithRaporViews,
  collectStudentTakeableOpenCatalogExams,
  pickEdesisExamTakeWindow,
  edesisExamTakeWindowOpen,
  overlayCatalogExamsWithTakeWindows,
  edesisResultHiddenFromStudent,
  pickExamDurationSeconds,
  pickEdesisResultExamId,
  buildEdesisStudentRaporQuery,
  resultRowBelongsToStudent,
  collectEdesisBookletFiles,
  pickEdesisBookletFile,
  detectEdesisExamFamily,
  edesisOpticalUi,
  pickEdesisBookletLessons,
  extractEdesisStructureRows,
  normalizeKitapcikCode,
  listEdesisBookletCodes,
  denemeOnlyBookletCodes,
  extractEdesisAnswerKeyBookletCodes,
  kitapcikAllowedForExam,
  canonicalEdesisStructureLessons,
  looksLikePdfBuffer,
  absorbEdesisBookletSource,
  catalogLooksStudentFiltered,
  catalogQueryLooksFiltered,
  catalogExamAssignedToStudent,
  examAssignedViaOnlineFlag,
  examResultRowsAssignStudent,
  examRosterIncludesStudent,
  shouldOfferOpenCatalogExamAfterRoster,
  trustEdesisStudentCatalogList,
  looksLikePersonalExamList,
  resolveEdesisFileUrl,
  expandEdesisFileUrlCandidates,
  extractGoogleDriveFileId,
  expandGoogleDrivePdfCandidates,
  pickGoogleDriveFetchUrl,
  googleDrivePreviewUrl,
  rewriteBookletFilesForBrowser
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

  it('maps MAARİF / müfredat to lgs', () => {
    const keys = inferEdesisExamProgramKeys({ examType: 'MAARİF 80', examName: 'Maarif Model4' });
    assert.equal(keys.has('lgs'), true);
    assert.equal(keys.has('yks'), false);
  });

  it('does not map TYT-Maarif student class to lgs', () => {
    const keys = inferEdesisExamProgramKeys({ classLevel: 'TYT-Maarif' });
    assert.equal(keys.has('yks'), true);
    assert.equal(keys.has('lgs'), false);
  });

  it('maps KTT / 25’li mini tarama to lgs without dumping TYT', () => {
    const ktt = inferEdesisExamProgramKeys({ examName: 'MATEMATİK KTT 25 Lİ' });
    assert.equal(ktt.has('lgs'), true);
    assert.equal(ktt.has('yks'), false);
    const tytKtt = inferEdesisExamProgramKeys({ examName: 'TYT KTT 1' });
    assert.equal(tytKtt.has('yks'), true);
    assert.equal(tytKtt.has('lgs'), false);
  });
});

describe('examCompatibleWithStudentProgramSoft', () => {
  it('keeps LGS+Maarif for lgs student, blocks for yks', () => {
    const lgs = new Set(['lgs']);
    const yks = new Set(['yks']);
    assert.equal(
      examCompatibleWithStudentProgramSoft({ name: 'LİMİT LGS', examType: '5-6-7 LGS 90' }, lgs),
      false
    );
    assert.equal(
      examCompatibleWithStudentProgramSoft({ name: 'Maarif Model4', examType: 'MAARİF 80' }, lgs),
      true
    );
    assert.equal(
      examCompatibleWithStudentProgramSoft({ name: 'LİMİT LGS', examType: '5-6-7 LGS 90' }, yks),
      false
    );
    assert.equal(
      examCompatibleWithStudentProgramSoft({ name: 'Maarif Model4', examType: 'MAARİF 80' }, yks),
      false
    );
    assert.equal(
      examCompatibleWithStudentProgramSoft({ name: 'TOPRAK', examType: 'TYT' }, yks),
      true
    );
  });
});

describe('thin online roster + open catalog', () => {
  it('treats 1–8 students as thin, 24 as not', () => {
    assert.equal(isThinOnlineRosterExam({ studentCount: 2 }), true);
    assert.equal(isThinOnlineRosterExam({ studentCount: 4 }), true);
    assert.equal(isThinOnlineRosterExam({ studentCount: 0 }), false);
    assert.equal(isThinOnlineRosterExam({ studentCount: 24 }), false);
    assert.equal(isThinOnlineRosterExam({ studentCount: 24 }, 2), true);
  });

  it('catalog fast path keeps empty/thin LGS, drops 24-person roster', () => {
    const keys = new Set(['lgs']);
    const empty = {
      id: '1579080',
      name: 'LİMİT LGS HAZIRBULUNUŞLUK',
      examType: 'LGS',
      resultStatus: 'None',
      studentCount: 0,
      examDate: '2026-08-20',
      isOnlineSinavForStudent: true
    };
    const fat = { ...empty, id: '1', name: 'PARAF MOR 1', studentCount: 24 };
    assert.equal(
      catalogExamTakeableWithoutRosterProbe(empty, { programKeys: keys, gradeName: '8-F' }),
      true
    );
    assert.equal(
      catalogExamTakeableWithoutRosterProbe(fat, { programKeys: keys, gradeName: '8-F' }),
      false
    );
    assert.equal(
      catalogExamTakeableWithoutRosterProbe({ ...empty, studentCount: 1 }, { programKeys: keys, gradeName: '8-F' }),
      false
    );
    assert.equal(
      catalogExamOpenTakeableCandidate({ ...empty, studentCount: 1 }, { programKeys: keys, gradeName: '8-F' }),
      true
    );
    assert.equal(
      catalogExamOpenTakeableCandidate(
        { ...empty, examType: '5-6-7 LGS 90', studentCount: 0 },
        { programKeys: keys, gradeName: '8-F' }
      ),
      false
    );
  });

  it('unpublished 7.SINIF / 5-6-7 KTT is not dumped to 8-F', () => {
    const keys = new Set(['lgs']);
    const ktt = {
      id: '1579103',
      name: '\t7.SINIF MAT FEN KTT 2',
      examType: 'ONLİNE VİP 5-6-7 (MAT FEN 15 Lİ)',
      resultStatus: 'None',
      studentCount: 0,
      examDate: '2026-08-26',
      isOnlineSinavForStudent: true
    };
    assert.equal(
      catalogExamTakeableWithoutRosterProbe(ktt, { programKeys: keys, gradeName: '8-F' }),
      false
    );
    assert.equal(
      catalogExamTakeableWithoutRosterProbe(
        { ...ktt, id: '1533029', resultStatus: 'Ready', studentCount: 1 },
        { programKeys: keys, gradeName: '8-F' }
      ),
      false
    );
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [ktt],
      assignedCatalogRows: [ktt],
      resultRows: [],
      edesisStudentId: '2086573',
      programKeys: keys,
      gradeName: '8-F',
      now: new Date('2026-08-26T12:00:00Z'),
      requireExplicitAssignment: true
    });
    assert.deepEqual(
      items.filter((x) => x.canTake).map((x) => x.examId),
      []
    );
  });

  it('lists LGS open exams in 45d excluding taken', () => {
    const now = new Date('2026-08-25T12:00:00Z');
    const rows = [
      {
        id: '1579080',
        name: 'LİMİT LGS HAZIRBULUNUŞLUK',
        examType: 'LGS',
        resultStatus: 'None',
        examDate: '2026-08-25'
      },
      {
        id: '1544720',
        name: 'YANIT 1 PROVA YENİ',
        examType: 'LGS',
        resultStatus: 'Ready',
        examDate: '2026-08-01',
        studentCount: 2
      },
      {
        id: '1561040',
        name: 'PARAF MOR 1',
        examType: 'LGS',
        resultStatus: 'Ready',
        examDate: '2026-08-15',
        studentCount: 24
      },
      {
        id: '1539420',
        name: 'TOPRAK',
        examType: 'TYT',
        resultStatus: 'None',
        examDate: '2026-08-20'
      }
    ];
    const open = collectOpenOnlineProgramExams(rows, {
      programKeys: new Set(['lgs']),
      gradeName: '8',
      excludeExamIds: [],
      now
    });
    const ids = open.map((r) => pickEdesisCatalogExamId(r));
    assert.equal(ids.includes('1579080'), true);
    assert.equal(ids.includes('1544720'), true);
    assert.equal(ids.includes('1561040'), true);
    assert.equal(ids.includes('1539420'), false);
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

  it('requireExplicitAssignment hides ancient Ready assigned exams (analysis residue)', () => {
    const now = new Date('2026-08-24T12:00:00Z');
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 315978,
          name: 'Eski 5. sınıf',
          examType: '5 SINIF 75 LGS',
          resultStatus: 'Ready',
          examDate: '2023-11-11',
          studentIds: [2086573]
        },
        {
          id: 1561043,
          name: 'Yeni LGS',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-15',
          studentIds: [2086573]
        }
      ],
      assignedCatalogRows: [
        {
          id: 315978,
          name: 'Eski 5. sınıf',
          examType: '5 SINIF 75 LGS',
          resultStatus: 'Ready',
          examDate: '2023-11-11'
        },
        {
          id: 1561043,
          name: 'Yeni LGS',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-15'
        }
      ],
      resultRows: [],
      edesisStudentId: '2086573',
      programKeys: inferEdesisExamProgramKeys({ classLevel: 'LGS' }),
      now,
      requireExplicitAssignment: true
    });
    assert.deepEqual(
      items.filter((x) => x.canTake).map((x) => x.examId),
      ['1561043']
    );
  });

  it('requireExplicitAssignment does not mix submitted results into Sınava gir list', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 100,
          name: 'Açık atanmış',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-20'
        }
      ],
      assignedCatalogRows: [
        {
          id: 100,
          name: 'Açık atanmış',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-20'
        }
      ],
      resultRows: [
        { examId: 99, studentId: 2086573, examName: 'Eski girilmiş', net: 80, examDate: '2026-08-01' }
      ],
      edesisStudentId: '2086573',
      programKeys: inferEdesisExamProgramKeys({ classLevel: 'LGS' }),
      now: new Date('2026-08-24T12:00:00Z'),
      requireExplicitAssignment: true
    });
    assert.deepEqual(
      items.map((x) => x.examId),
      ['100']
    );
    assert.equal(items[0].canTake, true);
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

describe('buildEdesisGetOgrenciSinavIdsPath', () => {
  it('appends tenantId — empty sinavId without it (Edesis live bug)', () => {
    assert.equal(
      buildEdesisGetOgrenciSinavIdsPath('2086573', '3226'),
      '/api/services/app/OgrenciSinavs/GetOgrenciSinavIds?ogrenciId=2086573&tenantId=3226'
    );
  });

  it('omits tenantId when blank', () => {
    assert.equal(
      buildEdesisGetOgrenciSinavIdsPath(2086573, ''),
      '/api/services/app/OgrenciSinavs/GetOgrenciSinavIds?ogrenciId=2086573'
    );
  });
});

describe('parseEdesisOgrenciSinavAssignmentResponse / grade compatibility', () => {
  it('reads sinavId + sinavTuruId together', () => {
    const parsed = parseEdesisOgrenciSinavAssignmentResponse({
      result: { sinavId: [1579080], sinavTuruId: [60, 3, 60] }
    });
    assert.deepEqual(parsed.sinavIds, ['1579080']);
    assert.deepEqual(parsed.sinavTuruIds, ['60', '3']);
  });

  it('picks sinavTuruId from nested deneme', () => {
    assert.equal(pickEdesisExamSinavTuruId({ deneme: { sinavTuruId: 60 } }), '60');
  });

  it('blocks 5/6. sınıf denemeleri for grade 8', () => {
    assert.equal(examCompatibleWithStudentGrade({ name: '5.SINIF MAT FEN KTT 2' }, '8'), false);
    assert.equal(examCompatibleWithStudentGrade({ name: '6 SINIF FEN KTT' }, '8'), false);
    assert.equal(examCompatibleWithStudentGrade({ name: 'LİMİT LGS HAZIRBULUNUŞLUK' }, '8'), true);
    assert.equal(examCompatibleWithStudentGrade({ name: '7.sınıf Mat Fen KTT 2' }, '8'), false);
    assert.equal(examCompatibleWithStudentGrade({ name: '7.sınıf Mat Fen KTT 2' }, '7'), true);
    assert.equal(
      examCompatibleWithStudentGrade({ name: '7.sınıf Mat Fen KTT 2' }, '8', { allowLgsNeighbor: true }),
      false
    );
    assert.equal(
      examCompatibleWithStudentGrade({ name: 'LİMİT LGS HAZIRBULUNUŞLUK', examType: '5-6-7 LGS 90' }, '8'),
      false
    );
    assert.equal(
      examCompatibleWithStudentGrade({ name: '5.SINIF MAT FEN KTT 2' }, '8', { allowLgsNeighbor: true }),
      false
    );
    assert.equal(edesisExamGradeIdMatchesStudent({ gradeId: '8' }, '8'), true);
    assert.equal(edesisExamGradeIdMatchesStudent({ gradeId: '7' }, '8'), false);
    assert.equal(edesisExamGradeIdMatchesStudent({ name: 'LGS' }, '8'), null);
  });

  it('empty known roster stays takeable even if GetSinavForView studentCount is nonzero', () => {
    const exam = { id: '1580678', name: 'PARAF MİS LGS-2', studentCount: 12 };
    assert.equal(
      shouldOfferOpenCatalogExamAfterRoster(exam, { roster: [], edesisStudentId: '2086573' }),
      true
    );
    assert.equal(
      shouldOfferOpenCatalogExamAfterRoster(exam, { roster: ['999'], edesisStudentId: '2086573' }),
      false
    );
    assert.equal(
      shouldOfferOpenCatalogExamAfterRoster(exam, { roster: ['2086573'], edesisStudentId: '2086573' }),
      true
    );
    assert.equal(
      shouldOfferOpenCatalogExamAfterRoster(exam, { roster: null, edesisStudentId: '2086573' }),
      false
    );
  });

  it('reads grade from examType when title has no sınıf', () => {
    assert.equal(
      examCompatibleWithStudentGrade({ name: 'Origami', examType: '9 SINIF ORİGAMİ 125' }, '8'),
      false
    );
    assert.equal(
      examCompatibleWithStudentGrade({ name: 'Maarif Model4', examType: 'MAARİF 80' }, '8'),
      true
    );
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

  it('Kağan-like: tenant-wide sinavTuruId does not expand 1 assigned exam into the catalog', () => {
    const catalog = [
      {
        id: 1579890,
        name: 'Kağan atanan',
        examType: 'TYT',
        resultStatus: 'None',
        examDate: '2026-08-27',
        studentCount: 0,
        isOnlineSinavForStudent: true
      },
      {
        id: 1579181,
        name: 'SUPARA TYT-1',
        examType: 'TYT',
        resultStatus: 'None',
        examDate: '2026-08-26',
        studentCount: 0,
        isOnlineSinavForStudent: true
      },
      {
        id: 1574149,
        name: 'TOPRAK TYT-5',
        examType: 'TYT',
        resultStatus: 'None',
        examDate: '2026-08-24',
        studentCount: 2,
        isOnlineSinavForStudent: true
      },
      {
        id: 1537212,
        name: 'LGS İNGİLİZCE KTT 1',
        examType: 'LGS İNGİLİZCE 10',
        resultStatus: 'None',
        examDate: '2026-08-10',
        studentCount: 0
      }
    ];
    const assigned = mergeAssignedCatalogWithAdminSinavIds({
      assigned: [],
      catalogRows: catalog,
      adminSinavIds: ['1579890']
    });
    assert.deepEqual(assigned.map((r) => pickEdesisCatalogExamId(r)), ['1579890']);
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      assignedCatalogRows: assigned,
      resultRows: [],
      edesisStudentId: '7909547',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '11' }),
      now: new Date('2026-08-28T12:00:00Z'),
      allowRecencyFallback: false,
      requireExplicitAssignment: true
    });
    assert.deepEqual(
      items.filter((x) => x.canTake).map((x) => x.examId),
      ['1579890']
    );
  });

  it('Safiye-like: unpublished empty-roster LGS is takeable; fat Ready and TYT are not', () => {
    const catalog = [
      {
        id: 315978,
        name: 'Eski analiz',
        examType: 'LGS',
        resultStatus: 'Ready',
        examDate: '2024-01-01',
        studentCount: 40
      },
      {
        id: 1579080,
        name: 'LİMİT LGS HAZIRBULUNUŞLUK',
        examType: '5-6-7 LGS 90',
        resultStatus: 'None',
        examDate: '2026-08-25',
        studentCount: 0
      },
      {
        id: 1580129,
        name: 'MATEMATİK KTT 25 Lİ',
        resultStatus: 'None',
        examDate: '2026-08-28',
        studentCount: 0
      },
      {
        id: 1580678,
        name: 'PARAF MİS LGS-2 İNTERAKTİF',
        examType: 'LGS',
        resultStatus: 'Ready',
        examDate: '2026-08-29',
        studentCount: 0
      },
      {
        id: 1561040,
        name: 'PARAF MOR 1',
        examType: 'LGS',
        resultStatus: 'Ready',
        examDate: '2026-08-15',
        studentCount: 25
      },
      {
        id: 1579181,
        name: 'SUPARA TYT-1',
        examType: 'TYT',
        resultStatus: 'Ready',
        examDate: '2026-08-26',
        studentCount: 1
      }
    ];
    const open = collectStudentTakeableOpenCatalogExams(catalog, {
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      gradeName: '8',
      now: new Date('2026-08-28T12:00:00Z')
    });
    assert.deepEqual(open.map((r) => pickEdesisCatalogExamId(r)).sort(), ['1580129', '1580678']);
    const thinAssigned = collectStudentTakeableOpenCatalogExams(
      [
        ...catalog,
        {
          id: 1580999,
          name: '8-F MATEMATİK KTT ATAMA',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2026-08-29',
          studentCount: 1
        }
      ],
      {
        programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
        gradeName: '8',
        now: new Date('2026-08-28T12:00:00Z')
      }
    );
    assert.equal(
      thinAssigned.some((r) => pickEdesisCatalogExamId(r) === '1580999'),
      true
    );
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      assignedCatalogRows: open,
      resultRows: [],
      edesisStudentId: '2086573',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      gradeName: '8',
      now: new Date('2026-08-28T12:00:00Z'),
      allowRecencyFallback: false,
      requireExplicitAssignment: true
    });
    assert.deepEqual(
      items.filter((x) => x.canTake).map((x) => x.examId).sort(),
      ['1580129', '1580678']
    );
  });

  it('Kağan-like: unpublished LGS catalog is not takeable for YKS class 11', () => {
    const catalog = [
      {
        id: 1579080,
        name: 'LİMİT LGS HAZIRBULUNUŞLUK',
        examType: 'LGS',
        resultStatus: 'None',
        examDate: '2026-08-25',
        studentCount: 0
      },
      {
        id: 1580129,
        name: 'MATEMATİK KTT 25 Lİ',
        resultStatus: 'None',
        examDate: '2026-08-28',
        studentCount: 0
      },
      {
        id: 1579181,
        name: 'SUPARA TYT-1',
        examType: 'TYT',
        resultStatus: 'Ready',
        examDate: '2026-08-26',
        studentCount: 1
      }
    ];
    const open = collectStudentTakeableOpenCatalogExams(catalog, {
      programKeys: inferEdesisExamProgramKeys({ classLevel: '11' }),
      gradeName: '11',
      now: new Date('2026-08-28T12:00:00Z')
    });
    const ids = open.map((r) => pickEdesisCatalogExamId(r));
    assert.equal(ids.includes('1579080'), false);
    assert.equal(ids.includes('1580129'), false);
    assert.deepEqual(ids, ['1579181']);
  });

  it('shows only admin-assigned open exams for that student id', () => {
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

  it('does not dump recent unpublished program exams as assigned without studentIds', () => {
    const catalog = [
      {
        id: 1559901,
        name: 'VİP MÜFREDAT İZLEME LGS-1',
        examType: 'LGS',
        resultStatus: 'None',
        examDate: '2026-08-14'
      },
      {
        id: 1567875,
        name: 'Maarif Model4',
        examType: 'MAARİF 80',
        resultStatus: 'None',
        examDate: '2026-08-19'
      },
      {
        id: 1574085,
        name: '9 SINIF ESEN DENEME-2',
        examType: '9 SINIF 100',
        resultStatus: 'None',
        examDate: '2026-08-24'
      }
    ];
    const unpublished = collectRecentUnpublishedProgramExams(catalog, {
      programKeys: inferEdesisExamProgramKeys({ classLevel: 'LGS' }),
      now: new Date('2026-08-24T12:00:00Z'),
      windowDays: 45
    });
    assert.deepEqual(
      unpublished.map((r) => pickEdesisCatalogExamId(r)).sort(),
      ['1559901', '1567875']
    );

    const assigned = resolveAssignedCatalogRowsForStudent({
      catalogRows: catalog,
      edesisStudentId: '2086573',
      classroomId: '294965',
      programKeys: inferEdesisExamProgramKeys({ classLevel: 'LGS' })
    });
    assert.deepEqual(assigned.map((r) => pickEdesisCatalogExamId(r)), []);

    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: catalog,
      assignedCatalogRows: assigned,
      resultRows: [],
      edesisStudentId: '2086573',
      programKeys: inferEdesisExamProgramKeys({ classLevel: 'LGS' }),
      now: new Date('2026-08-24T12:00:00Z'),
      allowRecencyFallback: false,
      requireExplicitAssignment: true
    });
    assert.equal(items.filter((x) => x.canTake).length, 0);
  });

  it('offers unpublished assigned exam even when older than 180d', () => {
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [
        {
          id: 1559901,
          name: 'VİP MÜFREDAT İZLEME LGS-1',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2025-01-01'
        }
      ],
      assignedCatalogRows: [
        {
          id: 1559901,
          name: 'VİP MÜFREDAT İZLEME LGS-1',
          examType: 'LGS',
          resultStatus: 'None',
          examDate: '2025-01-01'
        }
      ],
      resultRows: [],
      edesisStudentId: '2086573',
      programKeys: inferEdesisExamProgramKeys({ classLevel: 'LGS' }),
      now: new Date('2026-08-24T12:00:00Z'),
      requireExplicitAssignment: true
    });
    assert.deepEqual(
      items.filter((x) => x.canTake).map((x) => x.examId),
      ['1559901']
    );
  });

  it('treats classRoomIds detail as classroom assignment', () => {
    const hit = catalogExamAssignedToStudent(
      {
        id: 1559901,
        name: 'VİP MÜFREDAT İZLEME LGS-1',
        examType: 'LGS',
        resultStatus: 'None',
        classRoomIds: [294965, 111]
      },
      { edesisStudentId: '2086573', classroomId: '294965', allowClassroomOnly: true }
    );
    assert.equal(hit, true);
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

  it('harvestLooseBookletRefs skips md5Key hashes', async () => {
    const { harvestLooseBookletRefs } = await import('./edesis-client.js');
    const files = harvestLooseBookletRefs(
      {
        id: 1579080,
        md5Key: '80b56be2-3bbd-885e-acb2-d78e6279837f',
        md10Key: '7d3fccb7-4e13-6442-9385-4f60cfeeee26',
        denemeUrl: 'https://cdn.edesis.com/kitapcik/limit-a.pdf'
      },
      '1579080'
    );
    assert.equal(
      files.some((f) => f.url.includes('80b56be2-3bbd-885e-acb2-d78e6279837f')),
      false
    );
    assert.ok(files.some((f) => /limit-a\.pdf/.test(f.url)));
  });

  it('absorbEdesisBookletSource reads ABP GetSinavForView denemeUrl + denemeId', () => {
    const absorbed = absorbEdesisBookletSource(
      {
        id: 1579080,
        name: 'LİMİT LGS HAZIRBULUNUŞLUK',
        sinavTuruAdi: 'LGS',
        deneme: {
          id: 441122,
          denemeUrl: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        }
      },
      '1579080'
    );
    assert.equal(absorbed.denemeId, '441122');
    assert.ok(absorbed.files.some((f) => f.url.includes('a1b2c3d4-e5f6-7890-abcd-ef1234567890')));
    assert.match(absorbed.examMeta.title || '', /LİMİT LGS/i);
  });

  it('absorbEdesisBookletSource reads merged catalog-row denemeUrl', () => {
    const absorbed = absorbEdesisBookletSource(
      {
        id: 1579080,
        name: 'LİMİT LGS HAZIRBULUNUŞLUK',
        denemeUrl: 'https://cdn.edesis.com/files/11111111-2222-3333-4444-555555555555',
        denemeId: 778899
      },
      '1579080'
    );
    assert.equal(absorbed.denemeId, '778899');
    assert.ok(absorbed.files.some((f) => /555555555555/.test(f.url)));
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

  it('expands Google Drive /view share links to download URLs', () => {
    const view = 'https://drive.google.com/file/d/1MYKrkAlkJ0jG-nkO1Lf72TUfDa1sSPPR/view?usp=sharing';
    assert.equal(extractGoogleDriveFileId(view), '1MYKrkAlkJ0jG-nkO1Lf72TUfDa1sSPPR');
    const cands = expandGoogleDrivePdfCandidates(view);
    assert.ok(cands.some((u) => u.includes('drive.usercontent.google.com/download')));
    assert.ok(cands.some((u) => u.includes('export=download')));
    assert.equal(cands.some((u) => /\/view/.test(u)), false);
    assert.equal(
      pickGoogleDriveFetchUrl([{ url: view }]),
      cands[0]
    );
    assert.equal(
      googleDrivePreviewUrl(view),
      'https://drive.google.com/file/d/1MYKrkAlkJ0jG-nkO1Lf72TUfDa1sSPPR/preview'
    );
    assert.equal(googleDrivePreviewUrl(cands[0]), googleDrivePreviewUrl(view));
    const rewritten = rewriteBookletFilesForBrowser([{ url: view, name: 'Kitapçık PDF' }]);
    assert.equal(rewritten[0].url, googleDrivePreviewUrl(view));
    assert.equal(rewritten[0].url.includes('/preview'), true);
    assert.equal(rewritten[0].url.includes('usercontent'), false);
    const expanded = expandEdesisFileUrlCandidates(view, {
      baseUrl: 'https://onlinevipdershane.api.edesis.com'
    });
    assert.ok(expanded.some((u) => u.includes('export=download') || u.includes('usercontent.google.com')));
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
  it('shows deneme B even when structure rows are only A', () => {
    const structure = {
      rows: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 1, questionCount: 10 }],
      booklets: [{ kitapcikTuru: 'A', lessons: [] }],
      answerKeyBookletCodes: ['A', 'B']
    };
    assert.deepEqual(listEdesisBookletCodes(structure), ['A', 'B']);
    assert.deepEqual(denemeOnlyBookletCodes(structure), []);
  });

  it('includes C and D from answer keys or booklet endpoint', () => {
    const codes = listEdesisBookletCodes({
      rows: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 1, questionCount: 10 }],
      booklets: [],
      answerKeyBookletCodes: ['A', 'B', 'C', 'D']
    });
    assert.deepEqual(codes, ['A', 'B', 'C', 'D']);
  });

  it('keeps A and B when structure rows include both', () => {
    const codes = listEdesisBookletCodes({
      rows: [
        { kitapcikTuru: 'A', lessonId: 1, dersGrupId: 1, questionCount: 10 },
        { kitapcikTuru: 'B', lessonId: 1, dersGrupId: 1, questionCount: 10 }
      ],
      booklets: [],
      answerKeyBookletCodes: ['A', 'B']
    });
    assert.deepEqual(codes, ['A', 'B']);
  });

  it('does not invent B-C-D when only A has an answer key', () => {
    const codes = listEdesisBookletCodes({
      rows: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 1, questionCount: 10 }],
      booklets: [{ kitapcikTuru: 'A', lessons: [] }],
      answerKeyBookletCodes: ['A']
    });
    assert.deepEqual(codes, ['A']);
  });

  it('uses structure letters when answer keys are empty', () => {
    const codes = listEdesisBookletCodes({
      rows: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 1, questionCount: 10 }],
      booklets: [{ kitapcikTuru: 'A', lessons: [] }],
      answerKeyBookletCodes: []
    });
    assert.deepEqual(codes, ['A']);
  });

  it('falls back to A-D when nothing is known', () => {
    assert.deepEqual(listEdesisBookletCodes({ rows: [], booklets: [], answerKeyBookletCodes: [] }), [
      'A',
      'B',
      'C',
      'D'
    ]);
  });
});

describe('extractEdesisAnswerKeyBookletCodes', () => {
  it('reads ABP DenemeCevapOutputDto kitapciklar', () => {
    const codes = extractEdesisAnswerKeyBookletCodes({
      result: {
        kitapciklar: [
          { kitapcikTuru: 'A', cevaplar: [{ adet: 1 }] },
          { KitapcikTuru: '2', cevaplar: [{ adet: 1 }] }
        ]
      }
    });
    assert.deepEqual(codes, ['A', 'B']);
  });

  it('skips booklet slot with empty cevaplar', () => {
    const codes = extractEdesisAnswerKeyBookletCodes({
      result: {
        kitapciklar: [
          { kitapcikTuru: 'A', cevaplar: [{ adet: 1 }] },
          { kitapcikTuru: 'B', cevaplar: [] }
        ]
      }
    });
    assert.deepEqual(codes, ['A']);
  });
});

describe('kitapcikAllowedForExam', () => {
  it('rejects B when only A is registered', () => {
    const structure = {
      rows: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 1, questionCount: 10 }],
      answerKeyBookletCodes: ['A']
    };
    assert.equal(kitapcikAllowedForExam(structure, 'B').ok, false);
    assert.deepEqual(kitapcikAllowedForExam(structure, 'A').available, ['A']);
  });

  it('allows B when deneme answer key has B even if structure is A', () => {
    const structure = {
      rows: [{ kitapcikTuru: 'A', lessonId: 1, dersGrupId: 1, questionCount: 10 }],
      answerKeyBookletCodes: ['A', 'B']
    };
    assert.equal(kitapcikAllowedForExam(structure, 'B').ok, true);
    assert.deepEqual(kitapcikAllowedForExam(structure, 'B').available, ['A', 'B']);
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

describe('GetAllSinavRaporForStudent classroom gate', () => {
  const safiyeClass = 294965;
  const kaganClass = 335565;
  const limitLgs = {
    id: 1579103,
    name: 'LİMİT LGS-1',
    examType: 'LGS',
    resultStatus: 'None',
    examDate: '2026-08-25',
    isOnlineSinavForStudent: true,
    isStudentAddResult: true,
    classRoomIds: [safiyeClass],
    sinav: { id: 1579103, isOnlineSinavForStudent: true, sinavSuresi: 165 }
  };
  const suparaTyt = {
    id: 1579181,
    name: 'SUPARA TYT-1',
    examType: 'TYT',
    resultStatus: 'None',
    examDate: '2026-08-26',
    isOnlineSinavForStudent: true,
    classRoomIds: [kaganClass]
  };
  const tenantDump = {
    id: 1537212,
    name: 'LGS İNGİLİZCE KTT 1',
    examType: 'LGS İNGİLİZCE 10',
    resultStatus: 'None',
    examDate: '2026-08-10',
    isOnlineSinavForStudent: true
  };

  it('keeps only the student classroom + online flag', () => {
    const rows = collectAssignedRowsFromStudentRaporViews([limitLgs, suparaTyt, tenantDump], {
      edesisStudentId: '2086573',
      classroomId: String(safiyeClass),
      adminSinavIds: []
    });
    assert.deepEqual(
      rows.map((r) => pickEdesisCatalogExamId(r)),
      ['1579103']
    );
  });

  it('does not leak Safiye classroom exams to Kağan', () => {
    const rows = collectAssignedRowsFromStudentRaporViews([limitLgs, suparaTyt], {
      edesisStudentId: '7909547',
      classroomId: String(kaganClass),
      adminSinavIds: []
    });
    assert.deepEqual(
      rows.map((r) => pickEdesisCatalogExamId(r)),
      ['1579181']
    );
  });

  it('does not dump tenant rapor rows without classroom or admin sinavId', () => {
    const dump = Array.from({ length: 17 }, (_, i) => ({
      id: 1500000 + i,
      name: `Kurum dump ${i}`,
      isOnlineSinavForStudent: true,
      resultStatus: 'None',
      examDate: '2026-08-27'
    }));
    const rows = collectAssignedRowsFromStudentRaporViews(dump, {
      edesisStudentId: '7909547',
      classroomId: String(kaganClass),
      adminSinavIds: []
    });
    assert.equal(rows.length, 0);
  });

  it('still keeps GetOgrenciSinavIds admin id without classroom match', () => {
    const rows = collectAssignedRowsFromStudentRaporViews([tenantDump], {
      edesisStudentId: '7909547',
      classroomId: String(kaganClass),
      adminSinavIds: ['1537212']
    });
    assert.equal(rows.length, 1);
    assert.equal(pickEdesisCatalogExamId(rows[0]), '1537212');
  });

  it('overlays rapor duration onto thin catalog assignment', () => {
    const out = overlayAssignedCatalogWithRaporViews(
      [{ id: 1579103, name: 'LİMİT LGS-1', resultStatus: 'None' }],
      [limitLgs]
    );
    assert.equal(out.length, 1);
    assert.equal(pickExamDurationSeconds(out[0]), 9900);
  });

  it('Safiye classroom online exam is takeable; tenant dump is not', () => {
    const assigned = collectAssignedRowsFromStudentRaporViews([limitLgs, tenantDump], {
      edesisStudentId: '2086573',
      classroomId: String(safiyeClass),
      adminSinavIds: []
    });
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [limitLgs, tenantDump],
      assignedCatalogRows: assigned,
      resultRows: [],
      edesisStudentId: '2086573',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      classroomId: String(safiyeClass),
      gradeName: '8. Sınıf',
      now: new Date('2026-08-28T12:00:00Z'),
      allowRecencyFallback: false,
      requireExplicitAssignment: true
    });
    assert.deepEqual(
      items.filter((x) => x.canTake).map((x) => x.examId),
      ['1579103']
    );
  });
});

describe('edesisExamTakeWindowOpen', () => {
  const now = new Date('2026-08-28T12:00:00Z');

  it('hides when GetSinavForView endDate has passed', () => {
    assert.equal(
      edesisExamTakeWindowOpen(
        { id: 1559901, name: 'VİP MÜFREDAT İZLEME LGS-1', startDate: '2026-08-10', endDate: '2026-08-20' },
        now
      ),
      false
    );
  });

  it('keeps exam open through the Istanbul calendar day of a midnight endDate', () => {
    assert.equal(
      edesisExamTakeWindowOpen({ id: 1580129, endDate: '2026-08-28T00:00:00' }, now),
      true
    );
  });

  it('hides when startDate is still in the future', () => {
    assert.equal(
      edesisExamTakeWindowOpen({ id: 1, startDate: '2026-08-29', endDate: '2026-09-05' }, now),
      false
    );
  });

  it('does not hide when only examDate exists (that is not the take window)', () => {
    assert.equal(
      edesisExamTakeWindowOpen({ id: 1559901, examDate: '2026-08-14', sinavTarihi: '2026-08-14' }, now),
      true
    );
  });

  it('ignores placeholder 0001 dates', () => {
    assert.equal(
      edesisExamTakeWindowOpen(
        { id: 1, startDate: '0001-01-01T00:00:00', endDate: '0001-01-01T00:00:00' },
        now
      ),
      true
    );
    assert.equal(pickEdesisExamTakeWindow({ startDate: '0001-01-01' }).startRaw, '');
  });

  it('reads nested GetSinavForViewDto startDate/endDate', () => {
    const view = {
      sinav: { id: 1579080, sinavAdi: 'LİMİT LGS', sinavTarihi: '2026-08-25' },
      startDate: '2026-08-25T00:00:00',
      endDate: '2026-08-20T00:00:00'
    };
    assert.equal(edesisExamTakeWindowOpen(view, now), false);
    assert.equal(pickEdesisExamTakeWindow(view).endRaw, '2026-08-20T00:00:00');
  });

  it('Sınava gir hides expired window even if catalog examDate is recent', () => {
    const expired = {
      id: 1559901,
      name: 'VİP MÜFREDAT İZLEME LGS-1',
      examType: 'LGS',
      resultStatus: 'None',
      examDate: '2026-08-14',
      studentCount: 0,
      startDate: '2026-08-10T00:00:00',
      endDate: '2026-08-20T00:00:00'
    };
    const items = buildStudentAvailableEdesisExamItems({
      catalogRows: [expired],
      assignedCatalogRows: [expired],
      resultRows: [],
      edesisStudentId: '2086573',
      programKeys: inferEdesisExamProgramKeys({ classLevel: '8' }),
      gradeName: '8',
      now,
      allowRecencyFallback: false,
      requireExplicitAssignment: true
    });
    assert.deepEqual(items.filter((x) => x.canTake).map((x) => x.examId), []);
  });

  it('overlays GetSinavForView dates onto an assigned row that had none', () => {
    const assigned = [
      { id: 1559901, name: 'VİP MÜFREDAT', resultStatus: 'None', examDate: '2026-08-14' }
    ];
    const detailed = [
      { id: 1559901, startDate: '2026-08-10', endDate: '2026-08-20', resultStatus: 'None' }
    ];
    const merged = overlayCatalogExamsWithTakeWindows(assigned, detailed);
    assert.equal(merged[0].endDate, '2026-08-20');
    assert.equal(edesisExamTakeWindowOpen(merged[0], now), false);
  });
});

describe('edesisResultHiddenFromStudent', () => {
  it('hides when isResultHideForStudent is true', () => {
    assert.equal(edesisResultHiddenFromStudent({ isResultHideForStudent: true, examId: 1 }), true);
    assert.equal(edesisResultHiddenFromStudent({ examId: 1, totalNet: 12 }), false);
  });
});

describe('buildEdesisStudentRaporQuery', () => {
  it('omits donemId so current-term exams are not locked to 113', () => {
    const q = buildEdesisStudentRaporQuery({ sid: '7909547', stdIdsKey: 'stdIds' });
    assert.equal(q.includes('donemId='), false);
    assert.match(q, /stdIds=7909547/);
  });

  it('includes donemId when given', () => {
    const q = buildEdesisStudentRaporQuery({ sid: '2086573', donemId: 113, stdIdsKey: 'stdIds' });
    assert.match(q, /donemId=113/);
  });
});
