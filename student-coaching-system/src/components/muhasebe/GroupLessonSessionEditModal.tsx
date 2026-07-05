import React, { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
  AppModalForm,
  AppModalHeader
} from '../ui/AppModal';
import { apiFetch } from '../../lib/session';
import type { GroupLessonSummarySession } from '../liveLessons/GroupLessonPaymentSummary';

type TeacherOption = { id: string; name: string };

type Props = {
  session: GroupLessonSummarySession | null;
  teacherOptions: TeacherOption[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
};

export function GroupLessonSessionEditModal({ session, teacherOptions, onClose, onSaved, onError }: Props) {
  const [subject, setSubject] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [status, setStatus] = useState('completed');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    setSubject(session.subject || '');
    setLessonDate(session.lesson_date || '');
    setStartTime(String(session.start_time || '').slice(0, 5));
    setEndTime(String(session.end_time || '').slice(0, 5));
    setTeacherId(session.teacher_id || '');
    setStatus('completed');
  }, [session]);

  const save = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/class-live-lessons', {
        method: 'PATCH',
        body: JSON.stringify({
          id: session.id,
          subject: subject.trim(),
          lesson_date: lessonDate,
          start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
          end_time: endTime.length === 5 ? `${endTime}:00` : endTime,
          teacher_id: teacherId.trim() || undefined,
          status
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(String(j.error || 'Oturum güncellenemedi'));
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal open={Boolean(session)} onClose={onClose} panelClassName="max-w-lg">
      <AppModalHeader>
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Pencil className="h-5 w-5 text-indigo-600" />
          Oturum düzenle (muhasebe)
        </h3>
        <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
          Kapat
        </button>
      </AppModalHeader>
      <AppModalBody className="space-y-4">
        <label className="block text-sm">
          <span className="text-slate-600">Konu</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Tarih</span>
          <input
            type="date"
            value={lessonDate}
            onChange={(e) => setLessonDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600">Başlangıç</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Bitiş</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Öğretmen</span>
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          >
            {teacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Durum</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          >
            <option value="completed">Tamamlandı</option>
            <option value="scheduled">Planlı</option>
            <option value="cancelled">İptal</option>
          </select>
        </label>
      </AppModalBody>
      <AppModalFooter>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <button type="button" className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </AppModalFooter>
    </AppModal>
  );
}
