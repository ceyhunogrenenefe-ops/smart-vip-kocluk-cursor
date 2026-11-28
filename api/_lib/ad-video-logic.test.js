import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptVideoFile,
  buildDigest,
  buildWeeklyReport,
  canComment,
  canOpenModule,
  canSeeFile,
  canSeeRaw,
  commentsForFile,
  decideStoredResult,
  digestHasContent,
  firstArchivedRawByTask,
  formatDigestText,
  istanbulYmd,
  planPreview,
  reuseUploadRow,
  statusAfterEditStored,
  statusAfterRawStored,
  toClientFile,
  weekStartYmd
} from './ad-video-logic.js';

const admin = { sub: 'admin-1', role: 'admin', institution_id: 'kurum' };
const teacher1 = { sub: 't1', role: 'teacher', institution_id: 'kurum' };
const teacher2 = { sub: 't2', role: 'teacher', institution_id: 'kurum' };
const editor = { sub: 'e1', role: 'coach', institution_id: 'kurum' };
const student = { sub: 's1', role: 'student', institution_id: 'kurum' };
const parent = { sub: 'p1', role: 'veli', institution_id: 'kurum' };
const anon = { sub: 'anonymous', role: 'super_admin' };
const editors = new Set(['e1']);

const task = {
  id: 'task-1',
  teacher_user_id: 't1',
  teacher_name: 'Ayşe',
  idea: 'Yaz kampı',
  theme: 'kayıt',
  status: 'planlandi',
  due_at: '2026-11-20T09:00:00+03:00',
  actual_shoot_date: '2026-11-24',
  legacy_drive_url: 'https://drive.google.com/file/d/eski/view'
};

test('öğrenci, veli ve oturumsuz ziyaretçi modüle giremez', () => {
  assert.equal(canOpenModule(student, editors), false);
  assert.equal(canOpenModule(parent, editors), false);
  assert.equal(canOpenModule(anon, editors), false);
  assert.equal(canOpenModule({ sub: '', role: 'teacher' }, editors), false);
  assert.equal(canOpenModule(teacher1, editors), true);
  assert.equal(canOpenModule(admin, editors), true);
  assert.equal(canOpenModule(editor, editors), true);
  assert.equal(canOpenModule({ sub: 'c1', role: 'coach' }, editors), false);
});

test('kabul akışı: ham video, taslak montaj, yorum, ikinci sürüm ve onay', () => {
  const raw = {
    id: 'raw-1',
    task_id: 'task-1',
    kind: 'raw',
    source: 'archive',
    status: 'stored',
    version: 1,
    mime_type: 'video/mp4'
  };
  const draft = {
    id: 'edit-1',
    task_id: 'task-1',
    kind: 'edit',
    source: 'archive',
    status: 'stored',
    version: 1,
    open_for_comments: false,
    mime_type: 'video/mp4'
  };
  const opened = { ...draft, open_for_comments: true };
  const edit2 = {
    id: 'edit-2',
    task_id: 'task-1',
    kind: 'edit',
    source: 'archive',
    status: 'stored',
    version: 2,
    open_for_comments: false,
    mime_type: 'video/mp4',
    is_current_approval: true,
    approved_by: 'admin-1',
    approved_at: '2026-11-28T12:00:00+03:00'
  };

  assert.equal(canSeeRaw(teacher1, task, editors), true);
  assert.equal(canSeeRaw(admin, task, editors), true);
  assert.equal(canSeeRaw(editor, task, editors), true);
  assert.equal(canSeeRaw(teacher2, task, editors), false);
  assert.equal(canSeeFile(teacher2, task, raw, editors), false);
  assert.equal(canSeeFile(teacher2, task, draft, editors), false);
  assert.equal(canComment(teacher2, task, draft, editors), false);

  assert.equal(canSeeFile(teacher2, task, opened, editors), true);
  assert.equal(canComment(teacher2, task, opened, editors), true);
  assert.equal(canSeeFile({ sub: 'c1', role: 'coach' }, task, opened, editors), false);
  assert.equal(canSeeFile(student, task, opened, editors), false);
  assert.equal(canSeeFile({ sub: '', role: 'teacher' }, task, opened, editors), false);

  assert.equal(canSeeFile(admin, task, edit2, editors), true);
  assert.equal(canSeeFile(teacher2, task, edit2, editors), false);
  assert.equal(canSeeFile(teacher1, task, raw, editors), true);

  const comments = [
    { id: 'c1', file_id: 'edit-1', body: 'ilk' },
    { id: 'c2', file_id: 'edit-2', body: 'ikinci' }
  ];
  assert.deepEqual(commentsForFile(comments, 'edit-2').map((c) => c.id), ['c2']);
  assert.deepEqual(commentsForFile(comments, 'edit-1').map((c) => c.body), ['ilk']);
  assert.equal(edit2.approved_by, 'admin-1');
});

test('eski kişisel bağlantı kurum arşivi sayılmaz', () => {
  const legacy = {
    id: 'legacy-task-1',
    task_id: 'task-1',
    kind: 'raw',
    source: 'legacy_link',
    status: 'stored',
    legacy_url: task.legacy_drive_url,
    version: 0
  };
  const view = toClientFile(legacy);
  assert.equal(view.legacy, true);
  assert.equal(view.archive, false);
  assert.equal(view.playable, false);
  assert.equal(canSeeFile(teacher2, task, legacy, editors), false);
  assert.equal(canSeeFile(teacher1, task, legacy, editors), true);
});

test('aynı işin yeniden yüklemesi haftalık teslimi bir kez sayar', () => {
  const now = new Date('2026-11-28T09:00:00+03:00');
  assert.equal(istanbulYmd(now), '2026-11-28');
  assert.equal(weekStartYmd('2026-11-28'), '2026-11-23');
  const tasks = [
    { ...task, id: 'a', actual_shoot_date: '2026-11-24' },
    { ...task, id: 'b', teacher_user_id: 't2', teacher_name: 'Mehmet', actual_shoot_date: '2026-11-27' },
    { ...task, id: 'c', actual_shoot_date: '2026-11-10' }
  ];
  const files = [
    { id: 'a1', task_id: 'a', kind: 'raw', status: 'stored', source: 'archive', uploaded_at: '2026-11-24T10:00:00+03:00', version: 1 },
    { id: 'a2', task_id: 'a', kind: 'raw', status: 'stored', source: 'archive', uploaded_at: '2026-11-28T10:00:00+03:00', version: 2 },
    { id: 'b1', task_id: 'b', kind: 'raw', status: 'stored', source: 'archive', uploaded_at: '2026-11-28T11:00:00+03:00', version: 1 },
    { id: 'c1', task_id: 'c', kind: 'raw', status: 'stored', source: 'archive', uploaded_at: '2026-11-16T11:00:00+03:00', version: 1 },
    { id: 'c2', task_id: 'c', kind: 'raw', status: 'stored', source: 'archive', uploaded_at: '2026-11-28T12:00:00+03:00', version: 2 },
    { id: 'leg', task_id: 'a', kind: 'raw', status: 'stored', source: 'legacy_link', uploaded_at: '2026-11-28T08:00:00+03:00', version: 0 }
  ];
  const first = firstArchivedRawByTask(files);
  assert.equal(first.get('a').id, 'a1');
  const report = buildWeeklyReport({ tasks, files, now });
  assert.equal(report.deliveries, 2);
  assert.equal(report.shoots, 2);
  const ayse = report.teachers.find((row) => row.teacherUserId === 't1');
  assert.equal(ayse.weeklyDeliveries, 1);
  assert.equal(ayse.weeklyShoots, 1);
  assert.equal(ayse.lastShootLabel, '24.11.2026');
});

test('doğrulanmamış Drive kaydı teslim sayılmaz', () => {
  assert.equal(decideStoredResult({ ok: false, error: 'yok' }).stored, false);
  assert.equal(decideStoredResult({ ok: true, file: { id: 'x', size: '0', driveId: 'd' } }, 'd').stored, false);
  assert.equal(decideStoredResult({ ok: true, file: { id: 'x', size: '10', driveId: 'baska' } }, 'd').error, 'yanlis_drive');
  const ok = decideStoredResult({ ok: true, file: { id: 'abc', size: '42', mimeType: 'video/mp4', driveId: 'd' } }, 'd');
  assert.equal(ok.stored, true);
  assert.equal(ok.driveFileId, 'abc');
  assert.equal(reuseUploadRow(null), 'create');
  assert.equal(reuseUploadRow({ status: 'stored', source: 'archive' }), 'already');
  assert.equal(reuseUploadRow({ status: 'failed', source: 'archive' }), 'resume');
  assert.equal(statusAfterRawStored('planlandi'), 'ham_teslim');
  assert.equal(statusAfterRawStored('incelemede'), 'incelemede');
  assert.equal(statusAfterEditStored('ham_teslim'), 'montaj_taslak');
  assert.equal(statusAfterEditStored('incelemede'), 'incelemede');
});

test('mp4 ve mov önizlemesi ayrıdır; kişisel bağlantı alanı yoktur', () => {
  assert.equal(acceptVideoFile({ name: 'telefon.mov', mime: '' }).ok, true);
  assert.equal(acceptVideoFile({ name: 'ders.mp4', mime: 'video/mp4' }).mime, 'video/mp4');
  assert.equal(acceptVideoFile({ name: 'notlar.pdf', mime: 'application/pdf' }).ok, false);
  assert.equal(planPreview({ mime: 'video/mp4', name: 'a.mp4' }).previewStatus, 'not_needed');
  assert.equal(planPreview({ mime: 'video/quicktime', name: 'a.mov' }).previewStatus, 'unavailable');
  assert.equal(planPreview({ mime: 'video/quicktime', name: 'a.mov', ffmpegAvailable: true }).previewStatus, 'pending');
});

test('günlük özet yeni ham, bekleyen montaj ve geciken işi Türkiye saatiyle yazar', () => {
  const now = new Date('2026-11-28T09:00:00+03:00');
  const tasks = [
    { ...task, id: 'a', status: 'ham_teslim', due_at: '2026-11-20T09:00:00+03:00' },
    { ...task, id: 'b', status: 'onaylandi', due_at: '2026-11-01T09:00:00+03:00', teacher_name: 'Mehmet' }
  ];
  const files = [
    {
      id: 'raw-new',
      task_id: 'a',
      kind: 'raw',
      status: 'stored',
      source: 'archive',
      version: 2,
      uploaded_at: '2026-11-28T08:30:00+03:00'
    },
    {
      id: 'raw-old',
      task_id: 'a',
      kind: 'raw',
      status: 'stored',
      source: 'archive',
      version: 1,
      uploaded_at: '2026-11-20T08:30:00+03:00'
    },
    {
      id: 'edit-wait',
      task_id: 'a',
      kind: 'edit',
      status: 'stored',
      source: 'archive',
      version: 1,
      open_for_comments: false,
      is_current_approval: false
    }
  ];
  const digest = buildDigest({ tasks, files, now });
  assert.equal(digest.newRaws.length, 1);
  assert.equal(digest.newRaws[0].reupload, true);
  assert.equal(digest.waitingEdits.length, 1);
  assert.equal(digest.overdue.length, 1);
  assert.equal(digest.overdue[0].taskId, 'a');
  assert.equal(digestHasContent(digest), true);
  const text = formatDigestText(digest);
  assert.match(text, /Yeniden yükleme|yeniden yükleme/);
  assert.match(text, /20\.11\.2026/);
  assert.doesNotMatch(text, /drive\.google\.com/);
});
