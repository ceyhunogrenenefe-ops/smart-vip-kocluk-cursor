import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clapperboard, Loader2, Upload } from 'lucide-react';
import { apiFetch } from '../lib/session';

type DriveState = { ready: boolean; missing: string[]; hint: string };
type Actions = {
  uploadRaw: boolean;
  uploadEdit: boolean;
  openReview: boolean;
  approve: boolean;
  revise: boolean;
  editTask: boolean;
  setShootDate: boolean;
  seeRaw: boolean;
};
type VideoFile = {
  id: string;
  kind: 'raw' | 'edit';
  version: number;
  archive: boolean;
  legacy: boolean;
  legacyUrl?: string | null;
  mimeType?: string | null;
  originalName?: string | null;
  sizeBytes?: number | null;
  uploadedAt?: string | null;
  status: string;
  previewStatus?: string | null;
  previewNote?: string | null;
  openForComments: boolean;
  approvedAt?: string | null;
  approvedByName?: string | null;
  currentApproval: boolean;
  playable: boolean;
};
type Comment = {
  id: string;
  fileId: string;
  authorName: string;
  body: string;
  createdLabel: string;
};
type Task = {
  id: string;
  idea: string;
  theme: string;
  shootNotes: string;
  plannedShootDate?: string | null;
  plannedShootTime?: string | null;
  plannedShootLabel: string;
  dueAt?: string | null;
  dueLabel: string;
  actualShootDate?: string | null;
  actualShootLabel: string;
  status: string;
  statusLabel: string;
  teacherUserId: string;
  teacherName: string;
  revisionNote: string;
  actions: Actions;
  files: VideoFile[];
  comments: Comment[];
};
type ReviewItem = VideoFile & { idea: string; theme: string; teacherName: string; comments: Comment[] };
type TeacherStat = {
  teacherUserId: string;
  teacherName: string;
  lastShootLabel: string;
  weeklyShoots: number;
  weeklyDeliveries: number;
};
type Board = {
  schemaOk: boolean;
  hint?: string;
  drive: DriveState;
  me?: { isAdmin: boolean; isEditor: boolean; canCreate: boolean };
  tasks: Task[];
  review: ReviewItem[];
  report?: {
    weekLabel: string;
    shoots: number;
    deliveries: number;
    waitingEdits: number;
    openReviews: number;
    approved: number;
    overdue: number;
    teachers: TeacherStat[];
  } | null;
  digest?: { newRaws: unknown[]; waitingEdits: unknown[]; overdue: { idea: string; teacherName: string; dueLabel: string; statusLabel: string }[] } | null;
  teachers: { id: string; name: string }[];
  staffOptions: { id: string; name: string; role: string }[];
  editors: { user_id: string; user_name: string }[];
};

const CHUNK = 2 * 1024 * 1024;
const emptyForm = {
  id: '',
  teacherUserId: '',
  idea: '',
  theme: '',
  shootNotes: '',
  plannedShootDate: '',
  plannedShootTime: '',
  dueAt: '',
  actualShootDate: '',
  legacyDriveUrl: ''
};

async function post(op: string, body: Record<string, unknown>) {
  const res = await apiFetch(`/api/reklam-videolari?op=${op}`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const comma = text.indexOf(',');
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
    reader.readAsDataURL(blob);
  });
}

function rememberUpload(taskId: string, kind: string) {
  const key = `ad-video-upload:${taskId}:${kind}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '');
    sessionStorage.setItem(key, id);
  }
  return id;
}

function forgetUpload(taskId: string, kind: string) {
  sessionStorage.removeItem(`ad-video-upload:${taskId}:${kind}`);
}

function mb(bytes?: number | null) {
  if (!bytes) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ReklamVideolariPage() {
  const [params] = useSearchParams();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'gorev' | 'inceleme'>(params.get('inceleme') ? 'inceleme' : 'gorev');
  const [openTask, setOpenTask] = useState(params.get('gorev') || '');
  const [openReview, setOpenReview] = useState(params.get('inceleme') || '');
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState<Record<string, { pct: number; text: string }>>({});
  const [comment, setComment] = useState('');
  const [revision, setRevision] = useState('');
  const [editorId, setEditorId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/reklam-videolari');
      const data = (await res.json().catch(() => ({}))) as Board & { error?: string; hint?: string };
      if (!res.ok) {
        setError(data.hint || data.error || 'Sayfa açılamadı.');
        setBoard(null);
      } else {
        setError('');
        setBoard(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sayfa açılamadı.');
      setBoard(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const task = useMemo(() => board?.tasks.find((item) => item.id === openTask) || null, [board, openTask]);
  const review = useMemo(
    () => board?.review.find((item) => item.id === openReview) || board?.review[0] || null,
    [board, openReview]
  );

  const upload = async (taskId: string, kind: 'raw' | 'edit', file: File) => {
    const key = `${taskId}:${kind}`;
    const clientUploadId = rememberUpload(taskId, kind);
    setBusy(key);
    setProgress((prev) => ({ ...prev, [key]: { pct: 0, text: 'Oturum açılıyor' } }));
    try {
      const started = await post('start-upload', {
        taskId,
        kind,
        fileName: file.name,
        mime: file.type,
        size: file.size,
        clientUploadId
      });
      if (!started.ok) throw new Error(started.data.hint || started.data.error || 'Yükleme başlamadı');
      if (started.data.alreadyStored) {
        setProgress((prev) => ({ ...prev, [key]: { pct: 100, text: 'Bu teslim zaten arşivde' } }));
        forgetUpload(taskId, kind);
        await load();
        return;
      }
      let offset = Number(started.data.offset) || 0;
      const fileId = started.data.fileId as string;
      while (offset < file.size) {
        const end = Math.min(offset + CHUNK, file.size);
        const dataBase64 = await blobToBase64(file.slice(offset, end));
        const piece = await post('relay', { fileId, start: offset, total: file.size, dataBase64 });
        if (!piece.ok) throw new Error(piece.data.error || 'Yükleme kesildi');
        if (piece.data.mismatch) {
          offset = Number(piece.data.offset) || 0;
          continue;
        }
        offset = Number(piece.data.offset) || end;
        setProgress((prev) => ({
          ...prev,
          [key]: { pct: Math.round((offset / file.size) * 100), text: 'Drive’a yazılıyor' }
        }));
        if (piece.data.done) break;
      }
      setProgress((prev) => ({ ...prev, [key]: { pct: 100, text: 'Arşiv doğrulanıyor' } }));
      const done = await post('complete', { fileId });
      if (!done.ok || !done.data.stored) {
        throw new Error(done.data.error || 'Dosya kurum arşivinde doğrulanamadı');
      }
      forgetUpload(taskId, kind);
      const preview = done.data.file?.previewNote || '';
      setProgress((prev) => ({
        ...prev,
        [key]: { pct: 100, text: `Arşive kaydedildi. ${preview}` }
      }));
      await load();
    } catch (err) {
      setProgress((prev) => ({
        ...prev,
        [key]: { pct: prev[key]?.pct || 0, text: err instanceof Error ? err.message : 'Yükleme kesildi. Yeniden deneyin.' }
      }));
    } finally {
      setBusy('');
    }
  };

  const onFile = (taskId: string, kind: 'raw' | 'edit', list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    void upload(taskId, kind, file);
  };

  const saveTask = async () => {
    setBusy('form');
    const result = await post('save-task', form);
    setBusy('');
    if (!result.ok) {
      setError(result.data.error || 'Görev kaydedilemedi');
      return;
    }
    setShowForm(false);
    setForm(emptyForm);
    await load();
  };

  const downloadFile = async (file: VideoFile) => {
    const ticket = await post('ticket', { fileId: file.id, purpose: 'download' });
    if (!ticket.ok || !ticket.data.url) {
      setError(ticket.data.error || 'İndirme izni yok');
      return;
    }
    const size = Number(ticket.data.sizeBytes) || 0;
    const name = ticket.data.originalName || 'video.mp4';
    const savePicker = (window as Window & { showSaveFilePicker?: (opts: { suggestedName: string }) => Promise<{ createWritable: () => Promise<{ write: (data: BufferSource) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker;
    if (savePicker) {
      const handle = await savePicker({ suggestedName: name });
      const writable = await handle.createWritable();
      for (let start = 0; start < size; start += CHUNK) {
        const end = Math.min(start + CHUNK, size) - 1;
        const res = await fetch(ticket.data.url, { headers: { Range: `bytes=${start}-${end}` } });
        if (!res.ok && res.status !== 206) throw new Error('İndirme kesildi');
        await writable.write(await res.arrayBuffer());
      }
      await writable.close();
      return;
    }
    if (size > 400 * 1024 * 1024) {
      setError('Dosya büyük. İndirmek için Chrome masaüstü kullanın; panel Google erişim ekranına göndermez.');
      return;
    }
    const parts: BlobPart[] = [];
    for (let start = 0; start < size; start += CHUNK) {
      const end = Math.min(start + CHUNK, size) - 1;
      const res = await fetch(ticket.data.url, { headers: { Range: `bytes=${start}-${end}` } });
      if (!res.ok && res.status !== 206) throw new Error('İndirme kesildi');
      parts.push(await res.arrayBuffer());
    }
    const blob = new Blob(parts, { type: ticket.data.mimeType || 'video/mp4' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex items-center gap-3">
        <Clapperboard className="h-7 w-7 text-indigo-700" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reklam Videoları</h1>
          <p className="text-sm text-slate-600">Ham video ve montaj kurumun Paylaşılan Drive arşivine panel oturumuyla kaydedilir.</p>
        </div>
      </header>

      {loading && !board ? (
        <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor</p>
      ) : null}
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}

      {board && !board.schemaOk ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{board.hint}</p>
      ) : null}
      {board && !board.drive?.ready ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">Kurumsal Paylaşılan Drive henüz bağlı değil.</p>
          <p className="mt-1">{board.drive?.hint}</p>
          <p className="mt-1">Eksik ayar: {(board.drive?.missing || []).join(', ') || 'bilinmiyor'}.</p>
          <p className="mt-1">Kurulum adımları depoda `docs/REKLAM_VIDEOLARI_DRIVE.md` dosyasında. Yeni teslim kişisel Drive bağlantısına düşmez.</p>
        </div>
      ) : null}

      {board?.report ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Yönetici takibi · {board.report.weekLabel}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Stat label="Haftalık çekim" value={board.report.shoots} />
            <Stat label="Haftalık teslim" value={board.report.deliveries} />
            <Stat label="Montaj bekleyen" value={board.report.waitingEdits} />
            <Stat label="Yorumlara açık" value={board.report.openReviews} />
            <Stat label="Onaylanan sürüm" value={board.report.approved} />
            <Stat label="Geciken iş" value={board.report.overdue} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Aynı işin yeniden yüklenmesi haftalık teslim sayısını artırmaz. Tarihler Türkiye saatine göredir.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-1">Öğretmen</th>
                  <th>Son çekim</th>
                  <th>Haftalık çekim</th>
                  <th>Haftalık teslim</th>
                </tr>
              </thead>
              <tbody>
                {board.report.teachers.map((row) => (
                  <tr key={row.teacherUserId} className="border-t border-slate-100">
                    <td className="py-1">{row.teacherName}</td>
                    <td>{row.lastShootLabel || '—'}</td>
                    <td>{row.weeklyShoots}</td>
                    <td>{row.weeklyDeliveries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {board.digest?.overdue?.length ? (
            <ul className="mt-3 space-y-1 text-sm text-rose-800">
              {board.digest.overdue.map((row) => (
                <li key={`${row.teacherName}-${row.dueLabel}`}>{row.teacherName} — {row.idea} · son teslim {row.dueLabel} · {row.statusLabel}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {board?.me?.canCreate ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <button type="button" className="text-sm font-medium text-indigo-700" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Formu kapat' : 'Görev aç'}
          </button>
          {showForm ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-sm">Öğretmen
                <select className="mt-1 w-full rounded border px-2 py-2" value={form.teacherUserId} onChange={(e) => setForm({ ...form, teacherUserId: e.target.value })}>
                  <option value="">Seçin</option>
                  {board.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                </select>
              </label>
              <Field label="Video fikri" value={form.idea} onChange={(idea) => setForm({ ...form, idea })} />
              <Field label="Tema" value={form.theme} onChange={(theme) => setForm({ ...form, theme })} />
              <Field label="Planlanan çekim günü" type="date" value={form.plannedShootDate} onChange={(plannedShootDate) => setForm({ ...form, plannedShootDate })} />
              <Field label="Çekim saati" type="time" value={form.plannedShootTime} onChange={(plannedShootTime) => setForm({ ...form, plannedShootTime })} />
              <Field label="Son teslim" type="date" value={form.dueAt} onChange={(dueAt) => setForm({ ...form, dueAt })} />
              <Field label="Gerçekleşen çekim" type="date" value={form.actualShootDate} onChange={(actualShootDate) => setForm({ ...form, actualShootDate })} />
              <label className="text-sm sm:col-span-2">Çekim notu
                <textarea className="mt-1 w-full rounded border px-2 py-2" rows={3} value={form.shootNotes} onChange={(e) => setForm({ ...form, shootNotes: e.target.value })} />
              </label>
              <label className="text-sm sm:col-span-2">Eski kişisel Drive bağlantısı (yalnız geçmiş kaydı, yeni teslim değildir)
                <input className="mt-1 w-full rounded border px-2 py-2" value={form.legacyDriveUrl} onChange={(e) => setForm({ ...form, legacyDriveUrl: e.target.value })} />
              </label>
              <button type="button" className="rounded bg-indigo-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy === 'form'} onClick={() => void saveTask()}>
                Görevi kaydet
              </button>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-sm">Kurgu ekibi
              <select className="mt-1 block rounded border px-2 py-2" value={editorId} onChange={(e) => setEditorId(e.target.value)}>
                <option value="">Kişi seçin</option>
                {board.staffOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => editorId && post('editor', { userId: editorId }).then(load)}>Ekle</button>
            <ul className="flex flex-wrap gap-2 text-sm">
              {board.editors.map((editor) => (
                <li key={editor.user_id} className="rounded-full bg-slate-100 px-2 py-1">
                  {editor.user_name}
                  <button type="button" className="ml-2 text-rose-700" onClick={() => post('remove-editor', { userId: editor.user_id }).then(load)}>çıkar</button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <div className="flex gap-2">
        <TabButton active={tab === 'gorev'} onClick={() => setTab('gorev')}>Görevler</TabButton>
        <TabButton active={tab === 'inceleme'} onClick={() => setTab('inceleme')}>İncelemedeki Montajlar</TabButton>
      </div>

      {tab === 'inceleme' ? (
        <section className="space-y-3">
          {board && !board.review.length ? <p className="text-sm text-slate-600">Yorumlara açılmış montaj yok.</p> : null}
          <div className="flex gap-2 overflow-x-auto">
            {board?.review.map((item) => (
              <button key={item.id} type="button" className={`shrink-0 rounded-lg border px-3 py-2 text-left text-sm ${review?.id === item.id ? 'border-indigo-600 bg-indigo-50' : 'bg-white'}`} onClick={() => setOpenReview(item.id)}>
                <span className="block font-medium">{item.idea}</span>
                <span className="text-slate-500">Sürüm {item.version} · {item.teacherName}</span>
              </button>
            ))}
          </div>
          {review ? (
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-medium">{review.idea}</h2>
              <p className="text-sm text-slate-600">{review.theme} · {review.teacherName} · Sürüm {review.version}</p>
              <Player fileId={review.id} />
              <p className="mt-2 text-sm text-slate-600">{review.previewNote}</p>
              <CommentList comments={review.comments} />
              <CommentBox
                value={comment}
                onChange={setComment}
                onSend={async () => {
                  const result = await post('comment', { fileId: review.id, body: comment });
                  if (!result.ok) setError(result.data.error || 'Yorum kaydedilemedi');
                  else { setComment(''); await load(); }
                }}
              />
            </article>
          ) : null}
        </section>
      ) : (
        <section className="space-y-3">
          {board && !board.tasks.length ? <p className="text-sm text-slate-600">Görev yok.</p> : null}
          {board?.tasks.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <button type="button" className="w-full text-left" onClick={() => setOpenTask(openTask === item.id ? '' : item.id)}>
                <span className="font-medium text-slate-900">{item.idea}</span>
                <span className="mt-1 block text-sm text-slate-600">{item.teacherName} · {item.theme} · {item.statusLabel}</span>
              </button>
              {task?.id === item.id ? (
                <div className="mt-3 space-y-3 text-sm">
                  <p>Planlanan çekim: {item.plannedShootLabel || '—'} · Son teslim: {item.dueLabel || '—'}</p>
                  <p>Gerçekleşen çekim: {item.actualShootLabel || '—'}</p>
                  {item.shootNotes ? <p className="whitespace-pre-wrap text-slate-700">{item.shootNotes}</p> : null}
                  {item.revisionNote ? <p className="rounded bg-amber-50 p-2">Yeni sürüm notu: {item.revisionNote}</p> : null}
                  {item.actions.setShootDate ? (
                    <label className="block">Gerçekleşen çekim günü
                      <input type="date" className="mt-1 rounded border px-2 py-1" defaultValue={item.actualShootDate || ''} onChange={(e) => post('set-shoot-date', { taskId: item.id, actualShootDate: e.target.value }).then(load)} />
                    </label>
                  ) : null}
                  {item.actions.uploadRaw ? (
                    <UploadButton label="Ham Videoyu Yükle" disabled={Boolean(busy) || !board.drive?.ready} onFile={(file) => onFile(item.id, 'raw', file)} />
                  ) : null}
                  {item.actions.uploadEdit ? (
                    <UploadButton label="Montajı Yükle" disabled={Boolean(busy) || !board.drive?.ready} onFile={(file) => onFile(item.id, 'edit', file)} />
                  ) : null}
                  {progress[`${item.id}:raw`] ? <p>{progress[`${item.id}:raw`].text} · %{progress[`${item.id}:raw`].pct}</p> : null}
                  {progress[`${item.id}:edit`] ? <p>{progress[`${item.id}:edit`].text} · %{progress[`${item.id}:edit`].pct}</p> : null}
                  {item.actions.revise ? (
                    <div className="flex gap-2">
                      <input className="flex-1 rounded border px-2 py-1" placeholder="Yeni sürüm notu" value={revision} onChange={(e) => setRevision(e.target.value)} />
                      <button type="button" className="rounded border px-2 py-1" onClick={() => post('request-revision', { taskId: item.id, note: revision }).then(load)}>Yeni sürüm iste</button>
                    </div>
                  ) : null}
                  <div className="space-y-3">
                    {item.files.map((file) => (
                      <FileCard
                        key={file.id}
                        file={file}
                        comments={item.comments.filter((row) => row.fileId === file.id)}
                        actions={item.actions}
                        onDownload={() => downloadFile(file).catch((err) => {
                          if (err instanceof DOMException && err.name === 'AbortError') return;
                          setError(err instanceof Error ? err.message : 'İndirme kesildi');
                        })}
                        onOpen={() => post('open-review', { fileId: file.id }).then(load)}
                        onApprove={() => post('approve', { fileId: file.id }).then(load)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="text-sm">{label}
      <input type={type} className="mt-1 w-full rounded border px-2 py-2" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-sm ${active ? 'bg-indigo-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
      {children}
    </button>
  );
}

function UploadButton({ label, disabled, onFile }: { label: string; disabled: boolean; onFile: (files: FileList | null) => void }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 rounded bg-indigo-700 px-3 py-2 text-white ${disabled ? 'opacity-50' : ''}`}>
      <Upload className="h-4 w-4" /> {label}
      <input className="hidden" type="file" accept="video/mp4,video/quicktime,.mp4,.mov" disabled={disabled} onChange={(e) => { onFile(e.target.files); e.target.value = ''; }} />
    </label>
  );
}

function Player({ fileId }: { fileId: string }) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [stored, setStored] = useState(false);
  useEffect(() => {
    let cancel = false;
    void post('ticket', { fileId, purpose: 'play' }).then((result) => {
      if (cancel) return;
      setStored(Boolean(result.data.stored));
      setUrl(result.data.url || '');
      setNote(result.data.previewNote || result.data.error || '');
    });
    return () => { cancel = true; };
  }, [fileId]);
  return (
    <div className="mt-3 space-y-2">
      {stored ? <p className="text-sm text-emerald-800">Dosya kurum arşivine kaydedildi.</p> : null}
      {url ? <video className="w-full rounded-lg bg-black" controls playsInline src={url} /> : null}
      {note ? <p className="text-sm text-slate-600">{note}</p> : null}
    </div>
  );
}

function CommentList({ comments }: { comments: Comment[] }) {
  if (!comments.length) return <p className="mt-3 text-sm text-slate-500">Bu sürümde yorum yok.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {comments.map((item) => (
        <li key={item.id} className="rounded bg-slate-50 p-2 text-sm">
          <span className="font-medium">{item.authorName}</span>
          <span className="ml-2 text-slate-500">{item.createdLabel}</span>
          <p className="mt-1 whitespace-pre-wrap">{item.body}</p>
        </li>
      ))}
    </ul>
  );
}

function CommentBox({ value, onChange, onSend }: { value: string; onChange: (value: string) => void; onSend: () => void }) {
  return (
    <div className="mt-3 flex gap-2">
      <input className="flex-1 rounded border px-2 py-2" placeholder="Yorum yazın" value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="rounded bg-slate-900 px-3 py-2 text-sm text-white" onClick={onSend}>Gönder</button>
    </div>
  );
}

function FileCard({
  file,
  comments,
  actions,
  onDownload,
  onOpen,
  onApprove
}: {
  file: VideoFile;
  comments: Comment[];
  actions: Actions;
  onDownload: () => void;
  onOpen: () => void;
  onApprove: () => void;
}) {
  if (file.legacy) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="font-medium">Eski kişisel Drive bağlantısı</p>
        <p>Bu dosya kurum arşivine kaydedilmiş değildir. Açılırsa Google erişim isteyebilir. Orijinal durmuyorsa yukarıdaki yükleme düğmesiyle yeniden gönderin.</p>
        {file.legacyUrl ? <a className="mt-1 inline-block text-indigo-700 underline" href={file.legacyUrl} target="_blank" rel="noreferrer">Eski bağlantı</a> : null}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="font-medium">{file.kind === 'raw' ? 'Ham video' : 'Montaj'} · sürüm {file.version}</p>
      <p className="text-slate-600">{file.originalName} {mb(file.sizeBytes)} · {file.status === 'stored' ? 'Arşive kaydedildi' : file.status === 'failed' ? 'Doğrulanamadı' : 'Yükleniyor'}</p>
      <p className="text-slate-600">Önizleme: {file.previewStatus === 'not_needed' ? 'orijinal oynatılabilir' : file.previewStatus === 'ready' ? 'hazır' : file.previewStatus === 'unavailable' ? 'yok, orijinal arşivde' : 'bekliyor'}</p>
      {file.previewNote ? <p>{file.previewNote}</p> : null}
      {file.currentApproval ? <p className="text-emerald-800">Onaylandı · {file.approvedByName} · {file.approvedAt}</p> : null}
      {file.openForComments ? <p>Yorumlara açık</p> : null}
      {file.playable || file.status === 'stored' ? <Player fileId={file.id} /> : null}
      {file.status === 'stored' && actions.seeRaw || (file.kind === 'edit' && file.status === 'stored') ? (
        <button type="button" className="mt-2 rounded border px-2 py-1" onClick={onDownload}>İndir</button>
      ) : null}
      {file.kind === 'edit' && actions.openReview && file.status === 'stored' && !file.openForComments ? (
        <button type="button" className="ml-2 mt-2 rounded border px-2 py-1" onClick={onOpen}>Yorumlara Aç</button>
      ) : null}
      {file.kind === 'edit' && actions.approve && file.status === 'stored' ? (
        <button type="button" className="ml-2 mt-2 rounded border px-2 py-1" onClick={onApprove}>Onaylandı</button>
      ) : null}
      {file.kind === 'edit' ? <CommentList comments={comments} /> : null}
    </div>
  );
}
