import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
  mtSaveTemplate,
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

  const managerName = userName(m.manager_user_id);

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
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 md:p-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> Geri
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{m.title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {bundle.type?.name || '—'} · {m.meeting_date}
            {m.start_time ? ` ${String(m.start_time).slice(0, 5)}` : ''} · {MEETING_STATUS[m.status] || m.status}
          </p>
          <p className="text-xs text-slate-500">Toplantı yöneticisi: {managerName}</p>
        </div>
        {isManager && m.status !== 'closed' && m.status !== 'cancelled' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void closeMeeting(false)}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white"
            >
              Toplantıyı Kapat
            </button>
            <button
              type="button"
              onClick={async () => {
                const name = window.prompt('Şablon adı:', `${m.title} şablonu`);
                if (!name) return;
                await mtSaveTemplate({
                  name,
                  meeting_type_id: m.meeting_type_id,
                  agenda_json: bundle.agenda.map((a) => ({ title: a.title, description: a.description || '' }))
                });
                toast.success('Şablon kaydedildi');
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600"
            >
              Şablon kaydet
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Gündem ilerleme</span>
          <span>
            {discussed}/{bundle.agenda.length} ({progress}%)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {(
          [
            { key: 'toplanti' as const, label: 'Gündem & Kararlar' },
            { key: 'notlar' as const, label: 'Notlar' },
            { key: 'gecmis' as const, label: 'İşlem Geçmişi' }
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm ${
              tab === t.key ? 'border-b-2 border-indigo-600 font-medium text-indigo-700' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'toplanti' && (
        <div className="space-y-4">
          {isManager && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Gündem metnini yapıştır</div>
              <p className="mb-2 text-xs text-slate-500">Numaralı veya maddeli listeyi yapıştırın; sistem satır satır ayırır.</p>
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

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 lg:block">
            <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <div className="px-3 py-2">Toplantı gündemi</div>
              <div className="border-l border-slate-200 px-3 py-2 dark:border-slate-700">Alınan kararlar & yapılacaklar</div>
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

  const left = (
    <div className="space-y-2 p-3">
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
    <div className="space-y-2 border-slate-200 p-3 dark:border-slate-700 lg:border-l">
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
        className={`rounded-xl border ${selected ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200 dark:border-slate-700'}`}
        onClick={onSelect}
      >
        {left}
        {right}
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-2 border-b border-slate-200 last:border-b-0 dark:border-slate-700 ${
        selected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : 'bg-white dark:bg-slate-900'
      }`}
      onClick={onSelect}
    >
      {left}
      {right}
    </div>
  );
}
