import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { userHasAnyRole } from '../../config/rolePermissions';
import { useTeacherOptions } from '../../lib/useTeacherOptions';
import {
  PRIVATE_LIVE_SQL_HINT,
  formatPrivateLiveError,
  privateLiveApi,
  type LessonSessionMeta
} from '../../lib/privateLiveApi';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
  AppModalHeader
} from '../../components/ui/AppModal';

type HistoryRow = {
  id: string;
  title?: string;
  date?: string;
  lesson_date?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  teacher_id?: string;
  student_id?: string;
  recording_link?: string | null;
  meta?: LessonSessionMeta | null;
  files?: Array<{ id: string; title: string; url: string; file_type?: string }>;
};

const ATT_LABEL: Record<string, string> = {
  present: 'Katıldı',
  absent: 'Katılmadı',
  late: 'Geç geldi',
  cancelled: 'İptal',
  makeup: 'Telafi'
};

export default function PrivateLiveHistoryPage() {
  const { students } = useApp();
  const { teachers } = useTeacherOptions();
  const { effectiveUser } = useAuth();
  const canEditMeta = userHasAnyRole(effectiveUser, ['super_admin', 'admin', 'coach', 'teacher']);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sqlMissing, setSqlMissing] = useState(false);
  const [edit, setEdit] = useState<HistoryRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    attendance_status: '',
    topic: '',
    gains: '',
    gaps: '',
    homework: '',
    next_plan: '',
    notes: '',
    file_title: '',
    file_url: '',
    file_type: 'link'
  });

  const reload = async () => {
    setLoading(true);
    try {
      const result = await privateLiveApi().history();
      setRows(result.rows as HistoryRow[]);
      setSqlMissing(result.sqlMissing);
      setError(result.sqlMissing ? PRIVATE_LIVE_SQL_HINT : '');
    } catch (e) {
      setRows([]);
      setSqlMissing(false);
      setError(formatPrivateLiveError(e instanceof Error ? e.message : 'Yüklenemedi'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const openEdit = (row: HistoryRow) => {
    setEdit(row);
    setForm({
      attendance_status: row.meta?.attendance_status || '',
      topic: row.meta?.topic || '',
      gains: row.meta?.gains || '',
      gaps: row.meta?.gaps || '',
      homework: row.meta?.homework || '',
      next_plan: row.meta?.next_plan || '',
      notes: row.meta?.notes || '',
      file_title: '',
      file_url: '',
      file_type: 'link'
    });
  };

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      await privateLiveApi().saveLessonMeta({
        lesson_id: edit.id,
        attendance_status: (form.attendance_status || null) as LessonSessionMeta['attendance_status'],
        topic: form.topic,
        gains: form.gains,
        gaps: form.gaps,
        homework: form.homework,
        next_plan: form.next_plan,
        notes: form.notes
      });
      if (form.file_title.trim() && form.file_url.trim()) {
        await privateLiveApi().addFile({
          lesson_id: edit.id,
          title: form.file_title.trim(),
          url: form.file_url.trim(),
          file_type: form.file_type
        });
      }
      setEdit(null);
      await reload();
    } catch (e) {
      setError(formatPrivateLiveError(e instanceof Error ? e.message : 'Kayıt başarısız'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div
          className={`whitespace-pre-line rounded-lg border px-3 py-2 text-sm ${
            sqlMissing
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Henüz ders geçmişi yok.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const date = r.date || r.lesson_date;
            return (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{r.title || 'Özel ders'}</h3>
                    <p className="text-xs text-slate-500">
                      {date} · {String(r.start_time || '').slice(0, 5)}–
                      {String(r.end_time || '').slice(0, 5)} ·{' '}
                      {students.find((s) => s.id === r.student_id)?.name || r.student_id} ·{' '}
                      {teachers.find((t) => t.id === r.teacher_id)?.name || r.teacher_id}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Durum: {r.status}
                      {r.meta?.attendance_status
                        ? ` · Yoklama: ${ATT_LABEL[r.meta.attendance_status] || r.meta.attendance_status}`
                        : ''}
                    </p>
                    {r.meta?.topic ? (
                      <p className="mt-2 text-sm text-slate-700">
                        <span className="font-medium">Konu:</span> {r.meta.topic}
                      </p>
                    ) : null}
                    {r.meta?.homework ? (
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">Ödev:</span> {r.meta.homework}
                      </p>
                    ) : null}
                    {(r.files || []).length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {r.files!.map((f) => (
                          <li key={f.id}>
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-indigo-600 hover:underline"
                            >
                              {f.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.recording_link ? (
                      <a
                        href={r.recording_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Kaydı izle
                      </a>
                    ) : null}
                    {canEditMeta && !sqlMissing ? (
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"
                      >
                        Yoklama / Not
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {edit ? (
        <AppModal open onClose={() => setEdit(null)} panelClassName="max-w-lg">
          <AppModalHeader>
            <h3 className="font-semibold">Yoklama ve ders notu</h3>
          </AppModalHeader>
          <AppModalBody className="max-h-[60dvh] space-y-3 overflow-y-auto">
            <label className="block text-xs font-medium text-slate-600">
              Yoklama
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.attendance_status}
                onChange={(e) => setForm((f) => ({ ...f, attendance_status: e.target.value }))}
              >
                <option value="">Seçin</option>
                <option value="present">Katıldı</option>
                <option value="late">Geç geldi</option>
                <option value="absent">Katılmadı</option>
                <option value="cancelled">İptal</option>
                <option value="makeup">Telafi</option>
              </select>
            </label>
            {(
              [
                ['topic', 'Konu'],
                ['gains', 'Kazanımlar'],
                ['gaps', 'Eksikler'],
                ['homework', 'Ödev'],
                ['next_plan', 'Bir sonraki ders planı'],
                ['notes', 'Notlar']
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-xs font-medium text-slate-600">
                {label}
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  rows={2}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
            <div className="rounded-lg border border-dashed border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">Dosya / link ekle</p>
              <input
                placeholder="Başlık"
                className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.file_title}
                onChange={(e) => setForm((f) => ({ ...f, file_title: e.target.value }))}
              />
              <input
                placeholder="URL (PDF, YouTube, sunum…)"
                className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.file_url}
                onChange={(e) => setForm((f) => ({ ...f, file_url: e.target.value }))}
              />
              <select
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.file_type}
                onChange={(e) => setForm((f) => ({ ...f, file_type: e.target.value }))}
              >
                <option value="pdf">PDF</option>
                <option value="video">Video</option>
                <option value="animation">Animasyon</option>
                <option value="presentation">Sunum</option>
                <option value="youtube">YouTube</option>
                <option value="link">Link</option>
              </select>
            </div>
          </AppModalBody>
          <AppModalFooter className="gap-2">
            <button type="button" className="min-h-[44px] flex-1 rounded-lg border" onClick={() => setEdit(null)}>
              İptal
            </button>
            <button
              type="button"
              disabled={saving}
              className="min-h-[44px] flex-1 rounded-lg bg-amber-600 font-semibold text-white disabled:opacity-50"
              onClick={() => void save()}
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </AppModalFooter>
        </AppModal>
      ) : null}
    </div>
  );
}
