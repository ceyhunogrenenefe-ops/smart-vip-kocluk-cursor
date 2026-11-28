import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  ExternalLink,
  FileVideo,
  History,
  Loader2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { AppModal } from '../../components/ui/AppModal';
import { adVideosApi, type AdVideoDetail, type AdVideoMe } from './api';
import { EVENT_LABELS, STATUS_META, fmtBytes, fmtDateTime, fmtDay, todayKey } from './format';
import { UploadAborted, uploadResumable } from './resumableUpload';
import PanelVideo from './PanelVideo';
import TaskFormModal from './TaskFormModal';

type Props = {
  taskId: string | null;
  me: AdVideoMe | null;
  onClose: () => void;
  onChanged: () => void;
};

const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.planned;
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>{m.label}</span>;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-xs font-semibold text-slate-500 sm:w-40">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-slate-800">{v || '—'}</dd>
    </div>
  );
}

type UploadState = { phase: 'idle' | 'uploading' | 'paused' | 'finalizing' | 'error'; sent: number; total: number; error?: string };

export default function TaskDetailModal({ taskId, me, onClose, onChanged }: Props) {
  const [d, setD] = useState<AdVideoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shootDate, setShootDate] = useState(todayKey());
  const [submitShootDate, setSubmitShootDate] = useState(todayKey());
  const [editFile, setEditFile] = useState<File | null>(null);
  const [approveId, setApproveId] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<{ file_name: string; size_bytes: number } | null>(null);
  const [up, setUp] = useState<UploadState>({ phase: 'idle', sent: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<{ id: string; uri: string; chunk: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const r = await adVideosApi.get(taskId);
      setD(r);
      setShootDate(r.task.actual_shoot_date || todayKey());
      setSubmitShootDate(r.task.actual_shoot_date || todayKey());
      if (r.can.submit && me?.upload.enabled) {
        adVideosApi
          .uploadPending(taskId)
          .then((p) => setPending(p.session))
          .catch(() => setPending(null));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Görev açılamadı');
      onCloseRef.current();
    } finally {
      setLoading(false);
    }
  }, [taskId, me?.upload.enabled]);

  useEffect(() => {
    setD(null);
    setFile(null);
    setPending(null);
    setEditFile(null);
    setReviewNote('');
    setApproveId('');
    setUp({ phase: 'idle', sent: 0, total: 0 });
    sessionRef.current = null;
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = async () => {
    await load();
    onChanged();
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(false);
    }
  };

  const task = d?.task;
  const needsShootDate = Boolean(task && !task.actual_shoot_date);

  const startUpload = async (kind: 'raw' | 'edit' = 'raw') => {
    const chosen = kind === 'edit' ? editFile : file;
    if (!task || !chosen) return;
    const ext = (chosen.name.split('.').pop() || '').toLowerCase();
    if (!['mp4', 'mov', 'm4v'].includes(ext)) return toast.error('Yalnız MP4 veya MOV video yüklenebilir');
    setUp({ phase: 'uploading', sent: 0, total: chosen.size });
    try {
      if (!sessionRef.current) {
        const s = await adVideosApi.uploadStart({
          id: task.id,
          kind,
          file_name: chosen.name,
          mime_type: chosen.type,
          size: chosen.size,
          actual_shoot_date: kind === 'raw' && needsShootDate ? submitShootDate : undefined
        });
        sessionRef.current = { id: s.session_id, uri: s.session_uri, chunk: s.chunk_bytes };
        if (s.resumed) toast.message('Yarım kalan yükleme kaldığı yerden sürüyor');
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      await uploadResumable(chosen, sessionRef.current.uri, {
        chunkBytes: sessionRef.current.chunk,
        signal: ctrl.signal,
        onProgress: (p) => setUp((u) => ({ ...u, phase: 'uploading', sent: p.sent, total: p.total }))
      });
      setUp((u) => ({ ...u, phase: 'finalizing' }));
      // Google tamamlanmayı birkaç saniye geç bildirebilir
      let lastErr: unknown = null;
      for (let i = 0; i < 5; i += 1) {
        try {
          await adVideosApi.uploadFinalize(sessionRef.current.id);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if ((e as { status?: number }).status !== 409) break;
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        }
      }
      if (lastErr) throw lastErr;
      toast.success(kind === 'edit' ? 'Montaj arşive kaydedildi. Henüz taslak; yorumlara açılmadı.' : 'Ham video arşive kaydedildi ve teslim edildi');
      sessionRef.current = null;
      setFile(null);
      setEditFile(null);
      setPending(null);
      setUp({ phase: 'idle', sent: 0, total: 0 });
      await refresh();
    } catch (e) {
      if (e instanceof UploadAborted) {
        setUp((u) => ({ ...u, phase: 'paused' }));
        return;
      }
      const msg = e instanceof Error ? e.message : 'Yükleme başarısız';
      if (/süresi doldu/.test(msg)) sessionRef.current = null;
      setUp((u) => ({ ...u, phase: 'error', error: msg }));
    }
  };

  const pct = up.total ? Math.floor((up.sent / up.total) * 100) : 0;
  const isReviewer = Boolean(me?.access.reviewer);
  const edits = (d?.submissions || []).filter((s) => s.kind === 'edit');
  const raws = (d?.submissions || []).filter((s) => s.kind !== 'edit');

  return (
    <AppModal open={Boolean(taskId)} onClose={up.phase === 'uploading' ? undefined : onClose} panelClassName="sm:max-w-3xl">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-900">{task?.title || 'Görev'}</h3>
          {task ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <StatusBadge status={task.status} />
              {task.is_overdue ? <StatusBadge status="overdue" /> : null}
              {isReviewer ? <span>{task.teacher_name}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {d?.can.manage ? (
            <>
              <button type="button" onClick={() => setEditOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Düzenle">
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Sil"
                className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                onClick={() => {
                  if (!task || !window.confirm('Görev silinsin mi? Öğretmen artık görmez.')) return;
                  void run(() => adVideosApi.remove(task.id), 'Görev silindi').then(onClose);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : null}
          <button type="button" onClick={onClose} disabled={up.phase === 'uploading'} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {loading || !task || !d ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {task.status === 'revision_requested' && task.review_note ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">Düzeltme notu · {fmtDateTime(task.review_note_at)}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">{task.review_note}</p>
              </div>
            ) : null}

            <dl className="space-y-2.5">
              <Row k="Video fikri / konusu" v={task.idea} />
              <Row k="Tema" v={task.theme} />
              <Row k="Çekim notu / senaryo" v={task.shoot_note} />
              <Row
                k="Örnek video"
                v={
                  task.reference_url ? (
                    <a href={task.reference_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-700 hover:underline">
                      Bağlantıyı aç <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null
                }
              />
              <Row k="Planlanan çekim" v={fmtDateTime(task.planned_shoot_at)} />
              <Row k="Son teslim" v={<span className={task.is_overdue ? 'font-semibold text-rose-700' : ''}>{fmtDateTime(task.due_at)}</span>} />
              <Row k="Gerçekleşen çekim" v={fmtDay(task.actual_shoot_date)} />
              <Row k="İlk teslim" v={fmtDateTime(task.first_submitted_at)} />
              <Row k="Son yükleme" v={fmtDateTime(task.last_uploaded_at)} />
              {task.approved_at ? <Row k="Onay" v={fmtDateTime(task.approved_at)} /> : null}
            </dl>

            {/* ---------- Öğretmen: çekim kaydı */}
            {d.can.mark_shot && ['planned', 'shot'].includes(task.status) ? (
              <section className="rounded-2xl border border-slate-200 p-3">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CalendarCheck className="h-4 w-4 text-sky-600" /> Çekim kaydı
                </h4>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input type="date" value={shootDate} max={todayKey()} onChange={(e) => setShootDate(e.target.value)} className={`${field} sm:max-w-[200px]`} />
                  <button
                    type="button"
                    disabled={busy || !shootDate}
                    onClick={() => void run(() => adVideosApi.markShot(task.id, shootDate), 'Çekim tarihi kaydedildi')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {task.actual_shoot_date ? 'Tarihi güncelle' : 'Çektim'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">Videoyu henüz yüklemediyseniz de çekimi kaydedebilirsiniz.</p>
              </section>
            ) : null}

            {/* ---------- Öğretmen: teslim */}
            {d.can.submit ? (
              <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Upload className="h-4 w-4 text-indigo-600" />
                  {task.first_submitted_at ? 'Ham videoyu yeniden yükle' : 'Ham Videoyu Yükle'}
                </h4>
                {needsShootDate ? (
                  <label className="mb-3 block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Gerçekleşen çekim tarihi *</span>
                    <input type="date" value={submitShootDate} max={todayKey()} onChange={(e) => setSubmitShootDate(e.target.value)} className={`${field} sm:max-w-[200px]`} />
                  </label>
                ) : null}

                {me?.upload.enabled ? (
                  <div className="space-y-3">
                    {pending && up.phase === 'idle' ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Yarım kalan yükleme var: <b>{pending.file_name}</b> ({fmtBytes(pending.size_bytes)}). Aynı dosyayı seçerseniz kaldığı yerden devam eder.
                      </p>
                    ) : null}
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
                      disabled={up.phase === 'uploading' || up.phase === 'finalizing'}
                      onChange={(e) => {
                        setFile(e.target.files?.[0] || null);
                        sessionRef.current = null;
                        setUp({ phase: 'idle', sent: 0, total: 0 });
                      }}
                      className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                    />
                    {file ? (
                      <p className="flex items-center gap-2 text-xs text-slate-600">
                        <FileVideo className="h-4 w-4" /> {file.name} · {fmtBytes(file.size)}
                      </p>
                    ) : null}
                    {up.phase !== 'idle' ? (
                      <div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {up.phase === 'finalizing'
                            ? 'Drive kaydı doğrulanıyor…'
                            : `%${pct} · ${fmtBytes(up.sent)} / ${fmtBytes(up.total)}${up.phase === 'paused' ? ' · duraklatıldı' : ''}`}
                        </p>
                        {up.phase === 'error' ? <p className="mt-1 text-xs font-medium text-rose-700">{up.error}</p> : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {up.phase === 'uploading' ? (
                        <button
                          type="button"
                          onClick={() => abortRef.current?.abort()}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
                        >
                          <Pause className="h-4 w-4" /> Duraklat
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!file || up.phase === 'finalizing' || (needsShootDate && !submitShootDate)}
                          onClick={() => void startUpload('raw')}
                          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {up.phase === 'paused' || up.phase === 'error' ? <Play className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                          {up.phase === 'paused' || up.phase === 'error' ? 'Devam et' : 'Ham Videoyu Yükle'}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">MP4 veya MOV. Video kurumun Drive alanına kaydedilmeden teslim sayılmaz; yükleme sırasında bu pencereyi kapatmayın.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    Kurumsal Drive henüz hazır değil. Ham video yüklenemez ve kişisel Drive bağlantısı kabul edilmez. Yönetici Paylaşılan Drive kimliğini, hedef klasörü ve sunucudaki hizmet hesabını tanımlamalı.
                  </div>
                )}
              </section>
            ) : null}

            {d.can.upload_edit ? (
              <section className="rounded-2xl border border-slate-200 p-3">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Upload className="h-4 w-4 text-slate-700" /> Montajı Yükle
                </h4>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
                  disabled={up.phase === 'uploading' || up.phase === 'finalizing'}
                  onChange={(e) => {
                    setEditFile(e.target.files?.[0] || null);
                    sessionRef.current = null;
                    setUp({ phase: 'idle', sent: 0, total: 0 });
                  }}
                  className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
                <button
                  type="button"
                  disabled={!editFile || up.phase === 'uploading' || up.phase === 'finalizing' || !me?.upload.enabled}
                  onClick={() => void startUpload('edit')}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" /> Montajı Yükle
                </button>
                {!me?.upload.enabled ? <p className="mt-2 text-xs text-amber-800">Kurumsal Drive hazır olmadığı için montaj yüklenemez.</p> : null}
                <p className="mt-1 text-xs text-slate-500">Montaj önce taslak kalır. Yorumlara açılınca diğer öğretmenler yalnız bu sürümü görür.</p>
              </section>
            ) : null}

            {/* ---------- Ham video: panel oynatıcı */}
            {raws
                  .filter((s) => s.playable)
                  .slice(0, 1)
                  .map((s) => (
                    <section key={s.id} className="space-y-2 rounded-2xl border border-slate-200 p-3">
                      <h4 className="text-sm font-semibold text-slate-900">Ham video · v{s.version}</h4>
                      <PanelVideo
                        submissionId={s.id}
                        title={`${task.title} ham`}
                        fileName={s.file_name}
                        sizeBytes={s.size_bytes}
                        allowDownload={isReviewer}
                        previewStatus={s.preview_status}
                        previewNote={s.preview_note}
                      />
                    </section>
                  ))}

            {edits.map((s) => (
              <section key={s.id} className="space-y-2 rounded-2xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Montaj v{s.version} {s.open_for_comments ? '· yorumlara açık' : '· taslak'}
                    {s.review_status === 'approved' ? ' · onaylandı' : ''}
                  </h4>
                  {d.can.open_review && !s.open_for_comments && s.playable ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => adVideosApi.openReview(s.id), 'Montaj yorumlara açıldı')}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Yorumlara Aç
                    </button>
                  ) : null}
                </div>
                {s.playable ? (
                  <PanelVideo
                    submissionId={s.id}
                    title={`${task.title} v${s.version}`}
                    fileName={s.file_name}
                    sizeBytes={s.size_bytes}
                    allowDownload={isReviewer}
                    previewStatus={s.preview_status}
                    previewNote={s.preview_note}
                  />
                ) : (
                  <p className="text-xs text-slate-500">Bu sürüm sizin için kapalı.</p>
                )}
                {(s.comments || []).map((c) => (
                  <p key={c.id} className="text-xs text-slate-600">
                    <b>{c.author_name}</b> · {fmtDateTime(c.created_at)} — {c.body}
                  </p>
                ))}
              </section>
            ))}

            {d.can.review ? (
              <section className="space-y-3 rounded-2xl border border-slate-200 p-3">
                <h4 className="text-sm font-semibold text-slate-900">Onay</h4>
                {edits.length ? (
                  <select value={approveId || edits[0]?.id || ''} onChange={(e) => setApproveId(e.target.value)} className={field}>
                    {edits.map((s) => (
                      <option key={s.id} value={s.id}>
                        Montaj v{s.version}
                        {s.open_for_comments ? ' · yorumlara açık' : ' · taslak'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-500">Onaylanacak montaj yok. Ham video duruyor; montaj yükleyin.</p>
                )}
                <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} placeholder="Yeni sürüm isterken açıklama zorunlu" className={field} />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !edits.length}
                    onClick={() => void run(() => adVideosApi.review(task.id, 'approve', reviewNote, approveId || edits[0]?.id), 'Seçilen sürüm onaylandı')}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Seçilen sürümü onayla
                  </button>
                  <button
                    type="button"
                    disabled={busy || !reviewNote.trim()}
                    onClick={() => void run(() => adVideosApi.review(task.id, 'revision', reviewNote, approveId || edits[0]?.id), 'Yeni sürüm istendi')}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" /> Yeni sürüm iste
                  </button>
                </div>
              </section>
            ) : null}

            {/* ---------- Geçmiş */}
            <section>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <History className="h-4 w-4 text-slate-500" /> Teslim geçmişi
              </h4>
              {d.submissions.length ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {d.submissions.map((s) => (
                    <li key={s.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {s.kind === 'edit' ? 'Montaj' : 'Ham'} v{s.version} {s.is_revision ? <span className="text-xs font-normal text-amber-700">(yeniden)</span> : null}
                        </p>
                        <p className="text-xs text-slate-500">
                          {fmtDateTime(s.uploaded_at)} · {s.legacy_link ? 'Eski kişisel bağlantı (kurum arşivi değil)' : 'Kurum arşivi'}
                          {s.size_bytes ? ` · ${fmtBytes(s.size_bytes)}` : ''}
                        </p>
                        {s.review_note ? <p className="mt-0.5 whitespace-pre-wrap text-xs text-amber-800">Not: {s.review_note}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {s.review_status === 'approved'
                            ? 'Onaylandı'
                            : s.review_status === 'revision_requested'
                              ? 'Düzeltme istendi'
                              : s.review_status === 'superseded'
                                ? 'Yenisi yüklendi'
                                : 'İnceleme bekliyor'}
                        </span>
                        {s.legacy_link && s.drive_url ? (
                          <a href={s.drive_url} target="_blank" rel="noreferrer" className="text-[11px] text-amber-800 underline" title="Eski kişisel bağlantı">
                            Eski bağlantı
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Henüz teslim yok.</p>
              )}
              {d.events.length ? (
                <ol className="mt-3 space-y-1.5 border-l-2 border-slate-200 pl-3">
                  {d.events.map((e) => (
                    <li key={e.id} className="text-xs text-slate-600">
                      <span className="font-medium text-slate-800">{EVENT_LABELS[e.kind] || e.kind}</span> · {fmtDateTime(e.created_at)}
                      {e.actor_name ? ` · ${e.actor_name}` : ''}
                      {e.note ? <span className="block whitespace-pre-wrap text-slate-500">{e.note}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          </>
        )}
      </div>
      {d?.can.manage ? <TaskFormModal open={editOpen} task={task} onClose={() => setEditOpen(false)} onSaved={() => void refresh()} /> : null}
    </AppModal>
  );
}
