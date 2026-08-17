import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileSpreadsheet,
  Kanban,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Download,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  rtListLeads,
  rtGetDashboard,
  rtCreateLead,
  rtCheckDuplicates,
  rtExport,
  rtImportPreview,
  rtImportCommit,
  rtBulk,
  rtListCoaches,
  rtLookupPhone,
  type RegLead,
  type RegDashboard,
  type RegCoach
} from '../../lib/registrationTrackingApi';
import {
  GRADE_PROGRAMS,
  GRADE_LABEL,
  STAGE_LABELS,
  KANBAN_STAGES
} from '../../lib/registrationTrackingConfig';
import RegLeadCard from './registrationTracking/RegLeadCard';
import RegLeadDrawer from './registrationTracking/RegLeadDrawer';

type ViewMode = 'excel' | 'kanban' | 'list';

type Props = {
  isManager: boolean;
  institutionId: string | null;
};

function useDebouncedValue<T>(value: T, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function RegistrationTrackingPanel({ isManager, institutionId }: Props) {
  const [params, setParams] = useSearchParams();
  const viewMode = (params.get('rt_view') as ViewMode) || 'excel';
  const quickFilter = params.get('rt_quick') || '';

  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<RegLead[]>([]);
  const [dash, setDash] = useState<RegDashboard | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(params.get('rt_lead'));
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState(params.get('rt_search') || '');
  const debouncedSearch = useDebouncedValue(search);
  const includeLost = params.get('rt_lost') === '1';
  const coachId = params.get('rt_coach') || '';
  const dateFrom = params.get('rt_from') || '';
  const dateTo = params.get('rt_to') || '';
  const [coaches, setCoaches] = useState<RegCoach[]>([]);

  const setViewMode = (v: ViewMode) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (v === 'excel') n.delete('rt_view');
      else n.set('rt_view', v);
      return n;
    });
  };

  const setQuickFilter = (q: string) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (!q) n.delete('rt_quick');
      else n.set('rt_quick', q);
      return n;
    });
  };

  const buildQuery = useCallback(() => {
    const q: Record<string, string> = {
      page: '1',
      page_size: '500',
      include_lost: includeLost ? '1' : '0'
    };
    if (debouncedSearch) q.search = debouncedSearch;
    if (quickFilter === 'overdue') q.overdue = '1';
    if (quickFilter === 'today') {
      const d = new Date();
      const ymd = d.toISOString().slice(0, 10);
      q.next_action_from = `${ymd}T00:00:00.000Z`;
      q.next_action_to = `${ymd}T23:59:59.999Z`;
    }
    if (quickFilter === 'payment') q.payment_pending = '1';
    if (quickFilter === 'confirmed') q.primary_status = 'confirmed';
    if (quickFilter === 'tracking') q.primary_status = 'tracking';
    if (coachId) q.coach_id = coachId;
    if (dateFrom) q.date_from = dateFrom;
    if (dateTo) q.date_to = dateTo;
    return q;
  }, [debouncedSearch, includeLost, quickFilter, coachId, dateFrom, dateTo]);

  const reload = useCallback(async () => {
    if (!institutionId && !isManager) return;
    setLoading(true);
    try {
      const query = buildQuery();
      const [listRes, dashRes] = await Promise.all([rtListLeads(query), rtGetDashboard(query)]);
      setLeads(listRes.items || []);
      setDash(dashRes.data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Veri yüklenemedi';
      if (/table_missing|henüz kurulmadı/i.test(msg)) {
        toast.error('Kayıt Takibi tabloları henüz kurulmadı. SQL migration çalıştırın.');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [buildQuery, institutionId, isManager]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    rtListCoaches()
      .then((r) => setCoaches(r.data || []))
      .catch(() => setCoaches([]));
  }, [institutionId]);

  useEffect(() => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (debouncedSearch) n.set('rt_search', debouncedSearch);
      else n.delete('rt_search');
      return n;
    });
  }, [debouncedSearch, setParams]);

  const confirmedByGrade = useMemo(() => {
    const map = new Map<string, RegLead[]>();
    for (const g of GRADE_PROGRAMS) map.set(g.code, []);
    for (const l of leads) {
      if (l.primary_status !== 'confirmed') continue;
      const arr = map.get(l.grade_program) || [];
      arr.push(l);
      map.set(l.grade_program, arr);
    }
    return map;
  }, [leads]);

  const trackingByGrade = useMemo(() => {
    const map = new Map<string, RegLead[]>();
    for (const g of GRADE_PROGRAMS) map.set(g.code, []);
    for (const l of leads) {
      if (l.primary_status !== 'tracking') continue;
      const arr = map.get(l.grade_program) || [];
      arr.push(l);
      map.set(l.grade_program, arr);
    }
    return map;
  }, [leads]);

  const openDrawer = (id: string) => {
    setDrawerId(id);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('rt_lead', id);
      return n;
    });
  };

  const closeDrawer = () => {
    setDrawerId(null);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.delete('rt_lead');
      return n;
    });
  };

  const handleExport = async () => {
    try {
      const { rows } = await rtExport(buildQuery());
      const ws = XLSX.utils.json_to_sheet(
        rows.map((r) => ({
          'Öğrenci': r.full_name,
          'Veli': r.parent_full_name,
          'Telefon': r.phone,
          'Program': GRADE_LABEL[r.grade_program] || r.grade_program,
          'Durum': r.primary_status,
          'Aşama': STAGE_LABELS[r.stage],
          'Sonraki işlem': r.next_action_at
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Kayıt Takibi');
      XLSX.writeFile(wb, `kayit-takibi-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Excel indirildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dışa aktarılamadı');
    }
  };

  const handleDragStart = (lead: RegLead) => (e: React.DragEvent) => {
    e.dataTransfer.setData('lead_id', lead.id);
    e.dataTransfer.setData('from_status', lead.primary_status);
  };

  const handleDropConfirmed = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('lead_id');
    const from = e.dataTransfer.getData('from_status');
    if (id && from === 'tracking') {
      openDrawer(id);
      toast.info('Kesin kayıt için modal açıldı');
    }
  };

  return (
    <div className="space-y-4">
      {/* Dashboard */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5 lg:grid-cols-10">
        {[
          { label: 'Takipte', value: dash?.total_tracking, tone: 'text-violet-700' },
          { label: 'Kesin kayıt', value: dash?.total_confirmed, tone: 'text-emerald-700' },
          { label: 'Bu hafta aday', value: dash?.new_this_week, tone: 'text-sky-700' },
          { label: 'Haftalık kesin', value: dash?.confirmed_this_week, tone: 'text-emerald-600' },
          { label: 'Aylık kesin', value: dash?.confirmed_this_month, tone: 'text-emerald-600' },
          { label: 'Ödeme bekleyen', value: dash?.payment_pending, tone: 'text-violet-700' },
          { label: 'Bugün aranacak', value: dash?.call_today, tone: 'text-indigo-700' },
          { label: 'Gecikmiş', value: dash?.overdue, tone: 'text-red-700' },
          { label: 'Olumsuz', value: dash?.lost_count, tone: 'text-slate-600' },
          { label: 'Dönüşüm %', value: dash?.conversion_rate, tone: 'text-amber-700' }
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="text-[10px] text-slate-500 leading-tight">{c.label}</div>
            <div className={`text-xl font-semibold ${c.tone}`}>{c.value ?? '—'}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800"
            placeholder="Öğrenci, veli, telefon ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-600">
          {(
            [
              ['excel', FileSpreadsheet, 'Excel'],
              ['kanban', Kanban, 'Kanban'],
              ['list', List, 'Liste']
            ] as const
          ).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                viewMode === mode ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50' : 'text-slate-600'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {[
            ['', 'Tümü'],
            ['today', 'Bugün'],
            ['overdue', 'Gecikmiş'],
            ['payment', 'Ödeme bekleyen'],
            ['confirmed', 'Kesin kayıt']
          ].map(([k, label]) => (
            <button
              key={k || 'all'}
              type="button"
              onClick={() => setQuickFilter(k)}
              className={`rounded-full px-2.5 py-1 text-xs ${
                quickFilter === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setParams((p) => {
                const n = new URLSearchParams(p);
                if (includeLost) n.delete('rt_lost');
                else n.set('rt_lost', '1');
                return n;
              })
            }
            className={`rounded-full px-2.5 py-1 text-xs ${includeLost ? 'bg-slate-700 text-white' : 'bg-slate-100'}`}
          >
            Arşiv/Olumsuz
          </button>
        </div>

        <select
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
          value={coachId}
          onChange={(e) =>
            setParams((p) => {
              const n = new URLSearchParams(p);
              if (e.target.value) n.set('rt_coach', e.target.value);
              else n.delete('rt_coach');
              return n;
            })
          }
        >
          <option value="">Koç: Tümü</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          Tarih
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
            value={dateFrom}
            onChange={(e) =>
              setParams((p) => {
                const n = new URLSearchParams(p);
                if (e.target.value) n.set('rt_from', e.target.value);
                else n.delete('rt_from');
                return n;
              })
            }
          />
          <span>—</span>
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
            value={dateTo}
            onChange={(e) =>
              setParams((p) => {
                const n = new URLSearchParams(p);
                if (e.target.value) n.set('rt_to', e.target.value);
                else n.delete('rt_to');
                return n;
              })
            }
          />
        </label>

        <button type="button" onClick={reload} className="rounded-lg border p-2 hover:bg-slate-50 dark:border-slate-600">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {isManager && (
          <>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" /> Yeni aday
            </button>
            <button type="button" onClick={() => setShowImport(true)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
              <Upload className="h-4 w-4" /> Excel'den Aktar
            </button>
            <button type="button" onClick={handleExport} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
              <Download className="h-4 w-4" /> Dışa Aktar
            </button>
          </>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        </div>
      )}

      {!loading && viewMode === 'excel' && (
        <ExcelView
          confirmedByGrade={confirmedByGrade}
          trackingByGrade={trackingByGrade}
          selected={selected}
          onSelect={(id, checked) => {
            setSelected((s) => {
              const n = new Set(s);
              if (checked) n.add(id);
              else n.delete(id);
              return n;
            });
          }}
          onOpen={openDrawer}
          onDragStart={handleDragStart}
          onDropConfirmed={handleDropConfirmed}
        />
      )}

      {!loading && viewMode === 'kanban' && (
        <KanbanView leads={leads.filter((l) => l.primary_status === 'tracking')} onOpen={openDrawer} />
      )}

      {!loading && viewMode === 'list' && (
        <ListView
          leads={leads}
          selected={selected}
          onSelect={(id, checked) => {
            setSelected((s) => {
              const n = new Set(s);
              if (checked) n.add(id);
              else n.delete(id);
              return n;
            });
          }}
          onOpen={openDrawer}
        />
      )}

      {drawerId && (
        <RegLeadDrawer
          leadId={drawerId}
          isManager={isManager}
          onClose={closeDrawer}
          onUpdated={reload}
        />
      )}

      {showCreate && (
        <CreateLeadModal
          coaches={coaches}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {showImport && (
        <ImportWizard
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function ExcelView({
  confirmedByGrade,
  trackingByGrade,
  selected,
  onSelect,
  onOpen,
  onDragStart,
  onDropConfirmed
}: {
  confirmedByGrade: Map<string, RegLead[]>;
  trackingByGrade: Map<string, RegLead[]>;
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (id: string) => void;
  onDragStart: (lead: RegLead) => (e: React.DragEvent) => void;
  onDropConfirmed: (e: React.DragEvent) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <SectionBlock
        title="KESİN KAYIT"
        tone="bg-emerald-600 text-white"
        onDrop={onDropConfirmed}
      >
        <GradeColumns
          getLeads={(code) => confirmedByGrade.get(code) || []}
          selected={selected}
          onSelect={onSelect}
          onOpen={onOpen}
          draggable={false}
        />
      </SectionBlock>
      <SectionBlock title="TAKİP" tone="bg-violet-600 text-white">
        <GradeColumns
          getLeads={(code) => trackingByGrade.get(code) || []}
          selected={selected}
          onSelect={onSelect}
          onOpen={onOpen}
          draggable
          onDragStart={onDragStart}
        />
      </SectionBlock>
    </div>
  );
}

function SectionBlock({
  title,
  tone,
  children,
  onDrop
}: {
  title: string;
  tone: string;
  children: React.ReactNode;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <div>
      <div
        className={`sticky left-0 z-10 px-4 py-2 text-sm font-bold tracking-wide ${tone}`}
        onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
        onDrop={onDrop}
      >
        {title}
      </div>
      <div className="min-w-max p-3">{children}</div>
    </div>
  );
}

function GradeColumns({
  getLeads,
  selected,
  onSelect,
  onOpen,
  draggable,
  onDragStart
}: {
  getLeads: (code: string) => RegLead[];
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (id: string) => void;
  draggable?: boolean;
  onDragStart?: (lead: RegLead) => (e: React.DragEvent) => void;
}) {
  return (
    <div className="flex gap-3">
      {GRADE_PROGRAMS.map((g) => {
        const items = getLeads(g.code);
        return (
          <div key={g.code} className="w-52 shrink-0">
            <div className="sticky top-0 z-[5] mb-2 rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-semibold dark:bg-slate-800">
              {g.label}
              <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] dark:bg-slate-900">
                {items.length}
              </span>
            </div>
            <div className="space-y-2 min-h-[80px]">
              {items.length === 0 && (
                <p className="text-center text-[10px] text-slate-400 py-4">Boş</p>
              )}
              {items.map((l) => (
                <RegLeadCard
                  key={l.id}
                  lead={l}
                  selected={selected.has(l.id)}
                  onSelect={onSelect}
                  onClick={() => onOpen(l.id)}
                  draggable={draggable}
                  onDragStart={onDragStart?.(l)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanView({ leads, onOpen }: { leads: RegLead[]; onOpen: (id: string) => void }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {KANBAN_STAGES.map((stage) => {
        const col = leads.filter((l) => l.stage === stage);
        return (
          <div key={stage} className="w-64 shrink-0 rounded-xl border border-slate-200 bg-slate-50/50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              {STAGE_LABELS[stage]}
              <span className="ml-1 text-slate-400">({col.length})</span>
            </div>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {col.map((l) => (
                <RegLeadCard key={l.id} lead={l} onClick={() => onOpen(l.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({
  leads,
  selected,
  onSelect,
  onOpen
}: {
  leads: RegLead[];
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="p-2 w-8" />
            <th className="p-2 text-left">Öğrenci</th>
            <th className="p-2 text-left">Program</th>
            <th className="p-2 text-left">Durum</th>
            <th className="p-2 text-left">Aşama</th>
            <th className="p-2 text-left">Sıcaklık</th>
            <th className="p-2 text-left">Sonraki işlem</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr
              key={l.id}
              className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50 cursor-pointer"
              onClick={() => onOpen(l.id)}
            >
              <td className="p-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(l.id)}
                  onChange={(e) => onSelect(l.id, e.target.checked)}
                />
              </td>
              <td className="p-2 font-medium">{l.full_name}</td>
              <td className="p-2">{GRADE_LABEL[l.grade_program]}</td>
              <td className="p-2">{l.primary_status}</td>
              <td className="p-2">{STAGE_LABELS[l.stage]}</td>
              <td className="p-2">{l.temperature}</td>
              <td className="p-2 text-xs">{l.next_action_at?.slice(0, 16) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {leads.length === 0 && (
        <p className="p-8 text-center text-slate-500">Kayıt adayı bulunamadı.</p>
      )}
    </div>
  );
}

function CreateLeadModal({
  coaches,
  onClose,
  onCreated
}: {
  coaches: RegCoach[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    full_name: '',
    parent_full_name: '',
    phone: '',
    grade_program: 'lgs',
    temperature: 'warm',
    source: '',
    notes: '',
    primary_status: '' as '' | 'tracking' | 'confirmed',
    assigned_user_id: ''
  });
  const [dupes, setDupes] = useState<RegLead[]>([]);
  const [busy, setBusy] = useState(false);
  const [coachHint, setCoachHint] = useState('');

  const checkDup = async () => {
    try {
      const { duplicates } = await rtCheckDuplicates(form);
      setDupes(duplicates || []);
      if (duplicates?.length) toast.warning(`${duplicates.length} benzer kayıt bulundu`);
    } catch {
      /* ignore */
    }
  };

  const lookupPhone = async () => {
    const phone = form.phone.trim();
    if (!phone) {
      setCoachHint('');
      return;
    }
    try {
      const { data } = await rtLookupPhone(phone);
      if (data?.coach?.id) {
        setForm((f) => ({
          ...f,
          assigned_user_id: data.coach!.id,
          parent_full_name: f.parent_full_name || data.parent_full_name || ''
        }));
        setCoachHint(`Sistemde kayıtlı koç: ${data.coach.name}`);
        toast.success(`Koç bulundu: ${data.coach.name}`);
      } else {
        setCoachHint('Bu telefonla eşleşen koç bulunamadı');
      }
    } catch {
      setCoachHint('');
    }
    await checkDup();
  };

  const submit = async (force = false) => {
    if (!form.full_name.trim()) {
      toast.error('Öğrenci adı zorunlu');
      return;
    }
    if (!form.primary_status) {
      toast.error('Kesin kayıt mı takip mi seçin');
      return;
    }
    if (dupes.length && !force) {
      toast.error('Mükerrer kayıt uyarısı — "Yine de oluştur" ile devam edin');
      return;
    }
    setBusy(true);
    try {
      await rtCreateLead({
        ...form,
        full_name: form.full_name,
        assigned_user_id: form.assigned_user_id || null
      });
      toast.success(form.primary_status === 'confirmed' ? 'Kesin kayıt eklendi' : 'Takip adayı oluşturuldu');
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 dark:bg-slate-900">
        <h3 className="text-lg font-semibold">Yeni Kayıt Adayı</h3>
        <div className="mt-3 space-y-2 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Kayıt türü *</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, primary_status: 'confirmed' })}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  form.primary_status === 'confirmed'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 dark:border-slate-600'
                }`}
              >
                Kesin kayıt
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, primary_status: 'tracking' })}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  form.primary_status === 'tracking'
                    ? 'border-violet-600 bg-violet-50 text-violet-800'
                    : 'border-slate-200 dark:border-slate-600'
                }`}
              >
                Takip
              </button>
            </div>
          </div>
          <input
            placeholder="Öğrenci adı soyadı *"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            onBlur={checkDup}
          />
          <input
            placeholder="Veli adı soyadı"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.parent_full_name}
            onChange={(e) => setForm({ ...form, parent_full_name: e.target.value })}
          />
          <input
            placeholder="Veli telefonu"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            onBlur={lookupPhone}
          />
          {coachHint && <p className="text-xs text-indigo-700 dark:text-indigo-300">{coachHint}</p>}
          <select
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.assigned_user_id}
            onChange={(e) => setForm({ ...form, assigned_user_id: e.target.value })}
          >
            <option value="">Koç seçin (opsiyonel)</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.grade_program}
            onChange={(e) => setForm({ ...form, grade_program: e.target.value })}
          >
            {GRADE_PROGRAMS.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        {dupes.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:bg-amber-950/30">
            <p className="font-semibold text-amber-900">Benzer kayıtlar:</p>
            <ul className="mt-1 list-disc pl-4">
              {dupes.map((d) => (
                <li key={d.id}>
                  {d.full_name} — {GRADE_LABEL[d.grade_program]} ({d.primary_status})
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            İptal
          </button>
          {dupes.length > 0 && (
            <button type="button" disabled={busy} onClick={() => submit(true)} className="rounded-lg border px-4 py-2 text-sm">
              Yine de oluştur
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => submit(false)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">
            Oluştur
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const parseFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];

    // Yatay Excel düzeni algılama (KESİN KAYIT / TAKİP)
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][];
    const parsed: Array<Record<string, unknown>> = [];
    let section: 'confirmed' | 'tracking' = 'tracking';

    for (const row of matrix) {
      const first = String(row[0] || '').trim().toLocaleUpperCase('tr-TR');
      if (first.includes('KESİN') || first.includes('KESIN')) {
        section = 'confirmed';
        continue;
      }
      if (first.includes('TAKİP') || first.includes('TAKIP')) {
        section = 'tracking';
        continue;
      }

      // Başlık satırı: sınıf isimleri
      const headerLike = row.some((c) =>
        /sınıf|lgs|yks|yös|özel/i.test(String(c))
      );
      if (headerLike && row[0] === '') continue;

      for (let col = 0; col < row.length; col++) {
        const cell = String(row[col] || '').trim();
        if (!cell || cell.length < 2) continue;
        const gradeHeader = matrix.find((r) => /sınıf|lgs|yks|yös|özel/i.test(String(r[col] || '')));
        const gradeLabel = gradeHeader ? String(gradeHeader[col]) : '';
        if (!gradeLabel && col === 0) continue;
        parsed.push({
          student_name: cell,
          grade_program: gradeLabel || 'lgs',
          primary_status: section === 'confirmed' ? 'confirmed' : 'tracking',
          source: 'excel_import'
        });
      }
    }

    if (parsed.length === 0) {
      // Standart satır bazlı
      const std = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      setRows(std);
    } else {
      setRows(parsed);
    }
    setStep(2);
  };

  const runPreview = async () => {
    setBusy(true);
    try {
      const { data } = await rtImportPreview({ rows, file_name: 'upload.xlsx', import_type: 'excel_horizontal' });
      setPreview(data);
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ön izleme başarısız');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview?.import_log_id) return;
    setBusy(true);
    try {
      const result = await rtImportCommit({
        import_log_id: preview.import_log_id,
        skip_duplicates: true
      });
      toast.success(`Aktarım: ${JSON.stringify(result.data || result)}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aktarım başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 dark:bg-slate-900">
        <h3 className="text-lg font-semibold">Excel'den Aktar</h3>
        <p className="text-xs text-slate-500">Adım {step}/3</p>

        {step === 1 && (
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="mt-4 w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) parseFile(f);
            }}
          />
        )}

        {step === 2 && (
          <div className="mt-4">
            <p className="text-sm">{rows.length} satır/hücre okundu.</p>
            <button type="button" disabled={busy} onClick={runPreview} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">
              Ön izleme
            </button>
          </div>
        )}

        {step === 3 && preview && (
          <div className="mt-4 text-sm">
            <pre className="max-h-48 overflow-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-800">
              {JSON.stringify(preview.summary, null, 2)}
            </pre>
            <button type="button" disabled={busy} onClick={commit} className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">
              Onayla ve aktar
            </button>
          </div>
        )}

        <button type="button" onClick={onClose} className="mt-4 text-sm text-slate-500 hover:underline">
          Kapat
        </button>
      </div>
    </div>
  );
}
