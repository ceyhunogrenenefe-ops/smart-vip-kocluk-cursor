import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Clapperboard, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { adVideosApi, type AdVideoMe, type AdVideoTask, type PersonOption } from '../features/adVideos/api';
import { fmtDateTime, fmtDay } from '../features/adVideos/format';
import TaskDetailModal, { StatusBadge } from '../features/adVideos/TaskDetailModal';
import TaskFormModal from '../features/adVideos/TaskFormModal';
import { AdVideoDailyView, AdVideoStatsView } from '../features/adVideos/AdVideoReports';
import AdVideoSettingsView from '../features/adVideos/AdVideoSettingsView';
import ReviewMontaj from '../features/adVideos/ReviewMontaj';

type Tab = 'gorevler' | 'gorevlerim' | 'ozet' | 'gunluk' | 'ayarlar' | 'inceleme';

const STATUS_OPTIONS: Array<[string, string]> = [
  ['', 'Tüm durumlar'],
  ['planned', 'Planlandı'],
  ['shot', 'Çekildi'],
  ['submitted', 'Ham Video Teslim Edildi'],
  ['revision_requested', 'Düzeltme İstendi'],
  ['approved', 'Onaylandı'],
  ['overdue', 'Gecikti']
];

const DATE_FIELDS: Array<[string, string]> = [
  ['due_at', 'Son teslim'],
  ['planned_shoot_at', 'Planlanan çekim'],
  ['actual_shoot_date', 'Gerçekleşen çekim'],
  ['first_submitted_at', 'İlk teslim'],
  ['approved_at', 'Onay']
];

const sel = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800';

function TaskList({ tasks, showTeacher, onOpen }: { tasks: AdVideoTask[]; showTeacher: boolean; onOpen: (id: string) => void }) {
  if (!tasks.length) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">Görev yok.</div>;
  }
  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onOpen(t.id)}
            className={`w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 active:scale-[0.995] ${
              t.is_overdue ? 'border-rose-200' : 'border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{t.title}</p>
                {showTeacher ? <p className="text-xs text-slate-500">{t.teacher_name}</p> : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <StatusBadge status={t.status} />
                {t.is_overdue ? <StatusBadge status="overdue" /> : null}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
              <span>
                <span className="text-slate-400">Çekim planı: </span>
                {fmtDateTime(t.planned_shoot_at)}
              </span>
              <span className={t.is_overdue ? 'font-semibold text-rose-700' : ''}>
                <span className="text-slate-400">Son teslim: </span>
                {fmtDateTime(t.due_at)}
              </span>
              <span>
                <span className="text-slate-400">Çekildi: </span>
                {fmtDay(t.actual_shoot_date)}
              </span>
              <span>
                <span className="text-slate-400">Son yükleme: </span>
                {fmtDateTime(t.last_uploaded_at)}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Reklam Videoları — öğretmen, yönetici ve kurgu ekibi tek sayfadan */
export default function AdVideosPage() {
  const [params, setParams] = useSearchParams();
  const [me, setMe] = useState<AdVideoMe | null>(null);
  const [tasks, setTasks] = useState<AdVideoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<PersonOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState({ teacher_id: '', status: '', date_field: 'due_at', from: '', to: '' });

  const reviewer = Boolean(me?.access.reviewer);
  const manager = Boolean(me?.access.manager);
  const tabParam = params.get('sekme') as Tab | null;
  const tab: Tab = useMemo(() => {
    if (!me) return 'gorevler';
    if (tabParam === 'inceleme') return 'inceleme';
    if (!reviewer) return 'gorevlerim';
    if (tabParam === 'ayarlar' && !manager) return 'gorevler';
    if (tabParam === 'gorevlerim' && !me.access.has_tasks) return 'gorevler';
    return tabParam && ['gorevler', 'gorevlerim', 'ozet', 'gunluk', 'ayarlar', 'inceleme'].includes(tabParam) ? tabParam : 'gorevler';
  }, [me, reviewer, manager, tabParam]);

  const openId = params.get('gorev');
  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: k === 'gorev' ? false : true });
  };

  const loadMe = useCallback(() => adVideosApi.me().then(setMe).catch((e) => toast.error(e.message)), []);

  const loadTasks = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      const mine = tab === 'gorevlerim' || !reviewer;
      const r = await adVideosApi.list(mine ? { mine: '1' } : { ...filters });
      setTasks(r.tasks);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Görevler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [me, tab, reviewer, filters]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (tab === 'gorevler' || tab === 'gorevlerim') void loadTasks();
  }, [tab, loadTasks]);

  useEffect(() => {
    if (manager) adVideosApi.teachers().then((r) => setTeachers(r.teachers)).catch(() => undefined);
  }, [manager]);

  const counts = useMemo(() => {
    const c = { open: 0, overdue: 0, review: 0, revision: 0 };
    for (const t of tasks) {
      if (t.is_overdue) c.overdue += 1;
      if (t.status === 'submitted') c.review += 1;
      if (t.status === 'revision_requested') c.revision += 1;
      if (['planned', 'shot', 'revision_requested'].includes(t.status)) c.open += 1;
    }
    return c;
  }, [tasks]);

  const tabs: Array<[Tab, string]> = reviewer
    ? [
        ['gorevler', 'Görevler'],
        ...(me?.access.has_tasks ? ([['gorevlerim', 'Görevlerim']] as Array<[Tab, string]>) : []),
        ['inceleme', 'İncelemedeki Montajlar'],
        ['ozet', 'Öğretmen özeti'],
        ['gunluk', 'Günlük özet'],
        ...(manager ? ([['ayarlar', 'Ayarlar']] as Array<[Tab, string]>) : [])
      ]
    : [
        ['gorevlerim', 'Görevlerim'],
        ['inceleme', 'İncelemedeki Montajlar']
      ];

  if (!me) {
    return (
      <div className="flex justify-center py-20 text-slate-400">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-4 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Clapperboard className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Reklam Videoları</h1>
            <p className="text-xs text-slate-500">
              {reviewer ? 'Görev atama, çekim ve teslim takibi, kurgu incelemesi' : 'Size atanan reklam videosu görevleri'}
            </p>
          </div>
        </div>
        {manager ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Görev ata
          </button>
        ) : null}
      </div>

      {!me.upload.enabled ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Kurumsal Paylaşılan Drive hazır değil. Yeni videolar yüklenemez; kişisel Drive bağlantısı kabul edilmez.
          {me.upload.credentials === false ? ' Sunucuda hizmet hesabı anahtarı yok.' : ''}
          {me.upload.folder === false ? ' Hedef klasör kimliği girilmemiş.' : ''}
          {me.upload.shared_drive === false ? ' Paylaşılan Drive kimliği girilmemiş.' : ''}
          {me.upload.credentials && me.upload.folder && me.upload.shared_drive && me.upload.enabled_flag === false ? ' Yükleme ayarı kapalı.' : ''}
        </div>
      ) : null}

      {tabs.length ? (
        <div className="-mx-3 overflow-x-auto px-3 print:hidden">
          <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
            {tabs.map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setParam('sekme', k === 'gorevler' ? null : k)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'gorevler' || tab === 'gorevlerim' ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Açık', counts.open, 'text-slate-900'],
              ['Geciken', counts.overdue, 'text-rose-700'],
              ['İnceleme bekleyen', counts.review, 'text-indigo-700'],
              ['Düzeltme istenen', counts.revision, 'text-amber-700']
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${c}`}>{v}</p>
              </div>
            ))}
          </div>

          {tab === 'gorevler' && reviewer ? (
            <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
              {manager || teachers.length ? (
                <select className={sel} value={filters.teacher_id} onChange={(e) => setFilters({ ...filters, teacher_id: e.target.value })} aria-label="Öğretmen">
                  <option value="">Tüm öğretmenler</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <select className={sel} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Durum">
                {STATUS_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select className={sel} value={filters.date_field} onChange={(e) => setFilters({ ...filters, date_field: e.target.value })} aria-label="Tarih alanı">
                {DATE_FIELDS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <CalendarClock className="h-4 w-4" />
                <input type="date" className={sel} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label="Başlangıç" />
              </label>
              <span className="text-slate-400">–</span>
              <input type="date" className={sel} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label="Bitiş" />
              <button
                type="button"
                onClick={() => setFilters({ teacher_id: '', status: '', date_field: 'due_at', from: '', to: '' })}
                className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Temizle
              </button>
              <button type="button" onClick={() => void loadTasks()} className="ml-auto rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Yenile">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-12 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <TaskList tasks={tasks} showTeacher={tab === 'gorevler' && reviewer} onOpen={(id) => setParam('gorev', id)} />
          )}
        </>
      ) : null}

      {tab === 'inceleme' ? <ReviewMontaj focusId={params.get('montaj')} /> : null}
      {tab === 'ozet' ? <AdVideoStatsView onOpen={(id) => setParam('gorev', id)} /> : null}
      {tab === 'gunluk' ? <AdVideoDailyView onOpen={(id) => setParam('gorev', id)} initialDate={params.get('tarih') || undefined} /> : null}
      {tab === 'ayarlar' && manager ? <AdVideoSettingsView onSaved={() => void loadMe()} /> : null}

      <TaskDetailModal taskId={openId} me={me} onClose={() => setParam('gorev', null)} onChanged={() => void loadTasks()} />
      {manager ? <TaskFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => void loadTasks()} /> : null}
    </div>
  );
}
