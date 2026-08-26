import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  subjectsMatchCombined,
  teacherRowBlocksNewLesson,
  findBlockingTeacherRow
} from './teacher-time-conflict.js';

describe('teacherRowBlocksNewLesson', () => {
  const fen19 = { start: '19:00:00', end: '19:40:00', subject: 'FEN BİLİMLERİ', ownClassId: 'class-8c' };

  it('allows 8C Fen when 8A already has Fen at the same time (combined class)', () => {
    const blocks = teacherRowBlocksNewLesson(fen19, {
      class_id: 'class-8a',
      subject: 'FEN BİLİMLERİ',
      start_time: '19:00:00',
      end_time: '19:40:00'
    });
    assert.equal(blocks, false);
  });

  it('blocks Fen vs Matematik at the same time for the same teacher', () => {
    const blocks = teacherRowBlocksNewLesson(fen19, {
      class_id: 'class-8a',
      subject: 'MATEMATİK',
      start_time: '19:00:00',
      end_time: '19:40:00'
    });
    assert.equal(blocks, true);
  });

  it('blocks a duplicate in the same class', () => {
    const blocks = teacherRowBlocksNewLesson(fen19, {
      class_id: 'class-8c',
      subject: 'FEN BİLİMLERİ',
      start_time: '19:00:00',
      end_time: '19:40:00'
    });
    assert.equal(blocks, true);
  });

  it('does not treat a later slot as overlap', () => {
    const blocks = teacherRowBlocksNewLesson(fen19, {
      class_id: 'class-8a',
      subject: 'MATEMATİK',
      start_time: '19:50:00',
      end_time: '20:30:00'
    });
    assert.equal(blocks, false);
  });

  it('matches Turkish subject casing', () => {
    assert.equal(subjectsMatchCombined('Fen Bilimleri', 'FEN BİLİMLERİ'), true);
  });

  it('findBlockingTeacherRow skips excluded ids', () => {
    const hit = findBlockingTeacherRow({
      ...fen19,
      rows: [
        {
          id: 'keep',
          class_id: 'class-8c',
          subject: 'FEN BİLİMLERİ',
          start_time: '19:00:00',
          end_time: '19:40:00'
        }
      ],
      excludeIds: ['keep']
    });
    assert.equal(hit, null);
  });
});
