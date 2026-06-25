import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Brain,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  ExternalLink,
  FileText,
  GraduationCap,
  Link2,
  Loader2,
  PenLine,
  Plug,
  RefreshCw,
  Search,
  Users
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import EdesisSyncPanel from '../components/settings/EdesisSyncPanel';
import {
  createEdesisClassroomHub,
  createEdesisParentHub,
  createEdesisStudentHub,
  fetchEdesisHubExams,
  fetchEdesisHubClassrooms,
  fetchEdesisHubDepartments,
  fetchEdesisHubGrades,
  fetchEdesisHubStudents,
  fetchEdesisHubTerms,
  fetchEdesisKarnePdf,
  fetchEdesisStatus,
  fetchEdesisStudentResultsHub,
  linkEdesisStudent,
  syncEdesis,
  type EdesisHubStudent,
  type EdesisPlatformStudent,
  type EdesisStatus,
  type EdesisStudentResultsExam
} from '../lib/edesis/edesisApi';

type TabId = 'baglanti' | 'ogrenciler' | 'donem' | 'sonuclar' | 'yazma';

const WRITE_STEPS = [
  { n: 1, title: 'Sınıf seviyeleri', desc: 'GET /grades — gradeId şube oluşturmak için gerekli.' },
  { n: 2, title: 'Bölümler', desc: 'GET /departments — lise öğrencisi için bolumId zorunlu.' },
  { n: 3, title: 'Şube oluştur', desc: 'POST /classrooms — dönen id öğrenci atamasında kullanılır.' },
  { n: 4, title: 'Öğrenci ekle', desc: 'POST /students — classroomId + bolumId ile profil ve kullanıcı.' },
  { n: 5, title: 'Veli ekle', desc: 'POST /parents — studentId ile veli bağlantısı.' }
];

const SYNC_TIP =
  'Senkronizasyon: öğrenci listesini günde bir kez çekin; sınav sonuçlarını sınav bittikten sonra alın. Sık istek rate limit tetikler.';

const STEPS = [
  { n: 1, title: 'API Key', desc: 'Kurum yöneticinizden API anahtarı alın (Vercel ortam değişkeni).' },
  { n: 2, title: 'Öğrenci listesi', desc: 'GET /students — Edesis id’lerini sisteme kaydedin.' },
  { n: 3, title: 'Dönem & sınav', desc: 'GET /terms ve GET /exams ile katalog bilgisini görün.' },
  { n: 4, title: 'Sınav sonuçları', desc: 'GET /exams/results?StudentId=… ile öğrenci sonuçlarını sorgulayın.' },
  { n: 5, title: 'Karne PDF', desc: 'POST /reports/exam-report — reportUrl ile PDF indirin.' }
];

function pickField(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v);
  }
  return '—';
}

export default function EdesisPage() {
  const [tab, setTab] = useState<TabId>('baglanti');
  const [status, setStatus] = useState<EdesisStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  const [studentsLoading, setStudentsLoading] = useState(false);
  const [hubStudents, setHubStudents] = useState<EdesisHubStudent[]>([]);
  const [platformStudents, setPlatformStudents] = useState<EdesisPlatformStudent[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);

  const [termsLoading, setTermsLoading] = useState(false);
  const [terms, setTerms] = useState<Record<string, unknown>[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [exams, setExams] = useState<Record<string, unknown>[]>([]);

  const [resultsLoading, setResultsLoading] = useState(false);
  const [selectedEdesisId, setSelectedEdesisId] = useState('');
  const [selectedPlatformId, setSelectedPlatformId] = useState('');
  const [resultExams, setResultExams] = useState<EdesisStudentResultsExam[]>([]);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [karneBusyKey, setKarneBusyKey] = useState<string | null>(null);
  const [lastKarneUrl, setLastKarneUrl] = useState<string | null>(null);
  const [selectedTermId, setSelectedTermId] = useState('');

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
  const [parentForm, setParentForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    studentId: ''
  });

  const reloadStatus = useCallback(async () => {
    try {
      setStatus(await fetchEdesisStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void reloadStatus();
  }, [reloadStatus]);

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    try {
      const r = await fetchEdesisHubStudents();
      setHubStudents(r.items || []);
      setPlatformStudents(r.platformStudents || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Öğrenci listesi alınamadı');
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const loadTermsAndExams = useCallback(async () => {
    setTermsLoading(true);
    setExamsLoading(true);
    try {
      const [t, e] = await Promise.all([fetchEdesisHubTerms(), fetchEdesisHubExams()]);
      setTerms(t.items || []);
      setExams(e.items || []);
      const def = (t.items || []).find((row) => row.isDefault === true) || (t.items || [])[0];
      const defId = def ? pickField(def, ['id', 'termId']) : '';
      if (defId && defId !== '—') setSelectedTermId(defId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dönem/sınav listesi alınamadı');
    } finally {
      setTermsLoading(false);
      setExamsLoading(false);
    }
  }, []);

  const loadWriteCatalog = useCallback(async () => {
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
      toast.error(e instanceof Error ? e.message : 'Yazma kataloğu alınamadı — admin API paketi gerekli');
    } finally {
      setWriteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'ogrenciler' && !hubStudents.length && status?.configured) void loadStudents();
    if (tab === 'sonuclar' && !terms.length && status?.configured) void loadTermsAndExams();
    if (tab === 'donem' && !terms.length && !exams.length && status?.configured) void loadTermsAndExams();
    if ((tab === 'sonuclar' || tab === 'ogrenciler') && !platformStudents.length && status?.configured) {
      void loadStudents();
    }
    if (tab === 'yazma' && !grades.length && status?.configured) void loadWriteCatalog();
  }, [tab, hubStudents.length, terms.length, exams.length, platformStudents.length, grades.length, status?.configured, loadStudents, loadTermsAndExams, loadWriteCatalog]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return hubStudents;
    return hubStudents.filter(
      (s) =>
        (s.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (s.email || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(s.edesisId || '').includes(q) ||
        (s.platformStudentName || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [hubStudents, studentSearch]);

  const edesisIdByPlatformId = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of hubStudents) {
      if (s.platformStudentId && s.edesisId) map.set(s.platformStudentId, s.edesisId);
    }
    for (const p of platformStudents) {
      if (p.edesis_ogrenci_id) map.set(p.id, String(p.edesis_ogrenci_id));
    }
    return map;
  }, [hubStudents, platformStudents]);

  const applyPlatformStudentSelection = (platformId: string) => {
    setSelectedPlatformId(platformId);
    if (!platformId) return;
    const fromHub = edesisIdByPlatformId.get(platformId);
    if (fromHub) {
      setSelectedEdesisId(fromHub);
      return;
    }
    const p = platformStudents.find((x) => x.id === platformId);
    if (p?.edesis_ogrenci_id) setSelectedEdesisId(String(p.edesis_ogrenci_id));
  };

  const onSync = async () => {
    setSyncBusy(true);
    try {
      const r = await syncEdesis();
      if (r.ok && (r.imported ?? 0) > 0) {
        toast.success(`${r.imported} deneme sisteme aktarıldı`);
      } else if (r.ok) {
        toast.warning(r.diagnosis || 'Senkron tamamlandı — yeni kayıt yok');
      } else {
        toast.error(r.error || r.diagnosis || 'Senkron başarısız');
      }
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bağlantı başarısız');
    } finally {
      setLinkBusyId(null);
    }
  };

  const loadResults = async () => {
    if (!selectedEdesisId && !selectedPlatformId) {
      toast.error('Öğrenci seçin');
      return;
    }
    setResultsLoading(true);
    setResultExams([]);
    try {
      const r = await fetchEdesisStudentResultsHub({
        edesisStudentId: selectedEdesisId || undefined,
        studentId: selectedPlatformId || undefined
      });
      setResultExams(r.exams || []);
      if (r.platformStudentId) setSelectedPlatformId(r.platformStudentId);
      if (r.edesisStudentId) setSelectedEdesisId(r.edesisStudentId);
      if (r.autoLinked) {
        toast.success(`Edesis ID otomatik bağlandı (${r.edesisStudentId})`);
        void loadStudents();
      }
      if ((r.exams || []).length) {
        toast.success(`${r.count} sınav sonucu yüklendi`);
      } else {
        toast.info('Bu öğrenci için sonuç bulunamadı');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sonuçlar alınamadı');
    } finally {
      setResultsLoading(false);
    }
  };

  const onKarne = async (exam: EdesisStudentResultsExam) => {
    if (!exam.edesisExamId || !selectedEdesisId) {
      toast.error('Karne için Edesis öğrenci ID ve sınav ID gerekli');
      return;
    }
    const key = `${exam.edesisExamId}-${selectedEdesisId}`;
    setKarneBusyKey(key);
    setLastKarneUrl(null);
    try {
      const r = await fetchEdesisKarnePdf({
        examId: exam.edesisExamId,
        edesisStudentId: selectedEdesisId,
        studentId: selectedPlatformId || undefined,
        termId: selectedTermId || undefined
      });
      if (r.reportUrl) {
        setLastKarneUrl(r.reportUrl);
        window.open(r.reportUrl, '_blank', 'noopener,noreferrer');
        toast.success(r.message || 'Karne PDF hazır');
      } else {
        toast.warning(r.message || r.hint || 'reportUrl dönmedi — admin/student_dashboard paketi gerekli');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Karne oluşturulamadı');
    } finally {
      setKarneBusyKey(null);
    }
  };

  const onCreateClassroom = async () => {
    if (!classroomName.trim() || !classroomGradeId.trim()) {
      toast.error('Şube adı ve gradeId gerekli');
      return;
    }
    setWriteLoading(true);
    try {
      const r = await createEdesisClassroomHub({
        name: classroomName.trim(),
        gradeId: Number(classroomGradeId) || classroomGradeId
      });
      toast.success('Şube oluşturuldu');
      setClassroomName('');
      await loadWriteCatalog();
      const id = pickField((r.item as Record<string, unknown>) || {}, ['id', 'classroomId']);
      if (id !== '—') setStudentForm((s) => ({ ...s, classroomId: id }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şube oluşturulamadı');
    } finally {
      setWriteLoading(false);
    }
  };

  const onCreateStudent = async () => {
    if (!studentForm.firstName.trim() || !studentForm.lastName.trim() || !studentForm.classroomId.trim()) {
      toast.error('Ad, soyad ve classroomId gerekli');
      return;
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
      const item = (r.item as Record<string, unknown>) || {};
      const sid = pickField(item, ['id', 'studentId']);
      if (sid !== '—') setParentForm((p) => ({ ...p, studentId: sid }));
      setStudentForm({ firstName: '', lastName: '', email: '', classroomId: studentForm.classroomId, bolumId: studentForm.bolumId });
      await loadStudents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Öğrenci eklenemedi');
    } finally {
      setWriteLoading(false);
    }
  };

  const onCreateParent = async () => {
    if (!parentForm.studentId.trim() || !parentForm.firstName.trim()) {
      toast.error('Veli adı ve Edesis studentId gerekli');
      return;
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
      setParentForm({ firstName: '', lastName: '', phone: '', studentId: parentForm.studentId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Veli eklenemedi');
    } finally {
      setWriteLoading(false);
    }
  };

  const tabBtn = (id: TabId, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
        tab === id
          ? 'bg-indigo-600 text-white shadow'
          : 'bg-white text-indigo-900 hover:bg-indigo-50 border border-indigo-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edesis</h1>
          <p className="mt-1 text-sm text-slate-600">
            Edesis External API v1 — öğrenci eşleme, sınav sonuçları ve karne PDF
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!status?.configured || syncBusy}
            onClick={() => void onSync()}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {syncBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
            Tüm sonuçları senkronize et
          </button>
          <Link
            to="/exam-tracking"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <BookOpen className="h-4 w-4" />
            Deneme takibi
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
        <p className="mb-3 text-sm font-semibold text-indigo-950">Veri okuma akışı</p>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-lg border border-indigo-100 bg-white/90 p-3 text-xs">
              <span className="font-bold text-indigo-700">{s.n}.</span> {s.title}
              <p className="mt-1 text-slate-600">{s.desc}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabBtn('baglanti', 'Bağlantı & Senkron', <Plug className="h-4 w-4" />)}
        {tabBtn('ogrenciler', 'Edesis Öğrencileri', <Users className="h-4 w-4" />)}
        {tabBtn('donem', 'Dönem & Sınavlar', <GraduationCap className="h-4 w-4" />)}
        {tabBtn('sonuclar', 'Sonuçlar & Karne', <FileText className="h-4 w-4" />)}
        {tabBtn('yazma', 'Veri Yazma', <PenLine className="h-4 w-4" />)}
      </div>

      {tab === 'baglanti' && <EdesisSyncPanel />}

      {tab === 'ogrenciler' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Edesis <code className="rounded bg-slate-100 px-1">GET /students</code> — platform öğrencisiyle eşleştirin
            </p>
            <button
              type="button"
              disabled={!status?.configured || studentsLoading}
              onClick={() => void loadStudents()}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
            >
              {studentsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Listeyi çek
            </button>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Ad, e-posta veya Edesis ID ara…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-2 py-2">Edesis ID</th>
                  <th className="px-2 py-2">Ad</th>
                  <th className="px-2 py-2">E-posta</th>
                  <th className="px-2 py-2">Platform eşleşme</th>
                  <th className="px-2 py-2">Bağla</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((item) => (
                  <tr key={String(item.edesisId || item.name)} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-mono text-xs">{item.edesisId || '—'}</td>
                    <td className="px-2 py-2">{item.name || '—'}</td>
                    <td className="px-2 py-2">{item.email || '—'}</td>
                    <td className="px-2 py-2">
                      {item.linked ? (
                        <span className="text-green-700">{item.platformStudentName} ✓</span>
                      ) : item.platformStudentName ? (
                        <span className="text-amber-700">
                          {item.platformStudentName} ({item.matchMethod})
                        </span>
                      ) : (
                        <span className="text-red-600">Eşleşmedi</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {item.linked ? (
                        <span className="text-xs text-green-600">Bağlı</span>
                      ) : item.edesisId && item.platformStudentId ? (
                        <button
                          type="button"
                          disabled={linkBusyId === item.edesisId}
                          onClick={() => void onLink(item, item.platformStudentId!)}
                          className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {linkBusyId === item.edesisId ? 'Bağlanıyor…' : 'Eşleşmeyi kaydet'}
                        </button>
                      ) : item.edesisId ? (
                        <select
                          defaultValue={item.platformStudentId || ''}
                          disabled={linkBusyId === item.edesisId}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v) void onLink(item, v);
                          }}
                          className="max-w-[180px] rounded border border-slate-200 px-2 py-1 text-xs"
                        >
                          <option value="">Öğrenci seç…</option>
                          {platformStudents.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!studentsLoading && !filteredStudents.length && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                      {status?.configured ? 'Liste boş — “Listeyi çek” ile Edesis’ten alın' : 'API key tanımlı değil'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'donem' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Dönemler (GET /terms)</h2>
              <button
                type="button"
                disabled={termsLoading}
                onClick={() => void loadTermsAndExams()}
                className="text-sm text-indigo-600 hover:underline disabled:opacity-50"
              >
                Yenile
              </button>
            </div>
            {termsLoading ? (
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
            ) : (
              <ul className="space-y-2 text-sm">
                {terms.map((t, i) => (
                  <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="font-medium">{pickField(t, ['name', 'termName', 'donemAdi'])}</span>
                    <span className="ml-2 text-slate-500">ID: {pickField(t, ['id', 'termId'])}</span>
                    {t.isDefault === true && (
                      <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-800">Varsayılan</span>
                    )}
                  </li>
                ))}
                {!terms.length && <li className="text-slate-500">Kayıt yok</li>}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Sınavlar (GET /exams)</h2>
              <button
                type="button"
                disabled={examsLoading}
                onClick={() => void loadTermsAndExams()}
                className="text-sm text-indigo-600 hover:underline disabled:opacity-50"
              >
                Yenile
              </button>
            </div>
            {examsLoading ? (
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
                {exams.map((ex, i) => (
                  <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="font-medium">{pickField(ex, ['name', 'examName', 'sinavAdi', 'title'])}</p>
                    <p className="text-xs text-slate-500">
                      ID: {pickField(ex, ['id', 'examId', 'sinavId'])} ·{' '}
                      {pickField(ex, ['examDate', 'sinavTarihi', 'date', 'tarih'])}
                    </p>
                  </li>
                ))}
                {!exams.length && <li className="text-slate-500">Kayıt yok</li>}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'sonuclar' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">
            <code className="rounded bg-slate-100 px-1">GET /exams/results?StudentId=…</code> ve{' '}
            <code className="rounded bg-slate-100 px-1">POST /reports/exam-report</code>
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Edesis öğrenci ID</span>
              <input
                value={selectedEdesisId}
                onChange={(e) => setSelectedEdesisId(e.target.value)}
                placeholder="Edesis student id"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">veya platform öğrenci</span>
              <select
                value={selectedPlatformId}
                onChange={(e) => applyPlatformStudentSelection(e.target.value)}
                className="min-w-[240px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Seçin…</option>
                {platformStudents.map((p) => {
                  const hubEdesis = edesisIdByPlatformId.get(p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {hubEdesis || p.edesis_ogrenci_id
                        ? ` (Edesis: ${hubEdesis || p.edesis_ogrenci_id})`
                        : ' — ID bağlı değil'}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Dönem (termId)</span>
              <select
                value={selectedTermId}
                onChange={(e) => setSelectedTermId(e.target.value)}
                className="min-w-[160px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Otomatik</option>
                {terms.map((t, i) => {
                  const id = pickField(t, ['id', 'termId']);
                  return (
                    <option key={i} value={id === '—' ? '' : id}>
                      {pickField(t, ['name', 'termName', 'donemAdi'])} ({id})
                    </option>
                  );
                })}
              </select>
            </label>
            <button
              type="button"
              disabled={resultsLoading}
              onClick={() => void loadResults()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {resultsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Sonuçları getir
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('ogrenciler');
                if (!hubStudents.length) void loadStudents();
              }}
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
            >
              <Link2 className="h-4 w-4" />
              Öğrenci bağla
            </button>
          </div>

          {lastKarneUrl ? (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
              Son karne:{' '}
              <a href={lastKarneUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                PDF&apos;yi aç / indir
              </a>
            </p>
          ) : null}

          <div className="space-y-2">
            {resultExams.map((exam) => {
              const key = String(exam.edesisExamId || exam.examTitle + exam.examDate);
              const open = expandedExam === key;
              return (
                <div key={key} className="rounded-lg border border-slate-200">
                  <div className="flex w-full items-center justify-between gap-2 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedExam(open ? null : key)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-80"
                    >
                      {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{exam.examTitle}</p>
                        <p className="text-xs text-slate-500">
                          {exam.examDate} · Net: {exam.totalNet?.toFixed?.(2) ?? exam.totalNet} · D/Y/B:{' '}
                          {exam.correct}/{exam.wrong}/{exam.blank}
                          {exam.subjectCount ? ` · ${exam.subjectCount} ders` : ''}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={!selectedEdesisId || karneBusyKey === key}
                      onClick={() => void onKarne(exam)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {karneBusyKey === key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ExternalLink className="h-3 w-3" />
                      )}
                      Karne PDF
                    </button>
                    {selectedPlatformId && exam.edesisExamId ? (
                      <Link
                        to={`/ai-coach?student=${encodeURIComponent(selectedPlatformId)}&from=edesis&edesisExamId=${encodeURIComponent(exam.edesisExamId)}&edesisStudentId=${encodeURIComponent(selectedEdesisId)}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-800 hover:bg-purple-100"
                      >
                        <Brain className="h-3 w-3" />
                        AI Koç
                      </Link>
                    ) : (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-400"
                        title="AI analiz için önce platform öğrencisi bağlayın"
                      >
                        <Brain className="h-3 w-3" />
                        AI Koç
                      </span>
                    )}
                  </div>
                  {open && (
                    <div className="border-t px-3 py-3">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="py-1">Ders</th>
                            <th className="py-1">D</th>
                            <th className="py-1">Y</th>
                            <th className="py-1">B</th>
                            <th className="py-1">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(exam.subjects || []).map((s, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="py-1 font-medium">{s.name}</td>
                              <td className="py-1">{s.correct}</td>
                              <td className="py-1">{s.wrong}</td>
                              <td className="py-1">{s.blank}</td>
                              <td className="py-1">{s.net?.toFixed?.(2) ?? s.net}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(exam.subjects || []).some((s) => (s.topics?.length ?? 0) > 0) && (
                        <p className="mt-2 text-xs text-slate-500">
                          Konu kırılımı mevcut — detay için Deneme Takibi sayfasında “Edesis detayını çek” kullanın.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!resultsLoading && !resultExams.length && (
              <p className="py-8 text-center text-sm text-slate-500">Öğrenci seçip sonuçları getirin</p>
            )}
          </div>
        </div>
      )}

      {tab === 'yazma' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
            <p className="text-sm font-semibold text-amber-950">Veri yazma akışı (admin paketi gerekli)</p>
            <ol className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {WRITE_STEPS.map((s) => (
                <li key={s.n} className="rounded-lg border border-amber-100 bg-white/90 p-3 text-xs">
                  <span className="font-bold text-amber-800">{s.n}.</span> {s.title}
                  <p className="mt-1 text-slate-600">{s.desc}</p>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-amber-900">{SYNC_TIP}</p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={writeLoading}
              onClick={() => void loadWriteCatalog()}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
            >
              {writeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Katalogları yenile
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900">Sınıf seviyeleri (GET /grades)</h3>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                {grades.map((g, i) => (
                  <li key={i} className="rounded bg-slate-50 px-2 py-1">
                    {pickField(g, ['name', 'gradeName', 'sinifAdi'])} — ID: {pickField(g, ['id', 'gradeId'])}
                  </li>
                ))}
                {!grades.length && <li className="text-slate-500">Liste boş veya admin paketi yok</li>}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900">Bölümler (GET /departments)</h3>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                {departments.map((d, i) => (
                  <li key={i} className="rounded bg-slate-50 px-2 py-1">
                    {pickField(d, ['name', 'bolumAdi', 'departmentName'])} — ID: {pickField(d, ['id', 'bolumId'])}
                  </li>
                ))}
                {!departments.length && <li className="text-slate-500">Liste boş</li>}
              </ul>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 font-semibold text-slate-900">POST /classrooms</h3>
              <div className="space-y-2 text-sm">
                <input
                  value={classroomName}
                  onChange={(e) => setClassroomName(e.target.value)}
                  placeholder="Şube adı (9-A)"
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                />
                <select
                  value={classroomGradeId}
                  onChange={(e) => setClassroomGradeId(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                >
                  <option value="">gradeId seç…</option>
                  {grades.map((g, i) => {
                    const id = pickField(g, ['id', 'gradeId']);
                    return (
                      <option key={i} value={id === '—' ? '' : id}>
                        {pickField(g, ['name', 'gradeName'])} ({id})
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  disabled={writeLoading}
                  onClick={() => void onCreateClassroom()}
                  className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Şube oluştur
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 font-semibold text-slate-900">POST /students</h3>
              <div className="space-y-2 text-sm">
                <input
                  value={studentForm.firstName}
                  onChange={(e) => setStudentForm((s) => ({ ...s, firstName: e.target.value }))}
                  placeholder="Ad"
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                />
                <input
                  value={studentForm.lastName}
                  onChange={(e) => setStudentForm((s) => ({ ...s, lastName: e.target.value }))}
                  placeholder="Soyad"
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                />
                <input
                  value={studentForm.email}
                  onChange={(e) => setStudentForm((s) => ({ ...s, email: e.target.value }))}
                  placeholder="E-posta (opsiyonel)"
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                />
                <select
                  value={studentForm.classroomId}
                  onChange={(e) => setStudentForm((s) => ({ ...s, classroomId: e.target.value }))}
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                >
                  <option value="">classroomId…</option>
                  {classrooms.map((c, i) => {
                    const id = pickField(c, ['id', 'classroomId']);
                    return (
                      <option key={i} value={id === '—' ? '' : id}>
                        {pickField(c, ['name', 'className'])} ({id})
                      </option>
                    );
                  })}
                </select>
                <select
                  value={studentForm.bolumId}
                  onChange={(e) => setStudentForm((s) => ({ ...s, bolumId: e.target.value }))}
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                >
                  <option value="">bolumId (lise)…</option>
                  {departments.map((d, i) => {
                    const id = pickField(d, ['id', 'bolumId']);
                    return (
                      <option key={i} value={id === '—' ? '' : id}>
                        {pickField(d, ['name', 'bolumAdi'])} ({id})
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  disabled={writeLoading}
                  onClick={() => void onCreateStudent()}
                  className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Öğrenci ekle
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 font-semibold text-slate-900">POST /parents</h3>
              <div className="space-y-2 text-sm">
                <input
                  value={parentForm.studentId}
                  onChange={(e) => setParentForm((p) => ({ ...p, studentId: e.target.value }))}
                  placeholder="Edesis studentId"
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                />
                <input
                  value={parentForm.firstName}
                  onChange={(e) => setParentForm((p) => ({ ...p, firstName: e.target.value }))}
                  placeholder="Veli adı"
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                />
                <input
                  value={parentForm.lastName}
                  onChange={(e) => setParentForm((p) => ({ ...p, lastName: e.target.value }))}
                  placeholder="Veli soyadı"
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                />
                <input
                  value={parentForm.phone}
                  onChange={(e) => setParentForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Telefon"
                  className="w-full rounded border border-slate-200 px-2 py-1.5"
                />
                <button
                  type="button"
                  disabled={writeLoading}
                  onClick={() => void onCreateParent()}
                  className="w-full rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  Veli ekle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
