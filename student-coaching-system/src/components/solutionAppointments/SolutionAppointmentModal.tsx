import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2, Upload, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  createSolutionAppointment,
  fetchSolutionLesson,
  fileToBase64,
  patchSolutionAppointment
} from '../../lib/solutionAppointments/api';
import type { SolutionLessonPayload, SolutionSlot } from '../../lib/solutionAppointments/utils';
import { slotRangeLabel } from '../../lib/solutionAppointments/utils';

type SessionInfo = {
  id: string;
  subject: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  teacher_id: string;
  teacher_name?: string;
};

export type SolutionAppointmentModalProps = {
  open: boolean;
  onClose: () => void;
  session: SessionInfo;
  teacherName: string;
  studentDefaults?: { name?: string; class_level?: string };
  onSuccess?: () => void;
};

const QUESTION_OPTIONS = ['1', '2', '3', '4', '5+'] as const;
const ACCEPT = 'image/jpeg,image/png,application/pdf';

export function SolutionAppointmentModal({
  open,
  onClose,
  session,
  teacherName,
  studentDefaults,
  onSuccess
}: SolutionAppointmentModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<SolutionLessonPayload | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<SolutionSlot | null>(null);
  const [step, setStep] = useState<'slot' | 'form'>('slot');
  const [questionCount, setQuestionCount] = useState<string>('1');
  const [studentName, setStudentName] = useState(studentDefaults?.name || '');
  const [studentClass, setStudentClass] = useState(studentDefaults?.class_level || '');
  const [studentNote, setStudentNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSolutionLesson(session.id);
      setPayload(data);
      if (data.my_appointment) {
        setStep('form');
        setQuestionCount(data.my_appointment.question_count || '1');
        setStudentNote(data.my_appointment.note?.student_note || '');
        setSelectedSlot({
          slot_start: data.my_appointment.slot_start,
          slot_end: data.my_appointment.slot_end,
          available: true
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    if (!open) return;
    setStep('slot');
    setSelectedSlot(null);
    setSuccess('');
    setStudentName(studentDefaults?.name || '');
    setStudentClass(studentDefaults?.class_level || '');
    setQuestionCount('1');
    setStudentNote('');
    setFiles([]);
    void load();
  }, [open, load, studentDefaults?.name, studentDefaults?.class_level]);

  const bookingClosed = payload?.booking_deadline_passed === true;
  const myAp = payload?.my_appointment;

  const dateLabel = useMemo(() => {
    const d = session.lesson_date;
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}.${m}.${y}`;
  }, [session.lesson_date]);

  const timeLabel = `${String(session.start_time).slice(0, 5)}–${String(session.end_time).slice(0, 5)}`;

  const onPickSlot = (slot: SolutionSlot) => {
    if (!slot.available) return;
    setSelectedSlot(slot);
    setStep('form');
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    const valid = list.filter((f) =>
      ['image/jpeg', 'image/png', 'application/pdf'].includes(f.type)
    );
    setFiles((prev) => [...prev, ...valid]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const slotChanged =
    Boolean(
      myAp &&
        selectedSlot &&
        (normalizeTime(selectedSlot.slot_start) !== normalizeTime(myAp.slot_start) ||
          normalizeTime(selectedSlot.slot_end) !== normalizeTime(myAp.slot_end))
    );

  const submit = async () => {
    if (loading) return;

    if (myAp && !slotChanged && step === 'form' && !selectedSlot) {
      if (!myAp.can_upload && files.length > 0) {
        setError('Dosya yükleme süresi doldu.');
        return;
      }
      setSaving(true);
      setError('');
      try {
        const encoded = await Promise.all(files.map(fileToBase64));
        await patchSolutionAppointment(myAp.id, {
          student_note: studentNote,
          files: encoded
        });
        setSuccess('Güncellendi.');
        await load();
        onSuccess?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    const slot = selectedSlot || (myAp ? { slot_start: myAp.slot_start, slot_end: myAp.slot_end } : null);
    if (!slot) {
      setError('Lütfen bir zaman dilimi seçin.');
      return;
    }
    if (!studentName.trim()) {
      setError('Ad soyad gerekli.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const encoded = await Promise.all(files.map(fileToBase64));
      const res = await createSolutionAppointment({
        lesson_id: session.id,
        slot_start: slot.slot_start,
        slot_end: slot.slot_end,
        question_count: questionCount,
        student_name: studentName.trim(),
        student_class_level: studentClass.trim(),
        student_note: studentNote.trim() || undefined,
        files: encoded
      });
      setSuccess(
        String(
          (res as { message?: string }).message ||
            'Randevunuz oluşturuldu. Sorularınızı bu pencereden yükleyin; ders saatinde karttaki «Derse Katıl» ile canlı derse girin.'
        )
      );
      await load();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    } finally {
      setSaving(false);
    }
  };

  function normalizeTime(t: string) {
    const parts = String(t || '').split(':');
    const h = String(Number(parts[0]) || 0).padStart(2, '0');
    const m = String(Number(parts[1]) || 0).padStart(2, '0');
    return `${h}:${m}:00`;
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="solution-appt-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 id="solution-appt-title" className="text-base font-bold text-slate-900">
              {myAp ? '✅ Randevum' : '📅 Randevu Al'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{session.subject}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-4">
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-[11px] leading-relaxed text-violet-950">
            <p className="font-semibold">Nasıl çalışır?</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>Randevu saati seçin</li>
              <li>Soru fotoğrafı veya PDF yükleyin</li>
              <li>Randevu saatinden 10 dk önce ders kartındaki «Derse Katıl» ile canlı derse girin</li>
            </ol>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-50 px-2.5 py-2">
              <dt className="text-slate-500">Öğretmen</dt>
              <dd className="font-semibold text-slate-800">{teacherName}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-2.5 py-2">
              <dt className="text-slate-500">Tarih</dt>
              <dd className="font-semibold text-slate-800">{dateLabel}</dd>
            </div>
            <div className="col-span-2 rounded-lg bg-slate-50 px-2.5 py-2">
              <dt className="text-slate-500">Ders saati</dt>
              <dd className="font-semibold text-slate-800">{timeLabel}</dd>
            </div>
          </dl>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Yükleniyor…
            </div>
          ) : null}

          {!loading && bookingClosed && !myAp ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              Bu ders için randevu süresi dolmuştur (ders başlangıcından 60 dk önce kapanır).
            </div>
          ) : null}

          {!loading && step === 'slot' && !bookingClosed && (!myAp || payload?.booking_open) ? (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Müsait zaman dilimleri</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(payload?.slots || []).map((slot) => {
                  const selected =
                    selectedSlot &&
                    selectedSlot.slot_start === slot.slot_start &&
                    selectedSlot.slot_end === slot.slot_end;
                  return (
                    <button
                      key={`${slot.slot_start}-${slot.slot_end}`}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => onPickSlot(slot)}
                      className={cn(
                        'rounded-lg border px-2 py-2 text-xs font-semibold tabular-nums transition-colors touch-manipulation',
                        slot.available
                          ? selected
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                          : 'cursor-not-allowed border-red-200 bg-red-50 text-red-700'
                      )}
                    >
                      {slotRangeLabel(slot.slot_start, slot.slot_end)}
                    </button>
                  );
                })}
              </div>
              {selectedSlot ? (
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="mt-3 w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white"
                >
                  Devam et
                </button>
              ) : null}
            </div>
          ) : null}

          {!loading && (step === 'form' || myAp) ? (
            <div className="space-y-3">
              {myAp ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  <p>
                    <span className="font-semibold">Saat:</span> {slotRangeLabel(myAp.slot_start, myAp.slot_end)}
                  </p>
                  <p>
                    <span className="font-semibold">Durum:</span> {myAp.status_label || myAp.status}
                  </p>
                  {payload?.booking_open ? (
                    <button
                      type="button"
                      onClick={() => setStep('slot')}
                      className="mt-2 text-[11px] font-semibold text-indigo-700 underline"
                    >
                      Slotu değiştir
                    </button>
                  ) : null}
                </div>
              ) : selectedSlot ? (
                <p className="text-xs text-slate-600">
                  Seçilen slot:{' '}
                  <span className="font-semibold text-blue-700">
                    {slotRangeLabel(selectedSlot.slot_start, selectedSlot.slot_end)}
                  </span>
                </p>
              ) : null}

              <label className="block text-xs font-medium text-slate-700">
                Ad Soyad
                <input
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  disabled={Boolean(myAp)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Sınıf
                <input
                  value={studentClass}
                  onChange={(e) => setStudentClass(e.target.value)}
                  disabled={Boolean(myAp)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                />
              </label>
              <fieldset>
                <legend className="text-xs font-medium text-slate-700">Kaç soru soracaksınız?</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {QUESTION_OPTIONS.map((n) => (
                    <label
                      key={n}
                      className={cn(
                        'cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold',
                        questionCount === n
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700',
                        myAp ? 'pointer-events-none opacity-70' : ''
                      )}
                    >
                      <input
                        type="radio"
                        name="qcount"
                        value={n}
                        checked={questionCount === n}
                        disabled={Boolean(myAp)}
                        onChange={() => setQuestionCount(n)}
                        className="sr-only"
                      />
                      {n}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <p className="text-xs font-medium text-slate-700">Dosya yükleme (JPG, PNG, PDF)</p>
                {myAp && !myAp.can_upload ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Randevu saatinden 30 dakika öncesine kadar yükleme yapılabilir. Artık yalnızca görüntüleyebilirsiniz.
                  </p>
                ) : null}
                {(myAp?.can_upload !== false || !myAp) && (
                  <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-600 hover:bg-slate-100">
                    <Upload className="h-4 w-4" />
                    Dosya seç
                    <input type="file" accept={ACCEPT} multiple className="sr-only" onChange={onFileChange} />
                  </label>
                )}
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between text-xs text-slate-700">
                      <span className="truncate">{f.name}</span>
                      <button type="button" onClick={() => removeFile(i)} className="text-red-600">
                        Kaldır
                      </button>
                    </li>
                  ))}
                  {(myAp?.files || []).map((f) => (
                    <li key={f.id}>
                      <a
                        href={f.file_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 underline"
                      >
                        {f.original_name || 'Dosya'}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <label className="block text-xs font-medium text-slate-700">
                Açıklama (isteğe bağlı)
                <textarea
                  value={studentNote}
                  onChange={(e) => setStudentNote(e.target.value)}
                  disabled={Boolean(myAp && !myAp.can_upload)}
                  rows={3}
                  placeholder="3. soruda integral kısmını anlamadım."
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                />
              </label>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm font-medium text-emerald-700">{success}</p> : null}
        </div>

        <div className="border-t border-slate-100 px-4 py-3 flex gap-2">
          {!myAp && step === 'form' && !bookingClosed ? (
            <button
              type="button"
              onClick={() => setStep('slot')}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
            >
              Geri
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          >
            Kapat
          </button>
          {(step === 'form' || myAp) && (!bookingClosed || myAp) ? (
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void submit()}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
              {myAp && !slotChanged ? 'Güncelle' : slotChanged ? 'Slotu Güncelle' : 'Randevuyu Oluştur'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
