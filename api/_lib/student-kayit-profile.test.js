import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeKayitOntoStudents } from './student-kayit-profile.js';

test('kayıt sözleşmesindeki program, tc ve adres öğrenciye yazılır', () => {
  const rows = [{ id: 's1', platform_user_id: 'u1', tc_identity_no: null, address: null }];
  const contracts = [
    {
      student_id: 's1',
      program_adi: 'Deneme Kulübü',
      adres: 'Kadıköy · İstanbul · Moda sk. 1',
      kayit_formu_json: { tc_kimlik: '10000000146' },
      updated_at: '2026-11-09T10:00:00.000Z'
    }
  ];
  const [row] = mergeKayitOntoStudents(rows, contracts);
  assert.equal(row.enrolled_program, 'Deneme Kulübü');
  assert.equal(row.address, 'Kadıköy · İstanbul · Moda sk. 1');
  assert.equal(row.tc_identity_no, '10000000146');
});

test('öğrencide dolu olan tc kayıtla ezilmez, eski sözleşme yenisini ezmez', () => {
  const rows = [{ id: 's1', user_id: 'u1', tc_identity_no: '10000000146', enrolled_program: 'Yazılıya Hazırlık' }];
  const contracts = [
    {
      ogrenci_user_id: 'u1',
      program_adi: 'Eski',
      adres: 'eski adres',
      updated_at: '2026-11-01T10:00:00.000Z'
    },
    {
      student_id: 's1',
      program_adi: 'Deneme Kulübü',
      adres: 'yeni adres',
      kayit_formu_json: { tc_kimlik: '22222222222' },
      updated_at: '2026-11-09T10:00:00.000Z'
    }
  ];
  const [row] = mergeKayitOntoStudents(rows, contracts);
  assert.equal(row.tc_identity_no, '10000000146');
  assert.equal(row.enrolled_program, 'Yazılıya Hazırlık');
  assert.equal(row.address, 'yeni adres');
});
