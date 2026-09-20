import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ExternalLink, FileText, Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import {
  fetchEdesisHataKarnesiReports,
  fetchEdesisHataKarnesiSets,
  fetchEdesisStudentReports,
  type EdesisHataKarnesiReport,
  type EdesisHataKarnesiSet,
  type EdesisStudentReport
} from '../lib/edesis/edesisApi';

function fmtDate(v?: string | null) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function ReportLink({ url, label }: { url: string | null; label: string }) {
  if (!url) return <span className="text-xs text-slate-400">PDF yok</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
    >
      <ExternalLink className="h-3.5 w-3.5" /> {label}
    </a>
  );
}

/** Edesis'te üretilen hata karneleri — öğrenci kendi karnesini, koç kendi öğrencisini, yönetici tümünü görür. */
export default function EdesisHataKarnesiPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isStaff = tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
  // "Öğrenci olarak görüntüle"de oturum yöneticinin; hangi öğrenci olduğunu açıkça gönder
  const viewedStudentId = String(effectiveUser?.studentId || '').trim();

  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<EdesisStudentReport[]>([]);
  const [mineNote, setMineNote] = useState('');
  const [sets, setSets] = useState<EdesisHataKarnesiSet[]>([]);
  const [openSet, setOpenSet] = useState<EdesisHataKarnesiSet | null>(null);
  const [reports, setReports] = useState<EdesisHataKarnesiReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isStaff) {
        const r = await fetchEdesisHataKarnesiSets();
        setSets(r.items || []);
        if (r.error) setMineNote(r.error);
      } else {
        const r = await fetchEdesisStudentReports(viewedStudentId || undefined);
        setMine(r.items || []);
        setMineNote(r.hint || r.error || '');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata karneleri alınamadı');
    } finally {
      setLoading(false);
    }
  }, [isStaff, viewedStudentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReports = async (set: EdesisHataKarnesiSet) => {
    setOpenSet(set);
    setReportsLoading(true);
    setSearch('');
    try {
      const r = await fetchEdesisHataKarnesiReports(set.id);
      setReports(r.items || []);
      if (r.error) toast.error(r.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Karneler alınamadı');
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  };

  const filteredReports = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return reports;
    return reports.filter((r) => `${r.studentName} ${r.classroom}`.toLocaleLowerCase('tr').includes(q));
  }, [reports, search]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-rose-600 to-orange-600 p-5 text-white shadow">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FileText className="h-6 w-6" /> Hata Karneleri
        </h1>
        <p className="mt-1 text-sm text-rose-100">
          {isStaff
            ? 'Edesis’te oluşturulan hata karneleri. Karne setine tıklayın, öğrencilerin PDF karnelerini açın.'
            : 'Denemelerdeki boş ve yanlış sorularınızdan oluşan karneleriniz.'}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Yenile
        </button>
        {openSet ? (
          <button
            type="button"
            onClick={() => setOpenSet(null)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" /> Karne setleri
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </p>
      ) : !isStaff ? (
        mine.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
            Henüz hata karneniz yok. {mineNote}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((r) => (
              <div key={r.id || r.reportUrl} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="font-semibold text-slate-900">{r.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[r.reportType, fmtDate(r.reportDate)].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-3">
                  <ReportLink url={r.reportUrl} label="Karneyi aç" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : openSet ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-semibold text-slate-900">{openSet.title}</p>
            <p className="text-xs text-slate-500">
              {openSet.studentCount} öğrenci · {openSet.completedCount} hazır
              {openSet.failedCount ? ` · ${openSet.failedCount} hatalı` : ''} · {fmtDate(openSet.createdAt)}
            </p>
          </div>
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Öğrenci ara…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm"
            />
          </div>
          {reportsLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Karneler yükleniyor…
            </p>
          ) : filteredReports.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
              Bu sette görüntüleyebileceğiniz karne yok.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Öğrenci</th>
                    <th className="px-3 py-2">Sınıf</th>
                    <th className="px-3 py-2">Tarih</th>
                    <th className="px-3 py-2 text-right">Karne</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((r) => (
                    <tr key={r.id || r.edesisStudentId} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-900">{r.studentName || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{r.classroom || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{fmtDate(r.completedAt)}</td>
                      <td className="px-3 py-2 text-right">
                        <ReportLink url={r.reportUrl} label="Aç" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : sets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          Edesis’te oluşturulmuş hata karnesi bulunamadı. {mineNote}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sets.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void openReports(s)}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <p className="font-semibold text-slate-900">{s.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {s.studentCount} öğrenci · {s.completedCount} hazır
                {s.pendingCount ? ` · ${s.pendingCount} bekliyor` : ''}
                {s.failedCount ? ` · ${s.failedCount} hatalı` : ''}
              </p>
              <p className="mt-1 text-xs text-slate-400">{fmtDate(s.createdAt)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
