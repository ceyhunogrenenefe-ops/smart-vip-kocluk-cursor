import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CloudDownload,
  FileText,
  GraduationCap,
  Link2,
  Loader2,
  MessageCircle,
  PenLine,
  Plug,
  RefreshCw,
  Search,
  Sparkles,
  Users
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { sortByFirstName } from '../lib/personNameSort';
import EdesisSyncPanel from '../components/settings/EdesisSyncPanel';
import {
  createEdesisClassroomHub,
  createEdesisParentHub,
  createEdesisStudentHub,
  fetchEdesisExamStructure,
  fetchEdesisHubClassrooms,
  fetchEdesisHubDepartments,
  fetchEdesisHubGrades,
  fetchEdesisHubStudents,
  fetchEdesisKarnePdf,
  fetchEdesisStatus,
  fetchEdesisStudentDossier,
  ingestEdesisExamResults,
  linkEdesisStudent,
  syncEdesis,
  type EdesisHubStudent,
  type EdesisPlatformStudent,
  type EdesisStatus,
  type EdesisStudentDossier,
  type EdesisStudentResultsExam
} from '../lib/edesis/edesisApi';
import { shareEdesisKarneWithParent } from '../lib/edesis/shareEdesisKarneWhatsApp';

type DossierTab = 'girecek' | 'girdi' | 'kurum' | 'araclar';

function fmtDate(raw?: string | null) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toLocaleDateString('tr-TR');
}

function ExamRow({
  title,
  type,
  date,
  status,
  extra,
  children
}: {
  title: string;
  type?: string | null;
  date?: string | null;
  status?: string | null;
  extra?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {type || 'Tür yok'} · {fmtDate(date)}
          {status ? ` · ${status}` : ''}
          {extra ? ` · ${extra}` : ''}
        </p>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export default function EdesisPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<EdesisStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [hubStudents, setHubStudents] = useState<EdesisHubStudent[]>([]);
  const [platformStudents, setPlatformStudents] = useState<EdesisPlatformStudent[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);

  const [selectedPlatformId, setSelectedPlatformId] = useState(searchParams.get('studentId') || '');
  const [selectedEdesisId, setSelectedEdesisId] = useState('');
  const [dossierTab, setDossierTab] = useState<DossierTab>('girecek');
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossier, setDossier] = useState<EdesisStudentDossier | null>(null);

  const [karneBusyKey, setKarneBusyKey] = useState<string | null>(null);
  const [karneWaBusyKey, setKarneWaBusyKey] = useState<string | null>(null);

  const [writeLoading, setWriteLoading] = useState(false);
  const [grades, setGrades] = useState<Record<string, unknown>[]>([]);
  const [departments, setDepartments] = useState<Record<string, unknown>[]>([]);
  const [classrooms, setClassrooms] = useState<Record<string, unknown>[]>([]);
  const [classroomName, setClassroomName] = useState('');
  const [classroomGradeId, setClassroomGradeId] = useState('');
  const [studentForm, setStudentForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    classroomId: '',
    bolumId: ''
  });
  const [parentForm, setParentForm] = useState({ firstName: '', lastName: '', phone: '', studentId: '' });
  const [ingestExamId, setIngestExamId] = useState('');
  const [ingestReplace, setIngestReplace] = useState(false);
  const [ingestJson, setIngestJson] = useState('');
  const [ingestBusy, setIngestBusy] = useState(false);
  const [structurePreview, setStructurePreview] = useState('');

  const reloadStatus = useCallback(async () => {
    try {
      setStatus(await fetchEdesisStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    try {
      const r = await fetchEdesisHubStudents();
      setHubStudents(r.items || []);
      setPlatformStudents(sortByFirstName(r.platformStudents || [], (p) => p.name || ''));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Öğrenci listesi alınamadı');
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadStatus();
    void loadStudents();
  }, [reloadStatus, loadStudents]);

  const filteredHub = useMemo(() => {
    const q = studentSearch.trim().toLocaleLowerCase('tr-TR');
    const list = hubStudents.length
      ? hubStudents
      : platformStudents.map(
          (p): EdesisHubStudent => ({
            edesisId: p.edesis_ogrenci_id,
            name: p.name,
            email: p.email,
            schoolNo: null,
            platformStudentId: p.id,
            platformStudentName: p.name,
            matchMethod: p.edesis_ogrenci_id ? 'edesis_ogrenci_id' : null,
            linked: Boolean(p.edesis_ogrenci_id)
          })
        );
    if (!q) return list;
    return list.filter(
      (s) =>
        (s.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (s.email || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(s.edesisId || '').includes(q) ||
        (s.platformStudentName || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [hubStudents, platformStudents, studentSearch]);

  const loadDossier = useCallback(
    async (platformId: string, edesisId?: string) => {
      if (!platformId && !edesisId) return;
      setDossierLoading(true);
      setDossier(null);
      try {
        const d = await fetchEdesisStudentDossier({
          studentId: platformId || undefined,
          edesisStudentId: edesisId || undefined
        });
        setDossier(d);
        if (d.edesisStudentId) setSelectedEdesisId(d.edesisStudentId);
        if (d.platformStudentId) setSelectedPlatformId(d.platformStudentId);
        setDossierTab('girecek');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Öğrenci dosyası alınamadı');
      } finally {
        setDossierLoading(false);
      }
    },
    []
  );

  const selectStudent = (item: EdesisHubStudent) => {
    const platformId = item.platformStudentId || '';
    const edesisId = item.edesisId || '';
    setSelectedPlatformId(platformId);
    setSelectedEdesisId(edesisId);
    const next = new URLSearchParams(searchParams);
    if (platformId) next.set('studentId', platformId);
    else next.delete('studentId');
    setSearchParams(next, { replace: true });
    if (platformId || edesisId) void loadDossier(platformId, edesisId || undefined);
  };

  useEffect(() => {
    const sid = searchParams.get('studentId');
    if (!sid || dossier || dossierLoading || !platformStudents.length) return;
    const hit =
      hubStudents.find((s) => s.platformStudentId === sid) ||
      platformStudents.find((p) => p.id === sid);
    if (!hit) return;
    if ('platformStudentId' in (hit as EdesisHubStudent) && (hit as EdesisHubStudent).platformStudentId) {
      selectStudent(hit as EdesisHubStudent);
    } else {
      const p = hit as EdesisPlatformStudent;
      selectStudent({
        edesisId: p.edesis_ogrenci_id,
        name: p.name,
        email: p.email,
        schoolNo: null,
        platformStudentId: p.id,
        platformStudentName: p.name,
        matchMethod: p.edesis_ogrenci_id ? 'edesis_ogrenci_id' : null,
        linked: Boolean(p.edesis_ogrenci_id)
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformStudents.length, hubStudents.length]);

  const onSync = async () => {
    setSyncBusy(true);
    try {
      const r = await syncEdesis();
      if (r.ok) toast.success(`${r.imported ?? 0} deneme aktarıldı`);
      else toast.error(r.error || r.diagnosis || 'Senkron başarısız');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Senkron hatası');
    } finally {
      setSyncBusy(false);
    }
  };

  const onLink = async (item: EdesisHubStudent, platformStudentId: string) => {
    if (!item.edesisId || !platformStudentId) return;
    setLinkBusyId(item.edesisId);
    try {
      await linkEdesisStudent({ platformStudentId, edesisStudentId: item.edesisId });
      toast.success('Edesis ID bağlandı');
      await loadStudents();
      void loadDossier(platformStudentId, item.edesisId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bağlantı başarısız');
    } finally {
      setLinkBusyId(null);
    }
  };

  const onKarne = async (exam: EdesisStudentResultsExam) => {
    const edesisId = dossier?.edesisStudentId || selectedEdesisId;
    if (!exam.edesisExamId || !edesisId) {
      toast.error('Karne için Edesis öğrenci ve sınav ID gerekli');
      return;
    }
    const key = `${exam.edesisExamId}-${edesisId}`;
    setKarneBusyKey(key);
    try {
      const r = await fetchEdesisKarnePdf({
        examId: exam.edesisExamId,
        edesisStudentId: edesisId,
        studentId: selectedPlatformId || undefined
      });
      if (r.reportUrl) {
        window.open(r.reportUrl, '_blank', 'noopener,noreferrer');
        toast.success(r.message || 'Karne PDF hazır');
      } else toast.warning(r.message || 'Karne URL dönmedi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Karne oluşturulamadı');
    } finally {
      setKarneBusyKey(null);
    }
  };

  const onKarneWhatsApp = async (exam: EdesisStudentResultsExam) => {
    const edesisId = dossier?.edesisStudentId || selectedEdesisId;
    const phone = dossier?.profile.parentPhone;
    if (!exam.edesisExamId || !edesisId) return toast.error('Karne için Edesis ID gerekli');
    if (!phone) return toast.error('Veli telefonu öğrenci kartında yok');
    if (!user?.id) return toast.error('Oturum yok');
    const rowKey = String(exam.edesisExamId);
    setKarneWaBusyKey(rowKey);
    try {
      const r = await shareEdesisKarneWithParent({
        exam,
        edesisStudentId: edesisId,
        platformStudentId: selectedPlatformId || undefined,
        studentName: dossier?.profile.name || 'Öğrenci',
        parentPhone: phone,
        coachUserId: user.id
      });
      toast.success(r.notice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Veliye gönderilemedi');
    } finally {
      setKarneWaBusyKey(null);
    }
  };

  const loadWriteCatalog = async () => {
    setWriteLoading(true);
    try {
      const [g, d, c] = await Promise.all([
        fetchEdesisHubGrades(),
        fetchEdesisHubDepartments(),
        fetchEdesisHubClassrooms()
      ]);
      setGrades(g.items || []);
      setDepartments(d.items || []);
      setClassrooms(c.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yazma kataloğu alınamadı');
    } finally {
      setWriteLoading(false);
    }
  };

  const onCreateClassroom = async () => {
    if (!classroomName.trim() || !classroomGradeId.trim()) return toast.error('Şube adı ve gradeId gerekli');
    setWriteLoading(true);
    try {
      await createEdesisClassroomHub({
        name: classroomName.trim(),
        gradeId: Number(classroomGradeId) || classroomGradeId
      });
      toast.success('Şube oluşturuldu');
      setClassroomName('');
      await loadWriteCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şube oluşturulamadı');
    } finally {
      setWriteLoading(false);
    }
  };

  const onCreateStudent = async () => {
    if (!studentForm.firstName.trim() || !studentForm.classroomId.trim()) {
      return toast.error('Ad ve classroomId gerekli');
    }
    setWriteLoading(true);
    try {
      const body: Record<string, unknown> = {
        firstName: studentForm.firstName.trim(),
        lastName: studentForm.lastName.trim(),
        classroomId: Number(studentForm.classroomId) || studentForm.classroomId
      };
      if (studentForm.email.trim()) body.email = studentForm.email.trim();
      if (studentForm.bolumId.trim()) body.bolumId = Number(studentForm.bolumId) || studentForm.bolumId;
      const r = await createEdesisStudentHub(body);
      toast.success('Edesis öğrencisi oluşturuldu');
      const sid = String((r.item as { id?: string })?.id || '');
      if (sid) setParentForm((p) => ({ ...p, studentId: sid }));
      await loadStudents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Öğrenci eklenemedi');
    } finally {
      setWriteLoading(false);
    }
  };

  const onCreateParent = async () => {
    if (!parentForm.studentId.trim() || !parentForm.firstName.trim()) {
      return toast.error('Veli adı ve Edesis studentId gerekli');
    }
    setWriteLoading(true);
    try {
      await createEdesisParentHub({
        firstName: parentForm.firstName.trim(),
        lastName: parentForm.lastName.trim(),
        phone: parentForm.phone.trim() || undefined,
        studentId: Number(parentForm.studentId) || parentForm.studentId
      });
      toast.success('Veli eklendi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Veli eklenemedi');
    } finally {
      setWriteLoading(false);
    }
  };

  const onLoadStructure = async () => {
    if (!ingestExamId.trim()) return toast.error('Sınav ID girin');
    setIngestBusy(true);
    try {
      const r = await fetchEdesisExamStructure(ingestExamId.trim());
      setStructurePreview(
        (r.items || [])
          .map((row) => `${row.kitapcikTuru} · ${row.lessonName} (${row.questionCount} soru)`)
          .join('\n') || 'Yapı boş'
      );
      toast.success(`${r.count} kitapçık×ders`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yapı alınamadı');
    } finally {
      setIngestBusy(false);
    }
  };

  const onIngestResults = async () => {
    if (!ingestExamId.trim()) return toast.error('Sınav seçin');
    let results: Record<string, unknown>[] = [];
    try {
      const parsed = JSON.parse(ingestJson || '[]');
      results = Array.isArray(parsed) ? parsed : Array.isArray(parsed.results) ? parsed.results : [];
    } catch {
      return toast.error('results JSON geçersiz');
    }
    if (!results.length) return toast.error('results dizisi boş');
    setIngestBusy(true);
    try {
      const r = await ingestEdesisExamResults({
        examId: ingestExamId.trim(),
        replace: ingestReplace,
        results
      });
      if (r.conflict) return toast.warning(r.hint || 'Mevcut sonuç var — replace işaretleyin');
      toast.success(`${r.accepted || 0} satır kabul · ${r.job?.state || 'kuyruk'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderim başarısız');
    } finally {
      setIngestBusy(false);
    }
  };

  useEffect(() => {
    if (dossierTab === 'araclar' && !grades.length && status?.configured) void loadWriteCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierTab]);

  const profile = dossier?.profile;
  const takeable = dossier?.takeable || [];
  const taken = dossier?.taken || [];
  const openOnline = dossier?.openOnline || [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-xl">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300/90">
              Online VIP · Edesis Command
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Öğrenci sınav köprüsü</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Öğrenciyi seçin — gireceği denemeler, girdiği sonuçlar, karne ve kurumdaki açık online sınavlar tek
              dosyada. Öğrenci listesi otomatik gelir; tam senkron yalnızca “Şimdi senkron” ile (Hobby 60s sınırı).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!status?.configured || syncBusy}
              onClick={() => void onSync()}
              className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {syncBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
              {syncBusy ? 'Senkron…' : 'Şimdi senkron'}
            </button>
            <Link
              to="/edesis-analiz"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15"
            >
              <Sparkles className="h-4 w-4" />
              Analiz
            </Link>
          </div>
        </div>
        <div className="relative mt-5 grid gap-3 sm:grid-cols-4">
          {[
            ['API', status?.configured ? 'Bağlı' : 'Eksik'],
            ['Edesis ID', String(status?.studentsWithEdesisId ?? '—')],
            ['Platform', String(status?.studentsInDb ?? '—')],
            ['Senkron', syncBusy ? 'Çalışıyor' : 'Otomatik']
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">{k}</p>
              <p className="mt-1 text-lg font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Users className="h-4 w-4 text-indigo-600" />
              Öğrenciler
            </h2>
            <button
              type="button"
              disabled={studentsLoading}
              onClick={() => void loadStudents()}
              className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
            >
              {studentsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Ad, e-posta, Edesis ID"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {filteredHub.map((item) => {
              const active =
                (item.platformStudentId && item.platformStudentId === selectedPlatformId) ||
                (item.edesisId && item.edesisId === selectedEdesisId);
              return (
                <button
                  key={String(item.edesisId || item.platformStudentId || item.name)}
                  type="button"
                  onClick={() => selectStudent(item)}
                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                    active ? 'bg-indigo-600 text-white shadow' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.name || item.platformStudentName}</span>
                    <span className={`block truncate text-xs ${active ? 'text-indigo-100' : 'text-slate-500'}`}>
                      {item.edesisId ? `Edesis ${item.edesisId}` : 'ID bağlı değil'}
                      {item.linked ? ' · bağlı' : ''}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                </button>
              );
            })}
            {!studentsLoading && !filteredHub.length && (
              <p className="px-2 py-8 text-center text-sm text-slate-500">Öğrenci bulunamadı</p>
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          {!selectedPlatformId && !selectedEdesisId ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              Soldan bir öğrenciye tıklayın. Gireceği ve girdiği tüm Edesis sınavları burada açılır.
            </div>
          ) : dossierLoading ? (
            <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{profile?.name || 'Öğrenci'}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {profile?.classLevel || profile?.gradeName || 'Sınıf yok'}
                      {profile?.className ? ` · ${profile.className}` : ''}
                      {profile?.email ? ` · ${profile.email}` : ''}
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-400">
                      Edesis {dossier?.edesisStudentId || selectedEdesisId || '—'}
                      {profile?.parentPhone ? ` · veli ${profile.parentPhone}` : ''}
                      {profile?.programKeys?.length ? ` · ${profile.programKeys.join(', ')}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadDossier(selectedPlatformId, selectedEdesisId || undefined)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Dosyayı yenile
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    ['Girecek', dossier?.counts.takeable ?? takeable.length, 'amber'],
                    ['Girdi', dossier?.counts.taken ?? taken.length, 'emerald'],
                    ['Kurumda açık', dossier?.counts.openOnline ?? openOnline.length, 'indigo']
                  ].map(([label, n, tone]) => (
                    <div key={String(label)} className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p
                        className={`text-2xl font-semibold ${
                          tone === 'amber' ? 'text-amber-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-indigo-700'
                        }`}
                      >
                        {n as number}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['girecek', 'Girecek sınavlar', <ClipboardList className="h-4 w-4" />],
                    ['girdi', 'Girdiği sınavlar', <CheckCircle2 className="h-4 w-4" />],
                    ['kurum', 'Kurumda açık', <GraduationCap className="h-4 w-4" />],
                    ['araclar', 'Kurum araçları', <PenLine className="h-4 w-4" />]
                  ] as const
                ).map(([id, label, icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDossierTab(id)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                      dossierTab === id ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              {dossierTab === 'girecek' && (
                <div className="space-y-2">
                  {takeable.map((ex) => (
                    <ExamRow
                      key={ex.examId}
                      title={ex.name}
                      type={ex.examType}
                      date={ex.examDate}
                      status={ex.resultStatus}
                      extra={ex.totalQuestions != null ? `${ex.totalQuestions} soru` : null}
                    >
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                        Sınava girilebilir
                      </span>
                    </ExamRow>
                  ))}
                  {!takeable.length && (
                    <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                      Bu öğrenci için henüz girilmemiş açık deneme yok.
                    </p>
                  )}
                </div>
              )}

              {dossierTab === 'girdi' && (
                <div className="space-y-2">
                  {taken.map((ex) => {
                    const key = `${ex.edesisExamId}`;
                    return (
                      <ExamRow
                        key={key}
                        title={ex.examTitle}
                        type={ex.examType}
                        date={ex.examDate}
                        extra={`net ${ex.totalNet ?? '—'}`}
                      >
                        <button
                          type="button"
                          disabled={karneBusyKey === `${ex.edesisExamId}-${dossier?.edesisStudentId}`}
                          onClick={() => void onKarne(ex)}
                          className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800"
                        >
                          {karneBusyKey ? 'Karne…' : 'Karne PDF'}
                        </button>
                        <button
                          type="button"
                          disabled={karneWaBusyKey === key}
                          onClick={() => void onKarneWhatsApp(ex)}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Veli
                        </button>
                        <Link
                          to={`/edesis-analiz?studentId=${encodeURIComponent(selectedPlatformId)}`}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          Analiz
                        </Link>
                      </ExamRow>
                    );
                  })}
                  {!taken.length && (
                    <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                      Sonuç bulunamadı.
                    </p>
                  )}
                </div>
              )}

              {dossierTab === 'kurum' && (
                <div className="space-y-2">
                  <p className="text-sm text-slate-500">
                    Programına uygun, henüz girmediği kurum online denemeleri. Sınava gir listesi atama + ince
                    roster süzmesi uygular; burası tam görünürlük içindir.
                  </p>
                  {openOnline.map((ex) => (
                    <ExamRow
                      key={ex.examId}
                      title={ex.name}
                      type={ex.examType}
                      date={ex.examDate}
                      status={ex.resultStatus}
                      extra={ex.studentCount != null ? `${ex.studentCount} öğrenci` : null}
                    />
                  ))}
                  {!openOnline.length && (
                    <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                      Açık kurum denemesi yok.
                    </p>
                  )}
                </div>
              )}

              {dossierTab === 'araclar' && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold">
                      <Link2 className="h-4 w-4 text-indigo-600" />
                      Edesis eşleme
                    </h3>
                    {hubStudents
                      .filter((s) => s.platformStudentId === selectedPlatformId || s.edesisId === selectedEdesisId)
                      .map((item) => (
                        <div key={String(item.edesisId)} className="flex flex-wrap items-center gap-3 text-sm">
                          <span>
                            {item.name} · {item.edesisId}
                          </span>
                          {item.linked ? (
                            <span className="text-emerald-700">Bağlı</span>
                          ) : (
                            <select
                              defaultValue=""
                              disabled={linkBusyId === item.edesisId}
                              onChange={(e) => {
                                if (e.target.value) void onLink(item, e.target.value);
                              }}
                              className="rounded-lg border px-2 py-1"
                            >
                              <option value="">Platform öğrencisi seç</option>
                              {platformStudents.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ))}
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold">
                      <Plug className="h-4 w-4 text-indigo-600" />
                      Bağlantı
                    </h3>
                    <EdesisSyncPanel />
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5">
                    <h3 className="mb-3 font-semibold">Şube / öğrenci / veli yazma</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={classroomName}
                        onChange={(e) => setClassroomName(e.target.value)}
                        placeholder="Şube adı"
                        className="rounded-lg border px-3 py-2 text-sm"
                      />
                      <select
                        value={classroomGradeId}
                        onChange={(e) => setClassroomGradeId(e.target.value)}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="">gradeId</option>
                        {grades.map((g, i) => (
                          <option key={i} value={String((g as { id?: string }).id || '')}>
                            {String((g as { name?: string }).name || (g as { id?: string }).id)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={writeLoading}
                      onClick={() => void onCreateClassroom()}
                      className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                    >
                      Şube oluştur
                    </button>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input
                        value={studentForm.firstName}
                        onChange={(e) => setStudentForm((s) => ({ ...s, firstName: e.target.value }))}
                        placeholder="Ad"
                        className="rounded-lg border px-3 py-2 text-sm"
                      />
                      <input
                        value={studentForm.lastName}
                        onChange={(e) => setStudentForm((s) => ({ ...s, lastName: e.target.value }))}
                        placeholder="Soyad"
                        className="rounded-lg border px-3 py-2 text-sm"
                      />
                      <input
                        value={studentForm.email}
                        onChange={(e) => setStudentForm((s) => ({ ...s, email: e.target.value }))}
                        placeholder="E-posta"
                        className="rounded-lg border px-3 py-2 text-sm"
                      />
                      <select
                        value={studentForm.classroomId}
                        onChange={(e) => setStudentForm((s) => ({ ...s, classroomId: e.target.value }))}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="">Şube</option>
                        {classrooms.map((c, i) => (
                          <option key={i} value={String((c as { id?: string }).id || '')}>
                            {String((c as { name?: string }).name || (c as { id?: string }).id)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={studentForm.bolumId}
                        onChange={(e) => setStudentForm((s) => ({ ...s, bolumId: e.target.value }))}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="">Bölüm (lise)</option>
                        {departments.map((d, i) => (
                          <option key={i} value={String((d as { id?: string }).id || '')}>
                            {String((d as { name?: string }).name || (d as { id?: string }).id)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={writeLoading}
                      onClick={() => void onCreateStudent()}
                      className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
                    >
                      Öğrenci ekle
                    </button>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input
                        value={parentForm.firstName}
                        onChange={(e) => setParentForm((p) => ({ ...p, firstName: e.target.value }))}
                        placeholder="Veli adı"
                        className="rounded-lg border px-3 py-2 text-sm"
                      />
                      <input
                        value={parentForm.lastName}
                        onChange={(e) => setParentForm((p) => ({ ...p, lastName: e.target.value }))}
                        placeholder="Veli soyadı"
                        className="rounded-lg border px-3 py-2 text-sm"
                      />
                      <input
                        value={parentForm.phone}
                        onChange={(e) => setParentForm((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="Telefon"
                        className="rounded-lg border px-3 py-2 text-sm"
                      />
                      <input
                        value={parentForm.studentId}
                        onChange={(e) => setParentForm((p) => ({ ...p, studentId: e.target.value }))}
                        placeholder="Edesis studentId"
                        className="rounded-lg border px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={writeLoading}
                      onClick={() => void onCreateParent()}
                      className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      Veli ekle
                    </button>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold">
                      <FileText className="h-4 w-4" />
                      Ham sonuç gönderimi
                    </h3>
                    <input
                      value={ingestExamId}
                      onChange={(e) => setIngestExamId(e.target.value)}
                      placeholder="examId"
                      className="mb-2 w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <textarea
                      value={ingestJson}
                      onChange={(e) => setIngestJson(e.target.value)}
                      placeholder='[{"ogrenciId":2086573,"kitapcikTuru":"A","dersCevaplari":[]}]'
                      className="h-28 w-full rounded-lg border px-3 py-2 font-mono text-xs"
                    />
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ingestReplace}
                        onChange={(e) => setIngestReplace(e.target.checked)}
                      />
                      replace (mevcut sonucu üzerine yaz)
                    </label>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={ingestBusy}
                        onClick={() => void onLoadStructure()}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        Yapıyı getir
                      </button>
                      <button
                        type="button"
                        disabled={ingestBusy}
                        onClick={() => void onIngestResults()}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        Gönder
                      </button>
                    </div>
                    {structurePreview ? (
                      <pre className="mt-3 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{structurePreview}</pre>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
