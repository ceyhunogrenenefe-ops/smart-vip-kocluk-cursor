import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { toast } from 'sonner';
import type { EduClass, EduLessonRow, LessonRowFormValues, SubjectColor } from '../../types/eduPanel.types';
import { SUBJECT_COLORS } from '../../lib/eduPanel/eduPanelApi';

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  row: EduLessonRow;
  classes: EduClass[];
  busy?: boolean;
  onClose: () => void;
  onSave: (values: Partial<LessonRowFormValues>) => Promise<void>;
};

export default function TeacherEduTopicEditModal({
  open,
  row,
  classes,
  busy,
  onClose,
  onSave
}: Props) {
  const [title, setTitle] = useState(row.title);
  const [subjectName, setSubjectName] = useState(row.subject_name);
  const [subjectColor, setSubjectColor] = useState<SubjectColor>(row.subject_color);
  const [lessonDate, setLessonDate] = useState(row.lesson_date);
  const [availableFrom, setAvailableFrom] = useState(
    row.available_from || row.lesson_date
  );
  const [availableUntil, setAvailableUntil] = useState(
    row.available_until || addDays(row.lesson_date, 6)
  );
  const [notes, setNotes] = useState(row.notes || '');
  const [classIds, setClassIds] = useState<string[]>(
    row.class_ids?.length ? row.class_ids : [row.class_id]
  );

  useEffect(() => {
    if (!open) return;
    setTitle(row.title);
    setSubjectName(row.subject_name);
    setSubjectColor(row.subject_color);
    setLessonDate(row.lesson_date);
    setAvailableFrom(row.available_from || row.lesson_date);
    setAvailableUntil(row.available_until || addDays(row.lesson_date, 6));
    setNotes(row.notes || '');
    setClassIds(row.class_ids?.length ? row.class_ids : [row.class_id]);
  }, [open, row]);

  if (!open) return null;

  const toggleClass = (id: string, checked: boolean) => {
    const cid = String(id);
    setClassIds((prev) => {
      const next = checked
        ? [...new Set([...prev.map(String), cid])]
        : prev.map(String).filter((c) => c !== cid);
      return next;
    });
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Konu başlığı zorunlu');
      return;
    }
    if (!classIds.length) {
      toast.error('En az bir sınıf seçin');
      return;
    }
    void onSave({
      title: title.trim(),
      subject_name: subjectName.trim(),
      subject_color: subjectColor,
      lesson_date: lessonDate,
      available_from: availableFrom,
      available_until: availableUntil,
      notes: notes.trim(),
      class_ids: classIds,
      class_id: classIds[0]
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800">Konuyu düzenle</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600">Konu başlığı</span>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Ders</span>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Renk</span>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={subjectColor}
              onChange={(e) => setSubjectColor(e.target.value as SubjectColor)}
            >
              {SUBJECT_COLORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-600">Başlangıç</span>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Bitiş (son gün)</span>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={availableUntil}
                onChange={(e) => setAvailableUntil(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-slate-600">Ders tarihi (etiket)</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={lessonDate}
              onChange={(e) => setLessonDate(e.target.value)}
            />
          </label>
          <div>
            <span className="text-sm text-slate-600">Sınıflar</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {classes.map((c) => {
                const checked = classIds.some((id) => String(id) === String(c.id));
                return (
                  <label
                    key={c.id}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                      checked ? 'border-violet-400 bg-violet-50' : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleClass(String(c.id), e.target.checked)}
                    />
                    {c.name}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="block text-sm">
            <span className="text-slate-600">Not</span>
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[60px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-2 border-t bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border py-2.5 text-sm font-medium text-slate-700"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={busy || !title.trim() || !classIds.length}
            onClick={handleSave}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
