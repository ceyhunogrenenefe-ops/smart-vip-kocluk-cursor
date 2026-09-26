import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSchemaMissingError } from './edesis-exam-assignments.js';

describe('isSchemaMissingError', () => {
  it('tablo/kolon gercekten yoksa true', () => {
    assert.equal(
      isSchemaMissingError({
        code: 'PGRST205',
        message: "Could not find the table 'public.edesis_exam_assignments' in the schema cache"
      }),
      true
    );
    assert.equal(isSchemaMissingError({ code: '42P01', message: 'relation "x" does not exist' }), true);
    assert.equal(isSchemaMissingError({ code: 'PGRST204', message: 'Could not find the column' }), true);
  });

  it('not-null ihlali sema eksikligi degildir (sinif atamasi vakasi)', () => {
    assert.equal(
      isSchemaMissingError({
        code: '23502',
        message:
          'null value in column "student_id" of relation "edesis_exam_assignments" violates not-null constraint'
      }),
      false
    );
  });

  it('foreign key / check / unique ihlalleri sema eksikligi degildir', () => {
    assert.equal(
      isSchemaMissingError({
        code: '23503',
        message:
          'insert or update on table "edesis_exam_assignments" violates foreign key constraint "edesis_exam_assignments_class_id_fkey"'
      }),
      false
    );
    assert.equal(
      isSchemaMissingError({
        code: '23514',
        message: 'new row for relation "edesis_exam_assignments" violates check constraint'
      }),
      false
    );
    assert.equal(
      isSchemaMissingError({ code: '23505', message: 'duplicate key value violates unique constraint' }),
      false
    );
  });

  it('kod yoksa dar mesaj kalibina bakar', () => {
    assert.equal(isSchemaMissingError({ message: 'relation "edesis_exams" does not exist' }), true);
    assert.equal(
      isSchemaMissingError({ message: 'permission denied for relation edesis_exams' }),
      false
    );
  });
});
