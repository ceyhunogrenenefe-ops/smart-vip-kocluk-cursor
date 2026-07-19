import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Send, AlertCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/session';
import TeacherAvailabilityPanel from '../components/teacher/TeacherAvailabilityPanel';

type ProfileResponse = {
  profile: Record<string, unknown>;
  working: Record<string, unknown>;
  missing_required: string[];
  completion_pct: number;
  can_submit?: boolean;
  can_edit?: boolean;
  editing_enabled?: boolean;
  account?: { name?: string; email?: string };
};

const MISSING_LABELS: Record<string, string> = {
  display_name: 'Ad soyad',
  photo: 'Profil fotoğrafı',
  branch: 'Branş',
  short_bio: 'Kısa tanıtım',
  full_bio: 'Özgeçmiş',
  education: 'Eğitim bilgisi',
  experience: 'Deneyim',
  grade_levels: 'Ders verdiği seviyeler',
  video: 'Tanıtım videosu / video linki'
};

const GRADE_OPTIONS = ['ilkokul', 'ortaokul', 'lise', 'lgs', 'yks', 'tyt', 'ayt'];
const EXAM_OPTIONS = ['LGS', 'TYT', 'AYT', 'YKS', 'KPSS'];

const STATUS_TR: Record<string, string> = {
  incomplete: 'Eksik',
  draft: 'Taslak (gönderilebilir)',
  pending_approval: 'Onay bekliyor',
  published: 'Yayında',
  changes_pending: 'Değişiklik onayı bekliyor',
  update_pending: 'Güncelleme onayı bekliyor',
  rejected: 'Reddedildi',
  passive: 'Pasif',
  deleted: 'Silindi'
};

export default function TeacherVitrineProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<'basic' | 'cv' | 'media' | 'lesson' | 'availability'>('basic');
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/teacher-profile');
      const j = (await res.json()) as ProfileResponse & { error?: string };
      if (!res.ok) throw new Error(j.error || res.statusText);
      setData(j);
      setForm({ ...(j.working || {}) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Profil yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArray = (key: string, value: string) => {
    const cur = Array.isArray(form[key]) ? ([...(form[key] as string[])] as string[]) : [];
    const i = cur.indexOf(value);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(value);
    setField(key, cur);
  };

  const canEdit = data?.can_edit ?? data?.editing_enabled ?? true;
  const editingDisabled = !canEdit;

  const save = async () => {
    if (editingDisabled) {
      toast.error('Profil düzenleme yetkiniz kapalı');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/teacher-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.message || res.statusText);
      toast.success(j.message || 'Taslak kaydedildi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (editingDisabled) {
      toast.error('Profil düzenleme yetkiniz kapalı');
      return;
    }
    setSubmitting(true);
    try {
      const saveRes = await apiFetch('/api/teacher-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const saveJ = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveJ.error || saveJ.message || saveRes.statusText);

      const res = await apiFetch('/api/teacher-profile?op=submit', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) {
        if (j.missing_required?.length) {
          toast.error('Eksik alanlar: ' + j.missing_required.map((k: string) => MISSING_LABELS[k] || k).join(', '));
        } else throw new Error(j.error || j.message || res.statusText);
        return;
      }
      toast.success(j.message || 'Onaya gönderildi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const status = String((data?.profile as { status?: string })?.status || '');
  const statusKey = status === 'changes_pending' ? 'changes_pending' : status;
  const pct = data?.completion_pct ?? 0;
  const missing = data?.missing_required || [];
  const canSubmit =
    canEdit &&
    (data?.can_submit !== false) &&
    missing.length === 0 &&
    status !== 'pending_approval' &&
    status !== 'passive' &&
    status !== 'deleted';

  const tabs = useMemo(
    () => [
      { id: 'basic' as const, label: 'Temel' },
      { id: 'cv' as const, label: 'Özgeçmiş' },
      { id: 'media' as const, label: 'Medya' },
      { id: 'lesson' as const, label: 'Özel ders' },
      { id: 'availability' as const, label: 'Müsaitlik' }
    ],
    []
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-24 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Profilimi Düzenle</h1>
        <p className="mt-1 text-sm text-slate-600">
          Bu profil onaylandıktan sonra onlinevipdershane.com Özel Ders sayfasında yayınlanır. Ders ücretlerini yalnızca yönetim belirler.
        </p>
      </div>

      {editingDisabled ? (
        <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <div className="font-semibold">Profil düzenleme yetkiniz kapalı. Yönetici &apos;Düzenlemeye Aç&apos; yapmalı.</div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {STATUS_TR[statusKey] || STATUS_TR[status] || status}
          </span>
          <span className="text-sm font-semibold text-[#1a3fad]">%{pct} tamamlandı</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[#e8232a] transition-all" style={{ width: `${pct}%` }} />
        </div>
        {missing.length > 0 ? (
          <div className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">Onaya göndermek için eksikler:</div>
              <ul className="mt-1 list-inside list-disc">
                {missing.map((m) => (
                  <li key={m}>{MISSING_LABELS[m] || m}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        {status === 'rejected' && (data?.profile as { rejection_reason?: string })?.rejection_reason ? (
          <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            Red gerekçesi: {(data?.profile as { rejection_reason?: string }).rejection_reason}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === t.id ? 'bg-[#1a3fad] text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'availability' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <TeacherAvailabilityPanel embedded />
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {tab === 'basic' ? (
            <>
              <Field
                label="Görünen ad"
                value={String(form.display_name || '')}
                onChange={(v) => setField('display_name', v)}
                disabled={editingDisabled}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Ad"
                  value={String(form.first_name || '')}
                  onChange={(v) => setField('first_name', v)}
                  disabled={editingDisabled}
                />
                <Field
                  label="Soyad"
                  value={String(form.last_name || '')}
                  onChange={(v) => setField('last_name', v)}
                  disabled={editingDisabled}
                />
              </div>
              <Field
                label="Unvan"
                value={String(form.title || '')}
                onChange={(v) => setField('title', v)}
                placeholder="Matematik Öğretmeni"
                disabled={editingDisabled}
              />
              <Field
                label="Branş"
                value={String(form.branch || '')}
                onChange={(v) => setField('branch', v)}
                placeholder="Matematik"
                disabled={editingDisabled}
              />
              <Field
                label="Şehir"
                value={String(form.city || '')}
                onChange={(v) => setField('city', v)}
                disabled={editingDisabled}
              />
              <TextArea
                label="Kısa tanıtım"
                value={String(form.short_bio || '')}
                onChange={(v) => setField('short_bio', v)}
                rows={3}
                disabled={editingDisabled}
              />
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.online_lessons !== false}
                  disabled={editingDisabled}
                  onChange={(e) => setField('online_lessons', e.target.checked)}
                />
                Online ders veriyorum
              </label>
            </>
          ) : null}

          {tab === 'cv' ? (
            <>
              <TextArea
                label="Ayrıntılı özgeçmiş"
                value={String(form.full_bio || '')}
                onChange={(v) => setField('full_bio', v)}
                rows={6}
                disabled={editingDisabled}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Üniversite"
                  value={String(form.university || '')}
                  onChange={(v) => setField('university', v)}
                  disabled={editingDisabled}
                />
                <Field
                  label="Bölüm"
                  value={String(form.department || '')}
                  onChange={(v) => setField('department', v)}
                  disabled={editingDisabled}
                />
                <Field
                  label="Mezuniyet yılı"
                  value={form.graduation_year == null ? '' : String(form.graduation_year)}
                  onChange={(v) => setField('graduation_year', v)}
                  disabled={editingDisabled}
                />
                <Field
                  label="Deneyim (yıl)"
                  value={form.experience_years == null ? '' : String(form.experience_years)}
                  onChange={(v) => setField('experience_years', v)}
                  disabled={editingDisabled}
                />
              </div>
              <TextArea
                label="Çalıştığı kurumlar"
                value={String(form.institutions_worked || '')}
                onChange={(v) => setField('institutions_worked', v)}
                rows={3}
                disabled={editingDisabled}
              />
              <TextArea
                label="Ders anlatım yaklaşımı"
                value={String(form.teaching_approach || '')}
                onChange={(v) => setField('teaching_approach', v)}
                rows={3}
                disabled={editingDisabled}
              />
              <ChipGroup
                label="Sınıf seviyeleri"
                options={GRADE_OPTIONS}
                selected={(form.grade_levels as string[]) || []}
                onToggle={(v) => toggleArray('grade_levels', v)}
                disabled={editingDisabled}
              />
              <ChipGroup
                label="Sınav alanları"
                options={EXAM_OPTIONS}
                selected={(form.exam_areas as string[]) || []}
                onToggle={(v) => toggleArray('exam_areas', v)}
                disabled={editingDisabled}
              />
            </>
          ) : null}

          {tab === 'media' ? (
            <>
              <Field
                label="Profil fotoğrafı URL"
                value={String(form.photo_url || '')}
                onChange={(v) => setField('photo_url', v)}
                placeholder="https://… veya yükleme sonrası URL"
                disabled={editingDisabled}
              />
              <p className="text-xs text-slate-500">
                Fotoğraf yükleme için Supabase <code>teacher-profiles</code> bucket gerekir. Şimdilik görsel URL’si de kabul edilir.
              </p>
              <Field
                label="Tanıtım videosu (YouTube / Vimeo linki)"
                value={String(form.video_url || '')}
                onChange={(v) => setField('video_url', v)}
                placeholder="https://www.youtube.com/watch?v=…"
                disabled={editingDisabled}
              />
              {form.photo_url ? (
                <img src={String(form.photo_url)} alt="Önizleme" className="mt-2 h-40 w-32 rounded-xl object-cover" />
              ) : null}
            </>
          ) : null}

          {tab === 'lesson' ? (
            <>
              <Field
                label="Ders süresi (dk)"
                value={form.lesson_duration_min == null ? '' : String(form.lesson_duration_min)}
                onChange={(v) => setField('lesson_duration_min', v)}
                disabled={editingDisabled}
              />
              <label className="block text-sm font-semibold text-slate-700">
                Format
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-60"
                  value={String(form.lesson_format || 'online')}
                  disabled={editingDisabled}
                  onChange={(e) => setField('lesson_format', e.target.value)}
                >
                  <option value="online">Online</option>
                  <option value="yuz_yuze">Yüz yüze</option>
                  <option value="hibrit">Hibrit</option>
                </select>
              </label>
              <TextArea
                label="Müsaitlik notu"
                value={String(form.availability_note || '')}
                onChange={(v) => setField('availability_note', v)}
                rows={3}
                disabled={editingDisabled}
              />
              <Field
                label="Takvim / müsaitlik linki"
                value={String(form.availability_link || '')}
                onChange={(v) => setField('availability_link', v)}
                disabled={editingDisabled}
              />
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.accepting_students !== false}
                  disabled={editingDisabled}
                  onChange={(e) => setField('accepting_students', e.target.checked)}
                />
                Yeni özel ders başvurusu açık
              </label>
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                Paket fiyatları ve ücretler Admin panelinden yönetilir; öğretmen değiştiremez.
              </p>
            </>
          ) : null}
        </div>
      )}

      {tab !== 'availability' ? (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
          <div className="mx-auto flex max-w-3xl gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || editingDisabled || status === 'passive' || status === 'deleted'}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Taslak Kaydet
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit || submitting || editingDisabled}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#e8232a] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Onaya Gönder
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal disabled:opacity-60"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows,
  disabled
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <textarea
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal disabled:opacity-60"
        rows={rows || 4}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
  disabled
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-700">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(o)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                on ? 'bg-[#1a3fad] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
