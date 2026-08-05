import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileDown,
  Gavel,
  Loader2,
  MessageCircle,
  Plus,
  Scale,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import MeetingSummaryDocument from '../../components/meetingTracker/MeetingSummaryDocument';
import { buildMeetingSummaryPdfBlob } from '../../lib/pdfMeetingSummary';
import { shareMeetingSummaryWhatsApp } from '../../lib/shareMeetingSummaryWhatsApp';
import { parseAgendaPasteText, mergeAgendaDrafts, type ParsedAgendaDraft } from '../../lib/meetingAgendaParse';
import {
  mtAddAgenda,
  mtAddDecision,
  mtAddNote,
  mtArchiveMeeting,
  mtCarryForward,
  mtCloseMeeting,
  mtCreateTask,
  mtReorderAgenda,
  mtUpdateAgenda,
  mtUpdateTask,
  type MtAgendaItem,
  type MtMeeting,
  type MtMeetingBundle,
  type MtTask,
  type MtUser
} from '../../lib/meetingTrackerApi';

const MEETING_STATUS: Record<string, string> = {
  draft: 'Taslak',
  planned: 'Planlandı',
  held: 'Gerçekleşti',
  closed: 'Kapatıldı',
  cancelled: 'İptal Edildi'
};

const AGENDA_STATUS: Record<string, string> = {
  pending: 'Görüşülecek',
  in_discussion: 'Görüşülüyor',
  discussed: 'Görüşüldü',
  deferred: 'Ertelendi',
  cancelled: 'İptal'
};

const TASK_STATUS: Record<string, string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam',
  done: 'Tamam',
  overdue: 'Gecikti',
  deferred: 'Ertelendi',
  cancelled: 'İptal'
};

function agendaBadge(status: string) {
  if (status === 'discussed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'in_discussion') return 'bg-sky-100 text-sky-800';
  if (status === 'deferred') return 'bg-orange-100 text-orange-800';
  return 'bg-amber-100 text-amber-900';
}

function roleLabel(role?: string | null) {
  const r = String(role || '').toLowerCase();
  if (r === 'super_admin') return 'Süper Admin';
  if (r === 'admin') return 'Yönetici';
  if (r === 'coach') return 'Koç';
  if (r === 'teacher') return 'Öğretmen';
  return r || '—';
}

function StaffAssigneePicker({
  users,
  selected,
  onChange,
  disabled
}: {
  users: MtUser[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const order = ['super_admin', 'admin', 'coach', 'teacher'] as const;
  const grouped = useMemo(() => {
    const map: Record<string, MtUser[]> = {};
    for (const u of users) {
      const r = String(u.role || 'other').toLowerCase();
      if (!map[r]) map[r] = [];
      map[r].push(u);
    }
    return order.filter((r) => map[r]?.length).flatMap((r) => map[r]);
  }, [users]);

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="flex flex-wrap gap-1">
      {grouped.map((u) => {
        const on = selected.includes(u.id);
        return (
          <button
            key={u.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(u.id)}
            title={roleLabel(u.role)}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              on
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-600 dark:bg-slate-800'
            }`}
          >
            {u.name || u.email}
          </button>
        );
      })}
    </div>
  );
}

type TabKey = 'toplanti' | 'notlar' | 'gecmis';

export default function MeetingDetailPanel({
  bundle,
  isManager,
  users,
  meetings,
  currentUserId,
  onBack,
  onReload,
  userName
}: {
  bundle: MtMeetingBundle;
  isManager: boolean;
  users: MtUser[];
  meetings: MtMeeting[];
  currentUserId: string;
  onBack: () => void;
  onReload: () => void;
  userName: (id?: string | null) => string;
}) {
  const m = bundle.meeting;
  const discussed = bundle.agenda.filter((a) => a.status === 'discussed').length;
  const progress = bundle.agenda.length ? Math.round((discussed / bundle.agenda.length) * 100) : 0;

  const [tab, setTab] = useState<TabKey>('toplanti');
  const [paste, setPaste] = useState('');
  const [drafts, setDrafts] = useState<ParsedAgendaDraft[]>([]);
  const [newAgendaTitle, setNewAgendaTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedRow, setSelectedRow] = useState<string | null>(bundle.agenda[0]?.id || null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const defaultRecipients = useMemo(() => {
    const ids = new Set<string>();
    if (m.manager_user_id) ids.add(m.manager_user_id);
    for (const t of bundle.tasks) {
      for (const a of t.assignees || t.mt_task_assignees || []) {
        if (a.user_id) ids.add(String(a.user_id));
      }
    }
    for (const p of bundle.participants) {
      if (p.user_id) ids.add(String(p.user_id));
    }
    return [...ids];
  }, [bundle.participants, bundle.tasks, m.manager_user_id]);

  const [shareRecipients, setShareRecipients] = useState<string[]>(defaultRecipients);

  const managerName = userName(m.manager_user_id);

  const buildPdf = async (compact = false) => {
    if (!pdfRef.current) throw new Error('PDF alanı hazır değil');
    const safe = m.title.replace(/[^\w\u00C0-\u024F\s-]/gi, '').trim().slice(0, 40) || 'toplanti';
    const filename = `toplanti-ozeti-${safe}-${m.meeting_date}.pdf`;
    return buildMeetingSummaryPdfBlob(pdfRef.current, filename, { compactForShare: compact });
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const { blob, filename } = await buildPdf(false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF indirildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF oluşturulamadı');
    } finally {
      setPdfBusy(false);
    }
  };

  const sendWhatsApp = async () => {
    if (!shareRecipients.length) {
      toast.error('En az bir alıcı seçin');
      return;
    }
    setShareBusy(true);
    try {
      const { blob, filename } = await buildPdf(true);
      const result = await shareMeetingSummaryWhatsApp({
        bundle,
        users,
        recipientIds: shareRecipients,
        senderUserId: currentUserId,
        pdfBlob: blob,
        filename
      });
      if (result.sent > 0) toast.success(result.notice);
      else toast.error(result.notice);
      if (result.skipped.length) {
        console.warn('WA skipped', result.skipped);
      }
      setShareOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'WhatsApp gönderilemedi');
    } finally {
      setShareBusy(false);
    }
  };

  const closeMeeting = async (force = false) => {
    setBusy(true);
    try {
      await mtCloseMeeting(m.id, force);
      toast.success('Toplantı kapatıldı');
      onReload();
    } catch (e) {
      const err = e as Error & { status?: number; warnings?: { title: string }[] };
      if (err.status === 409 && err.warnings?.length) {
        const ok = window.confirm(
          `Uyarılar var (${err.warnings.length} madde). Yine de kapatılsın mı? Açık görevler tamamlanmış sayılmaz.`
        );
        if (ok) await closeMeeting(true);
      } else {
        toast.error(err.message || 'Kapatılamadı');
      }
    } finally {
      setBusy(false);
    }
  };

  const addPaste = async () => {
    const items = drafts.length ? drafts : parseAgendaPasteText(paste);
    if (!items.length) {
      toast.error('Eklenecek gündem maddesi yok');
      return;
    }
    setBusy(true);
    try {
      await mtAddAgenda(m.id, items);
      toast.success(`${items.length} gündem eklendi`);
      setPaste('');
      setDrafts([]);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const addSingleAgenda = async () => {
    const title = newAgendaTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      await mtAddAgenda(m.id, [{ title, description: '' }]);
      setNewAgendaTitle('');
      toast.success('Gündem eklendi');
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      <div className="pointer-events-none fixed -left-[10000px] top-0" aria-hidden>
        <div ref={pdfRef}>
          <MeetingSummaryDocument bundle={bundle} users={users} userName={userName} />
        </div>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-indigo-700 dark:text-slate-400"
      >
        <ArrowLeft className="h-4 w-4" /> Geri
      </button>

      <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 p-5 text-white shadow-lg shadow-indigo-200/40 dark:border-indigo-900 dark:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-indigo-200">Toplantı</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{m.title}</h1>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-indigo-100">
              <span>{bundle.type?.name || '—'}</span>
              <span>·</span>
              <span>{m.meeting_date}</span>
              {m.start_time && (
                <>
                  <span>·</span>
                  <span>{String(m.start_time).slice(0, 5)}</span>
                </>
              )}
              <span>·</span>
              <span>{MEETING_STATUS[m.status] || m.status}</span>
            </p>
            <p className="mt-1 text-xs text-indigo-200/90">Yönetici: {managerName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isManager && (
              <>
                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={() => void downloadPdf()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-medium backdrop-blur hover:bg-white/25 disabled:opacity-60"
                >
                  {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  PDF indir
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShareRecipients(defaultRecipients);
                    setShareOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-400"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp gönder
                </button>
              </>
            )}
            {isManager && m.status !== 'closed' && m.status !== 'cancelled' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void closeMeeting(false)}
                className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-50 disabled:opacity-60"
              >
                Toplantıyı kapat
              </button>
            )}
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-indigo-100">
            <span>Gündem ilerleme</span>
            <span>
              {discussed}/{bundle.agenda.length} madde · %{progress}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-indigo-900/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {shareOpen && isManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">WhatsApp ile özet gönder</h3>
                <p className="text-xs text-slate-500">Gateway üzerinden PDF — alıcıları seçin</p>
              </div>
              <button type="button" onClick={() => setShareOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <StaffAssigneePicker users={users} selected={shareRecipients} onChange={setShareRecipients} />
            <ul className="mt-3 space-y-1 text-xs text-slate-500">
              {users
                .filter((u) => shareRecipients.includes(u.id))
                .map((u) => (
                  <li key={u.id}>
                    {u.name || u.email} — {u.phone ? '✓ telefon' : '⚠ telefon yok'}
                  </li>
                ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-600"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={shareBusy}
                onClick={() => void sendWhatsApp()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {shareBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                Gönder
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
        {(
          [
            { key: 'toplanti' as const, label: 'Gündem & Kararlar', icon: ClipboardList },
            { key: 'notlar' as const, label: 'Notlar', icon: Scale },
            { key: 'gecmis' as const, label: 'Geçmiş', icon: Gavel }
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm transition sm:flex-none ${
                tab === t.key
                  ? 'bg-white font-medium text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'toplanti' && (
        <div className="space-y-4">
          {isManager && (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <ClipboardList className="h-4 w-4 text-indigo-600" />
                Gündem ekle
              </div>
              <p className="mb-3 mt-1 text-xs text-slate-500">Listeyi yapıştırın veya tek tek madde ekleyin.</p>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={4}
                placeholder={'1. Günlük raporların kontrolü\n2. Devamsızlıklar\n3. Veli görüşmeleri'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDrafts(parseAgendaPasteText(paste))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  Ön izleme
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addPaste()}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white"
                >
                  Gündeme ekle
                </button>
              </div>
              {drafts.length > 0 && <PastePreview drafts={drafts} setDrafts={setDrafts} />}
              <div className="mt-3 flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-600">
                <input
                  value={newAgendaTitle}
                  onChange={(e) => setNewAgendaTitle(e.target.value)}
                  placeholder="Tek gündem maddesi ekle…"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  onKeyDown={(e) => e.key === 'Enter' && void addSingleAgenda()}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addSingleAgenda()}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  <Plus className="h-4 w-4" /> Ekle
                </button>
              </div>
            </div>
          )}

          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900 lg:block">
            <div className="grid grid-cols-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:from-slate-800 dark:to-indigo-950/30 dark:text-slate-300">
              <div className="flex items-center gap-2 px-4 py-3">
                <ClipboardList className="h-4 w-4 text-indigo-600" />
                Toplantı gündemi
              </div>
              <div className="flex items-center gap-2 border-l border-slate-200 px-4 py-3 dark:border-slate-700">
                <Gavel className="h-4 w-4 text-emerald-600" />
                Kararlar & yapılacaklar
              </div>
            </div>
            {bundle.agenda.map((item, idx) => (
              <AgendaDecisionRow
                key={item.id}
                item={item}
                index={idx}
                tasks={bundle.tasks.filter((t) => t.agenda_item_id === item.id)}
                isManager={isManager}
                users={users}
                meetings={meetings}
                currentUserId={currentUserId}
                selected={selectedRow === item.id}
                onSelect={() => setSelectedRow(item.id)}
                onReload={onReload}
                onMove={async (dir) => {
                  const ids = bundle.agenda.map((x) => x.id);
                  const j = idx + dir;
                  if (j < 0 || j >= ids.length) return;
                  [ids[idx], ids[j]] = [ids[j], ids[idx]];
                  await mtReorderAgenda(m.id, ids);
                  onReload();
                }}
              />
            ))}
            {!bundle.agenda.length && (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Henüz gündem maddesi yok.</div>
            )}
          </div>

          <div className="space-y-3 lg:hidden">
            {bundle.agenda.map((item, idx) => (
              <AgendaDecisionRow
                key={item.id}
                item={item}
                index={idx}
                tasks={bundle.tasks.filter((t) => t.agenda_item_id === item.id)}
                isManager={isManager}
                users={users}
                meetings={meetings}
                currentUserId={currentUserId}
                selected={selectedRow === item.id}
                onSelect={() => setSelectedRow(item.id)}
                onReload={onReload}
                onMove={async (dir) => {
                  const ids = bundle.agenda.map((x) => x.id);
                  const j = idx + dir;
                  if (j < 0 || j >= ids.length) return;
                  [ids[idx], ids[j]] = [ids[j], ids[idx]];
                  await mtReorderAgenda(m.id, ids);
                  onReload();
                }}
                mobile
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'notlar' && (
        <div className="space-y-3">
          {bundle.notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
              <div className="text-xs text-slate-500">
                {userName(n.created_by)} · {new Date(n.created_at).toLocaleString('tr-TR')}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="Toplantı notu…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="button"
            onClick={async () => {
              if (!noteText.trim()) return;
              await mtAddNote(m.id, noteText.trim());
              setNoteText('');
              toast.success('Not eklendi');
              onReload();
            }}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
          >
            Not kaydet
          </button>
        </div>
      )}

      {tab === 'gecmis' && (
        <div className="space-y-2">
          {bundle.activity.map((log) => (
            <div key={log.id} className="rounded border border-slate-100 px-3 py-2 text-xs dark:border-slate-700">
              <div className="font-medium">
                {log.action} · {userName(log.actor_user_id)}
              </div>
              <div className="text-slate-500">{new Date(log.created_at).toLocaleString('tr-TR')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PastePreview({
  drafts,
  setDrafts
}: {
  drafts: ParsedAgendaDraft[];
  setDrafts: (d: ParsedAgendaDraft[]) => void;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= drafts.length) return;
    const next = [...drafts];
    [next[i], next[j]] = [next[j], next[i]];
    setDrafts(next);
  };
  return (
    <div className="mt-2 space-y-1 rounded-lg border border-indigo-200 bg-white p-2 dark:border-indigo-800 dark:bg-slate-900">
      <div className="text-xs font-medium text-indigo-700">Ön izleme — {drafts.length} madde</div>
      {drafts.map((d, i) => (
        <div key={i} className="flex gap-1">
          <input
            value={d.title}
            onChange={(e) => {
              const next = [...drafts];
              next[i] = { ...d, title: e.target.value };
              setDrafts(next);
            }}
            className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
          />
          <button type="button" onClick={() => move(i, -1)} className="p-1">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => move(i, 1)} className="p-1">
            <ChevronDown className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} className="p-1 text-red-500">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function AgendaDecisionRow({
  item,
  index,
  tasks,
  isManager,
  users,
  meetings,
  currentUserId,
  selected,
  onSelect,
  onReload,
  onMove,
  mobile
}: {
  item: MtAgendaItem;
  index: number;
  tasks: MtTask[];
  isManager: boolean;
  users: MtUser[];
  meetings: MtMeeting[];
  currentUserId: string;
  selected: boolean;
  onSelect: () => void;
  onReload: () => void;
  onMove: (dir: -1 | 1) => Promise<void>;
  mobile?: boolean;
}) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.discussion_note || '');
  const [decision, setDecision] = useState(item.decision_text || '');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskAssignees, setNewTaskAssignees] = useState<string[]>([]);
  const [carryTarget, setCarryTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const saveDecision = async () => {
    setSaving(true);
    try {
      await mtUpdateAgenda({
        id: item.id,
        status,
        discussion_note: note,
        decision_text: decision
      });
      if (decision.trim()) {
        await mtAddDecision({
          meeting_id: item.meeting_id,
          agenda_item_id: item.id,
          title: item.title,
          body: decision
        }).catch(() => null);
      }
      toast.success('Kaydedildi');
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    setSaving(true);
    try {
      await mtCreateTask({
        meeting_id: item.meeting_id,
        agenda_item_id: item.id,
        title: newTaskTitle.trim(),
        due_date: newTaskDue || null,
        assignee_user_ids: newTaskAssignees
      });
      setNewTaskTitle('');
      setNewTaskDue('');
      setNewTaskAssignees([]);
      toast.success('Görev eklendi');
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Görev eklenemedi');
    } finally {
      setSaving(false);
    }
  };

  const rowAccent =
    status === 'discussed'
      ? 'border-l-emerald-500'
      : status === 'in_discussion'
        ? 'border-l-sky-500'
        : status === 'deferred'
          ? 'border-l-orange-500'
          : 'border-l-amber-400';

  const left = (
    <div className={`space-y-2 border-l-4 ${rowAccent} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-400">#{index + 1}</span>
            <span className="font-medium text-slate-900 dark:text-white">{item.title}</span>
            {item.is_carried_forward && (
              <span className="rounded bg-orange-100 px-1 py-0.5 text-[10px] text-orange-800">Devreden</span>
            )}
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${agendaBadge(status)}`}>{AGENDA_STATUS[status] || status}</span>
          </div>
          {item.description && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.description}</p>}
        </div>
        {isManager && (
          <div className="flex shrink-0 gap-0.5">
            <button type="button" onClick={() => void onMove(-1)} className="p-1 text-slate-400">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void onMove(1)} className="p-1 text-slate-400">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {isManager ? (
        <>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
          >
            {Object.entries(AGENDA_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Görüşme notu"
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
          />
        </>
      ) : (
        note && <p className="text-xs text-slate-600">{note}</p>
      )}
    </div>
  );

  const right = (
    <div className="space-y-2 border-l border-slate-100 bg-slate-50/40 p-4 dark:border-slate-700 dark:bg-slate-800/30 lg:border-l">
      {isManager ? (
        <textarea
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          rows={3}
          placeholder="Alınan karar…"
          className="w-full rounded border border-emerald-200 bg-emerald-50/30 px-2 py-1.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/20"
        />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{decision || '—'}</p>
      )}

      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Yapılacaklar</div>
        {tasks.map((t) => {
          const assignees = t.assignees || t.mt_task_assignees || [];
          const ids = assignees.map((a) => a.user_id);
          const isAssignee = ids.some((id) => String(id) === String(currentUserId));
          return (
            <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{t.title}</span>
                {(isManager || isAssignee) && (
                  <select
                    value={t.status}
                    onChange={async (e) => {
                      await mtUpdateTask({ id: t.id, status: e.target.value });
                      onReload();
                    }}
                    className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] dark:border-slate-600 dark:bg-slate-800"
                  >
                    {Object.entries(TASK_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {isManager ? (
                <div className="mt-1.5">
                  <StaffAssigneePicker
                    users={users}
                    selected={ids}
                    onChange={async (next) => {
                      await mtUpdateTask({ id: t.id, assignee_user_ids: next });
                      onReload();
                    }}
                  />
                  <input
                    type="date"
                    value={t.due_date || ''}
                    onChange={async (e) => {
                      await mtUpdateTask({ id: t.id, due_date: e.target.value || null });
                      onReload();
                    }}
                    className="mt-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-slate-500">
                  Sorumlu:{' '}
                  {ids
                    .map((id) => users.find((u) => u.id === id)?.name || id)
                    .join(', ') || '—'}
                  {t.due_date ? ` · Son: ${t.due_date}` : ''}
                </div>
              )}
            </div>
          );
        })}

        {isManager && (
          <div className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/30 p-2 dark:border-indigo-800 dark:bg-indigo-950/20">
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Yapılacak iş…"
              className="mb-1.5 w-full rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
            <StaffAssigneePicker users={users} selected={newTaskAssignees} onChange={setNewTaskAssignees} />
            <div className="mt-1.5 flex flex-wrap gap-2">
              <input
                type="date"
                value={newTaskDue}
                onChange={(e) => setNewTaskDue(e.target.value)}
                className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void addTask()}
                className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white"
              >
                <Plus className="h-3 w-3" /> Görev ekle
              </button>
            </div>
          </div>
        )}
      </div>

      {isManager && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-700">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveDecision()}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Kararı kaydet'}
          </button>
          <select
            value={carryTarget}
            onChange={(e) => setCarryTarget(e.target.value)}
            className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Sonraki toplantıya aktar…</option>
            {meetings
              .filter((x) => x.id !== item.meeting_id && ['draft', 'planned'].includes(x.status))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
          </select>
          {carryTarget && (
            <button
              type="button"
              onClick={async () => {
                await mtCarryForward({ target_meeting_id: carryTarget, agenda_item_id: item.id });
                toast.success('Sonraki toplantıya aktarıldı');
                setCarryTarget('');
                onReload();
              }}
              className="rounded bg-orange-600 px-2 py-1 text-xs text-white"
            >
              Aktar
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (mobile) {
    return (
      <div
        className={`overflow-hidden rounded-2xl border shadow-sm transition ${
          selected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 dark:border-slate-700'
        }`}
        onClick={onSelect}
      >
        {left}
        {right}
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-2 border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40 ${
        selected ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : 'bg-white dark:bg-slate-900'
      }`}
      onClick={onSelect}
    >
      {left}
      {right}
    </div>
  );
}
