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
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { userHasAnyRole } from '../config/rolePermissions';
import { parseAgendaPasteText, mergeAgendaDrafts, type ParsedAgendaDraft } from '../lib/meetingAgendaParse';
import MeetingDetailPanel from './meetingTracker/MeetingDetailPanel';
import CoachEnrollmentTrackerPanel from './meetingTracker/CoachEnrollmentTrackerPanel';
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

function roleLabel(role?: string | null) {
  const r = String(role || '').toLowerCase();
  if (r === 'super_admin') return 'Süper Admin';
  if (r === 'admin') return 'Yönetici';
  if (r === 'coach') return 'Koç';
  if (r === 'teacher') return 'Öğretmen';
  return r || '—';
}

function staffManagers(users: MtUser[]) {
  return users.filter((u) => ['super_admin', 'admin'].includes(String(u.role || '').toLowerCase()));
}

type PageTab = 'toplanti' | 'koc-takip';

function parsePageTab(raw: string | null): PageTab {
  if (raw === 'koc-takip') return 'koc-takip';
  return 'toplanti';
}

export default function MeetingTrackerPage() {
  const { effectiveUser } = useAuth();
  const isManager = userHasAnyRole(effectiveUser, ['super_admin', 'admin']);
  const [params, setParams] = useSearchParams();
  const meetingId = params.get('id') || '';
  const pageTab = parsePageTab(params.get('tab'));

  const setPageTab = useCallback(
    (next: PageTab) => {
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.delete('id');
        if (next === 'toplanti') n.delete('tab');
        else n.set('tab', next);
        return n;
      });
    },
    [setParams]
  );

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
      const [b, u] = await Promise.all([
        mtGetMeeting(id),
        isManager ? mtGetUsers().catch(() => []) : Promise.resolve([])
      ]);
      setBundle(b);
      if (u.length) setUsers(u);
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
  }, [setParams, isManager]);

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
      <MeetingDetailPanel
        bundle={bundle}
        isManager={isManager}
        users={users}
        meetings={dash?.meetings || []}
        currentUserId={String(effectiveUser?.id || '')}
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
            {pageTab === 'koc-takip'
              ? 'Koç bazlı yaz kayıt, geçiş, referans ve memnuniyet videosu takibi.'
              : 'Gündem, karar ve görev takibi — önceki toplantılardan devreden işler korunur.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pageTab === 'toplanti' ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setPageTab('toplanti')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
            pageTab === 'toplanti'
              ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Toplantılar
        </button>
        <button
          type="button"
          onClick={() => setPageTab('koc-takip')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
            pageTab === 'koc-takip'
              ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          Koç kayıt takibi
        </button>
      </div>

      {pageTab === 'koc-takip' ? (
        <CoachEnrollmentTrackerPanel
          isManager={isManager}
          institutionId={effectiveUser?.institutionId || null}
        />
      ) : null}

      {pageTab === 'toplanti' ? (
      <>
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
      </>
      ) : null}
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
            <span className="mb-1 block text-slate-600">Toplantı yöneticisi</span>
            <select value={manager} onChange={(e) => setManager(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
              <option value="">Varsayılan (siz)</option>
              {staffManagers(users).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email} ({roleLabel(u.role)})
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
            Koç/öğretmen toplantısı — ilgili role açık (katılımcı seçmeye gerek yok)
          </label>
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
            Gündem metnini yapıştır
          </label>
          <p className="mb-1 text-xs text-slate-500">Numaralı veya maddeli listeyi yapıştırın.</p>
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
