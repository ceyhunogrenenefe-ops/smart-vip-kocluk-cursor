import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { userHasAnyRole } from '../../config/rolePermissions';
import { useTeacherOptions } from '../../lib/useTeacherOptions';
import { CLASS_LEVELS, formatClassLevelLabel } from '../../types';
import { topicPool as defaultTopicPool } from '../../data/mockData';
import { formatMaarifSubjectLabel } from '../../data/tytMaarifTopicPool';
import { sortSubjectsWithStudyTracks } from '../../lib/studyTrackSubjects';
import {
  formatPrivateLiveError,
  paymentStatusClass,
  paymentStatusLabel,
  privateLiveApi,
  type PrivateEnrollment,
  type PrivateLessonPackage
} from '../../lib/privateLiveApi';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
  AppModalHeader
} from '../../components/ui/AppModal';

const DURATION_PRESETS = [40, 60, 80] as const;

const emptyForm = {
  student_id: '',
  teacher_id: '',
  coach_id: '',
  package_id: '',
  subject: '',
  class_level: '',
  start_date: '',
  end_date: '',
  weekly_lesson_count: '1',
  credits_total: '8',
  duration_minutes: '60',
  amount_total: '',
  amount_paid: '',
  discount: '',
  payment_status: 'unpaid',
  due_date: '',
  enrollment_notes: '',
  is_unlimited: false
};

export default function PrivateLiveStudentsPage() {
  const { students, coaches, getTopicsByClass } = useApp();
  const { teachers } = useTeacherOptions();
  const { effectiveUser } = useAuth();
  const canEdit = userHasAnyRole(effectiveUser, ['super_admin', 'admin', 'coach']);
  const canPayments = userHasAnyRole(effectiveUser, ['super_admin', 'admin', 'coach']);
  const [rows, setRows] = useState<PrivateEnrollment[]>([]);
  const [packages, setPackages] = useState<PrivateLessonPackage[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previousTeacherId, setPreviousTeacherId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [durationCustom, setDurationCustom] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const subjectOptions = useMemo(() => {
    if (form.class_level) {
      const byClass = getTopicsByClass(form.class_level);
      const keys = [
        ...Object.keys(byClass.regular || {}),
        ...Object.keys(byClass.tytSubjects || {}),
        ...Object.keys(byClass.aytSubjects || {})
      ];
      if (keys.length) return sortSubjectsWithStudyTracks([...new Set(keys)]);
    }
    return sortSubjectsWithStudyTracks(Object.keys(defaultTopicPool));
  }, [form.class_level, getTopicsByClass]);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const [enr, pkgs] = await Promise.all([
        privateLiveApi().enrollments(),
        privateLiveApi()
          .packages()
          .catch(() => ({ data: [] as PrivateLessonPackage[], sqlMissing: true }))
      ]);
      setRows(enr);
      setPackages(pkgs.data);
    } catch (e) {
      setError(formatPrivateLiveError(e instanceof Error ? e.message : 'Yüklenemedi'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const nameOfStudent = (r: PrivateEnrollment) =>
    r.student_name || students.find((s) => s.id === r.student_id)?.name || r.student_id;
  const nameOfTeacher = (r: PrivateEnrollment) =>
    r.teacher_name || teachers.find((t) => t.id === r.teacher_id)?.name || r.teacher_id;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const blob = [
        nameOfStudent(r),
        nameOfTeacher(r),
        r.package_label,
        r.subject,
        r.payment_status,
        r.class_level
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [rows, q, students, teachers]);

  const onPickPackage = (packageId: string) => {
    const pkg = packages.find((p) => p.id === packageId);
    const dur =
      pkg?.duration_minutes != null ? Number(pkg.duration_minutes) : Number(form.duration_minutes || 60);
    setDurationCustom(!DURATION_PRESETS.includes(dur as (typeof DURATION_PRESETS)[number]));
    setForm((f) => ({
      ...f,
      package_id: packageId,
      is_unlimited: Boolean(pkg?.is_unlimited),
      credits_total: pkg?.is_unlimited ? '' : String(pkg?.lesson_count ?? f.credits_total),
      duration_minutes: String(pkg?.duration_minutes ?? f.duration_minutes),
      amount_total: pkg ? String(Number(pkg.price || 0) - Number(pkg.discount || 0)) : f.amount_total,
      discount: pkg ? String(pkg.discount || 0) : f.discount
    }));
  };

  const onPickStudent = (studentId: string) => {
    const st = students.find((s) => s.id === studentId);
    const classVal =
      st?.classLevel != null && st.classLevel !== '' ? String(st.classLevel) : form.class_level;
    setForm((f) => ({
      ...f,
      student_id: studentId,
      class_level: classVal,
      coach_id: f.coach_id || (st?.coachId ? String(st.coachId) : '')
    }));
  };

  const closeModal = () => {
    setOpen(false);
    setEditingId(null);
    setPreviousTeacherId('');
    setForm(emptyForm);
    setDurationCustom(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setPreviousTeacherId('');
    setForm(emptyForm);
    setDurationCustom(false);
    setOpen(true);
  };

  const openEdit = (r: PrivateEnrollment) => {
    const dur = Number(r.duration_minutes || 60);
    setDurationCustom(!DURATION_PRESETS.includes(dur as (typeof DURATION_PRESETS)[number]));
    setEditingId(r.id);
    setPreviousTeacherId(r.teacher_id);
    setForm({
      student_id: r.student_id,
      teacher_id: r.teacher_id,
      coach_id: r.coach_id || '',
      package_id: r.package_id || '',
      subject: r.subject || '',
      class_level: r.class_level || '',
      start_date: r.start_date || '',
      end_date: r.end_date || '',
      weekly_lesson_count: String(r.weekly_lesson_count ?? 1),
      credits_total: r.credits_total == null ? '' : String(r.credits_total),
      duration_minutes: String(r.duration_minutes ?? 60),
      amount_total: r.amount_total != null ? String(r.amount_total) : '',
      amount_paid: r.amount_paid != null ? String(r.amount_paid) : '',
      discount: r.discount != null ? String(r.discount) : '',
      payment_status: r.payment_status || 'unpaid',
      due_date: r.due_date || '',
      enrollment_notes: r.enrollment_notes || '',
      is_unlimited: r.credits_total == null
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.student_id || !form.teacher_id) return;
    setSaving(true);
    try {
      const pkg = packages.find((p) => p.id === form.package_id);
      const payload: Record<string, unknown> = {
        student_id: form.student_id,
        teacher_id: form.teacher_id,
        coach_id: form.coach_id || null,
        package_id: form.package_id || null,
        package_label: pkg?.name || null,
        subject: form.subject || null,
        class_level: form.class_level || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        weekly_lesson_count: form.weekly_lesson_count ? Number(form.weekly_lesson_count) : null,
        credits_total: form.is_unlimited ? null : Number(form.credits_total || 0),
        is_unlimited: form.is_unlimited,
        duration_minutes: Number(form.duration_minutes || 60)
      };
      if (canPayments) {
        payload.amount_total = Number(form.amount_total || 0);
        payload.amount_paid = Number(form.amount_paid || 0);
        payload.discount = Number(form.discount || 0);
        payload.payment_status = form.payment_status;
        payload.due_date = form.due_date || null;
        payload.enrollment_notes = form.enrollment_notes || null;
      }
      if (editingId) {
        await privateLiveApi().patchEnrollment({
          id: editingId,
          ...payload,
          previous_teacher_id: previousTeacherId || undefined
        });
      } else {
        await privateLiveApi().createEnrollment(payload);
      }
      closeModal();
      await reload();
    } catch (e) {
      setError(formatPrivateLiveError(e instanceof Error ? e.message : 'Kayıt başarısız'));
    } finally {
      setSaving(false);
    }
  };

  const removeEnrollment = async (r: PrivateEnrollment) => {
    const label = nameOfStudent(r);
    if (
      !window.confirm(
        `${label} kaydını silmek istediğinize emin misiniz?\n(Özel ders paketi / kota kaldırılır; geçmiş dersler silinmez.)`
      )
    ) {
      return;
    }
    setDeletingId(r.id);
    setError('');
    try {
      await privateLiveApi().deleteEnrollment(r.id);
      await reload();
    } catch (e) {
      setError(formatPrivateLiveError(e instanceof Error ? e.message : 'Silinemedi'));
    } finally {
      setDeletingId(null);
    }
  };

  const durationSelectValue = durationCustom
    ? 'custom'
    : DURATION_PRESETS.includes(Number(form.duration_minutes) as (typeof DURATION_PRESETS)[number])
      ? String(form.duration_minutes)
      : 'custom';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
        <p className="font-semibold">WhatsApp / Meta hatırlatma</p>
        <p className="mt-1 text-xs text-emerald-900/90">
          Takvimde oluşturulan özel dersler için cron, ders öncesi öğrenciye{' '}
          <code className="rounded bg-white/70 px-1">lesson_reminder</code> ve veliye{' '}
          <code className="rounded bg-white/70 px-1">lesson_reminder_parent</code> Meta şablonlarını
          gönderir. Şablonlar Mesaj şablonları / WhatsApp merkezinde aktif olmalı.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Öğrenci, öğretmen, paket, branş, ödeme…"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm sm:max-w-md"
        />
        {canEdit ? (
          <button
            type="button"
            onClick={openCreate}
            className="min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white touch-manipulation"
          >
            Yeni özel ders kaydı
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Kayıtlı özel ders paketi yok.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Öğrenci</th>
                <th className="px-3 py-2.5">Öğretmen</th>
                <th className="px-3 py-2.5">Paket</th>
                <th className="px-3 py-2.5">Sayaç</th>
                {canPayments ? <th className="px-3 py-2.5">Ödeme</th> : null}
                {canEdit ? <th className="px-3 py-2.5 text-right">İşlem</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{nameOfStudent(r)}</td>
                  <td className="px-3 py-2.5 text-slate-700">{nameOfTeacher(r)}</td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {r.package_label || (r.credits_total == null ? 'Sınırsız' : `${r.credits_total} ders`)}
                    {r.subject ? <span className="block text-xs text-slate-500">{r.subject}</span> : null}
                    {r.class_level ? (
                      <span className="block text-xs text-slate-500">
                        {formatClassLevelLabel(r.class_level)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">
                    <span title="Tamamlanan / Toplam / Kalan">
                      {r.stats?.completed ?? 0}/{r.stats?.credits_total ?? '∞'} · kalan{' '}
                      {r.stats?.remaining_units ?? '∞'}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      iptal {r.stats?.cancelled ?? 0} · bekleyen {r.stats?.pending ?? 0} · telafi{' '}
                      {r.stats?.makeup ?? 0}
                    </span>
                  </td>
                  {canPayments ? (
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${paymentStatusClass(r.payment_status)}`}
                      >
                        {paymentStatusLabel(r.payment_status)}
                      </span>
                    </td>
                  ) : null}
                  {canEdit ? (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                          aria-label="Düzenle"
                          title="Düzenle"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === r.id}
                          onClick={() => void removeEnrollment(r)}
                          className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          aria-label="Sil"
                          title="Sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <AppModal open onClose={closeModal} panelClassName="max-w-lg">
          <AppModalHeader>
            <h3 className="font-semibold text-slate-900">
              {editingId ? 'Özel ders kaydını düzenle' : 'Yeni özel ders kaydı'}
            </h3>
            <button type="button" className="text-sm text-slate-500" onClick={closeModal}>
              Kapat
            </button>
          </AppModalHeader>
          <AppModalBody className="grid max-h-[60dvh] gap-3 overflow-y-auto sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Öğrenci
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50"
                value={form.student_id}
                disabled={Boolean(editingId)}
                onChange={(e) => onPickStudent(e.target.value)}
              >
                <option value="">Seçin</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Öğretmen
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.teacher_id}
                onChange={(e) => setForm((f) => ({ ...f, teacher_id: e.target.value }))}
              >
                <option value="">Seçin</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Koç
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.coach_id}
                onChange={(e) => setForm((f) => ({ ...f, coach_id: e.target.value }))}
              >
                <option value="">(öğrencinin koçu)</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Paket
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.package_id}
                onChange={(e) => onPickPackage(e.target.value)}
              >
                <option value="">Özel sayı</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.is_unlimited ? ' (sınırsız)' : ` (${p.lesson_count})`}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Sınıf
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.class_level}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    class_level: e.target.value,
                    subject: ''
                  }))
                }
              >
                <option value="">Seçin</option>
                {CLASS_LEVELS.map((lvl) => (
                  <option key={String(lvl.value)} value={String(lvl.value)}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Ders / branş
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              >
                <option value="">Seçin</option>
                {subjectOptions.map((sub) => (
                  <option key={sub} value={sub}>
                    {formatMaarifSubjectLabel(sub)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Başlangıç
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Bitiş
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Haftalık ders
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.weekly_lesson_count}
                onChange={(e) => setForm((f) => ({ ...f, weekly_lesson_count: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Süre (dk)
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={durationSelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'custom') {
                    setDurationCustom(true);
                    return;
                  }
                  setDurationCustom(false);
                  setForm((f) => ({ ...f, duration_minutes: v }));
                }}
              >
                {DURATION_PRESETS.map((d) => (
                  <option key={d} value={String(d)}>
                    {d} dk
                  </option>
                ))}
                <option value="custom">Diğer (elle yaz)</option>
              </select>
              {durationCustom || durationSelectValue === 'custom' ? (
                <input
                  type="number"
                  min={15}
                  max={240}
                  step={5}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  placeholder="Örn. 45"
                  value={form.duration_minutes}
                  onChange={(e) => {
                    setDurationCustom(true);
                    setForm((f) => ({ ...f, duration_minutes: e.target.value }));
                  }}
                />
              ) : null}
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.is_unlimited}
                onChange={(e) => setForm((f) => ({ ...f, is_unlimited: e.target.checked }))}
              />
              Sınırsız paket
            </label>
            {!form.is_unlimited ? (
              <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                Toplam ders hakkı
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={form.credits_total}
                  onChange={(e) => setForm((f) => ({ ...f, credits_total: e.target.value }))}
                />
              </label>
            ) : null}
            {canPayments ? (
              <>
                <label className="block text-xs font-medium text-slate-600">
                  Ücret
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={form.amount_total}
                    onChange={(e) => setForm((f) => ({ ...f, amount_total: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  İndirim
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={form.discount}
                    onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Ödenen
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={form.amount_paid}
                    onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Son ödeme
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                  Ödeme durumu
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={form.payment_status}
                    onChange={(e) => setForm((f) => ({ ...f, payment_status: e.target.value }))}
                  >
                    <option value="unpaid">Ödenmedi</option>
                    <option value="partial">Kısmi</option>
                    <option value="paid">Ödendi</option>
                    <option value="overdue">Gecikmiş</option>
                    <option value="waived">Muaf</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                  Notlar
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    rows={2}
                    value={form.enrollment_notes}
                    onChange={(e) => setForm((f) => ({ ...f, enrollment_notes: e.target.value }))}
                  />
                </label>
              </>
            ) : null}
          </AppModalBody>
          <AppModalFooter className="gap-2">
            <button
              type="button"
              className="min-h-[44px] flex-1 rounded-lg border border-slate-200 text-sm"
              onClick={closeModal}
            >
              İptal
            </button>
            <button
              type="button"
              disabled={saving || !form.student_id || !form.teacher_id}
              className="min-h-[44px] flex-1 rounded-lg bg-indigo-600 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void submit()}
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </AppModalFooter>
        </AppModal>
      ) : null}
    </div>
  );
}
