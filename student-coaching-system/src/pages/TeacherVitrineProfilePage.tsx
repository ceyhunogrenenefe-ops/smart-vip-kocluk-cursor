import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Save, Send, AlertCircle, Lock, Upload, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/session';
import TeacherAvailabilityPanel from '../components/teacher/TeacherAvailabilityPanel';

type TeacherVideo = { id: string; url: string; title?: string };

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

function normalizeVideosFromWorking(working: Record<string, unknown>): TeacherVideo[] {
  const raw = working.videos;
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map((item, idx) => {
        if (typeof item === 'string') {
          const url = item.trim();
          return url ? { id: `v-${idx + 1}`, url, title: '' } : null;
        }
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const url = String(row.url || row.public_url || row.video_url || '').trim();
        if (!url) return null;
        return {
          id: String(row.id || `v-${idx + 1}`),
          url,
          title: String(row.title || '').trim()
        };
      })
      .filter((v): v is TeacherVideo => Boolean(v));
  }
  const legacy = String(working.video_url || '').trim();
  return legacy ? [{ id: 'v-1', url: legacy, title: '' }] : [];
}

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
  const [photoUploading, setPhotoUploading] = useState(false);
  const [localPhotoPreview, setLocalPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/teacher-profile');
      const j = (await res.json()) as ProfileResponse & { error?: string };
      if (!res.ok) throw new Error(j.error || res.statusText);
      setData(j);
      const working = { ...(j.working || {}) };
      const videos = normalizeVideosFromWorking(working);
      setForm({
        ...working,
        videos,
        video_url: videos[0]?.url || String(working.video_url || '')
      });
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

  const videosList: TeacherVideo[] = Array.isArray(form.videos)
    ? (form.videos as TeacherVideo[])
    : normalizeVideosFromWorking(form);

  const setVideos = (next: TeacherVideo[]) => {
    const cleaned = next
      .map((v, idx) => ({
        id: String(v.id || `v-${idx + 1}`),
        url: String(v.url || '').trim(),
        title: String(v.title || '').trim()
      }))
      .filter((v) => v.url);
    setForm((prev) => ({
      ...prev,
      videos: cleaned,
      video_url: cleaned[0]?.url || ''
    }));
  };

  const addVideoRow = () => {
    if (editingDisabled) return;
    const next = [
      ...videosList,
      { id: `v-${Date.now()}`, url: '', title: '' }
    ];
    setForm((prev) => ({ ...prev, videos: next, video_url: next.find((v) => v.url)?.url || prev.video_url || '' }));
  };

  const updateVideoRow = (id: string, patch: Partial<TeacherVideo>) => {
    const next = videosList.map((v) => (v.id === id ? { ...v, ...patch } : v));
    setForm((prev) => ({
      ...prev,
      videos: next,
      video_url: next.map((v) => String(v.url || '').trim()).find(Boolean) || ''
    }));
  };

  const removeVideoRow = (id: string) => {
    setVideos(videosList.filter((v) => v.id !== id));
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

  const uploadProfilePhoto = async (file: File) => {
    if (editingDisabled) {
      toast.error('Profil düzenleme yetkiniz kapalı');
      return;
    }
    const mime = String(file.type || '').toLowerCase();
    const okMime = mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png';
    const ext = String(file.name || '')
      .split('.')
      .pop()
      ?.toLowerCase();
    const okExt = ext === 'jpg' || ext === 'jpeg' || ext === 'png';
    if (!okMime && !okExt) {
      toast.error('Sadece JPG veya PNG yükleyebilirsiniz');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya en fazla 5 MB olabilir');
      return;
    }

    const contentType = mime === 'image/png' || ext === 'png' ? 'image/png' : 'image/jpeg';
    const objectUrl = URL.createObjectURL(file);
    setLocalPhotoPreview(objectUrl);
    setPhotoUploading(true);
    try {
      const signRes = await apiFetch('/api/teacher-profile-media?op=sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'photo',
          fileName: file.name || `profil.${ext === 'png' ? 'png' : 'jpg'}`,
          contentType,
          size: file.size
        })
      });
      const signJ = (await signRes.json()) as {
        error?: string;
        hint?: string;
        signedUrl?: string | null;
        token?: string | null;
        path?: string;
        contentType?: string;
      };
      if (!signRes.ok) {
        throw new Error(signJ.hint || signJ.error || `Yükleme hazırlığı başarısız (${signRes.status})`);
      }
      if (!signJ.path || !signJ.signedUrl) {
        throw new Error('Yükleme bağlantısı alınamadı. Storage (teacher-profiles) ayarını kontrol edin.');
      }

      const putHeaders: Record<string, string> = {
        'Content-Type': signJ.contentType || contentType,
        'x-upsert': 'true'
      };
      if (signJ.token) putHeaders.Authorization = `Bearer ${signJ.token}`;

      const put = await fetch(signJ.signedUrl, {
        method: 'PUT',
        headers: putHeaders,
        body: file
      });
      if (!put.ok) {
        const t = await put.text().catch(() => '');
        throw new Error(t.slice(0, 180) || `Dosya Storage’a yüklenemedi (${put.status})`);
      }

      const confirmRes = await apiFetch('/api/teacher-profile-media?op=confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'photo',
          path: signJ.path,
          contentType: signJ.contentType || contentType
        })
      });
      const confirmJ = (await confirmRes.json()) as {
        error?: string;
        publicUrl?: string | null;
        path?: string;
        profile?: { photo_url?: string | null; photo_path?: string | null };
      };
      if (!confirmRes.ok) throw new Error(confirmJ.error || `Onay başarısız (${confirmRes.status})`);

      const photoUrl =
        confirmJ.publicUrl ||
        confirmJ.profile?.photo_url ||
        String(form.photo_url || '') ||
        objectUrl;
      const photoPath = confirmJ.path || confirmJ.profile?.photo_path || '';
      setForm((prev) => ({
        ...prev,
        photo_url: photoUrl,
        photo_path: photoPath || prev.photo_path
      }));
      toast.success('Profil fotoğrafı yüklendi');
      await load();
      URL.revokeObjectURL(objectUrl);
      setLocalPhotoPreview(null);
    } catch (e) {
      URL.revokeObjectURL(objectUrl);
      setLocalPhotoPreview(null);
      toast.error(e instanceof Error ? e.message : 'Fotoğraf yüklenemedi');
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const save = async () => {
    if (editingDisabled) {
      toast.error('Profil düzenleme yetkiniz kapalı');
      return;
    }
    setSaving(true);
    try {
      const videos = normalizeVideosFromWorking(form).filter((v) => v.url);
      const payload = { ...form, videos, video_url: videos[0]?.url || '' };
      const res = await apiFetch('/api/teacher-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
      const videos = normalizeVideosFromWorking(form).filter((v) => v.url);
      const payload = { ...form, videos, video_url: videos[0]?.url || '' };
      const saveRes = await apiFetch('/api/teacher-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-700">Profil fotoğrafı</p>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex h-40 w-32 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                    {localPhotoPreview || form.photo_url ? (
                      <img
                        src={String(localPhotoPreview || form.photo_url)}
                        alt="Profil önizleme"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 px-2 text-center text-slate-400">
                        <ImagePlus className="h-8 w-8" />
                        <span className="text-xs">JPG / PNG</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                      className="hidden"
                      disabled={editingDisabled || photoUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadProfilePhoto(file);
                      }}
                    />
                    <button
                      type="button"
                      disabled={editingDisabled || photoUploading}
                      onClick={() => photoInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {photoUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {photoUploading ? 'Yükleniyor…' : 'Foto yükle'}
                    </button>
                    <p className="max-w-xs text-xs text-slate-500">
                      JPG veya PNG, en fazla 5 MB. Dosyayı seçince otomatik yüklenir.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Tanıtım videoları</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      YouTube veya Vimeo linki ekleyin. Birden fazla video ekleyebilirsiniz; ilki birincil tanıtım videosudur.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={editingDisabled}
                    onClick={addVideoRow}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Video ekle
                  </button>
                </div>

                {videosList.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    Henüz video yok. “Video ekle” ile ilk linki ekleyin.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {videosList.map((video, idx) => (
                      <div
                        key={video.id}
                        className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            {idx === 0 ? 'Birincil video' : `Video ${idx + 1}`}
                          </span>
                          <button
                            type="button"
                            disabled={editingDisabled}
                            onClick={() => removeVideoRow(video.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Sil
                          </button>
                        </div>
                        <label className="block text-xs font-semibold text-slate-600">
                          Video linki
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal disabled:opacity-60"
                            value={video.url}
                            placeholder="https://www.youtube.com/watch?v=…"
                            disabled={editingDisabled}
                            onChange={(e) => updateVideoRow(video.id, { url: e.target.value })}
                          />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                          Başlık (isteğe bağlı)
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal disabled:opacity-60"
                            value={video.title || ''}
                            placeholder="Örn. Tanıtım / Deneme çözümü"
                            disabled={editingDisabled}
                            onChange={(e) => updateVideoRow(video.id, { title: e.target.value })}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
