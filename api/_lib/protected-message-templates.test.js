import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTECTED_META_TEMPLATE_NAMES,
  PROTECTED_TEMPLATE_TYPES,
  isProtectedMetaTemplateName,
  isProtectedTemplateType,
  protectedTemplateMessage
} from './protected-message-templates.js';

test('devamsızlık şablonu korunuyor — 9 Ekim olayının tekrarı engellenir', () => {
  assert.ok(isProtectedTemplateType('class_absent_notice_1'));
  assert.ok(isProtectedMetaTemplateName('class_absent_notice_1'));
});

test('bütün yoklama şablonları korunuyor', () => {
  for (const t of [
    'class_camera_off_notice',
    'attendance_status_update',
    'coach_lesson_attendance_summary',
    'attendance_coach_late_update'
  ]) {
    assert.ok(isProtectedTemplateType(t), t);
  }
});

test('ders ve rapor hatırlatmaları da korunuyor', () => {
  for (const t of [
    'class_lesson_reminder',
    'lesson_reminder',
    'lesson_reminder_parent',
    'teacher_lesson_reminder',
    'report_reminder',
    'meeting_notification',
    'class_homework_notice'
  ]) {
    assert.ok(isProtectedTemplateType(t), t);
  }
});

test('tohumdaki farklı Meta adı da korunuyor', () => {
  // coach_lesson_attendance_summary Meta'da coach_attendance_report adıyla duruyor
  assert.ok(isProtectedMetaTemplateName('coach_attendance_report'));
});

test('kullanıcının kendi şablonu silinebilir', () => {
  assert.ok(!isProtectedTemplateType('kampanya_duyuru'));
  assert.ok(!isProtectedMetaTemplateName('kampanya_duyuru'));
  assert.ok(!isProtectedTemplateType(''));
  assert.ok(!isProtectedTemplateType(null));
  assert.ok(!isProtectedMetaTemplateName(undefined));
});

test('büyük/küçük harf ve boşluk farkı korumayı delmez', () => {
  assert.ok(isProtectedTemplateType('  CLASS_ABSENT_NOTICE_1  '));
  assert.ok(isProtectedMetaTemplateName('Class_Absent_Notice_1'));
});

test('liste tanımlardan türetiliyor, elle yazılmıyor', () => {
  // Yeni otomasyon eklendiğinde burasının kendiliğinden kapsaması beklenir
  assert.ok(PROTECTED_TEMPLATE_TYPES.size >= 18);
  assert.ok(PROTECTED_META_TEMPLATE_NAMES.size >= PROTECTED_TEMPLATE_TYPES.size);
});

test('hata metni ne yapılacağını söylüyor', () => {
  const m = protectedTemplateMessage('Yoklama — katılmayan öğrenci (veli)');
  assert.match(m, /silinemez/);
  assert.match(m, /pasife/);
  assert.match(m, /Yoklama/);
  // Etiket verilmese de anlamlı kalmalı
  assert.match(protectedTemplateMessage(''), /sistem şablonu/);
});
