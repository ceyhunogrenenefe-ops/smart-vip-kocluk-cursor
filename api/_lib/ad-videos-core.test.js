import { describe, expect, it } from 'vitest';
import {
  computeTeacherStats,
  dailySummaryDue,
  isOverdue,
  normalizeVideoFile,
  parseDriveFileId,
  trDateKey,
  trWeekRange,
  validateDriveLink
} from './ad-videos-core.js';

describe('Türkiye saati ve pazartesi–pazar haftası', () => {
  it('UTC 21:30 ertesi gündür (TR +03:00)', () => {
    expect(trDateKey('2026-11-29T21:30:00Z')).toBe('2026-11-30');
  });
  it('pazar 23:30 TR o haftaya, pazartesi 00:10 TR yeni haftaya düşer', () => {
    expect(trWeekRange(new Date('2026-11-29T20:30:00Z'))).toMatchObject({ startKey: '2026-11-23', endKey: '2026-11-29' });
    expect(trWeekRange(new Date('2026-11-29T21:10:00Z'))).toMatchObject({ startKey: '2026-11-30', endKey: '2026-12-06' });
  });
  it('hafta sınırı sayaçta doğru uygulanır', () => {
    const tasks = [
      { id: 'a', teacher_id: 't', status: 'submitted', first_submitted_at: '2026-11-29T20:59:00Z' }, // pazar 23:59 TR
      { id: 'b', teacher_id: 't', status: 'submitted', first_submitted_at: '2026-11-29T21:00:00Z' } // pazartesi 00:00 TR
    ];
    const s = computeTeacherStats(tasks, { weekKey: '2026-11-25', now: new Date('2026-11-25T10:00:00Z') });
    expect(s.rows[0].week.first_submitted).toBe(1);
  });
});

describe('durum ve dosya kuralları', () => {
  it('Gecikti yalnız ilk teslim yokken', () => {
    const now = new Date('2026-11-27T12:00:00Z');
    expect(isOverdue({ status: 'planned', due_at: '2026-11-27T11:00:00Z' }, now)).toBe(true);
    expect(isOverdue({ status: 'shot', due_at: '2026-11-27T13:00:00Z' }, now)).toBe(false);
    expect(isOverdue({ status: 'revision_requested', due_at: '2026-11-20T00:00:00Z', first_submitted_at: 'x' }, now)).toBe(false);
  });
  it('MP4/MOV kabul, diğerleri ret; boş MIME uzantıdan türetilir', () => {
    expect(normalizeVideoFile({ name: 'IMG_1.MOV', mime: '', size: 10 })).toMatchObject({ ok: true, mimeType: 'video/quicktime' });
    expect(normalizeVideoFile({ name: 'a.mp4', mime: 'video/mp4', size: 10 }).ok).toBe(true);
    expect(normalizeVideoFile({ name: 'a.mkv', mime: 'video/x-matroska', size: 10 }).ok).toBe(false);
  });
  it('Drive dosya bağlantısı ayrıştırılır, klasör bağlantısı reddedilir', () => {
    expect(parseDriveFileId('https://drive.google.com/open?id=1AbCdEfGhIjK')).toBe('1AbCdEfGhIjK');
    expect(validateDriveLink('https://drive.google.com/drive/folders/1AbCdEfGhIjK').ok).toBe(false);
  });
  it('günlük özet varsayılanı iş günleri 18:00', () => {
    expect(dailySummaryDue({}, new Date('2026-11-27T15:00:00Z')).due).toBe(true); // cuma 18:00 TR
    expect(dailySummaryDue({}, new Date('2026-11-27T14:59:00Z')).due).toBe(false);
    expect(dailySummaryDue({}, new Date('2026-11-28T15:30:00Z')).due).toBe(false); // cumartesi
  });
});
