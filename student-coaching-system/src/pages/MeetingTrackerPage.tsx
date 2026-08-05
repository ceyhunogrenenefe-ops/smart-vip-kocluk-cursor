import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { userHasAnyRole } from '../config/rolePermissions';
import { parseAgendaPasteText, mergeAgendaDrafts, type ParsedAgendaDraft } from '../lib/meetingAgendaParse';
import {
  mtAddAgenda,
  mtAddDecision,
  mtAddNote,
  mtArchiveMeeting,
  mtCarryForward,
  mtCloseMeeting,
  mtCreateMeeting,
  mtCreateTask,
  mtGetDashboard,
  mtGetMeeting,
  mtGetReports,
  mtGetTemplates,
  mtGetTypes,
  mtGetUsers,
  mtReorderAgenda,
  mtSaveTemplate,
  mtUpdateAgenda,
  mtUpdateTask,
  type MtAgendaItem,
  type MtDashboard,
  type MtMeeting,
  type MtMeetingBundle,
  type MtMeetingType,
  type MtTask,
  type MtTemplate,
  type MtUser
} from '../lib/meetingTrackerApi';

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
  deferred: 'Sonraki Toplantıya Ertelendi',
  cancelled: 'İptal Edildi'
};

const TASK_STATUS: Record<string, string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  done: 'Tamamlandı',
  overdue: 'Gecikti',
  deferred: 'Ertelendi',
  cancelled: 'İptal Edildi'
};

const PRIORITY: Record<string, string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  urgent: 'Acil'
};

function taskBadge(status: string) {
  if (status === 'done') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  if (status === 'overdue') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  if (status === 'in_progress') return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200';
  if (status === 'deferred') return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200';
  if (status === 'cancelled') return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  return 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200';
}

function agendaBadge(status: string) {
  if (status === 'discussed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'in_discussion') return 'bg-sky-100 text-sky-800';
  if (status === 'deferred') return 'bg-orange-100 text-orange-800';
  if (status === 'cancelled') return 'bg-slate-200 text-slate-600';
  return 'bg-amber-100 text-amber-900';
}

type TabKey = 'gundem' | 'kararlar' | 'gorevler' | 'notlar' | 'dosyalar' | 'katilimcilar' | 'gecmis';

export default function MeetingTrackerPage() {
  const { effectiveUser } = useAuth();
  const isManager = userHasAnyRole(effectiveUser, ['super_admin', 'admin']);
  const [params, setParams] = useSearchParams();
  const meetingId = params.get('id') || '';

  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<MtDashboard | null>(null);
  const [types, setTypes] = useState<MtMeetingType[]>([]);
  const [users, setUsers] = useState<MtUser[]>([]);
  const [templates, setTemplates] = useState<MtTemplate[]>([]);
  const [reports, setReports] = useState<Record<string, unknown> | null>(null);
  const [bundle, setBundle] = useState<MtMeetingBundle | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [showCreate, setShowCreate] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [q, setQ] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterMeetingStatus, setFilterMeetingStatus] = useState('');
  const [filterTaskStatus, setFilterTaskStatus] = useState('');
  const [tab, setTab] = useState<TabKey>('gundem');

  const pageTitle = isManager ? 'Toplantı ve Gündem Takibi' : 'Toplantılarım';

  const loadDash = useCallback(async () => {
    setLoading(true);
    try {
      const [d, t] = await Promise.all([mtGetDashboard(), mtGetTypes()]);
      setDash(d);
      setTypes(t);
      if (isManager) {
        const [u, tpl, r] = await Promise.all([
          mtGetUsers().catch(() => []),
          mtGetTemplates().catch(() => []),
          mtGetReports().catch(() => null)
        ]);
        setUsers(u);
        setTemplates(tpl);
        setReports(r);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  const loadMeeting = useCallback(async (id: string) => {
    if (!id) {
      setBundle(null);
      return;
    }
    setLoading(true);
    try {
      setBundle(await mtGetMeeting(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toplantı açılamadı');
      setBundle(null);
      setParams((p) => {
        p.delete('id');
        return p;
      });
    } finally {
      setLoading(false);
    }
  }, [setParams]);

  useEffect(() => {
    void loadDash();
  }, [loadDash]);

  useEffect(() => {
    void loadMeeting(meetingId);
  }, [meetingId, loadMeeting]);

  const openMeeting = (id: string) => {
    setParams((p) => {
      p.set('id', id);
      return p;
    });
    setTab('gundem');
  };

  const closeDetail = () => {
    setParams((p) => {
      p.delete('id');
      return p;
    });
    setBundle(null);
    void loadDash();
  };

  const filteredMeetings = useMemo(() => {
    let list = dash?.meetings || [];
    if (filterType) list = list.filter((m) => m.meeting_type_id === filterType);
    if (filterMeetingStatus) list = list.filter((m) => m.status === filterMeetingStatus);
    if (q.trim()) {
      const s = q.trim().toLocaleLowerCase('tr-TR');
      list = list.filter(
        (m) =>
          m.title.toLocaleLowerCase('tr-TR').includes(s) ||
          String(m.description || '')
            .toLocaleLowerCase('tr-TR')
            .includes(s)
      );
    }
    return list;
  }, [dash, filterType, filterMeetingStatus, q]);

  const filteredTasks = useMemo(() => {
    let list = dash?.tasks || [];
    if (filterTaskStatus) list = list.filter((t) => t.status === filterTaskStatus);
    if (filterType) {
      const ids = new Set(
        (dash?.meetings || []).filter((m) => m.meeting_type_id === filterType).map((m) => m.id)
      );
      list = list.filter((t) => ids.has(t.meeting_id));
    }
    if (q.trim()) {
      const s = q.trim().toLocaleLowerCase('tr-TR');
      list = list.filter((t) => t.title.toLocaleLowerCase('tr-TR').includes(s));
    }
    return list;
  }, [dash, filterTaskStatus, filterType, q]);

  const kanbanCols = useMemo(() => {
    const cols: { key: string; label: string; statuses: string[]; color: string }[] = [
      { key: 'planned', label: 'Planlandı', statuses: ['todo'], color: 'border-violet-300' },
      { key: 'todo', label: 'Yapılacak', statuses: ['todo'], color: 'border-slate-300' },
      { key: 'doing', label: 'Devam Ediyor', statuses: ['in_progress'], color: 'border-sky-400' },
      { key: 'done', label: 'Tamamlandı', statuses: ['done'], color: 'border-emerald-400' },
      { key: 'late', label: 'Gecikti/Ertelendi', statuses: ['overdue', 'deferred'], color: 'border-orange-400' }
    ];
    // Planlandı sütunu: yaklaşan toplantılara bağlı yapılacak görevler
    return cols;
  }, []);

  const tasksForCol = (colKey: string) => {
    if (colKey === 'planned') {
      const upcomingIds = new Set((dash?.upcoming || []).map((m) => m.id));
      return filteredTasks.filter((t) => t.status === 'todo' && upcomingIds.has(t.meeting_id));
    }
    if (colKey === 'todo') {
      const upcomingIds = new Set((dash?.upcoming || []).map((m) => m.id));
      return filteredTasks.filter((t) => t.status === 'todo' && !upcomingIds.has(t.meeting_id));
    }
    const col = kanbanCols.find((c) => c.key === colKey);
    return filteredTasks.filter((t) => col?.statuses.includes(t.status));
  };

  const typeName = (m: MtMeeting) =>
    m.type?.name || m.mt_meeting_types?.name || types.find((t) => t.id === m.meeting_type_id)?.name || '—';

  const userName = (id?: string | null) => {
    if (!id) return '—';
    const u = users.find((x) => x.id === id);
    return u?.name || u?.email || id.slice(0, 8);
  };

  if (loading && !dash && !bundle) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (bundle) {
    return (
      <MeetingDetail
        bundle={bundle}
        isManager={isManager}
        users={users}
        meetings={dash?.meetings || []}
        currentUserId={String(effectiveUser?.id || '')}
        tab={tab}
        setTab={setTab}
        onBack={closeDetail}
        onReload={() => loadMeeting(bundle.meeting.id)}
        userName={userName}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Gündem, karar ve görev takibi — önceki toplantılardan devreden işler korunur.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadDash()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" /> Yenile
          </button>
          {isManager && (
            <>
              <button
                type="button"
                onClick={() => setShowReports((v) => !v)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                Raporlar
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" /> Yeni Toplantı
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Yaklaşan', value: dash?.upcoming?.length ?? 0, tone: 'text-violet-700' },
          { label: 'Bu ay yapılan', value: dash?.this_month ?? 0, tone: 'text-slate-800 dark:text-slate-100' },
          { label: 'Açık görev', value: dash?.open_tasks ?? 0, tone: 'text-sky-700' },
          { label: 'Geciken', value: dash?.overdue_tasks ?? 0, tone: 'text-red-700' },
          { label: 'Tamamlanan', value: dash?.done_tasks ?? 0, tone: 'text-emerald-700' },
          { label: 'Ertelenen gündem', value: dash?.deferred_agenda ?? 0, tone: 'text-orange-700' }
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="text-xs text-slate-500">{c.label}</div>
            <div className={`mt-1 text-2xl font-semibold ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {showReports && reports && isManager && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 print:border-0 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Rapor özeti</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>Toplantı sayısı: <strong>{String(reports.meeting_count ?? 0)}</strong></div>
            <div>Açık görev: <strong>{String(reports.open_tasks ?? 0)}</strong></div>
            <div>Tamamlanan: <strong>{String(reports.done_tasks ?? 0)}</strong></div>
            <div>Geciken: <strong className="text-red-600">{String(reports.overdue_tasks ?? 0)}</strong></div>
          </div>
          <div className="mt-4 space-y-2">
            {Object.entries((reports.by_type as Record<string, { name: string; total: number; planned: number; held: number }>) || {}).map(
              ([code, row]) => (
                <div key={code} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2 text-sm dark:border-slate-700">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-slate-600 dark:text-slate-400">
                    Toplam {row.total} · Planlı {row.planned} · Yapılan {row.held}
                  </span>
                </div>
              )
            )}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600"
          >
            Yazdır / PDF
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Toplantı veya görev ara…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="">Tüm türler</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={filterMeetingStatus}
          onChange={(e) => setFilterMeetingStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="">Toplantı durumu</option>
          {Object.entries(MEETING_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={filterTaskStatus}
          onChange={(e) => setFilterTaskStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="">Görev durumu</option>
          {Object.entries(TASK_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-600">
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            className={`px-2 py-2 ${viewMode === 'kanban' ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
            title="Kanban"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-2 py-2 ${viewMode === 'list' ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
            title="Liste"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
          <Calendar className="h-5 w-5" /> Toplantılar
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2 font-medium">Başlık</th>
                <th className="px-3 py-2 font-medium">Tür</th>
                <th className="px-3 py-2 font-medium">Tarih</th>
                <th className="px-3 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {filteredMeetings.map((m) => (
                <tr
                  key={m.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
                  onClick={() => openMeeting(m.id)}
                >
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{m.title}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{typeName(m)}</td>
                  <td className="px-3 py-2">{m.meeting_date}</td>
                  <td className="px-3 py-2">{MEETING_STATUS[m.status] || m.status}</td>
                </tr>
              ))}
              {!filteredMeetings.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                    Henüz toplantı yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
          <ClipboardList className="h-5 w-5" /> İş takibi
        </h2>
        {viewMode === 'kanban' ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {kanbanCols.map((col) => (
              <div
                key={col.key}
                className={`min-w-[220px] flex-1 rounded-xl border-t-4 ${col.color} border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-800/50`}
              >
                <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  <span>{col.label}</span>
                  <span>{tasksForCol(col.key).length}</span>
                </div>
                <div className="space-y-2">
                  {tasksForCol(col.key).map((t) => {
                    const meeting = (dash?.meetings || []).find((m) => m.id === t.meeting_id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => openMeeting(t.meeting_id)}
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm hover:border-indigo-300 dark:border-slate-600 dark:bg-slate-900"
                      >
                        <div className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-white">{t.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {meeting ? typeName(meeting) : '—'} · {meeting?.meeting_date || '—'}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${taskBadge(t.status)}`}>
                            {TASK_STATUS[t.status] || t.status}
                          </span>
                          {t.due_date && <span className="text-[10px] text-slate-500">Son: {t.due_date}</span>}
                          <span className="text-[10px] text-slate-500">{PRIORITY[t.priority] || t.priority}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80">
                <tr>
                  <th className="px-3 py-2">Görev</th>
                  <th className="px-3 py-2">Toplantı</th>
                  <th className="px-3 py-2">Son tarih</th>
                  <th className="px-3 py-2">Durum</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((t) => {
                  const meeting = (dash?.meetings || []).find((m) => m.id === t.meeting_id);
                  return (
                    <tr
                      key={t.id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700"
                      onClick={() => openMeeting(t.meeting_id)}
                    >
                      <td className="px-3 py-2 font-medium">{t.title}</td>
                      <td className="px-3 py-2">{meeting?.title || '—'}</td>
                      <td className="px-3 py-2">{t.due_date || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${taskBadge(t.status)}`}>
                          {TASK_STATUS[t.status] || t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!filteredTasks.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                      Görev bulunamadı.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showCreate && isManager && (
        <CreateMeetingModal
          types={types}
          users={users}
          templates={templates}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            void loadDash();
            openMeeting(id);
          }}
        />
      )}
    </div>
  );
}

function CreateMeetingModal({
  types,
  users,
  templates,
  onClose,
  onCreated
}: {
  types: MtMeetingType[];
  users: MtUser[];
  templates: MtTemplate[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState(types[0]?.id || '');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [manager, setManager] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [openToRole, setOpenToRole] = useState(false);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [reminder, setReminder] = useState('');
  const [status, setStatus] = useState('planned');
  const [paste, setPaste] = useState('');
  const [drafts, setDrafts] = useState<ParsedAgendaDraft[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tplId, setTplId] = useState('');

  const applyTemplate = () => {
    const t = templates.find((x) => x.id === tplId);
    if (!t) return;
    if (t.meeting_type_id) setTypeId(t.meeting_type_id);
    setDrafts(
      (t.agenda_json || []).map((a) => ({
        title: a.title,
        description: a.description || ''
      }))
    );
    setShowPreview(true);
    toast.success('Şablon gündemi yüklendi (karar/görev kopyalanmaz)');
  };

  const parsePaste = () => {
    const items = parseAgendaPasteText(paste);
    if (!items.length) {
      toast.error('Ayrıştırılacak madde bulunamadı');
      return;
    }
    setDrafts(items);
    setShowPreview(true);
  };

  const submit = async () => {
    if (!title.trim() || !date || !typeId) {
      toast.error('Başlık, tür ve tarih zorunlu');
      return;
    }
    setBusy(true);
    try {
      const bundle = await mtCreateMeeting({
        title: title.trim(),
        meeting_type_id: typeId,
        meeting_date: date,
        start_time: start || null,
        end_time: end || null,
        manager_user_id: manager || null,
        participant_user_ids: participants,
        open_to_role: openToRole,
        description: description || null,
        location_or_link: location || null,
        reminder_at: reminder || null,
        status,
        agenda_items: drafts
      });
      toast.success('Toplantı oluşturuldu');
      onCreated(bundle.meeting.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-4 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Yeni toplantı</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800">
            Kapat
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Başlık</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Tür</span>
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Durum</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
              {Object.entries(MEETING_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Tarih</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Başlangıç / Bitiş</span>
            <div className="flex gap-2">
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 dark:border-slate-600 dark:bg-slate-800" />
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 dark:border-slate-600 dark:bg-slate-800" />
            </div>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Yönetici</span>
            <select value={manager} onChange={(e) => setManager(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
              <option value="">Ben / varsayılan</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Hatırlatma</span>
            <input type="datetime-local" value={reminder} onChange={(e) => setReminder(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Bağlantı veya konum</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Açıklama</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={openToRole} onChange={(e) => setOpenToRole(e.target.checked)} />
            Bu roldeki herkese açık
          </label>
          {!openToRole && (
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">Katılımcılar (Ctrl ile çoklu seçim)</span>
              <select
                multiple
                value={participants}
                onChange={(e) =>
                  setParticipants(Array.from(e.target.selectedOptions).map((o) => o.value))
                }
                className="h-28 w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email} ({u.role})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {templates.length > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="block flex-1 text-sm">
              <span className="mb-1 block text-slate-600">Şablondan yükle</span>
              <select value={tplId} onChange={(e) => setTplId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
                <option value="">Seçin</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={applyTemplate} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600">
              Uygula
            </button>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Gündem Metnini Yapıştır
          </label>
          <p className="mb-1 text-xs text-slate-500">ChatGPT veya numaralı listeler — yapay zekâ zorunlu değil.</p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder={'1. Günlük raporların kontrolü\n2. Devamsızlıklar\n...'}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="button"
            onClick={parsePaste}
            className="mt-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white dark:bg-slate-600"
          >
            Ön izleme
          </button>
        </div>

        {showPreview && (
          <AgendaPreviewEditor drafts={drafts} setDrafts={setDrafts} />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-600">
            İptal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

function AgendaPreviewEditor({
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
  const mergeWithNext = (i: number) => {
    if (i >= drafts.length - 1) return;
    const next = [...drafts];
    next[i] = mergeAgendaDrafts(next[i], next[i + 1]);
    next.splice(i + 1, 1);
    setDrafts(next);
  };
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
      <div className="text-sm font-medium">Ön izleme — {drafts.length} madde</div>
      {drafts.map((d, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
          <div className="flex gap-2">
            <input
              value={d.title}
              onChange={(e) => {
                const next = [...drafts];
                next[i] = { ...d, title: e.target.value };
                setDrafts(next);
              }}
              className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
            <button type="button" onClick={() => move(i, -1)} className="p-1 text-slate-500" title="Yukarı">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => move(i, 1)} className="p-1 text-slate-500" title="Aşağı">
              <ChevronDown className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => mergeWithNext(i)} className="px-1 text-xs text-slate-600" title="Sonrakiyle birleştir">
              Birleştir
            </button>
            <button
              type="button"
              onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
              className="p-1 text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={d.description}
            onChange={(e) => {
              const next = [...drafts];
              next[i] = { ...d, description: e.target.value };
              setDrafts(next);
            }}
            rows={2}
            placeholder="Açıklama"
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setDrafts([...drafts, { title: 'Yeni madde', description: '' }])}
        className="text-sm text-indigo-700 dark:text-indigo-300"
      >
        + Madde ekle
      </button>
    </div>
  );
}

function MeetingDetail({
  bundle,
  isManager,
  users,
  meetings,
  currentUserId,
  tab,
  setTab,
  onBack,
  onReload,
  userName
}: {
  bundle: MtMeetingBundle;
  isManager: boolean;
  users: MtUser[];
  meetings: MtMeeting[];
  currentUserId: string;
  tab: TabKey;
  setTab: (t: TabKey) => void;
  onBack: () => void;
  onReload: () => void;
  userName: (id?: string | null) => string;
}) {
  const m = bundle.meeting;
  const discussed = bundle.agenda.filter((a) => a.status === 'discussed').length;
  const progress = bundle.agenda.length ? Math.round((discussed / bundle.agenda.length) * 100) : 0;
  const [paste, setPaste] = useState('');
  const [drafts, setDrafts] = useState<ParsedAgendaDraft[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [taskForm, setTaskForm] = useState<{ agendaId: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [carryTarget, setCarryTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'gundem', label: 'Gündem' },
    { key: 'kararlar', label: 'Alınan Kararlar' },
    { key: 'gorevler', label: 'Yapılacaklar' },
    { key: 'notlar', label: 'Toplantı Notları' },
    { key: 'dosyalar', label: 'Dosyalar' },
    { key: 'katilimcilar', label: 'Katılımcılar' },
    { key: 'gecmis', label: 'İşlem Geçmişi' }
  ];

  const closeMeeting = async (force = false) => {
    setBusy(true);
    try {
      await mtCloseMeeting(m.id, force);
      toast.success('Toplantı kapatıldı (açık görevler tamamlanmadı)');
      onReload();
    } catch (e) {
      const err = e as Error & { status?: number; warnings?: { type: string; title: string }[] };
      if (err.status === 409 && err.warnings?.length) {
        const msg = err.warnings.map((w) => w.title).slice(0, 8).join(', ');
        const ok = window.confirm(
          `Uyarılar var:\n${msg}\n\nYine de kapatılsın mı? Açık görevler tamamlanmış sayılmaz.`
        );
        if (ok) await closeMeeting(true);
      } else {
        toast.error(err.message || 'Kapatılamadı');
      }
    } finally {
      setBusy(false);
    }
  };

  const addPastedas = async () => {
    if (!drafts.length) return;
    setBusy(true);
    try {
      await mtAddAgenda(m.id, drafts);
      toast.success(`${drafts.length} gündem eklendi`);
      setShowPaste(false);
      setPaste('');
      setDrafts([]);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const saveAsTemplate = async () => {
    const name = window.prompt('Şablon adı:', `${m.title} şablonu`);
    if (!name) return;
    try {
      await mtSaveTemplate({
        name,
        meeting_type_id: m.meeting_type_id,
        agenda_json: bundle.agenda.map((a) => ({ title: a.title, description: a.description || '' }))
      });
      toast.success('Şablon kaydedildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şablon kaydedilemedi');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> Geri
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{m.title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {bundle.type?.name || '—'} · {m.meeting_date}
            {m.start_time ? ` ${String(m.start_time).slice(0, 5)}` : ''}
            {' · '}
            {MEETING_STATUS[m.status] || m.status}
          </p>
          {m.location_or_link && (
            <a href={m.location_or_link.startsWith('http') ? m.location_or_link : undefined} className="text-sm text-indigo-600" target="_blank" rel="noreferrer">
              {m.location_or_link}
            </a>
          )}
        </div>
        {isManager && m.status !== 'closed' && m.status !== 'cancelled' && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveAsTemplate()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600">
              Şablon kaydet
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void closeMeeting(false)}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white dark:bg-slate-600"
            >
              Toplantıyı Kapat
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm('Arşivlensin mi?')) return;
                await mtArchiveMeeting(m.id);
                toast.success('Arşivlendi');
                onBack();
              }}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"
            >
              Arşivle
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
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-3 py-2 text-sm ${
              tab === t.key
                ? 'border-b-2 border-indigo-600 font-medium text-indigo-700 dark:text-indigo-300'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gundem' && (
        <div className="space-y-3">
          {isManager && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowPaste((v) => !v)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600"
              >
                Gündem metni yapıştır
              </button>
            </div>
          )}
          {showPaste && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-600">
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={4}
                className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDrafts(parseAgendaPasteText(paste));
                  }}
                  className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
                >
                  Ön izleme
                </button>
                {drafts.length > 0 && (
                  <button type="button" disabled={busy} onClick={() => void addPastedas()} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white">
                    {drafts.length} maddeyi ekle
                  </button>
                )}
              </div>
              {drafts.length > 0 && <AgendaPreviewEditor drafts={drafts} setDrafts={setDrafts} />}
            </div>
          )}

          {bundle.agenda.map((a, idx) => (
            <AgendaCard
              key={a.id}
              item={a}
              index={idx}
              isManager={isManager}
              meetings={meetings}
              carryTarget={carryTarget}
              setCarryTarget={setCarryTarget}
              onOpenTask={() => setTaskForm({ agendaId: a.id })}
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
          {!bundle.agenda.length && <p className="text-sm text-slate-500">Gündem maddesi yok.</p>}
        </div>
      )}

      {tab === 'kararlar' && (
        <div className="space-y-2">
          {bundle.decisions.map((d) => (
            <div key={d.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="font-medium">{d.title}</div>
              {d.body && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{d.body}</p>}
            </div>
          ))}
          {bundle.agenda
            .filter((a) => a.decision_text)
            .map((a) => (
              <div key={`a-${a.id}`} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800">
                <div className="text-xs text-emerald-700">Gündem: {a.title}</div>
                <p className="mt-1 text-sm whitespace-pre-wrap">{a.decision_text}</p>
              </div>
            ))}
          {!bundle.decisions.length && !bundle.agenda.some((a) => a.decision_text) && (
            <p className="text-sm text-slate-500">Henüz karar yok.</p>
          )}
        </div>
      )}

      {tab === 'gorevler' && (
        <div className="space-y-2">
          {bundle.tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              agenda={bundle.agenda.find((a) => a.id === t.agenda_item_id)}
              meetingTitle={m.title}
              isManager={isManager}
              currentUserId={currentUserId}
              onReload={onReload}
              userName={userName}
              meetings={meetings}
            />
          ))}
          {!bundle.tasks.length && <p className="text-sm text-slate-500">Görev yok.</p>}
          {isManager && (
            <button
              type="button"
              onClick={() => setTaskForm({ agendaId: '' })}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
            >
              <Plus className="h-4 w-4" /> Görev oluştur
            </button>
          )}
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
            placeholder="Toplantı notu ekle…"
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

      {tab === 'dosyalar' && (
        <div className="space-y-2">
          {bundle.attachments.map((f) => (
            <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer" className="block text-sm text-indigo-600">
              {f.file_name}
            </a>
          ))}
          {!bundle.attachments.length && (
            <p className="text-sm text-slate-500">Dosya ekleri URL olarak kaydedilir (storage sonraki aşama).</p>
          )}
        </div>
      )}

      {tab === 'katilimcilar' && (
        <ul className="space-y-1 text-sm">
          {m.open_to_role && <li className="text-slate-600">Bu roldeki herkese açık</li>}
          {bundle.participants.map((p) => (
            <li key={p.id}>{userName(p.user_id)}</li>
          ))}
          {!bundle.participants.length && !m.open_to_role && <li className="text-slate-500">Katılımcı seçilmedi</li>}
        </ul>
      )}

      {tab === 'gecmis' && (
        <div className="space-y-2">
          {bundle.activity.map((log) => (
            <div key={log.id} className="rounded border border-slate-100 px-3 py-2 text-xs dark:border-slate-700">
              <div className="font-medium text-slate-800 dark:text-slate-200">
                {log.action} · {userName(log.actor_user_id)}
              </div>
              <div className="text-slate-500">{new Date(log.created_at).toLocaleString('tr-TR')}</div>
            </div>
          ))}
          {!bundle.activity.length && <p className="text-sm text-slate-500">Kayıt yok.</p>}
        </div>
      )}

      {taskForm && isManager && (
        <CreateTaskModal
          meetingId={m.id}
          agendaItemId={taskForm.agendaId || null}
          users={users}
          onClose={() => setTaskForm(null)}
          onCreated={() => {
            setTaskForm(null);
            onReload();
          }}
        />
      )}
    </div>
  );
}

function AgendaCard({
  item,
  index,
  isManager,
  meetings,
  carryTarget,
  setCarryTarget,
  onOpenTask,
  onReload,
  onMove
}: {
  item: MtAgendaItem;
  index: number;
  isManager: boolean;
  meetings: MtMeeting[];
  carryTarget: string;
  setCarryTarget: (v: string) => void;
  onOpenTask: () => void;
  onReload: () => void;
  onMove: (dir: -1 | 1) => Promise<void>;
}) {
  const [note, setNote] = useState(item.discussion_note || '');
  const [decision, setDecision] = useState(item.decision_text || '');
  const [status, setStatus] = useState(item.status);

  const save = async () => {
    try {
      await mtUpdateAgenda({
        id: item.id,
        discussion_note: note,
        decision_text: decision,
        status
      });
      if (decision.trim()) {
        await mtAddDecision({
          meeting_id: item.meeting_id,
          agenda_item_id: item.id,
          title: `Karar: ${item.title}`,
          body: decision
        }).catch(() => null);
      }
      toast.success('Gündem güncellendi');
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">#{index + 1}</span>
            <h3 className="font-semibold text-slate-900 dark:text-white">{item.title}</h3>
            {item.is_carried_forward && (
              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-800">
                Önceki Toplantıdan Devreden
              </span>
            )}
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${agendaBadge(item.status)}`}>
              {AGENDA_STATUS[item.status] || item.status}
            </span>
          </div>
          {item.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.description}</p>}
        </div>
        {isManager && (
          <div className="flex gap-1">
            <button type="button" onClick={() => void onMove(-1)} className="p-1 text-slate-500">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void onMove(1)} className="p-1 text-slate-500">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {isManager && (
        <div className="mt-3 grid gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
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
            placeholder="Toplantı notu"
            className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <textarea
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            rows={2}
            placeholder="Alınan karar"
            className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white">
              Kaydet
            </button>
            <button type="button" onClick={onOpenTask} className="rounded border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600">
              Yapılacak Görev Oluştur
            </button>
            <select
              value={carryTarget}
              onChange={(e) => setCarryTarget(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="">Sonraki toplantıya aktar…</option>
              {meetings
                .filter((x) => x.id !== item.meeting_id && ['draft', 'planned'].includes(x.status))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title} ({x.meeting_date})
                  </option>
                ))}
            </select>
            {carryTarget && (
              <button
                type="button"
                onClick={async () => {
                  await mtCarryForward({ target_meeting_id: carryTarget, agenda_item_id: item.id });
                  toast.success('Aktarıldı — eski bağlantı korundu');
                  setCarryTarget('');
                  onReload();
                }}
                className="rounded bg-orange-600 px-3 py-1.5 text-sm text-white"
              >
                Aktar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  agenda,
  meetingTitle,
  isManager,
  currentUserId,
  onReload,
  userName,
  meetings
}: {
  task: MtTask;
  agenda?: MtAgendaItem;
  meetingTitle: string;
  isManager: boolean;
  currentUserId: string;
  onReload: () => void;
  userName: (id?: string | null) => string;
  meetings: MtMeeting[];
}) {
  const assignees = task.assignees || task.mt_task_assignees || [];
  const isAssignee = assignees.some((a) => String(a.user_id) === String(currentUserId));
  const canStatus = isManager || isAssignee;
  const [carryTarget, setCarryTarget] = useState('');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-slate-900 dark:text-white">{task.title}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            Toplantı: {meetingTitle}
            {agenda ? ` · Gündem: ${agenda.title}` : ''}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${taskBadge(task.status)}`}>
              {TASK_STATUS[task.status] || task.status}
            </span>
            {task.due_date && <span className="text-[10px] text-slate-500">Son: {task.due_date}</span>}
            <span className="text-[10px] text-slate-500">
              Sorumlu: {assignees.map((a) => userName(a.user_id)).join(', ') || '—'}
            </span>
          </div>
        </div>
        {canStatus && (
          <select
            value={task.status}
            onChange={async (e) => {
              try {
                await mtUpdateTask({ id: task.id, status: e.target.value });
                toast.success('Durum güncellendi');
                onReload();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Güncellenemedi');
              }
            }}
            className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            {Object.entries(TASK_STATUS)
              .filter(([k]) => (isManager ? true : !['cancelled', 'overdue'].includes(k)))
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        )}
      </div>
      {isManager && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            value={carryTarget}
            onChange={(e) => setCarryTarget(e.target.value)}
            className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Sonraki toplantıya bağla…</option>
            {meetings
              .filter((x) => x.id !== task.meeting_id && ['draft', 'planned'].includes(x.status))
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
                await mtCarryForward({ target_meeting_id: carryTarget, task_id: task.id });
                toast.success('Görev bağlantısı korundu (kopyalanmadı)');
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
}

function CreateTaskModal({
  meetingId,
  agendaItemId,
  users,
  onClose,
  onCreated
}: {
  meetingId: string;
  agendaItemId: string | null;
  users: MtUser[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('normal');
  const [reviewer, setReviewer] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 dark:bg-slate-900">
        <h3 className="mb-3 text-lg font-semibold">Yapılacak Görev Oluştur</h3>
        {agendaItemId && (
          <p className="mb-2 flex items-center gap-1 text-xs text-slate-500">
            <AlertTriangle className="h-3 w-3" /> Gündem maddesinden — görüşüldü ≠ görev tamamlandı
          </p>
        )}
        <div className="space-y-2 text-sm">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Görev başlığı"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Açıklama"
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <select
            multiple
            value={assignees}
            onChange={(e) => setAssignees(Array.from(e.target.selectedOptions).map((o) => o.value))}
            className="h-24 w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 dark:border-slate-600 dark:bg-slate-800" />
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </div>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
            {Object.entries(PRIORITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={reviewer} onChange={(e) => setReviewer(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
            <option value="">Kontrol edecek admin</option>
            {users
              .filter((u) => ['admin', 'super_admin'].includes(String(u.role || '')))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm">
            İptal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!title.trim()) {
                toast.error('Başlık gerekli');
                return;
              }
              setBusy(true);
              try {
                await mtCreateTask({
                  meeting_id: meetingId,
                  agenda_item_id: agendaItemId || null,
                  title: title.trim(),
                  description,
                  assignee_user_ids: assignees,
                  start_date: start || null,
                  due_date: due || null,
                  priority,
                  reviewer_user_id: reviewer || null
                });
                toast.success('Görev oluşturuldu');
                onCreated();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Oluşturulamadı');
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
