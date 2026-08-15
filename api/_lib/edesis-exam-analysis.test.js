/**
 * node --test api/_lib/edesis-exam-analysis.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeExamFamily,
  inferExamFamilyFromClassLevel,
  examHasResult,
  selectComparisonExams,
  classifyTopicPriority,
  buildStudentAnalysisSummary,
  buildSubjectBreakdown,
  buildTopicBreakdown,
  buildAutoEvaluationDraft,
  buildFullStudentAnalysis,
  buildLastVsPrevComparison,
  filterBreakdownByBranch,
  resolveEdesisExamId,
  mergeExamListsPreferRicher,
  payloadToExam
} from './edesis-exam-analysis.js';

function exam(partial) {
  return {
    id: 'e1',
    examType: 'TYT',
    examTitle: 'TYT Deneme 1',
    examDate: '2026-08-01',
    totalNet: 40,
    correct: 50,
    wrong: 10,
    blank: 5,
    subjects: [],
    ...partial
  };
}

describe('normalizeExamFamily', () => {
  it('keeps TYT, AYT and LGS apart', () => {
    assert.equal(normalizeExamFamily({ examType: 'TYT' }), 'tyt');
    assert.equal(normalizeExamFamily({ examType: 'AYT' }), 'ayt');
    assert.equal(normalizeExamFamily({ examType: 'LGS', examTitle: 'LGS Sözel' }), 'lgs');
  });
});

describe('inferExamFamilyFromClassLevel', () => {
  it('defaults LGS students to lgs, not tyt', () => {
    assert.equal(inferExamFamilyFromClassLevel('LGS'), 'lgs');
    assert.equal(inferExamFamilyFromClassLevel(8), 'lgs');
    assert.equal(inferExamFamilyFromClassLevel('TYT-Maarif'), 'tyt');
    assert.equal(inferExamFamilyFromClassLevel('YKS-Sayısal'), 'yks-say');
    assert.equal(inferExamFamilyFromClassLevel(5), 'okul');
  });
});

describe('filterBreakdownByBranch', () => {
  it('keeps only the teacher branch', () => {
    const rows = filterBreakdownByBranch(
      [{ name: 'Matematik' }, { name: 'Türkçe' }],
      'Matematik'
    );
    assert.deepEqual(rows.map((r) => r.name), ['Matematik']);
  });
});

describe('resolveEdesisExamId + payloadToExam', () => {
  it('reads exam number from id, examId and notes when edesisExamId is missing', () => {
    assert.equal(resolveEdesisExamId({ id: 'edesis-1264223-abc' }), '1264223');
    assert.equal(resolveEdesisExamId({ examId: 1264223 }), '1264223');
    assert.equal(resolveEdesisExamId({ notes: 'Edesis v1 exam #99001' }), '99001');
    const mapped = payloadToExam({
      id: 'edesis-555-student',
      student_id: 's1',
      app_payload: {
        id: 'edesis-555-student',
        studentId: 's1',
        examId: 555,
        subjects: { 0: { name: 'Türkçe', correct: 1, wrong: 0, blank: 0 } }
      }
    });
    assert.equal(mapped.edesisExamId, '555');
    assert.equal(Array.isArray(mapped.subjects), true);
  });
});

describe('examHasResult', () => {
  it('does not treat absent exams as zero net', () => {
    assert.equal(examHasResult({ attended: false, totalNet: 0 }), false);
    assert.equal(examHasResult({ katilim: 'katilmadi' }), false);
    assert.equal(examHasResult(exam({})), true);
  });
});

describe('selectComparisonExams', () => {
  const exams = [
    exam({ id: 't1', examType: 'TYT', examDate: '2026-08-10', totalNet: 50 }),
    exam({ id: 't2', examType: 'TYT', examDate: '2026-08-03', totalNet: 40 }),
    exam({ id: 't3', examType: 'TYT', examDate: '2026-07-20', totalNet: 30 }),
    exam({ id: 'a1', examType: 'AYT', examDate: '2026-08-11', totalNet: 20 }),
    exam({ id: 'l1', examType: 'LGS', examDate: '2026-08-12', totalNet: 70 }),
    exam({ id: 'x1', examType: 'TYT', examDate: '2026-08-09', attended: false })
  ];

  it('sorts by examDate and takes last 5 of the same type', () => {
    const sel = selectComparisonExams(exams, { family: 'tyt', window: 'last5' });
    assert.deepEqual(
      sel.compared.map((e) => e.id),
      ['t1', 't2', 't3']
    );
    assert.equal(sel.absent.some((e) => e.id === 'x1'), true);
    assert.equal(sel.compared.some((e) => e.examType === 'AYT'), false);
  });
});

describe('classifyTopicPriority', () => {
  it('uses default bands', () => {
    assert.equal(classifyTopicPriority(10).level, 'kritik');
    assert.equal(classifyTopicPriority(50).level, 'gelistirilmeli');
    assert.equal(classifyTopicPriority(70).level, 'orta');
    assert.equal(classifyTopicPriority(80).level, 'iyi');
    assert.equal(classifyTopicPriority(95).level, 'cok_iyi');
  });
});

describe('buildStudentAnalysisSummary', () => {
  it('computes last vs previous net without mixing types', () => {
    const exams = [
      exam({ id: '1', examDate: '2026-08-10', totalNet: 55, examType: 'TYT' }),
      exam({ id: '2', examDate: '2026-08-01', totalNet: 45, examType: 'TYT' }),
      exam({ id: '3', examDate: '2026-08-11', totalNet: 10, examType: 'LGS' })
    ];
    const s = buildStudentAnalysisSummary(exams, { family: 'tyt', window: 'last5' });
    assert.equal(s.examCount, 2);
    assert.equal(s.lastNet, 55);
    assert.equal(s.netChange, 10);
    assert.equal(s.last5Avg, 50);
  });
});

describe('buildSubjectBreakdown + draft', () => {
  it('does not invent numbers when data is missing', () => {
    const exams = [
      exam({
        subjects: [
          { name: 'Türkçe', net: 12, correct: 20, wrong: 5, blank: 2, topics: [{ name: 'Sözcükte anlam', correct: 1, wrong: 4, blank: 1 }] }
        ]
      })
    ];
    const subjects = buildSubjectBreakdown(exams);
    assert.equal(subjects[0].name, 'Türkçe');
    assert.equal(subjects[0].wrong, 5);
    const topics = buildTopicBreakdown(exams);
    assert.equal(topics[0].priority, 'kritik');
    const draft = buildAutoEvaluationDraft({
      summary: buildStudentAnalysisSummary(exams, { family: 'tyt' }),
      subjects,
      topics,
      studentName: 'Ayşe'
    });
    assert.match(draft.genel, /Ayşe/);
    assert.equal(draft.koc, '');
    assert.doesNotMatch(draft.kritikKonular, /uydur|örnek net/i);
  });
});

describe('mergeExamListsPreferRicher', () => {
  it('keeps live YÖS result that is missing from local exam_results', () => {
    const local = [
      exam({ id: 'edesis-1-s1', edesisExamId: '1', examType: 'TYT', examDate: '2026-08-01', totalNet: 40 })
    ];
    const live = [
      exam({
        id: 'edesis-1102253-s1',
        edesisExamId: '1102253',
        examType: 'YÖS',
        examTitle: 'YÖS SARMAL DENEME-12',
        examDate: '2026-08-10',
        totalNet: 42.5
      })
    ];
    const merged = mergeExamListsPreferRicher(local, live);
    assert.equal(merged.length, 2);
    assert.ok(merged.some((e) => String(e.edesisExamId) === '1102253'));
    const full = buildFullStudentAnalysis(merged, { family: 'all', window: 'last10' });
    assert.ok(full.table.some((r) => String(r.edesisExamId) === '1102253'));
    assert.ok(full.charts.netLine.some((p) => p.net === 42.5));
  });

  it('pins recently submitted old-dated exam into last10 window', () => {
    const olderMany = Array.from({ length: 10 }, (_, i) =>
      exam({
        id: `old-${i}`,
        edesisExamId: String(100 + i),
        examType: 'TYT',
        examDate: `2026-08-${String(14 - i).padStart(2, '0')}`,
        totalNet: 30 + i
      })
    );
    const justTaken = exam({
      id: 'edesis-999-s1',
      edesisExamId: '999',
      examType: 'YÖS',
      examTitle: 'YÖS Eski Katalog',
      examDate: '2026-01-05',
      totalNet: 55,
      createdAt: new Date().toISOString()
    });
    const sel = selectComparisonExams([...olderMany, justTaken], { family: 'all', window: 'last10' });
    assert.ok(sel.compared.some((e) => String(e.edesisExamId) === '999'));
  });
});

describe('buildFullStudentAnalysis', () => {
  it('chart nets match table nets', () => {
    const exams = [
      exam({ id: '1', examDate: '2026-08-10', totalNet: 41, correct: 40, wrong: 10, blank: 5 }),
      exam({ id: '2', examDate: '2026-08-01', totalNet: 33, correct: 30, wrong: 15, blank: 10 })
    ];
    const full = buildFullStudentAnalysis(exams, { family: 'tyt', window: 'last5' });
    assert.equal(full.summary.lastNet, 41);
    assert.equal(full.charts.netLine[1].net, 41);
    assert.equal(full.table[0].totalNet, 41);
    const vs = buildLastVsPrevComparison(exams);
    assert.equal(vs.last5Count, 2);
    assert.equal(vs.prev5Count, 0);
  });
});
