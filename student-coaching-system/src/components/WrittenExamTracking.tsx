// Türkçe: Yazılı Takip Modülü - Tablo Görünümü
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  FileText,
  Plus,
  X,
  Check,
  Trash2,
  Edit2,
  Save,
  BookOpen,
  Edit3
} from 'lucide-react';

// Sınav tipi seçenekleri
const EXAM_OPTIONS = [
  { semester: 1 as const, examType: '1. Yazılı' as const, label: '1.Dönem 1.Yazılı' },
  { semester: 1 as const, examType: '2. Yazılı' as const, label: '1.Dönem 2.Yazılı' },
  { semester: 2 as const, examType: '1. Yazılı' as const, label: '2.Dönem 1.Yazılı' },
  { semester: 2 as const, examType: '2. Yazılı' as const, label: '2.Dönem 2.Yazılı' },
];

// Başarı rengi
const getScoreColor = (score: number | null): string => {
  if (score === null) return 'text-gray-400 bg-gray-50';
  if (score >= 90) return 'text-green-600 bg-green-50';
  if (score >= 70) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
};

// Ortalama rengi
const getAverageColor = (avg: number | null): string => {
  if (avg === null) return 'text-gray-500';
  if (avg >= 85) return 'text-green-600';
  if (avg >= 70) return 'text-yellow-600';
  return 'text-red-600';
};

export default function WrittenExamTracking() {
  const { user } = useAuth();
  const {
    students,
    writtenExamScores,
    writtenExamSubjects,
    addWrittenExamScore,
    updateWrittenExamScore,
    deleteWrittenExamScore,
    getWrittenExamStats
  } = useApp();

  // State
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingScore, setEditingScore] = useState<{ id: string; subject: string; semester: number; examType: string } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ subject: string; semester: number; examType: string } | null>(null);

  // Form state
  const [newScore, setNewScore] = useState({
    subject: '',
    semester: 1 as 1 | 2,
    examType: '1. Yazılı' as '1. Yazılı' | '2. Yazılı',
    score: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  // Kullanıcı rolüne göre öğrenci seçenekleri
  const availableStudents = useMemo(() => {
    if (user?.role === 'admin' || user?.role === 'coach') {
      return students;
    } else if (user?.role === 'student' && user.studentId) {
      return students.filter(s => s.id === user.studentId);
    }
    return students;
  }, [user, students]);

  // Seçili öğrenci
  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // Öğrencinin sınav notları
  const studentScores = selectedStudentId ? writtenExamScores.filter(s => s.studentId === selectedStudentId) : [];

  // Derslere göre gruplandırılmış notlar - Tablo için
  const subjectScores = useMemo(() => {
    const subjects = selectedStudentId ? writtenExamSubjects : [];
    const data: Record<string, {
      s1e1: { score: number | null; id?: string; date?: string };
      s1e2: { score: number | null; id?: string; date?: string };
      s2e1: { score: number | null; id?: string; date?: string };
      s2e2: { score: number | null; id?: string; date?: string };
    }> = {};

    subjects.forEach(subject => {
      const subjectData = studentScores.filter(s => s.subject === subject);

      const s1e1 = subjectData.find(s => s.semester === 1 && s.examType === '1. Yazılı');
      const s1e2 = subjectData.find(s => s.semester === 1 && s.examType === '2. Yazılı');
      const s2e1 = subjectData.find(s => s.semester === 2 && s.examType === '1. Yazılı');
      const s2e2 = subjectData.find(s => s.semester === 2 && s.examType === '2. Yazılı');

      data[subject] = {
        s1e1: s1e1 ? { score: s1e1.score, id: s1e1.id, date: s1e1.date } : { score: null },
        s1e2: s1e2 ? { score: s2e2 ? s1e2.score : (s1e2 as any).score, id: s1e2?.id, date: (s1e2 as any)?.date } : { score: null },
        s2e1: s2e1 ? { score: s2e1.score, id: s2e1.id, date: s2e1.date } : { score: null },
        s2e2: s2e2 ? { score: s2e2.score, id: s2e2.id, date: s2e2.date } : { score: null },
      };
    });

    // Düzeltme: s1e2 ve s2e2'yi doğru ata
    subjects.forEach(subject => {
      const subjectData = studentScores.filter(s => s.subject === subject);
      const s1e2Find = subjectData.find(s => s.semester === 1 && s.examType === '2. Yazılı');
      const s2e2Find = subjectData.find(s => s.semester === 2 && s.examType === '2. Yazılı');

      if (data[subject]) {
        data[subject].s1e2 = s1e2Find ? { score: s1e2Find.score, id: s1e2Find.id, date: s1e2Find.date } : { score: null };
        data[subject].s2e2 = s2e2Find ? { score: s2e2Find.score, id: s2e2Find.id, date: s2e2Find.date } : { score: null };
      }
    });

    return data;
  }, [studentScores, writtenExamSubjects, selectedStudentId]);

  // Ortalama hesapla
  const calculateSemesterAvg = (s1: number | null, s2: number | null): number | null => {
    if (s1 === null && s2 === null) return null;
    const scores = [s1, s2].filter(s => s !== null) as number[];
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  };

  const calculateYearlyAvg = (s1avg: number | null, s2avg: number | null): number | null => {
    if (s1avg === null && s2avg === null) return null;
    const avgs = [s1avg, s2avg].filter(a => a !== null) as number[];
    if (avgs.length === 0) return null;
    return Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length);
  };

  // İstatistikler
  const stats = selectedStudentId ? getWrittenExamStats(selectedStudentId) : null;

  // Yeni not ekle veya güncelle
  const handleSaveScore = () => {
    if (!selectedStudentId || !newScore.subject || !newScore.score) return;

    const scoreNum = parseInt(newScore.score);
    if (scoreNum < 0 || scoreNum > 100) {
      alert('Not 0-100 arasında olmalıdır');
      return;
    }

    if (editingScore?.id) {
      // Güncelle
      updateWrittenExamScore(editingScore.id, {
        subject: newScore.subject,
        semester: newScore.semester,
        examType: newScore.examType,
        score: scoreNum,
        date: newScore.date,
        notes: newScore.notes || undefined
      });
    } else {
      // Yeni ekle
      addWrittenExamScore({
        id: `we-${Date.now()}`,
        studentId: selectedStudentId,
        subject: newScore.subject,
        semester: newScore.semester,
        examType: newScore.examType,
        examNumber: newScore.examType === '1. Yazılı' ? 1 : 2,
        score: scoreNum,
        date: newScore.date,
        notes: newScore.notes || undefined,
        createdAt: new Date().toISOString()
      });
    }

    setNewScore({
      subject: '',
      semester: 1,
      examType: '1. Yazılı',
      score: '',
      date: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setEditingScore(null);
    setShowAddModal(false);
    setSelectedCell(null);
  };

  // Notu düzenle
  const handleEditScore = (cell: { subject: string; semester: number; examType: string }) => {
    const data = subjectScores[cell.subject];
    if (!data) return;

    let existingScore = null;
    let scoreId: string | undefined;
    let existingDate = new Date().toISOString().split('T')[0];

    if (cell.semester === 1 && cell.examType === '1. Yazılı') {
      existingScore = data.s1e1.score;
      scoreId = data.s1e1.id;
      existingDate = data.s1e1.date || existingDate;
    } else if (cell.semester === 1 && cell.examType === '2. Yazılı') {
      existingScore = data.s1e2.score;
      scoreId = data.s1e2.id;
      existingDate = data.s1e2.date || existingDate;
    } else if (cell.semester === 2 && cell.examType === '1. Yazılı') {
      existingScore = data.s2e1.score;
      scoreId = data.s2e1.id;
      existingDate = data.s2e1.date || existingDate;
    } else if (cell.semester === 2 && cell.examType === '2. Yazılı') {
      existingScore = data.s2e2.score;
      scoreId = data.s2e2.id;
      existingDate = data.s2e2.date || existingDate;
    }

    setNewScore({
      subject: cell.subject,
      semester: cell.semester as 1 | 2,
      examType: cell.examType as '1. Yazılı' | '2. Yazılı',
      score: existingScore !== null ? existingScore.toString() : '',
      date: existingDate,
      notes: ''
    });
    setEditingScore(scoreId ? { id: scoreId, subject: cell.subject, semester: cell.semester, examType: cell.examType } : null);
    setSelectedCell(cell);
    setShowAddModal(true);
  };

  // Notu sil
  const handleDeleteScore = (id: string) => {
    if (confirm('Bu notu silmek istediğinize emin misiniz?')) {
      deleteWrittenExamScore(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Yazılı Takip</h2>
            <p className="text-purple-100">
              {user?.role === 'student' ? 'Kendi sınav notlarınızı takip edin' : 'Öğrenci yazılı sınav notlarını takip edin'}
            </p>
          </div>
        </div>
      </div>

      {/* Öğrenci Seçimi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4">
          <BookOpen className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-800">
            {user?.role === 'student' ? 'Öğrenci Bilgileri' : 'Öğrenci Seçimi'}
          </h3>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">{user?.role === 'student' ? 'Öğrenci seçin...' : 'Öğrenci seçin...'}</option>
            {availableStudents.map(student => (
              <option key={student.id} value={student.id}>
                {student.name} - {student.classLevel}. Sınıf
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedStudentId && stats && (
        <>
          {/* Genel İstatistikler */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center">
              <p className="text-3xl font-bold text-slate-800">{stats.totalExams}</p>
              <p className="text-sm text-gray-500">Toplam Sınav</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center">
              <p className={`text-3xl font-bold ${getAverageColor(stats.yearlyAverage)}`}>
                {stats.yearlyAverage || '-'}
              </p>
              <p className="text-sm text-gray-500">Yıl Sonu ort.</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center">
              <p className={`text-3xl font-bold ${getAverageColor(stats.semester1Average)}`}>
                {stats.semester1Average || '-'}
              </p>
              <p className="text-sm text-gray-500">1. Dönem ort.</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center">
              <p className={`text-3xl font-bold ${getAverageColor(stats.semester2Average)}`}>
                {stats.semester2Average || '-'}
              </p>
              <p className="text-sm text-gray-500">2. Dönem ort.</p>
            </div>
          </div>

          {/* Tablo Görünümü */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Ders Bazlı Notlar</h3>
              <button
                onClick={() => {
                  setNewScore({
                    subject: writtenExamSubjects[0] || '',
                    semester: 1,
                    examType: '1. Yazılı',
                    score: '',
                    date: new Date().toISOString().split('T')[0],
                    notes: ''
                  });
                  setEditingScore(null);
                  setSelectedCell(null);
                  setShowAddModal(true);
                }}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Yeni Not Ekle
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b-2 border-gray-200 bg-gradient-to-r from-slate-50 to-gray-50">
                    <th className="text-left py-4 px-4 text-sm font-bold text-slate-700 sticky left-0 bg-gradient-to-r from-slate-50 to-gray-50 z-10">
                      Ders Adı
                    </th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-purple-600 bg-purple-50 border-l border-purple-100" colSpan={2}>
                      1. Dönem
                    </th>
                    <th className="text-center py-3 px-3 text-sm font-semibold text-slate-600 bg-gray-100">
                      1.Dönem ort.
                    </th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-green-600 bg-green-50 border-l border-green-100" colSpan={2}>
                      2. Dönem
                    </th>
                    <th className="text-center py-3 px-3 text-sm font-semibold text-slate-600 bg-gray-100">
                      2.Dönem ort.
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600">
                      Yıl Sonu ort.
                    </th>
                  </tr>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 sticky left-0 bg-gray-50 z-10"></th>
                    <th className="py-3 px-3 text-center text-xs font-medium text-gray-600">1.Yazılı</th>
                    <th className="py-3 px-3 text-center text-xs font-medium text-gray-600">2.Yazılı</th>
                    <th className="py-3 px-3 text-center text-xs font-medium text-gray-600"></th>
                    <th className="py-3 px-3 text-center text-xs font-medium text-gray-600">1.Yazılı</th>
                    <th className="py-3 px-3 text-center text-xs font-medium text-gray-600">2.Yazılı</th>
                    <th className="py-3 px-3 text-center text-xs font-medium text-gray-600"></th>
                    <th className="py-3 px-4 text-center text-xs font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody>
                  {writtenExamSubjects.map((subject) => {
                    const data = subjectScores[subject] || {
                      s1e1: { score: null },
                      s1e2: { score: null },
                      s2e1: { score: null },
                      s2e2: { score: null }
                    };

                    const s1e1Score = data.s1e1.score;
                    const s1e2Score = data.s1e2.score;
                    const s2e1Score = data.s2e1.score;
                    const s2e2Score = data.s2e2.score;

                    const s1Avg = calculateSemesterAvg(s1e1Score, s1e2Score);
                    const s2Avg = calculateSemesterAvg(s2e1Score, s2e2Score);
                    const yearlyAvg = calculateYearlyAvg(s1Avg, s2Avg);

                    return (
                      <tr key={subject} className="border-b border-gray-100 hover:bg-purple-50/30 transition-colors">
                        <td className="py-4 px-4 text-sm font-semibold text-slate-800 sticky left-0 bg-white z-10">
                          {subject}
                        </td>
                        {/* 1.Dönem 1.Yazılı */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleEditScore({ subject, semester: 1, examType: '1. Yazılı' })}
                            className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all hover:scale-105 ${getScoreColor(s1e1Score)}`}
                          >
                            {s1e1Score !== null ? s1e1Score : (
                              <span className="text-gray-400 font-normal">-</span>
                            )}
                          </button>
                        </td>
                        {/* 1.Dönem 2.Yazılı */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleEditScore({ subject, semester: 1, examType: '2. Yazılı' })}
                            className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all hover:scale-105 ${getScoreColor(s1e2Score)}`}
                          >
                            {s1e2Score !== null ? s1e2Score : (
                              <span className="text-gray-400 font-normal">-</span>
                            )}
                          </button>
                        </td>
                        {/* 1.Dönem Ortalama */}
                        <td className="py-3 px-3 text-center bg-gray-50/50">
                          <span className={`inline-block px-3 py-2 rounded-lg font-bold text-sm ${getAverageColor(s1Avg)}`}>
                            {s1Avg !== null ? s1Avg : '-'}
                          </span>
                        </td>
                        {/* 2.Dönem 1.Yazılı */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleEditScore({ subject, semester: 2, examType: '1. Yazılı' })}
                            className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all hover:scale-105 ${getScoreColor(s2e1Score)}`}
                          >
                            {s2e1Score !== null ? s2e1Score : (
                              <span className="text-gray-400 font-normal">-</span>
                            )}
                          </button>
                        </td>
                        {/* 2.Dönem 2.Yazılı */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleEditScore({ subject, semester: 2, examType: '2. Yazılı' })}
                            className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all hover:scale-105 ${getScoreColor(s2e2Score)}`}
                          >
                            {s2e2Score !== null ? s2e2Score : (
                              <span className="text-gray-400 font-normal">-</span>
                            )}
                          </button>
                        </td>
                        {/* 2.Dönem Ortalama */}
                        <td className="py-3 px-3 text-center bg-gray-50/50">
                          <span className={`inline-block px-3 py-2 rounded-lg font-bold text-sm ${getAverageColor(s2Avg)}`}
                          >
                            {s2Avg !== null ? s2Avg : '-'}
                          </span>
                        </td>
                        {/* Yıl Sonu Ortalama */}
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-4 py-2 rounded-lg font-bold text-sm bg-gradient-to-r from-indigo-100 to-purple-100 ${getAverageColor(yearlyAvg)}`}
                          >
                            {yearlyAvg !== null ? yearlyAvg : '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {writtenExamSubjects.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-500">
                        Henüz ders eklenmemiş. Yeni not ekleyerek ders ekleyebilirsiniz.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Tablo Açıklaması */}
            <div className="p-4 border-t border-gray-100 bg-slate-50">
              <p className="text-xs text-gray-500">
                * Notları düzenlemek için ilgili hücreye tıklayın. Ortalamalar otomatik hesaplanır.
              </p>
            </div>
          </div>
        </>
      )}

      {/* Empty State */}
      {!selectedStudentId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">
            {user?.role === 'student' ? 'Yazılı Notlarınız' : 'Öğrenci Seçin'}
          </h3>
          <p className="text-gray-500">
            {user?.role === 'student'
              ? 'Henüz yazılı sınav notu eklenmemiş.'
              : 'Yazılı sınav notlarını görüntülemek için yukarıdan bir öğrenci seçin.'}
          </p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-slate-800">
                {editingScore ? 'Notu Düzenle' : 'Yeni Yazılı Notu Ekle'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingScore(null);
                  setSelectedCell(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Ders Seçimi */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ders *</label>
                <select
                  value={newScore.subject}
                  onChange={(e) => setNewScore({ ...newScore, subject: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Ders Seçin</option>
                  {writtenExamSubjects.map(subj => (
                    <option key={subj} value={subj}>{subj}</option>
                  ))}
                </select>
              </div>

              {/* Sınav Seçimi */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dönem *</label>
                  <select
                    value={newScore.semester}
                    onChange={(e) => setNewScore({ ...newScore, semester: parseInt(e.target.value) as 1 | 2 })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value={1}>1. Dönem</option>
                    <option value={2}>2. Dönem</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Yazılı *</label>
                  <select
                    value={newScore.examType}
                    onChange={(e) => setNewScore({ ...newScore, examType: e.target.value as '1. Yazılı' | '2. Yazılı' })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="1. Yazılı">1. Yazılı</option>
                    <option value="2. Yazılı">2. Yazılı</option>
                  </select>
                </div>
              </div>

              {/* Not */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Not * (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newScore.score}
                  onChange={(e) => setNewScore({ ...newScore, score: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="0-100"
                />
              </div>

              {/* Tarih */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
                <input
                  type="date"
                  value={newScore.date}
                  onChange={(e) => setNewScore({ ...newScore, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Notlar */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notlar (İsteğe bağlı)</label>
                <textarea
                  value={newScore.notes}
                  onChange={(e) => setNewScore({ ...newScore, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Örn: Sorular zorlayıcıydı"
                />
              </div>
            </div>

            <div className="flex justify-between p-6 border-t border-gray-100">
              <div>
                {editingScore && (
                  <button
                    onClick={() => {
                      if (editingScore.id) {
                        handleDeleteScore(editingScore.id);
                        setShowAddModal(false);
                        setEditingScore(null);
                        setSelectedCell(null);
                      }
                    }}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Sil
                  </button>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingScore(null);
                    setSelectedCell(null);
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleSaveScore}
                  disabled={!newScore.subject || !newScore.score}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {editingScore ? 'Kaydet' : 'Ekle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
