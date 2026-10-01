import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Phone, Save, Search, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/session';

type Row = {
  student_id: string;
  student_name: string;
  student_phone: string | null;
  class_level: string | null;
  branch: string | null;
  class_name: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  coach_name: string | null;
  institution_id: string | null;
  q_lessons: string | null;
  q_coach: string | null;
  q_tech: string | null;
  q_recommend: string | null;
  agent_user_id: string | null;
  call_status: string;
  last_call_at: string | null;
  action_required: boolean;
  has_referral: boolean;
  survey_count: number;
};

type Option = { id: string; label: string };
type Question = {
  id: string;
  title: string;
  text: string;
  noteLabel?: string;
  noteField?: string;
  options: Option[];
};
type Meta = {
  questions: Question[];
  call_results: Option[];
  statuses: Array<Option & { dot: string }>;
  action_types: Option[];
};
type Agent = { id: string; name: string; email?: string };

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  call_later: 'bg-sky-100 text-sky-900',
  completed: 'bg-emerald-100 text-emerald-900',
  unreachable: 'bg-rose-100 text-rose-900',
  action: 'bg-orange-100 text-orange-900'
};

function tarih(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Veli Memnuniyet ve Takip — arama listesi, görüşme anketi, yönetici özeti. */
export default function ParentSatisfactionPage() {
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [byAgent, setByAgent] = useState<Array<Record<string, unknown>>>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [institutions, setInstitutions] = useState<Array<{ id: string; name: string }>>([]);

  const [q, setQ] = useState('');
  const [fClass, setFClass] = useState('');
  const [fAgent, setFAgent] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fInstitution, setFInstitution] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState('');
  const [open, setOpen] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/parent-satisfaction');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.hint || j.error || 'Liste alınamadı');
      setIsManager(Boolean(j.is_manager));
      setRows(j.rows || []);
      setAgents(j.agents || []);
      setAgentNames(j.agent_names || {});
      setSummary(j.summary || {});
      setByAgent(j.by_agent || []);
      setMeta(j.meta || null);
      setInstitutions(j.institutions || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Liste alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const instName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of institutions) m[i.id] = i.name;
    return m;
  }, [institutions]);

  const classes = useMemo(
    () => [...new Set(rows.map((r) => r.class_name || r.class_level || '').filter(Boolean))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    return rows.filter((r) => {
      if (fClass && (r.class_name || r.class_level || '') !== fClass) return false;
      if (fAgent && String(r.agent_user_id || '') !== fAgent) return false;
      if (fStatus && r.call_status !== fStatus) return false;
      if (fInstitution && String(r.institution_id || '') !== fInstitution) return false;
      if (!needle) return true;
      return `${r.student_name} ${r.parent_name || ''} ${r.parent_phone || ''}`
        .toLocaleLowerCase('tr')
        .includes(needle);
    });
  }, [rows, q, fClass, fAgent, fStatus, fInstitution]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const assign = async () => {
    if (!selected.size) {
      toast.error('Önce öğrenci seçin');
      return;
    }
    try {
      const res = await apiFetch('/api/parent-satisfaction?op=assign', {
        method: 'POST',
        body: JSON.stringify({ agent_user_id: assignTo || null, student_ids: [...selected] })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Atanamadı');
      toast.success(`${j.assigned} öğrenci atandı`);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Atanamadı');
    }
  };

  /**
   * Anket istatistiği filtrelenmiş listeden hesaplanır: üstteki kurum, sınıf,
   * temsilci ve durum filtreleri sonuçlara da uygulansın.
   */
  const surveyStats = useMemo(() => {
    const positive: Record<string, string[]> = {
      q_lessons: ['very_satisfied', 'satisfied'],
      q_coach: ['very_regular', 'enough'],
      q_tech: ['fine'],
      q_recommend: ['definitely', 'maybe']
    };
    const negative: Record<string, string[]> = {
      q_lessons: ['unsatisfied'],
      q_coach: ['insufficient', 'unreachable'],
      q_tech: ['serious'],
      q_recommend: ['no']
    };
    return (meta?.questions || []).map((q) => {
      const counts: Record<string, number> = {};
      let answered = 0;
      for (const r of filtered) {
        const v = String((r as unknown as Record<string, unknown>)[q.id] ?? '').trim();
        if (!v || !q.options.some((o) => o.id === v)) continue;
        counts[v] = (counts[v] || 0) + 1;
        answered += 1;
      }
      const pos = (positive[q.id] || []).reduce((n, id) => n + (counts[id] || 0), 0);
      return {
        id: q.id,
        title: q.title,
        answered,
        positiveRate: answered ? Math.round((pos * 1000) / answered) / 10 : 0,
        options: q.options.map((o) => ({
          ...o,
          count: counts[o.id] || 0,
          percent: answered ? Math.round(((counts[o.id] || 0) * 1000) / answered) / 10 : 0,
          good: (positive[q.id] || []).includes(o.id),
          bad: (negative[q.id] || []).includes(o.id)
        }))
      };
    });
  }, [filtered, meta]);

  const statusLabel = (id: string) => meta?.statuses.find((s) => s.id === id)?.label || 'Aranacak';
  const statusDot = (id: string) => meta?.statuses.find((s) => s.id === id)?.dot || '🟡';

  const cards: Array<[string, number]> = [
    ['Toplam Öğrenci', summary.total || 0],
    ['Aranacak', summary.pending || 0],
    ['Aranan', summary.called || 0],
    ['Tamamlanan', summary.completed || 0],
    ['Ulaşılamayan', summary.unreachable || 0],
    ['Tekrar Aranacak', summary.call_later || 0],
    ['Aksiyon Gereken', summary.action || 0],
    ['Referans Alınan', summary.referral || 0]
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Veli İlişkileri</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-slate-900">📞 Veli Memnuniyet ve Takip</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Kayıtlı öğrencilerin velileri belirli aralıklarla aranır, memnuniyet ölçülür ve gereken aksiyonlar
          takip edilir. Öğrenci ve veli bilgileri mevcut kayıtlardan gelir.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-600">{label}</p>
          </div>
        ))}
      </div>

      {/* Anket sonuçları — üstteki filtrelere göre */}
      {surveyStats.some((q) => q.answered > 0) ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Anket Sonuçları</h2>
            <p className="text-[11px] text-slate-500">
              Yalnız görüşmesi tamamlanmış veliler sayılır · seçili filtrelere göre
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {surveyStats.map((q) => (
              <div key={q.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-800">{q.title}</h3>
                  <span className="text-[11px] text-slate-500">
                    {q.answered} yanıt ·{' '}
                    <span
                      className={`font-semibold ${
                        q.positiveRate >= 75
                          ? 'text-emerald-700'
                          : q.positiveRate >= 50
                            ? 'text-amber-700'
                            : 'text-rose-700'
                      }`}
                    >
                      %{q.positiveRate} olumlu
                    </span>
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {q.options.map((o) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <span className="w-40 shrink-0 truncate text-[11px] text-slate-600" title={o.label}>
                        {o.label}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <span
                          className={`block h-full rounded-full ${
                            o.good ? 'bg-emerald-500' : o.bad ? 'bg-rose-500' : 'bg-amber-400'
                          }`}
                          style={{ width: `${o.percent}%` }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-600">
                        {o.count} · %{o.percent}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isManager && byAgent.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Temsilci</th>
                <th className="px-3 py-2 font-medium">Atanan</th>
                <th className="px-3 py-2 font-medium">Aranan</th>
                <th className="px-3 py-2 font-medium">Tamamlanan</th>
                <th className="px-3 py-2 font-medium">Ulaşılamayan</th>
                <th className="px-3 py-2 font-medium">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {byAgent.map((a) => (
                <tr key={String(a.id)} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{String(a.name)}</td>
                  <td className="px-3 py-2 tabular-nums">{Number(a.assigned)}</td>
                  <td className="px-3 py-2 tabular-nums">{Number(a.called)}</td>
                  <td className="px-3 py-2 tabular-nums text-emerald-700">{Number(a.completed)}</td>
                  <td className="px-3 py-2 tabular-nums text-rose-700">{Number(a.unreachable)}</td>
                  <td className="px-3 py-2 tabular-nums text-orange-700">{Number(a.action)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs text-slate-600">
          Ara
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Öğrenci veya veli adı"
              className="w-56 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-sm"
            />
          </span>
        </label>
        <label className="text-xs text-slate-600">
          Sınıf
          <select value={fClass} onChange={(e) => setFClass(e.target.value)} className="mt-1 block w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Tümü</option>
            {classes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        {isManager ? (
          <label className="text-xs text-slate-600">
            Temsilci
            <select value={fAgent} onChange={(e) => setFAgent(e.target.value)} className="mt-1 block w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
              <option value="">Tümü</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {institutions.length > 1 ? (
          <label className="text-xs text-slate-600">
            Kurum
            <select
              value={fInstitution}
              onChange={(e) => setFInstitution(e.target.value)}
              className="mt-1 block w-48 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">Tümü</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-xs text-slate-600">
          Durum
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="mt-1 block w-48 rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Tümü</option>
            {(meta?.statuses || []).map((s) => (
              <option key={s.id} value={s.id}>{s.dot} {s.label}</option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-xs text-slate-500">{filtered.length} kayıt</span>
      </div>

      {isManager ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
          <button
            type="button"
            onClick={() => setSelected(new Set(filtered.map((r) => r.student_id)))}
            className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
          >
            Listedekilerin tamamını seç{fClass ? ` (${fClass})` : ''}
          </button>
          {selected.size ? (
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-slate-600 underline">
              Seçimi temizle ({selected.size})
            </button>
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
              <option value="">Temsilci seçin…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => void assign()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Seçilenleri Temsilciye Ata
            </button>
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                {isManager ? <th className="px-3 py-2" /> : null}
                <th className="px-3 py-2 font-medium">Öğrenci</th>
                <th className="px-3 py-2 font-medium">Sınıf</th>
                <th className="px-3 py-2 font-medium">Veli</th>
                <th className="px-3 py-2 font-medium">Telefon</th>
                <th className="px-3 py-2 font-medium">Arama Durumu</th>
                <th className="px-3 py-2 font-medium">Son Arama</th>
                <th className="px-3 py-2 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.student_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  {isManager ? (
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(r.student_id)} onChange={() => toggle(r.student_id)} />
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900">{r.student_name}</span>
                    {r.coach_name ? <span className="block text-[11px] text-slate-500">Koç: {r.coach_name}</span> : null}
                    {/* Kurum adı yalnız birden çok kurum listelenirken anlamlı */}
                    {institutions.length > 1 && r.institution_id ? (
                      <span className="block text-[11px] text-slate-400">{instName[r.institution_id] || 'Kurum'}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.class_name || r.class_level || '—'}
                    {r.branch ? ` / ${r.branch}` : ''}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.parent_name || '—'}</td>
                  <td className="px-3 py-2">
                    {r.parent_phone ? (
                      <a href={`tel:${r.parent_phone}`} className="inline-flex items-center gap-1 font-medium tabular-nums text-emerald-700 hover:underline">
                        <Phone className="h-3.5 w-3.5" />
                        {r.parent_phone}
                      </a>
                    ) : (
                      <span className="text-rose-600">telefon yok</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.call_status] || ''}`}>
                      {statusDot(r.call_status)} {statusLabel(r.call_status)}
                    </span>
                    {isManager && r.agent_user_id ? (
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {agentNames[r.agent_user_id] || 'Temsilci'}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                    {tarih(r.last_call_at)}
                    {r.survey_count > 1 ? <span className="block text-[10px]">{r.survey_count} görüşme</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setOpen(r)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Görüşmeyi Aç
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={isManager ? 8 : 7} className="px-3 py-10 text-center text-sm text-slate-500">
                    {isManager ? 'Kayıt yok.' : 'Size atanmış öğrenci yok.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {open && meta ? (
        <SurveyModal
          row={open}
          meta={meta}
          rows={filtered}
          onClose={() => setOpen(null)}
          onSaved={async (next) => {
            await load();
            setOpen(next);
          }}
        />
      ) : null}
    </div>
  );
}

/** Görüşme ekranı — tek sayfada: öğrenci kartı, anket, not, sonuç. */
function SurveyModal({
  row,
  meta,
  rows,
  onClose,
  onSaved
}: {
  row: Row;
  meta: Meta;
  rows: Row[];
  onClose: () => void;
  onSaved: (next: Row | null) => void | Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({ call_result: 'completed' });
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setForm({ call_result: 'completed' });
    void apiFetch(`/api/parent-satisfaction?op=history&student_id=${encodeURIComponent(row.student_id)}`)
      .then((r) => r.json())
      .then((j) => setHistory(j.items || []))
      .catch(() => setHistory([]));
  }, [row.student_id]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const recommend = String(form.q_recommend || '');
  const showReferral = recommend === 'definitely' || recommend === 'maybe';
  const actionOn = form.action_required === true;

  const save = async (goNext: boolean) => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/parent-satisfaction?op=save-survey', {
        method: 'POST',
        body: JSON.stringify({ ...form, student_id: row.student_id })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.hint || j.error || 'Kaydedilemedi');
      toast.success(j.referral_lead_id ? 'Kaydedildi — referans lead olarak eklendi' : 'Görüşme kaydedildi');
      if (goNext) {
        const i = rows.findIndex((x) => x.student_id === row.student_id);
        await onSaved(rows[i + 1] || null);
      } else {
        await onSaved(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const opening =
    `Merhabalar ${row.parent_name || 'Değerli velimiz'}, ben Online VIP Dershane yönetiminden arıyorum. ` +
    `Öğrencimiz ${row.student_name}'nın ders ve gelişim sürecini yakından takip etmek, kurum olarak sizlerin ` +
    'genel memnuniyetini değerlendirmek adına kısa bir arama gerçekleştirmek istedim. Müsaitseniz birkaç kısa sorum olacaktı.';

  const input = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-3 sm:p-6">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-slate-100 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{row.student_name}</p>
            <p className="text-[11px] text-slate-500">
              {row.class_name || row.class_level || '—'}
              {row.branch ? ` / ${row.branch}` : ''} · Veli: {row.parent_name || '—'}
              {row.coach_name ? ` · Koç: ${row.coach_name}` : ''}
            </p>
            <p className="mt-1 flex flex-wrap gap-3 text-xs">
              {row.parent_phone ? (
                <a href={`tel:${row.parent_phone}`} className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <Phone className="h-3.5 w-3.5" /> Veli: {row.parent_phone}
                </a>
              ) : null}
              {row.student_phone ? (
                <a href={`tel:${row.student_phone}`} className="inline-flex items-center gap-1 text-slate-600">
                  <Phone className="h-3.5 w-3.5" /> Öğrenci: {row.student_phone}
                </a>
              ) : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <p className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{opening}</p>

          {meta.questions.map((qq, i) => (
            <div key={qq.id} className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Soru {i + 1} — {qq.title}
              </p>
              <p className="mt-1 text-sm text-slate-800">{qq.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {qq.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => set(qq.id, o.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      form[qq.id] === o.id
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {qq.noteField ? (
                <label className="mt-2 block text-xs font-medium text-slate-600">
                  📝 {qq.noteLabel}
                  <textarea
                    rows={2}
                    value={String(form[qq.noteField] || '')}
                    onChange={(e) => set(qq.noteField as string, e.target.value)}
                    className={input}
                  />
                </label>
              ) : null}
              {qq.id === 'q_tech' ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.tech_support_needed === true}
                    onChange={(e) => set('tech_support_needed', e.target.checked)}
                  />
                  Teknik destek gerekiyor
                </label>
              ) : null}
            </div>
          ))}

          {showReferral ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-sm font-semibold text-emerald-900">Referans Öğrenci / Veli</p>
              <p className="mt-0.5 text-xs text-slate-600">
                Yönlendirmek istediğiniz, deneme dersimize katılabilecek bir tanıdığınız varsa memnuniyetle
                iletişim bilgilerini alabiliriz.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input placeholder="Ad Soyad" value={String(form.referral_name || '')} onChange={(e) => set('referral_name', e.target.value)} className={input} />
                <input placeholder="Telefon" value={String(form.referral_phone || '')} onChange={(e) => set('referral_phone', e.target.value)} className={input} />
                <input placeholder="Öğrencinin sınıfı" value={String(form.referral_grade || '')} onChange={(e) => set('referral_grade', e.target.value)} className={input} />
                <input placeholder="Açıklama" value={String(form.referral_note || '')} onChange={(e) => set('referral_note', e.target.value)} className={input} />
              </div>
            </div>
          ) : null}

          <label className="block text-xs font-medium text-slate-600">
            📝 Genel Görüşme Notu
            <textarea rows={3} value={String(form.general_note || '')} onChange={(e) => set('general_note', e.target.value)} className={input} />
          </label>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-800">Aksiyon gerekiyor mu?</p>
            <div className="mt-2 flex gap-2">
              {[['Hayır', false], ['Evet', true]].map(([label, val]) => (
                <button
                  key={String(label)}
                  type="button"
                  onClick={() => set('action_required', val)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    form.action_required === val ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-slate-200 text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {actionOn ? (
              <div className="mt-2 space-y-2">
                <select value={String(form.action_type || '')} onChange={(e) => set('action_type', e.target.value)} className={input}>
                  <option value="">Aksiyon türü seçin…</option>
                  {meta.action_types.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
                <textarea rows={2} placeholder="Aksiyon notu" value={String(form.action_note || '')} onChange={(e) => set('action_note', e.target.value)} className={input} />
                <label className="block text-xs text-slate-600">
                  Takip tarihi
                  <input type="date" value={String(form.action_due_at || '')} onChange={(e) => set('action_due_at', e.target.value)} className={input} />
                </label>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-800">Arama sonucu</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {meta.call_results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set('call_result', c.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    form.call_result === c.id ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {form.call_result === 'call_later' ? (
              <label className="mt-2 block text-xs text-slate-600">
                Tekrar arama tarihi ve saati
                <input type="datetime-local" value={String(form.call_back_at || '')} onChange={(e) => set('call_back_at', e.target.value)} className={input} />
              </label>
            ) : null}
          </div>

          <p className="rounded-xl bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-900">
            Geri bildirimleriniz bizim için çok kıymetli. Herhangi bir ihtiyacınızda veya talebinizde bizlere
            doğrudan ulaşabilirsiniz. Öğrencimize derslerinde başarılar dileriz.
          </p>

          {history.length ? (
            <div className="rounded-xl border border-slate-200 p-3">
              <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-xs font-semibold text-slate-700">
                📋 Geçmiş Görüşmeler ({history.length}) {showHistory ? '▲' : '▼'}
              </button>
              {showHistory ? (
                <div className="mt-2 space-y-1">
                  {history.map((h) => (
                    <details key={String(h.id)} className="rounded-lg bg-slate-50 px-2 py-1 text-xs">
                      <summary className="cursor-pointer text-slate-700">
                        {tarih(String(h.created_at))} — {String(h.agent_name || 'Temsilci')} —{' '}
                        {meta.call_results.find((c) => c.id === h.call_result)?.label || String(h.call_result)}
                      </summary>
                      <div className="mt-1 space-y-0.5 text-slate-600">
                        {h.q_lessons_note ? <p>Ders notu: {String(h.q_lessons_note)}</p> : null}
                        {h.q_coach_note ? <p>Koç notu: {String(h.q_coach_note)}</p> : null}
                        {h.q_tech_note ? <p>Teknik not: {String(h.q_tech_note)}</p> : null}
                        {h.general_note ? <p>Genel: {String(h.general_note)}</p> : null}
                        {h.action_note ? <p>Aksiyon: {String(h.action_note)}</p> : null}
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex flex-wrap gap-2 rounded-b-2xl border-t border-slate-100 bg-white px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet ve Sonraki Öğrenciye Geç
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Kaydet
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Listeye Dön
          </button>
        </div>
      </div>
    </div>
  );
}
