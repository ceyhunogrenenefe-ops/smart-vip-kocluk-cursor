// Türkçe: Öğrenci Özel Dashboard — deneme, yazılı ve kitap takibi
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import { useApp } from '../context/AppContext';
import { resolveStudentRecordId } from '../lib/coachResolve';
import type { WrittenExamScore } from '../types';
import {
  GraduationCap,
  TrendingUp,
  Target,
  Award,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  Download,
  Plus,
  Save,
  BookOpen,
  AlertCircle,
  ClipboardList,
  TrendingDown,
  FileText,
  MessageCircle,
  BookMarked,
  Flame,
  Timer
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
type TabType = 'exams' | 'written' | 'books';

const TAB_SEGMENT: Record<TabType, string> = {
  exams: 'denemeler',
  written: 'yazili',
  books: 'kitaplar'
};

const SEGMENT_TAB: Record<string, TabType> = {
  denemeler: 'exams',
  yazili: 'written',
  kitaplar: 'books'
};

export default function StudentDashboard() {
  const { tabKey } = useParams<{ tabKey?: string }>();
  const navigate = useNavigate();
  const { user, effectiveUser, linkedStudent, linkedStudentError, linkedStudentLoading } = useAuth();
  const studentTags = userRoleTags(effectiveUser);
  const {
    getStudentStats,
    students,
    getReadingStats,
    books,
    updateBook,
    writtenExamScores,
    getWrittenExamSubjectsForStudent,
    addWrittenExamSubjectForStudent,
    addWrittenExamScore,
    getStudentWrittenExamScores,
    writtenExamSubjectsByStudent,
    calculateSemesterAverage,
    calculateYearlyAverage,
    getWrittenExamStats,
    readingLogs,
    examResults
  } = useApp();

  /**
   * Canonical: API my-student (gerçek öğrenci oturumu).
   * Taklit (süper admin → öğrenci): JWT hâlâ admin; effectiveUser rolü + studentId / e-posta ile çözülür.
   */
  const resolvedStudentId = useMemo(
    () =>
      linkedStudent?.id ||
      effectiveUser?.studentId ||
      resolveStudentRecordId(
        effectiveUser?.role,
        effectiveUser?.studentId,
        effectiveUser?.email,
        students,
        { roles: studentTags }
      ) ||
      undefined,
    [linkedStudent?.id, effectiveUser?.role, effectiveUser?.studentId, effectiveUser?.email, students, studentTags]
  );

  // Tab state — URL: /student-dashboard/:denemeler | yazili | kitaplar
  const [activeTab, setActiveTab] = useState<TabType>('exams');

  useEffect(() => {
    const mapped = tabKey ? SEGMENT_TAB[tabKey] : undefined;
    if (mapped) {
      setActiveTab(mapped);
    } else {
      navigate('/student-dashboard/denemeler', { replace: true });
    }
  }, [tabKey, navigate]);

  const goTab = (t: TabType) => {
    setActiveTab(t);
    const seg = TAB_SEGMENT[t];
    navigate(`/student-dashboard/${seg}`);
  };

  const myExamResults = useMemo(() => {
    const sid = resolvedStudentId;
    if (!sid) return [];
    return examResults
      .filter((e) => e.studentId === sid)
      .slice()
      .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  }, [examResults, resolvedStudentId]);

  // Öğrencinin istatistikleri
  const myStats = useMemo(() => {
    if (!resolvedStudentId) return null;
    return getStudentStats(resolvedStudentId);
  }, [resolvedStudentId, getStudentStats]);

  // Öğrencinin okuma istatistikleri
  const myReadingStats = useMemo(() => {
    if (!resolvedStudentId) return null;
    return getReadingStats(resolvedStudentId);
  }, [resolvedStudentId, getReadingStats]);

  // Öğrencinin kitapları
  const myBooks = useMemo(() => {
    if (!resolvedStudentId) return [];
    return books.filter(b => b.studentId === resolvedStudentId);
  }, [resolvedStudentId, books]);

  const myActiveBooks = useMemo(
    () => myBooks.filter((b) => b.status !== 'completed'),
    [myBooks]
  );
  const myCompletedBooks = useMemo(
    () => myBooks.filter((b) => b.status === 'completed'),
    [myBooks]
  );

  const handleMarkMyBookFinished = (bookId: string) => {
    void updateBook(bookId, {
      status: 'completed',
      endDate: new Date().toISOString().split('T')[0]
    });
  };

  // Öğrencinin okuma kayıtları
  const studentReadingLogs = useMemo(() => {
    if (!resolvedStudentId) return [];
    return readingLogs.filter(l => l.studentId === resolvedStudentId);
  }, [resolvedStudentId, readingLogs]);

  // Öğrencinin yazılı takip istatistikleri
  const myWrittenExamStats = useMemo(() => {
    if (!resolvedStudentId) return null;
    return getWrittenExamStats(resolvedStudentId);
  }, [resolvedStudentId, writtenExamScores, getWrittenExamStats]);

  // Öğrencinin yazılı notları (ders bazlı)
  const myWrittenScores = useMemo(() => {
    if (!resolvedStudentId) return [];
    const subs = getWrittenExamSubjectsForStudent(resolvedStudentId);
    return subs.map(subject => ({
      subject,
      sem1Avg: calculateSemesterAverage(resolvedStudentId, subject, 1),
      sem2Avg: calculateSemesterAverage(resolvedStudentId, subject, 2),
      yearAvg: calculateYearlyAverage(resolvedStudentId, subject)
    })).filter(s => s.sem1Avg > 0 || s.sem2Avg > 0);
  }, [resolvedStudentId, writtenExamScores, getWrittenExamSubjectsForStudent, writtenExamSubjectsByStudent, calculateSemesterAverage, calculateYearlyAverage]);

  // Başarı rengi
  const getSuccessColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600 bg-green-50';
    if (rate >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const [writtenFormError, setWrittenFormError] = useState('');
  const [writtenForm, setWrittenForm] = useState({
    subject: '',
    newSubjectHint: '',
    semester: 1 as 1 | 2,
    examType: '1. Yazılı' as '1. Yazılı' | '2. Yazılı' | 'Final',
    score: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const writtenSubjectOptions = useMemo(() => {
    if (!resolvedStudentId) return [] as string[];
    return getWrittenExamSubjectsForStudent(resolvedStudentId);
  }, [getWrittenExamSubjectsForStudent, resolvedStudentId, writtenExamSubjectsByStudent]);

  const myWrittenRowList = useMemo(() => {
    if (!resolvedStudentId) return [] as WrittenExamScore[];
    return getStudentWrittenExamScores(resolvedStudentId)
      .slice()
      .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
  }, [getStudentWrittenExamScores, resolvedStudentId, writtenExamScores]);

  const submitWrittenExam = (e: React.FormEvent) => {
    e.preventDefault();
    setWrittenFormError('');
    const sid = resolvedStudentId;
    if (!sid) {
      setWrittenFormError(
        linkedStudentError ||
          'Hesabınız bir öğrenci kartına bağlı değil. Yöneticinize veya koçunuza başvurun.'
      );
      return;
    }
    let subject = writtenForm.subject.trim();
    if (!subject && writtenForm.newSubjectHint.trim()) {
      subject = writtenForm.newSubjectHint.trim();
      addWrittenExamSubjectForStudent(sid, subject);
    }
    if (!subject) {
      setWrittenFormError('Ders seçin veya yeni ders adı yazın.');
      return;
    }
    addWrittenExamSubjectForStudent(sid, subject);
    const scoreNum = parseInt(writtenForm.score, 10);
    if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      setWrittenFormError('Not 0–100 arasında olmalıdır.');
      return;
    }
    const examNum: 1 | 2 | 3 =
      writtenForm.examType === 'Final' ? 3 : writtenForm.examType === '1. Yazılı' ? 1 : 2;
    addWrittenExamScore({
      id: `we-student-${Date.now()}`,
      studentId: sid,
      subject,
      semester: writtenForm.semester,
      examType: writtenForm.examType,
      examNumber: examNum,
      score: scoreNum,
      date: writtenForm.date,
      notes: writtenForm.notes.trim() || undefined,
      createdAt: new Date().toISOString()
    });
    setWrittenForm({
      subject: '',
      newSubjectHint: '',
      semester: writtenForm.semester,
      examType: '1. Yazılı',
      score: '',
      date: new Date().toISOString().split('T')[0],
      notes: ''
    });
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      {user.role === 'student' && linkedStudentLoading && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Öğrenci kartınız yükleniyor…
        </div>
      )}
      {user.role === 'student' && linkedStudentError && !linkedStudent && !linkedStudentLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {linkedStudentError}
        </div>
      )}
      {/* Hoşgeldin */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
              {user.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold">Merhaba, {user.name}!</h2>
              <p className="text-blue-200">Başarılar dileriz</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold">%{myStats?.successRate || 0}</p>
            <p className="text-blue-200">Genel Başarın</p>
          </div>
        </div>
      </div>

      {/* 📚 Kitap Okuma Durumum */}
      {myReadingStats && myReadingStats.totalMinutes > 0 && (
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <BookMarked className="w-6 h-6" />
            <h3 className="text-lg font-bold">📚 Kitap Okuma Durumum</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="w-4 h-4 text-green-200" />
                <span className="text-sm text-green-100">Toplam Sayfa</span>
              </div>
              <p className="text-2xl font-bold">{myReadingStats.totalMinutes} sayfa</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Flame className="w-4 h-4 text-orange-300" />
                <span className="text-sm text-green-100">Okuma Serisi</span>
              </div>
              <p className="text-2xl font-bold">{myReadingStats.readingStreak} gün 🔥</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="w-4 h-4 text-blue-200" />
                <span className="text-sm text-green-100">Günlük Ort. (30 gün)</span>
              </div>
              <p className="text-2xl font-bold">{myReadingStats.averageDailyMinutes} sayfa/gün</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <BookMarked className="w-4 h-4 text-yellow-200" />
                <span className="text-sm text-green-100">Tamamlanan</span>
              </div>
              <p className="text-2xl font-bold">{myReadingStats.completedBooks} kitap</p>
            </div>
          </div>
          {myBooks.length > 0 && (
            <div className="mt-4 bg-white/10 rounded-xl p-4">
              <p className="text-sm text-green-100 mb-2">Okunan Kitaplar:</p>
              <div className="flex flex-wrap gap-2">
                {myBooks.slice(0, 5).map(book => (
                  <span key={book.id} className="px-3 py-1 bg-white/20 rounded-full text-sm">
                    📖 {book.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => goTab('exams')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium transition-colors ${
              activeTab === 'exams'
                ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Deneme Sınavları
          </button>
          <button
            onClick={() => goTab('written')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium transition-colors ${
              activeTab === 'written'
                ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            Yazılı
          </button>
          <button
            onClick={() => goTab('books')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium transition-colors ${
              activeTab === 'books'
                ? 'text-emerald-600 bg-emerald-50 border-b-2 border-emerald-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <BookMarked className="w-4 h-4" />
            Kitaplarım
          </button>
        </div>

        <div className="p-6">
          {/* Deneme Sınavları Tab */}
          {activeTab === 'exams' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <ClipboardList className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-blue-600">{myExamResults.length}</p>
                  <p className="text-sm text-gray-500">Toplam Deneme</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <TrendingUp className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-green-600">{myExamResults[0]?.totalNet ?? 0}</p>
                  <p className="text-sm text-gray-500">Son Net</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 text-center">
                  <Award className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-purple-600">
                    {myExamResults.length > 0
                      ? Math.round(
                          (myExamResults.reduce((sum, r) => sum + r.totalNet, 0) / myExamResults.length) * 10
                        ) / 10
                      : 0}
                  </p>
                  <p className="text-sm text-gray-500">Ortalama</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                  <Target className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-orange-600">
                    {myExamResults.length ? Math.max(...myExamResults.map((r) => r.totalNet)) : 0}
                  </p>
                  <p className="text-sm text-gray-500">En İyi</p>
                </div>
              </div>

              <div className="space-y-4">
                {myExamResults.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Henüz deneme sınavı sonucu bulunmuyor.</p>
                  </div>
                ) : (
                  myExamResults.map((result, idx) => {
                    const prevResult = myExamResults[idx + 1];
                    const netChange = prevResult ? result.totalNet - prevResult.totalNet : 0;

                    return (
                      <div key={result.id} className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  result.examType === 'TYT'
                                    ? 'bg-blue-100 text-blue-700'
                                    : result.examType === 'AYT'
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-green-100 text-green-700'
                                }`}
                              >
                                {result.examType}
                              </span>
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {new Date(result.examDate).toLocaleDateString('tr-TR')}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-blue-600">{result.totalNet} net</p>
                            {netChange !== 0 && (
                              <span className={`flex items-center justify-end gap-1 text-sm ${
                                netChange >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {netChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                {netChange >= 0 ? '+' : ''}{netChange}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {result.subjects.map((subject, i) => (
                            <div key={i} className="bg-white rounded-lg p-3 text-sm">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-gray-600">{subject.name}</span>
                                <span className={`font-semibold ${
                                  subject.net >= 5 ? 'text-green-600' :
                                  subject.net >= 3 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                  {subject.net}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="text-green-600">✓{subject.correct}</span>
                                <span className="text-red-600">✗{subject.wrong}</span>
                                <span>—{subject.blank}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-end gap-3">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`📊 *Deneme Sınavı Sonuçlarım*\n\nSonuç: ${myExamResults[0]?.totalNet ?? 0} net\nTür: ${myExamResults[0]?.examType ?? '—'}\n\n📅 Tarih: ${myExamResults[0]?.examDate ? new Date(myExamResults[0].examDate).toLocaleDateString('tr-TR') : '—'}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Yazdır
                </button>
              </div>
            </div>
          )}

          {/* Yazılı Takip Tab */}
          {activeTab === 'written' && (
            <div className="space-y-6">
              {/* Yazılı İstatistikleri */}
              {myWrittenExamStats && myWrittenExamStats.totalExams > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-sm p-4 text-white">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-5 h-5" />
                      <span className="text-sm opacity-80">Toplam Sınav</span>
                    </div>
                    <p className="text-2xl font-bold">{myWrittenExamStats.totalExams}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Award className="w-5 h-5 text-green-600" />
                      <span className="text-sm text-gray-500">Yıl Sonu Ort.</span>
                    </div>
                    <p className={`text-2xl font-bold ${
                      myWrittenExamStats.yearlyAverage >= 85 ? 'text-green-600' :
                      myWrittenExamStats.yearlyAverage >= 70 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {myWrittenExamStats.yearlyAverage || '-'}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                      <span className="text-sm text-gray-500">1. Dönem Ort.</span>
                    </div>
                    <p className={`text-2xl font-bold ${
                      myWrittenExamStats.semester1Average >= 85 ? 'text-green-600' :
                      myWrittenExamStats.semester1Average >= 70 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {myWrittenExamStats.semester1Average || '-'}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-indigo-600" />
                      <span className="text-sm text-gray-500">2. Dönem Ort.</span>
                    </div>
                    <p className={`text-2xl font-bold ${
                      myWrittenExamStats.semester2Average >= 85 ? 'text-green-600' :
                      myWrittenExamStats.semester2Average >= 70 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {myWrittenExamStats.semester2Average || '-'}
                    </p>
                  </div>
                </div>
              )}

              {/* Renk Açıklaması */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-500"></div>
                  <span className="text-gray-600">85+ (Başarılı)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-500"></div>
                  <span className="text-gray-600">70-84 (Orta)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-500"></div>
                  <span className="text-gray-600">&lt;70 (Çalışmalı)</span>
                </div>
              </div>

              {/* Öğrenci yazılı girişi */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-md font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-600" />
                  Yazılı notu ekle
                </h3>
                {!resolvedStudentId ? (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3">
                    Öğrenci kartınız kullanıcı e‑postanızla eşleşmiyorsa yazılı ekleyemezsiniz; koçunuzdan
                    güncellenmesini isteyin veya çıkış yapıp yeniden giriş yapın.
                  </p>
                ) : (
                  <form onSubmit={submitWrittenExam} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ders (liste)</label>
                        <select
                          value={writtenForm.subject}
                          onChange={(e) => setWrittenForm((p) => ({ ...p, subject: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                        >
                          <option value="">Seç veya altta yeni yaz</option>
                          {writtenSubjectOptions.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Yeni ders adı (opsiyonel)
                        </label>
                        <input
                          type="text"
                          value={writtenForm.newSubjectHint}
                          onChange={(e) =>
                            setWrittenForm((p) => ({ ...p, newSubjectHint: e.target.value }))
                          }
                          placeholder="Listede yoksa buraya yazın"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Dönem</label>
                        <select
                          value={writtenForm.semester}
                          onChange={(e) =>
                            setWrittenForm((p) => ({
                              ...p,
                              semester: Number(e.target.value) === 2 ? 2 : 1
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value={1}>1. dönem</option>
                          <option value={2}>2. dönem</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Sınav</label>
                        <select
                          value={writtenForm.examType}
                          onChange={(e) =>
                            setWrittenForm((p) => ({
                              ...p,
                              examType: e.target.value as '1. Yazılı' | '2. Yazılı' | 'Final'
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value="1. Yazılı">1. yazılı</option>
                          <option value="2. Yazılı">2. yazılı</option>
                          <option value="Final">Final</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Not (0–100)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={writtenForm.score}
                          onChange={(e) => setWrittenForm((p) => ({ ...p, score: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tarih</label>
                        <input
                          type="date"
                          value={writtenForm.date}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setWrittenForm((p) => ({ ...p, date: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama (opsiyonel)</label>
                        <input
                          type="text"
                          value={writtenForm.notes}
                          onChange={(e) => setWrittenForm((p) => ({ ...p, notes: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          placeholder="Opsiyonel"
                        />
                      </div>
                    </div>
                    {writtenFormError ? (
                      <p className="text-sm text-red-600 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {writtenFormError}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      <Save className="w-4 h-4" />
                      Kaydet
                    </button>
                  </form>
                )}
              </div>

              {resolvedStudentId && myWrittenRowList.length > 0 ? (
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Kayıtlı yazılılarım</h4>
                  <ul className="space-y-1 text-sm text-slate-600 max-h-40 overflow-y-auto">
                    {myWrittenRowList.slice(0, 12).map((w) => (
                      <li key={w.id} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                        <span>
                          {w.subject} · {w.semester}. dönem · {w.examType}
                        </span>
                        <span className="font-semibold text-slate-800">{w.score}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Ders Bazlı Yazılı Notları */}
              {myWrittenScores.length > 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ders</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">1. Dönem</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">2. Dönem</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase bg-gradient-to-r from-purple-100 to-pink-100">Yıl Sonu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {myWrittenScores.map(({ subject, sem1Avg, sem2Avg, yearAvg }) => (
                          <tr key={subject} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-800">{subject}</td>
                            <td className={`px-3 py-3 text-center font-bold ${
                              sem1Avg >= 85 ? 'text-green-600 bg-green-50' :
                              sem1Avg >= 70 ? 'text-yellow-600 bg-yellow-50' :
                              sem1Avg > 0 ? 'text-red-600 bg-red-50' : 'text-gray-400'
                            }`}>
                              {sem1Avg || '-'}
                            </td>
                            <td className={`px-3 py-3 text-center font-bold ${
                              sem2Avg >= 85 ? 'text-green-600 bg-green-50' :
                              sem2Avg >= 70 ? 'text-yellow-600 bg-yellow-50' :
                              sem2Avg > 0 ? 'text-red-600 bg-red-50' : 'text-gray-400'
                            }`}>
                              {sem2Avg || '-'}
                            </td>
                            <td className={`px-3 py-3 text-center font-bold bg-gradient-to-r from-purple-50 to-pink-50 ${
                              yearAvg >= 85 ? 'text-green-600' :
                              yearAvg >= 70 ? 'text-yellow-600' :
                              yearAvg > 0 ? 'text-red-600' : 'text-gray-400'
                            }`}>
                              {yearAvg || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Henüz Yazılı Notu Yok</h3>
                  <p className="text-gray-500">Koçunuz yazılı notlarınızı girdiğinde burada görünecek.</p>
                </div>
              )}

              {/* Başarılı ve Çalışmalı Dersler */}
              {myWrittenExamStats && myWrittenExamStats.totalExams > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myWrittenExamStats.subjectsAbove85.length > 0 && (
                    <div className="bg-green-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <h4 className="font-semibold text-green-800">Başarılı Dersler</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {myWrittenExamStats.subjectsAbove85.map(subject => (
                          <span key={subject} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                            {subject}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {myWrittenExamStats.subjectsBelow70.length > 0 && (
                    <div className="bg-red-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <h4 className="font-semibold text-red-800">Çalışmalı Dersler</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {myWrittenExamStats.subjectsBelow70.map(subject => (
                          <span key={subject} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                            {subject}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Kitaplarım Tab */}
          {activeTab === 'books' && (
            <div className="space-y-6">
              {/* Kitap İstatistikleri */}
              {myReadingStats && myReadingStats.totalMinutes > 0 ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-sm p-4 text-white">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-5 h-5" />
                        <span className="text-sm opacity-80">Toplam Sayfa</span>
                      </div>
                      <p className="text-2xl font-bold">{myReadingStats.totalMinutes} sayfa</p>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Flame className="w-5 h-5 text-orange-500" />
                        <span className="text-sm text-gray-500">Okuma Serisi</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">{myReadingStats.readingStreak} gün 🔥</p>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        <span className="text-sm text-gray-500">Günlük Ort. (30 gün)</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">{myReadingStats.averageDailyMinutes} sayfa/gün</p>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Award className="w-5 h-5 text-green-500" />
                        <span className="text-sm text-gray-500">Tamamlanan</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">{myReadingStats.completedBooks} kitap</p>
                    </div>
                  </div>

                  {myCompletedBooks.length > 0 ? (
                    <div className="rounded-xl border border-green-200 bg-green-50/60 p-4">
                      <h3 className="text-sm font-semibold text-green-900 mb-3 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Bitirdiğim kitaplar ({myCompletedBooks.length})
                      </h3>
                      <ul className="space-y-2">
                        {myCompletedBooks.map((book) => (
                          <li
                            key={book.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm"
                          >
                            <span className="font-medium text-slate-800">{book.title}</span>
                            <span className="text-xs text-gray-500 shrink-0">
                              {book.endDate
                                ? new Date(book.endDate).toLocaleDateString('tr-TR')
                                : 'Tamamlandı'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Okunan / devam eden kitaplar */}
                  {myActiveBooks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {myActiveBooks.map(book => {
                        const bookLogs = studentReadingLogs?.filter(l => l.bookId === book.id) || [];
                        const totalPagesRead = bookLogs.reduce((sum, l) => sum + (l.pagesRead || 0), 0);
                        const progress = book.totalPages ? Math.min(Math.round((totalPagesRead / book.totalPages) * 100), 100) : undefined;
                        return (
                          <div key={book.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-3">
                              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <BookOpen className="w-6 h-6 text-emerald-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-slate-800 truncate">{book.title}</h4>
                                <p className="text-sm text-gray-500">{book.author || 'Bilinmiyor'}</p>
                              </div>
                            </div>
                            {progress !== undefined && (
                              <div className="mt-3">
                                <div className="flex justify-between text-sm text-gray-600 mb-1">
                                  <span>İlerleme</span>
                                  <span>{progress}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            <div className="mt-3 flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                  📖 Okunuyor
                                </span>
                                <span className="text-xs text-gray-400">
                                  {totalPagesRead > 0 ? `${totalPagesRead} sayfa` : 'Henüz başlamadı'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleMarkMyBookFinished(book.id)}
                                className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                              >
                                Kitabı bitirdim
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : myCompletedBooks.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                      <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">Henüz Kitap Eklenmedi</h3>
                      <p className="text-gray-500">Koçunuz kitap eklediğinde burada görünecek.</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                  <BookMarked className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">Kitap Okuma Takibi</h3>
                  <p className="text-gray-500 mb-4">Henüz okuma kaydınız bulunmuyor.</p>
                  <div className="bg-emerald-50 rounded-xl p-4 text-sm text-emerald-700">
                    <p className="font-medium mb-2">Çalışma kaydı haftalık plandan</p>
                    <p>Kitap okuma ve çalışma sürelerini Haftalık Plan üzerinden girebilirsiniz; koçunuz kitap eklediğinde burada da görünür.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
