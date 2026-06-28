import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/session';
import { mergeClassSlotsIntoPlanner, type PlannerState as FullPlannerState } from '../lib/classSlotsToPlanner';
import { PLANNER_CURRICULUM_PRESETS, PLANNER_POOL_SUBJECTS } from '../lib/plannerTopicPool';

type PlannerTeacher = { id: string; name: string; email?: string; branches?: string[] };
type PlannerGroup = { id: string; name: string };
type PlannerState = {
  groups?: PlannerGroup[];
  days?: string[];
  [key: string]: unknown;
};

type PlanRow = {
  id: string;
  name: string;
  institution_id: string;
  updated_at?: string;
};

type ClassRow = {
  id: string;
  name: string;
  class_level?: string | null;
  branch?: string | null;
};

type TeacherOption = { id: string; name: string; email?: string };

type ExportResult = {
  ok: boolean;
  partial?: boolean;
  message: string;
  slots_created?: number;
  sessions_created?: number;
  created?: number;
  date_from?: string;
  date_to?: string;
  class_id?: string;
  class_name?: string;
  skipped_descriptions?: string[];
  session_skipped_descriptions?: string[];
  errors?: string[];
};

const IFRAME_SRC = '/ders-program-planner/index.html';

const API_ERROR_LABELS: Record<string, string> = {
  date_range_required: 'Başlangıç ve bitiş tarihi zorunludur.',
  date_range_invalid: 'Bitiş tarihi başlangıçtan önce olamaz.',
  class_id_and_group_id_required: 'Grup ve hedef sınıf seçin.',
  class_not_found: 'Seçilen sınıf bulunamadı.',
  class_institution_mismatch:
    'Seçilen sınıf bu kuruma ait değil. Üst menüden doğru kurumu seçin veya Canlı Grup Dersi\'nde sınıfın öğrenci atamasını kontrol edin.',
  planner_json_required: 'Planlayıcı verisi okunamadı.',
  institution_required: 'Kurum seçili değil.',
  export_failed: 'Aktarım sırasında hata oluştu.'
};

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultDateRange(): { from: string; to: string } {
  const today = new Date();
  const from = formatYmd(today);
  const end = new Date(today);
  end.setMonth(end.getMonth() + 2);
  return { from, to: formatYmd(end) };
}

function normMatchLabel(s: string): string {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function pickClassForGroup(groupName: string, rows: ClassRow[]): ClassRow | null {
  const gn = normMatchLabel(groupName);
  if (!gn) return null;
  const exact = rows.find((c) => normMatchLabel(c.name) === gn);
  if (exact) return exact;
  return (
    rows.find((c) => {
      const cn = normMatchLabel(c.name);
      return cn.includes(gn) || gn.includes(cn);
    }) || null
  );
}

function termDatesFromPlanner(state: PlannerState): { from: string; to: string } | null {
  const term = state.term as { start?: string; end?: string } | undefined;
  const from = String(term?.start || '').trim().slice(0, 10);
  const to = String(term?.end || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
    return { from, to };
  }
  return null;
}

function postPlannerMessage<T>(
  iframe: HTMLIFrameElement | null,
  type: string,
  payload?: unknown,
  timeoutMs = 8000
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!iframe?.contentWindow) {
      reject(new Error('iframe_not_ready'));
      return;
    }
    const requestId = crypto.randomUUID();
    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || msg.requestId !== requestId) return;
      window.removeEventListener('message', onMessage);
      if (type === 'GET_STATE' && msg.type === 'STATE') resolve(msg.payload as T);
      else if (type === 'SET_STATE' && msg.type === 'SET_OK') resolve(msg as T);
      else if (type === 'SET_CONTEXT' && msg.type === 'SET_CONTEXT_OK') resolve(msg as T);
      else reject(new Error(String(msg.type || 'unexpected_response')));
    };
    window.addEventListener('message', onMessage);
    iframe.contentWindow.postMessage(
      { source: 'scs-planner-parent', type, requestId, payload },
      '*'
    );
    setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('planner_timeout'));
    }, timeoutMs);
  });
}

export default function SchedulePlannerPage() {
  const { effectiveUser } = useAuth();
  const { activeInstitutionId } = useApp();
  const isSuper = effectiveUser?.role === 'super_admin';
  const institutionId = String(
    isSuper ? activeInstitutionId || effectiveUser?.institution_id || '' : effectiveUser?.institution_id || activeInstitutionId || ''
  ).trim();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planName, setPlanName] = useState('');
  const [busy, setBusy] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportGroupId, setExportGroupId] = useState('');
  const [exportClassId, setExportClassId] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [plannerGroups, setPlannerGroups] = useState<PlannerGroup[]>([]);
  const [unmatchedTeachers, setUnmatchedTeachers] = useState<string[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({});
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [importClassId, setImportClassId] = useState('');
  const [systemTeachers, setSystemTeachers] = useState<PlannerTeacher[]>([]);

  const pushPlannerContext = useCallback(async () => {
    if (!iframeReady || !institutionId) return;
    try {
      await postPlannerMessage(iframeRef.current, 'SET_CONTEXT', {
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name,
          class_level: c.class_level ?? null,
          branch: c.branch ?? null
        })),
        teachers: systemTeachers,
        poolSubjects: PLANNER_POOL_SUBJECTS,
        curriculumPresets: PLANNER_CURRICULUM_PRESETS
      });
    } catch {
      /* iframe henüz hazır olmayabilir */
    }
  }, [iframeReady, institutionId, classes, systemTeachers]);

  const loadPlannerResources = useCallback(async () => {
    if (!institutionId) return;
    const qs = new URLSearchParams({ op: 'planner-resources', institution_id: institutionId });
    const res = await apiFetch(`/api/class-schedule-plans?${qs.toString()}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'planner_resources_failed');
    setSystemTeachers(Array.isArray(j.teachers) ? j.teachers : []);
    if (Array.isArray(j.classes) && j.classes.length) {
      setClasses((prev) => {
        const map = new Map(prev.map((c) => [c.id, c]));
        for (const c of j.classes as ClassRow[]) map.set(c.id, c);
        return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
      });
    }
  }, [institutionId]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.source === 'scs-planner-embed' && ev.data?.type === 'READY') {
        setIframeReady(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const loadPlans = useCallback(async () => {
    if (!institutionId) return;
    const qs = new URLSearchParams({ institution_id: institutionId });
    const res = await apiFetch(`/api/class-schedule-plans?${qs.toString()}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'plan_list_failed');
    setPlans(Array.isArray(j.data) ? j.data : []);
    if (j.hint) toast.message(j.hint);
  }, [institutionId]);

  const loadClasses = useCallback(async () => {
    const qs = new URLSearchParams({ scope: 'classes' });
    if (institutionId) qs.set('institution_id', institutionId);
    const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'classes_failed');
    const rows = Array.isArray(j.classes) ? j.classes : Array.isArray(j.data) ? j.data : [];
    setClasses(rows);
  }, [institutionId]);

  useEffect(() => {
    loadPlans().catch((e) => toast.error(String(e.message || e)));
    loadClasses().catch(() => {});
    loadPlannerResources().catch(() => {});
  }, [loadPlans, loadClasses, loadPlannerResources]);

  useEffect(() => {
    if (iframeReady) void pushPlannerContext();
  }, [iframeReady, pushPlannerContext]);

  const refreshPlannerGroups = useCallback(async () => {
    if (!iframeReady) return;
    try {
      const state = await postPlannerMessage<PlannerState>(iframeRef.current, 'GET_STATE');
      setPlannerGroups(Array.isArray(state.groups) ? state.groups : []);
      if (!exportGroupId && state.groups?.[0]?.id) setExportGroupId(state.groups[0].id);
    } catch {
      /* iframe henüz hazır olmayabilir */
    }
  }, [iframeReady, exportGroupId]);

  useEffect(() => {
    if (iframeReady) refreshPlannerGroups();
  }, [iframeReady, refreshPlannerGroups]);

  const getPlannerState = useCallback(async () => {
    return postPlannerMessage<PlannerState>(iframeRef.current, 'GET_STATE');
  }, []);

  const handleSave = async () => {
    if (!institutionId) {
      toast.error('Kurum seçili değil.');
      return;
    }
    const name = planName.trim() || `Ders programı ${new Date().toLocaleDateString('tr-TR')}`;
    setBusy('save');
    try {
      const planner_json = await getPlannerState();
      if (selectedPlanId) {
        const res = await apiFetch('/api/class-schedule-plans', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedPlanId, name, planner_json, institution_id: institutionId })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'save_failed');
        toast.success('Plan güncellendi.');
      } else {
        const res = await apiFetch('/api/class-schedule-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, planner_json, institution_id: institutionId })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'save_failed');
        const id = j.data?.id;
        if (id) setSelectedPlanId(id);
        toast.success('Plan kaydedildi.');
      }
      setPlanName(name);
      await loadPlans();
    } catch (e) {
      toast.error(String((e as Error).message || e));
    } finally {
      setBusy('');
    }
  };

  const handleLoadPlan = async (planId: string) => {
    if (!planId) {
      setSelectedPlanId('');
      setPlanName('');
      return;
    }
    setBusy('load');
    try {
      const res = await apiFetch(`/api/class-schedule-plans?id=${encodeURIComponent(planId)}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.data) throw new Error(j.error || 'load_failed');
      await postPlannerMessage(iframeRef.current, 'SET_STATE', j.data.planner_json);
      setSelectedPlanId(planId);
      setPlanName(String(j.data.name || ''));
      await refreshPlannerGroups();
      await pushPlannerContext();
      toast.success('Plan yüklendi.');
    } catch (e) {
      toast.error(String((e as Error).message || e));
    } finally {
      setBusy('');
    }
  };

  const handleDeletePlan = async () => {
    if (!selectedPlanId) return;
    if (!confirm('Bu taslağı silmek istediğinize emin misiniz?')) return;
    setBusy('delete');
    try {
      const res = await apiFetch(`/api/class-schedule-plans?id=${encodeURIComponent(selectedPlanId)}`, {
        method: 'DELETE'
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'delete_failed');
      setSelectedPlanId('');
      setPlanName('');
      await loadPlans();
      toast.success('Taslak silindi.');
    } catch (e) {
      toast.error(String((e as Error).message || e));
    } finally {
      setBusy('');
    }
  };

  const openExport = async () => {
    setExportOpen(true);
    setExportResult(null);
    await refreshPlannerGroups();
    setExportClassId('');
    setReplaceExisting(false);
    setTeacherMap({});
    try {
      const state = await getPlannerState();
      const termRange = termDatesFromPlanner(state);
      const fallback = defaultDateRange();
      setExportDateFrom(termRange?.from || fallback.from);
      setExportDateTo(termRange?.to || fallback.to);
    } catch {
      const fallback = defaultDateRange();
      setExportDateFrom(fallback.from);
      setExportDateTo(fallback.to);
    }
    await previewTeachers(exportGroupId || plannerGroups[0]?.id || '');
  };

  const previewTeachers = async (groupId: string) => {
    if (!groupId || !institutionId) return;
    try {
      const planner_json = await getPlannerState();
      const res = await apiFetch('/api/class-schedule-plans?op=preview-teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId, planner_json, institution_id: institutionId })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'preview_failed');
      setTeacherOptions(Array.isArray(j.teachers) ? j.teachers : []);
      setUnmatchedTeachers((j.unmatched || []).map((x: { name: string }) => x.name));
    } catch (e) {
      toast.error(String((e as Error).message || e));
    }
  };

  useEffect(() => {
    if (exportOpen && exportGroupId) previewTeachers(exportGroupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportGroupId, exportOpen]);

  useEffect(() => {
    if (!exportOpen || !exportGroupId || exportClassId) return;
    const group = plannerGroups.find((g) => g.id === exportGroupId);
    if (!group?.name) return;
    const match = pickClassForGroup(group.name, classes);
    if (match) setExportClassId(match.id);
  }, [exportOpen, exportGroupId, exportClassId, plannerGroups, classes]);

  const handleImportFromClass = async () => {
    if (!importClassId || !iframeReady) {
      setExportResult({
        ok: false,
        message: 'Canlı Grup Dersi\'nden çekmek için sınıf seçin.'
      });
      return;
    }
    const classRow = classes.find((c) => c.id === importClassId);
    if (!classRow) {
      setExportResult({ ok: false, message: 'Sınıf bulunamadı.' });
      return;
    }
    setBusy('import');
    setExportResult(null);
    try {
      const qs = new URLSearchParams({ scope: 'slots', class_id: importClassId });
      if (institutionId) qs.set('institution_id', institutionId);
      const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(j.error || 'slots_load_failed'));
      const slots = Array.isArray(j.data) ? j.data : [];
      if (!slots.length) {
        setExportResult({
          ok: false,
          message: `«${classRow.name}» sınıfında henüz haftalık ders şablonu yok. Önce Canlı Grup Dersi'nde program oluşturun veya planlayıcıdan aktarın.`
        });
        return;
      }
      const current = await getPlannerState();
      const merged = mergeClassSlotsIntoPlanner(
        current as FullPlannerState,
        classRow.name,
        slots.map((s: Record<string, unknown>) => ({
          day_of_week: Number(s.day_of_week),
          start_time: String(s.start_time || ''),
          end_time: String(s.end_time || ''),
          subject: String(s.subject || ''),
          teacher_id: String(s.teacher_id || ''),
          teacher_name: String(s.teacher_name || '')
        }))
      );
      await postPlannerMessage(iframeRef.current, 'SET_STATE', merged);
      await refreshPlannerGroups();
      const matchedGroup = (merged.groups || []).find(
        (g) => normMatchLabel(g.name) === normMatchLabel(classRow.name)
      );
      if (matchedGroup?.id) setExportGroupId(matchedGroup.id);
      setExportClassId(importClassId);
      setExportResult({
        ok: true,
        message: `«${classRow.name}» programı Canlı Grup Dersi'nden planlayıcıya çekildi (${slots.length} şablon hücresi). Düzenleyip tekrar aktarabilirsiniz.`
      });
    } catch (e) {
      setExportResult({
        ok: false,
        message: String((e as Error).message || e)
      });
    } finally {
      setBusy('');
    }
  };

  const handleExport = async () => {
    if (!exportGroupId || !exportClassId || !institutionId) {
      setExportOpen(false);
      setExportResult({
        ok: false,
        message: 'Grup ve hedef sınıf seçin.'
      });
      return;
    }
    if (!exportDateFrom || !exportDateTo) {
      setExportOpen(false);
      setExportResult({
        ok: false,
        message: 'Hangi tarihler arasında ders programı oluşturmak istediğinizi seçin (başlangıç ve bitiş).'
      });
      return;
    }
    if (exportDateFrom > exportDateTo) {
      setExportOpen(false);
      setExportResult({
        ok: false,
        message: 'Bitiş tarihi başlangıç tarihinden önce olamaz.'
      });
      return;
    }
    const missing = unmatchedTeachers.filter((n) => !teacherMap[n]);
    if (missing.length) {
      setExportOpen(false);
      setExportResult({
        ok: false,
        message: `Öğretmen eşleştirmesi eksik: ${missing.join(', ')}`
      });
      return;
    }
    setBusy('export');
    setExportResult(null);
    try {
      const planner_json = await getPlannerState();
      const res = await apiFetch('/api/class-schedule-plans?op=export-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: exportGroupId,
          class_id: exportClassId,
          planner_json,
          institution_id: institutionId,
          replace_existing: replaceExisting,
          clear_cross_class_conflicts: true,
          teacher_map: teacherMap,
          date_from: exportDateFrom,
          date_to: exportDateTo
        })
      });
      const j = (await res.json().catch(() => ({}))) as ExportResult & {
        error?: string;
        message?: string;
        partial?: boolean;
        skipped_descriptions?: string[];
        session_skipped_descriptions?: string[];
        errors?: string[];
      };
      if (!res.ok && !j.message && !j.error) {
        throw new Error('export_failed');
      }
      const result: ExportResult = {
        ok: Boolean(j.ok),
        partial: Boolean(j.partial),
        message: String(
          j.message ||
            j.error ||
            (j.ok ? 'Aktarım başarılı.' : 'Aktarım başarısız.')
        ),
        slots_created: Number(j.slots_created ?? j.created ?? 0),
        sessions_created: Number(j.sessions_created ?? 0),
        date_from: j.date_from || exportDateFrom,
        date_to: j.date_to || exportDateTo,
        class_id: exportClassId,
        class_name: classOptions.find((c) => c.id === exportClassId)?.name,
        skipped_descriptions: j.skipped_descriptions,
        session_skipped_descriptions: j.session_skipped_descriptions,
        errors: j.errors
      };
      setExportResult(result);
      setExportOpen(false);
    } catch (e) {
      setExportOpen(false);
      setExportResult({
        ok: false,
        message: String((e as Error).message || e)
      });
    } finally {
      setBusy('');
    }
  };

  const classOptions = useMemo(() => {
    return classes.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
  }, [classes]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
          <CalendarDays className="h-5 w-5 text-indigo-600" />
          <div>
            <h1 className="text-base font-semibold">Ders Programı Planlayıcı</h1>
            <p className="text-xs text-slate-500">
              Canlı Grup Dersi programını çekin, düzenleyin veya planlayıcıdan sınıfa aktarın.
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="Taslak adı"
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <select
            value={selectedPlanId}
            onChange={(e) => handleLoadPlan(e.target.value)}
            className="max-w-[180px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">Kayıtlı taslak…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={!!busy}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet
          </button>
          {selectedPlanId ? (
            <button
              type="button"
              onClick={handleDeletePlan}
              disabled={!!busy}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
          <select
            value={importClassId}
            onChange={(e) => setImportClassId(e.target.value)}
            className="max-w-[200px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            title="Canlı Grup Dersi'nden çek"
          >
            <option value="">Sınıftan çek…</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleImportFromClass()}
            disabled={!!busy || !iframeReady || !importClassId}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
          >
            {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Çek
          </button>
          <button
            type="button"
            onClick={openExport}
            disabled={!!busy || !iframeReady}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            Sınıfa aktar
          </button>
          <Link
            to="/class-live-lessons"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Canlı Grup Dersi
          </Link>
          <button
            type="button"
            onClick={() => refreshPlannerGroups()}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-600"
            title="Yenile"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!institutionId && isSuper ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Süper admin: üst menüden kurum seçin, ardından planı kaydedip aktarabilirsiniz.
        </div>
      ) : null}

      {exportResult ? (
        <div className="fixed inset-x-0 top-16 z-[100] flex justify-center px-3 md:top-20">
          <div
            className={`relative w-full max-w-3xl rounded-xl border-2 p-4 shadow-2xl ${
              exportResult.ok
                ? 'border-emerald-400 bg-emerald-50'
                : exportResult.partial
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-red-400 bg-red-50'
            }`}
            role="alert"
          >
          <button
            type="button"
            onClick={() => setExportResult(null)}
            className="absolute right-3 top-3 rounded p-1 text-slate-500 hover:bg-white/60"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3 pr-8">
            {exportResult.ok ? (
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            ) : exportResult.partial ? (
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" />
            ) : (
              <XCircle className="h-6 w-6 shrink-0 text-red-600" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`text-base font-semibold ${
                  exportResult.ok ? 'text-emerald-900' : exportResult.partial ? 'text-amber-900' : 'text-red-900'
                }`}
              >
                {exportResult.ok ? 'Aktarım başarılı' : exportResult.partial ? 'Aktarım kısmen tamamlandı' : 'Aktarım başarısız'}
              </p>
              <p
                className={`mt-1 text-sm ${
                  exportResult.ok ? 'text-emerald-800' : exportResult.partial ? 'text-amber-800' : 'text-red-800'
                }`}
              >
                {exportResult.message}
              </p>
              {(exportResult.slots_created != null || exportResult.sessions_created != null) && (
                <p className="mt-2 text-sm text-slate-700">
                  {exportResult.slots_created ?? 0} haftalık şablon · {exportResult.sessions_created ?? 0} tarihli oturum
                  {exportResult.date_from && exportResult.date_to
                    ? ` · ${exportResult.date_from} – ${exportResult.date_to}`
                    : ''}
                </p>
              )}
              {exportResult.ok && exportResult.class_id ? (
                <p className="mt-2 text-sm text-slate-700">
                  {exportResult.class_name ? `«${exportResult.class_name}» — ` : ''}
                  Tarihli oturumlar takvimde{' '}
                  <strong>{exportResult.date_from || 'başlangıç tarihi'}</strong> haftasında görünür (şablonlar her hafta).
                </p>
              ) : null}
              {exportResult.ok && exportResult.class_id ? (
                <Link
                  to={`/class-live-lessons?class_id=${encodeURIComponent(exportResult.class_id)}&week=${encodeURIComponent(exportResult.date_from || '')}`}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  Canlı Grup Dersi&apos;nde görüntüle
                </Link>
              ) : null}
              {(exportResult.skipped_descriptions?.length || exportResult.session_skipped_descriptions?.length || exportResult.errors?.length) ? (
                <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm text-red-800">
                  {exportResult.skipped_descriptions?.map((line, i) => (
                    <li key={`s-${i}`}>• {line}</li>
                  ))}
                  {exportResult.session_skipped_descriptions?.map((line, i) => (
                    <li key={`ss-${i}`}>• {line}</li>
                  ))}
                  {exportResult.errors?.map((line, i) => (
                    <li key={`e-${i}`}>• {line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          </div>
        </div>
      ) : null}

      <iframe
        ref={iframeRef}
        src={IFRAME_SRC}
        title="Ders programı planlayıcı"
        className="min-h-0 flex-1 w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700"
      />

      {exportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Canlı Grup Dersi&apos;ne aktar</h2>
            <p className="mt-1 text-sm text-slate-500">
              Planlayıcıdaki bir grubu seçili sınıfın haftalık şablonlarına yazar; seçtiğiniz tarih aralığında
              tarihli oturumlar oluşturulur. BBB linkleri otomatik üretilir.
            </p>

            <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/80 p-3">
              <p className="text-sm font-medium text-indigo-900">Hangi tarihler arasında ders programı oluşturmak istiyorsunuz?</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block text-xs text-slate-600">
                  Başlangıç
                  <input
                    type="date"
                    value={exportDateFrom}
                    onChange={(e) => setExportDateFrom(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </label>
                <label className="block text-xs text-slate-600">
                  Bitiş
                  <input
                    type="date"
                    value={exportDateTo}
                    onChange={(e) => setExportDateTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </label>
              </div>
            </div>

            <label className="mt-4 block text-sm font-medium">Planlayıcı grubu</label>
            <select
              value={exportGroupId}
              onChange={(e) => setExportGroupId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Seçin…</option>
              {plannerGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-sm font-medium">Hedef sınıf (Canlı Grup Dersi)</label>
            <select
              value={exportClassId}
              onChange={(e) => setExportClassId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Seçin…</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.branch ? ` (${c.branch})` : ''}
                </option>
              ))}
            </select>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              Mevcut haftalık şablonları sil ve yerine yaz (aynı kurumdaki çakışan hayalet şablonlar da temizlenir)
            </label>

            {unmatchedTeachers.length ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-medium text-amber-900">Öğretmen eşleştirmesi gerekli</p>
                <p className="mt-1 text-amber-800">
                  Aşağıdaki isimler sistemde bulunamadı; kullanıcı seçin (adlar birebir eşleşmeli).
                </p>
                <ul className="mt-2 space-y-2">
                  {unmatchedTeachers.map((name) => (
                    <li key={name} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-[120px] font-medium">{name}</span>
                      <select
                        value={teacherMap[name] || ''}
                        onChange={(e) => setTeacherMap((m) => ({ ...m, [name]: e.target.value }))}
                        className="flex-1 rounded border border-amber-300 px-2 py-1 text-sm"
                      >
                        <option value="">Öğretmen seç…</option>
                        {teacherOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name || t.email}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={!!busy}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Aktar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
